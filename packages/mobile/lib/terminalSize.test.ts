import assert from "node:assert/strict";
import test from "node:test";
import { terminalSizeChanged } from "./terminalSize.ts";

test("suppresses layout reports for the current 52-row grid", () => {
	assert.equal(terminalSizeChanged({ cols: 96, rows: 52 }, { cols: 96, rows: 52 }), false);
	assert.equal(terminalSizeChanged({ cols: 96, rows: 52 }, { cols: 97, rows: 52 }), true);
});
