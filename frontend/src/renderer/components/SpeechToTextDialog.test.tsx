import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechToTextDialog } from "./SpeechToTextDialog";

type FakeSpeechRecognitionEvent = {
	resultIndex: number;
	results: ArrayLike<{ 0: { transcript?: string } }>;
};

const state = vi.hoisted(() => ({
	recognition: null as null | FakeSpeechRecognition,
}));

class FakeSpeechRecognition {
	lang = "";
	continuous = false;
	interimResults = false;
	onresult: ((event: FakeSpeechRecognitionEvent) => void) | null = null;
	onend: (() => void) | null = null;
	onerror: ((event: { error?: string }) => void) | null = null;
	start = vi.fn();
	stop = vi.fn();
	abort = vi.fn();

	constructor() {
		state.recognition = this;
	}
}

function setSpeechRecognition(enabled: boolean) {
	if (enabled) {
		Object.defineProperty(window, "SpeechRecognition", {
			configurable: true,
			value: FakeSpeechRecognition,
		});
		return;
	}
	delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
}

beforeEach(() => {
	state.recognition = null;
	setSpeechRecognition(true);
	window.ao!.clipboard.writeText = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
	setSpeechRecognition(false);
});

describe("SpeechToTextDialog", () => {
	it("keeps earlier finalized speech when later result events arrive", async () => {
		const user = userEvent.setup();
		render(<SpeechToTextDialog />);

		await user.click(screen.getByRole("button", { name: "Open speech-to-text" }));
		await user.click(screen.getByRole("button", { name: "Start listening" }));

		expect(state.recognition?.start).toHaveBeenCalledTimes(1);

		state.recognition?.onresult?.({
			resultIndex: 0,
			results: [{ 0: { transcript: "Hello" } }],
		});
		expect(await screen.findByDisplayValue("Hello")).toBeInTheDocument();

		state.recognition?.onresult?.({
			resultIndex: 1,
			results: [{ 0: { transcript: "Hello" } }, { 0: { transcript: "world" } }],
		});

		await waitFor(() => {
			expect(screen.getByDisplayValue("Hello world")).toBeInTheDocument();
		});
	});

	it("dispatches the terminal insert event without writing speech to the clipboard", async () => {
		const user = userEvent.setup();
		const insertListener = vi.fn();
		window.addEventListener("ao:terminal:insert-text", insertListener as EventListener);
		render(<SpeechToTextDialog />);

		await user.click(screen.getByRole("button", { name: "Open speech-to-text" }));
		await user.click(screen.getByRole("button", { name: "Start listening" }));

		state.recognition?.onresult?.({
			resultIndex: 0,
			results: [{ 0: { transcript: "Speak now" } }],
		});
		await screen.findByDisplayValue("Speak now");

		await user.click(screen.getByRole("button", { name: "Insert into terminal" }));

		expect(window.ao!.clipboard.writeText).not.toHaveBeenCalled();
		expect(insertListener).toHaveBeenCalledTimes(1);
		expect((insertListener.mock.calls[0][0] as CustomEvent<string>).detail).toBe("Speak now");
		window.removeEventListener("ao:terminal:insert-text", insertListener as EventListener);
	});
});
