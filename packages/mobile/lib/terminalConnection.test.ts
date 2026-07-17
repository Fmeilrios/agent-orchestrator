import assert from "node:assert/strict";
import test from "node:test";
import { terminalOpenFrames } from "./terminalConnection.ts";

test("reconnect restores the same terminal grid once after opening the new attachment", () => {
	assert.deepEqual(terminalOpenFrames("session-1", "project-1", 96, 52), [
		{ ch: "terminal", id: "session-1", type: "open", projectId: "project-1", role: "secondary" },
		{ ch: "terminal", id: "session-1", type: "resize", cols: 96, rows: 52, projectId: "project-1" },
	]);
});
