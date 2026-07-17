import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getSessions, isTerminalStatus, sendMessage } from "./api";
import { isConfigured, loadConfig } from "./config";
import { notificationOwnership } from "./notificationOwnership";
import { notificationAction, selectNotificationTarget } from "./notificationTarget";

export const REPLY_ACTION = "ao-reply";
export const VOICE_ACTION = "ao-voice";
const CATEGORY = "ao-ongoing";
const CHANNEL = "ao-ongoing";
const CURRENT_SESSION_KEY = "ao.notificationCurrentSession";
const NOTIFICATION_KEY = "ao.ongoingNotification";
const ownership = notificationOwnership(AsyncStorage, CURRENT_SESSION_KEY);

export async function rememberNotificationSession(id: string): Promise<void> {
	await ownership.remember(id);
}

export async function forgetNotificationSession(id: string): Promise<void> {
	await ownership.forget(id);
}

async function targetSession(required: boolean) {
	const config = await loadConfig();
	if (!isConfigured(config)) {
		if (required) throw new Error("Connect AO before replying.");
		return { config, target: null };
	}
	const [{ sessions }, currentId] = await Promise.all([getSessions(config, "all"), AsyncStorage.getItem(CURRENT_SESSION_KEY)]);
	const target = selectNotificationTarget(sessions, currentId, isTerminalStatus);
	if (required && !target) throw new Error("No single active session is safe to use. Open AO and choose one.");
	return { config, target };
}

export async function routeNotificationResponse(response: Notifications.NotificationResponse): Promise<{
	id: string | null;
	voice: boolean;
} | null> {
	const action = response.actionIdentifier;
	const { config, target } = await targetSession(action === REPLY_ACTION || action === VOICE_ACTION);
	const route = notificationAction(action, response.userText, target?.id ?? null);
	if (!route) throw new Error("Reply was empty.");
	if (route.kind === "send") {
		await sendMessage(config, route.id, route.message);
		return null;
	}
	return { id: route.id, voice: route.kind === "voice" };
}

export async function initializeOngoingNotification(): Promise<boolean> {
	if (Platform.OS !== "android") return false;
	await Notifications.setNotificationChannelAsync(CHANNEL, {
		name: "AO",
		importance: Notifications.AndroidImportance.DEFAULT,
	});
	await Notifications.setNotificationCategoryAsync(CATEGORY, [
		{
			identifier: REPLY_ACTION,
			buttonTitle: "Reply",
			textInput: { submitButtonTitle: "Send", placeholder: "Message AO" },
			options: { opensAppToForeground: true },
		},
		{ identifier: VOICE_ACTION, buttonTitle: "Voice", options: { opensAppToForeground: true } },
	]);
	let permission = await Notifications.getPermissionsAsync();
	if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
	if (!permission.granted) return false;

	const previous = await AsyncStorage.getItem(NOTIFICATION_KEY);
	if (previous) await Notifications.dismissNotificationAsync(previous).catch(() => {});
	const id = await Notifications.scheduleNotificationAsync({
		content: {
			title: "AO is ready",
			body: "Open AO, reply, or use voice with an active session.",
			categoryIdentifier: CATEGORY,
			sticky: true,
			autoDismiss: false,
			data: { kind: "ao-ongoing" },
		},
		trigger: null,
	});
	await AsyncStorage.setItem(NOTIFICATION_KEY, id);
	return true;
}
