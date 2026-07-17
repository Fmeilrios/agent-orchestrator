export function shouldStartVoiceAction(requested: boolean, started: boolean, appState: string): boolean {
	return requested && !started && appState === "active";
}
