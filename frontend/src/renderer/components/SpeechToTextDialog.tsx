import { Mic, MicOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { TopbarButton } from "./TopbarButton";

type SpeechRecognitionResultLike = {
	0: { transcript?: string };
	isFinal?: boolean;
};

type SpeechRecognitionEventLike = {
	resultIndex: number;
	results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	start: () => void;
	stop: () => void;
	abort: () => void;
	onresult: ((event: SpeechRecognitionEventLike) => void) | null;
	onend: (() => void) | null;
	onerror: ((event: { error?: string }) => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const INSERT_EVENT = "ao:terminal:insert-text";

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
	if (typeof window === "undefined") return undefined;
	const maybeWindow = window as Window & {
		SpeechRecognition?: SpeechRecognitionCtor;
		webkitSpeechRecognition?: SpeechRecognitionCtor;
	};
	return maybeWindow.SpeechRecognition ?? maybeWindow.webkitSpeechRecognition;
}

function transcriptFromEvent(event: SpeechRecognitionEventLike): string {
	const parts: string[] = [];
	for (let i = 0; i < event.results.length; i += 1) {
		const text = event.results[i]?.[0]?.transcript?.trim();
		if (text) parts.push(text);
	}
	return parts.join(" ").trim();
}

export function SpeechToTextDialog() {
	const [open, setOpen] = useState(false);
	const [listening, setListening] = useState(false);
	const [transcript, setTranscript] = useState("");
	const [error, setError] = useState<string | null>(null);
	const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

	const supported = Boolean(getSpeechRecognitionCtor());

	const stopListening = useCallback(() => {
		recognitionRef.current?.stop();
		setListening(false);
	}, []);

	const reset = useCallback(() => {
		stopListening();
		setTranscript("");
		setError(null);
	}, [stopListening]);

	const startListening = useCallback(() => {
		const Ctor = getSpeechRecognitionCtor();
		if (!Ctor) {
			setError("Speech recognition is not available in this build.");
			return;
		}

		if (!recognitionRef.current) {
			const recognition = new Ctor();
			recognition.lang = "en-US";
			recognition.continuous = false;
			recognition.interimResults = true;
			recognition.onresult = (event) => {
				setTranscript(transcriptFromEvent(event));
			};
			recognition.onend = () => {
				setListening(false);
			};
			recognition.onerror = (event) => {
				setListening(false);
				setError(event.error ? `Speech recognition error: ${event.error}` : "Speech recognition failed.");
			};
			recognitionRef.current = recognition;
		}

		setError(null);
		setListening(true);
		recognitionRef.current.start();
	}, []);

	const insertTranscript = useCallback(async () => {
		const text = transcript.trim();
		if (!text) return;
		window.dispatchEvent(new CustomEvent<string>(INSERT_EVENT, { detail: text }));
		setOpen(false);
		reset();
	}, [reset, transcript]);

	useEffect(() => {
		if (open) return undefined;
		reset();
		return undefined;
	}, [open, reset]);

	return (
		<>
			<TopbarButton aria-label="Open speech-to-text" onClick={() => setOpen(true)} style={undefined} variant="accent">
				<Mic className="size-icon-md" aria-hidden="true" />
				STT
			</TopbarButton>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) reset();
				}}
			>
				<DialogContent className="max-w-[560px]">
					<DialogHeader>
						<DialogTitle className="text-[15px]">Speech to text</DialogTitle>
						<DialogDescription>
							Start speech recognition, review the transcript, then insert it into the focused terminal.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-3">
						<div className="flex flex-wrap items-center gap-2">
							<Button type="button" onClick={listening ? stopListening : startListening} variant={listening ? "secondary" : "primary"}>
								{listening ? <MicOff className="size-icon-md" aria-hidden="true" /> : <Mic className="size-icon-md" aria-hidden="true" />}
								{listening ? "Stop listening" : "Start listening"}
							</Button>
							<Button type="button" onClick={insertTranscript} disabled={!transcript.trim()} variant="outline">
								Insert into terminal
							</Button>
						</div>

						{!supported && (
							<p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm leading-5 text-warning">
								Speech recognition is not available in this build. You can still type the transcript below.
							</p>
						)}

						{error && <p className="text-sm leading-5 text-error">{error}</p>}

						<textarea
							className="min-h-32 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
							onChange={(event) => setTranscript(event.target.value)}
							placeholder="Transcript appears here."
							value={transcript}
						/>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
