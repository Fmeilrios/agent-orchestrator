import assert from "node:assert/strict";
import test from "node:test";
import { notificationAction, selectNotificationTarget, type NotificationSession } from "./notificationTarget.ts";

const active = (status?: string | null) => status === "done";
const sessions: NotificationSession[] = [
	{ id: "older", status: "working", lastActivityAt: "2026-07-17T10:00:00Z" },
	{ id: "latest", status: "working", lastActivityAt: "2026-07-17T11:00:00Z" },
];

test("keeps an active current session", () => {
	assert.equal(selectNotificationTarget(sessions, "older", active)?.id, "older");
});

test("uses the uniquely latest active session when current is unavailable", () => {
	assert.equal(selectNotificationTarget([...sessions, { id: "dead", status: "done", lastActivityAt: "2026-07-17T12:00:00Z" }], null, active)?.id, "latest");
});

test("refuses ambiguous or inactive targets", () => {
	assert.equal(
		selectNotificationTarget(
			[
				{ id: "a", lastActivityAt: "2026-07-17T11:00:00Z" },
				{ id: "b", lastActivityAt: "2026-07-17T11:00:00Z" },
			],
			null,
			active,
		),
		null,
	);
});

test("routes reply and voice to the selected session", () => {
	assert.deepEqual(notificationAction("ao-reply", " hello ", "session-1"), {
		kind: "send",
		id: "session-1",
		message: "hello",
	});
	assert.deepEqual(notificationAction("ao-voice", undefined, "session-1"), { kind: "voice", id: "session-1" });
	assert.equal(notificationAction("ao-reply", "hello", null), null);
});
