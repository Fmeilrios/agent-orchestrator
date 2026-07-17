const DELETE = "\x7f";

/** Translate one native TextInput buffer update into terminal input. */
export function terminalInputDelta(previous: string, next: string): string {
	const before = Array.from(previous);
	const after = Array.from(next);
	let shared = 0;
	while (shared < before.length && shared < after.length && before[shared] === after[shared]) shared++;
	return DELETE.repeat(before.length - shared) + after.slice(shared).join("");
}

/** Enter is sent separately, then both native and displayed buffers restart. */
export function terminalInputEnter(): { data: string; buffer: string } {
	return { data: "\r", buffer: "" };
}

/** Handle keys that native text changes cannot represent. */
export function terminalInputKey(key: string, buffer: string): string {
	if (key === "Backspace") return buffer ? "" : DELETE;
	return terminalNamedKey[key] ?? "";
}

export const terminalNamedKey: Record<string, string> = {
	Tab: "\t",
	Escape: "\x1b",
	ArrowUp: "\x1b[A",
	ArrowDown: "\x1b[B",
	ArrowRight: "\x1b[C",
	ArrowLeft: "\x1b[D",
};
