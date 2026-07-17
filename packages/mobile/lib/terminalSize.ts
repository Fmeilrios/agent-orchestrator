export type TerminalSize = { cols: number; rows: number };

export function terminalSizeChanged(previous: TerminalSize | null, next: TerminalSize): boolean {
	return previous?.cols !== next.cols || previous.rows !== next.rows;
}
