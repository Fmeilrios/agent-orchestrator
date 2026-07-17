export function terminalOpenFrames(id: string, projectId?: string, cols?: number, rows?: number): object[] {
	const open = { ch: "terminal", id, type: "open", projectId, role: "secondary" };
	return cols === undefined || rows === undefined
		? [open]
		: [open, { ch: "terminal", id, type: "resize", cols, rows, projectId }];
}
