export type NotificationSession = {
	id: string;
	status?: string | null;
	lastActivityAt: string;
};

export function notificationAction(action: string, text: string | undefined, targetId: string | null) {
	if (action === "ao-reply") {
		const message = text?.trim();
		if (!message || !targetId) return null;
		return { kind: "send" as const, id: targetId, message };
	}
	if (action === "ao-voice" && targetId) return { kind: "voice" as const, id: targetId };
	return { kind: "open" as const, id: targetId };
}

export function selectNotificationTarget(
	sessions: NotificationSession[],
	currentId: string | null,
	isTerminal: (status?: string | null) => boolean,
): NotificationSession | null {
	const active = sessions.filter((session) => !isTerminal(session.status));
	const current = currentId ? active.find((session) => session.id === currentId) : null;
	if (current) return current;

	const sorted = active
		.map((session) => ({ session, time: Date.parse(session.lastActivityAt) }))
		.filter(({ time }) => Number.isFinite(time))
		.sort((a, b) => b.time - a.time || a.session.id.localeCompare(b.session.id));
	if (!sorted[0]) return null;
	if (sorted[1] && sorted[0].time === sorted[1].time) return null;
	return sorted[0].session;
}
