import assert from "node:assert/strict";
import test from "node:test";

import { shouldStartVoiceAction } from "./voiceAction.ts";

test("keeps a voice action pending until foreground and starts it once", () => {
	assert.equal(shouldStartVoiceAction(true, false, "background"), false);
	assert.equal(shouldStartVoiceAction(true, false, "active"), true);
	assert.equal(shouldStartVoiceAction(true, true, "active"), false);
});
