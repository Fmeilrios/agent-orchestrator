import assert from "node:assert/strict";
import test from "node:test";
import { terminalInputDelta, terminalInputEnter, terminalInputKey, terminalNamedKey } from "./terminalInput.ts";

test("forwards fast and batched text once", () => {
	assert.equal(terminalInputDelta("", "hello world"), "hello world");
	assert.equal(terminalInputDelta("hello", "hello!"), "!");
});

test("translates deletions, replacements, and Unicode", () => {
	assert.equal(terminalInputDelta("hello", "hel"), "\x7f\x7f");
	assert.equal(terminalInputDelta("cat", "car"), "\x7fr");
	assert.equal(terminalInputDelta("go🙂", "go"), "\x7f");
});

test("maps hardware keys without treating text keys as named keys", () => {
	assert.equal(terminalNamedKey.ArrowLeft, "\x1b[D");
	assert.equal(terminalNamedKey.Tab, "\t");
	assert.equal(terminalNamedKey.Backspace, undefined);
	assert.equal(terminalNamedKey.Enter, undefined);
});

test("resets retained input after Enter", () => {
	const enter = terminalInputEnter();
	assert.deepEqual(enter, { data: "\r", buffer: "" });
	assert.equal(terminalInputDelta(enter.buffer, "next"), "next");
});

test("sends Backspace for an empty buffer without duplicating native deletions", () => {
	assert.equal(terminalInputKey("Backspace", ""), "\x7f");
	assert.equal(terminalInputKey("Backspace", "text"), "");
	assert.equal(terminalInputDelta("text", "tex"), "\x7f");
	assert.equal(terminalInputKey("Backspace", terminalInputEnter().buffer), "\x7f");
});
