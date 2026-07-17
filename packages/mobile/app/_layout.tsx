import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "../lib/store";
import { theme } from "../lib/theme";
import { initializeOngoingNotification, routeNotificationResponse } from "../lib/ongoingNotification";

Notifications.setNotificationHandler({
	handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

export default function RootLayout() {
	const router = useRouter();
	const handled = useRef<string | null>(null);
	useEffect(() => {
		const handle = async (response: Notifications.NotificationResponse | null) => {
			if (!response) return;
			const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
			if (handled.current === key) return;
			handled.current = key;
			try {
				const route = await routeNotificationResponse(response);
				if (route?.id) router.push({ pathname: "/session/[id]", params: { id: route.id, voice: route.voice ? "1" : undefined } });
				else if (route) router.replace("/");
			} catch (error) {
				Alert.alert("Could not use notification", error instanceof Error ? error.message : "Open AO and choose a session.");
			} finally {
				await Notifications.clearLastNotificationResponseAsync();
				handled.current = null;
			}
		};
		void initializeOngoingNotification().catch((error) => console.warn("AO notification setup failed", error));
		void Notifications.getLastNotificationResponseAsync().then(handle);
		const subscription = Notifications.addNotificationResponseReceivedListener(handle);
		return () => subscription.remove();
	}, [router]);

	return (
		<SafeAreaProvider>
			<AppProvider>
				<StatusBar style="light" />
				<Stack
					screenOptions={{
						headerStyle: { backgroundColor: theme.bgSurface },
						headerTintColor: theme.textPrimary,
						headerTitleStyle: { fontWeight: "700" },
						headerShadowVisible: false,
						contentStyle: { backgroundColor: theme.bgBase },
					}}
				>
					<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
					<Stack.Screen name="session/[id]" options={{ title: "Terminal", headerBackTitle: "Back" }} />
					<Stack.Screen name="spawn" options={{ presentation: "modal", title: "New agent" }} />
					<Stack.Screen name="pair" options={{ presentation: "modal", title: "Scan pairing code" }} />
				</Stack>
			</AppProvider>
		</SafeAreaProvider>
	);
}
