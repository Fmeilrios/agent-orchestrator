import assert from "node:assert/strict";
import test from "node:test";
import { notificationOwnership } from "./notificationOwnership.ts";

test("old cleanup cannot remove newer ownership", async () => {
	let value: string | null = "old";
	let releaseRead!: () => void;
	const readStarted = new Promise<void>((resolve) => {
		releaseRead = resolve;
	});
	let continueRead!: () => void;
	const readReleased = new Promise<void>((resolve) => {
		continueRead = resolve;
	});
	const ownership = notificationOwnership(
		{
			getItem: async () => {
				const current = value;
				releaseRead();
				await readReleased;
				return current;
			},
			setItem: async (_key, next) => {
				value = next;
			},
			removeItem: async () => {
				value = null;
			},
		},
		"current",
	);

	const cleanup = ownership.forget("old");
	await readStarted;
	const remember = ownership.remember("new");
	continueRead();
	await Promise.all([cleanup, remember]);
	assert.equal(value, "new");
});
