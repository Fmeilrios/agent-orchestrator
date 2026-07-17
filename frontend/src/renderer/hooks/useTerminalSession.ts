// Terminal Attachment (see CONTEXT.md): the live binding between a terminal
// pane and a session's PTY over the mux. The hook owns the whole attachment
// lifecycle — open ordering, auto-reattach with backoff, error surfacing, and
// exit handling — so the pane component only renders.
//
// Status rule: the frontend never writes a session's display status. On mux
// `exited`/`error` it invalidates the workspaces query and lets the daemon's
// derived status flow back (docs/architecture.md).

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "../lib/api-client";
import { captureRendererEvent } from "../lib/telemetry";
import { createTerminalMux, muxUrlFromApiBase, type TerminalMux } from "../lib/terminal-mux";
import type { WorkspaceSession } from "../types/workspace";
import { workspaceQueryKey } from "./useWorkspaceQuery";

/**
 * The slice of xterm's Terminal the attachment needs. Structural, so tests can
 * drive the hook with a tiny fake instead of a real xterm + DOM.
 */
export type TerminalUserInputSource = "keyboard" | "paste" | "composition" | "shortcut" | "wheel";

export type AttachableTerminal = {
	cols: number;
	rows: number;
	write: (data: Uint8Array) => void;
	writeln: (line: string) => void;
	/**
	 * Erase screen + scrollback and home the cursor, preserving terminal modes.
	 * Never a full reset (RIS): that would drop zellij's mouse-tracking mode
	 * for the gap until the fresh attach's handshake re-asserts it — a window
	 * with wheel scroll dead (see XtermTerminal's CLEAR_SEQUENCE).
	 */
	clear: () => void;
	onUserInput: (listener: (data: string, source: TerminalUserInputSource) => void) => { dispose: () => void };
	onResize: (listener: (size: { cols: number; rows: number }) => void) => { dispose: () => void };
};

export type TerminalSessionState =
	| "idle" // nothing attached (no session, or detached)
	| "connecting" // first attach in flight
	| "attached" // server acked the open
	| "reattaching" // socket dropped; waiting on backoff or daemon readiness
	| "exited" // PTY process ended; terminal kept for scrollback
	| "error"; // server reported a pane error; no automatic retry

export type UseTerminalSessionOptions = {
	/** Gates auto-reattach: when false, a dropped socket waits instead of retrying. */
	daemonReady: boolean;
	/** Test seam: build the mux client. Defaults to a fresh socket against the current API base. */
	createMux?: () => TerminalMux;
};

const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 8_000;
const OPEN_TIMEOUT_MS = 3_000;
// Trailing debounce on grid changes: a pane drag emits a burst of intermediate
// sizes; the attached program should get one SIGWINCH when the drag settles,
// not dozens (yyork's terminal-panel does the same at its socket layer).
const RESIZE_DEBOUNCE_MS = 100;

function defaultCreateMux(): TerminalMux {
	// Resolved per connect, not per hook: a daemon restart can change the port.
	return createTerminalMux(muxUrlFromApiBase(getApiBaseUrl()));
}

export function useTerminalSession(session: WorkspaceSession | undefined, options: UseTerminalSessionOptions) {
	const queryClient = useQueryClient();
	const [state, setState] = useState<TerminalSessionState>("idle");
	const [error, setError] = useState<string | undefined>(undefined);

	const sessionRef = useRef(session);
	sessionRef.current = session;
	const previousSessionStatusRef = useRef(session?.status);
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const stateRef = useRef<TerminalSessionState>(state);
	const connectRef = useRef<() => void>(() => undefined);

	const runtime = useRef({
		terminal: null as AttachableTerminal | null,
		mux: null as TerminalMux | null,
		handle: null as string | null,
		disposers: [] as Array<() => void>,
		retryTimer: null as ReturnType<typeof setTimeout> | null,
		openTimer: null as ReturnType<typeof setTimeout> | null,
		resizeTimer: null as ReturnType<typeof setTimeout> | null,
		attempts: 0,
		lastSize: null as { cols: number; rows: number } | null,
		generation: 0,
		inputReady: false,
		detached: true,
	});

	const transition = useCallback((next: TerminalSessionState) => {
		stateRef.current = next;
		setState(next);
	}, []);

	const invalidateWorkspaces = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: workspaceQueryKey });
	}, [queryClient]);

	const teardownMux = useCallback(() => {
		const r = runtime.current;
		if (r.retryTimer) {
			clearTimeout(r.retryTimer);
			r.retryTimer = null;
		}
		if (r.openTimer) {
			clearTimeout(r.openTimer);
			r.openTimer = null;
		}
		if (r.resizeTimer) {
			clearTimeout(r.resizeTimer);
			r.resizeTimer = null;
		}
		r.inputReady = false;
		if (r.mux && r.handle) {
			r.mux.close(r.handle);
		}
		r.disposers.forEach((dispose) => dispose());
		r.disposers = [];
		r.mux?.dispose();
		r.mux = null;
	}, []);

	const isCurrentAttachment = useCallback((generation: number, handle: string, mux: TerminalMux) => {
		const r = runtime.current;
		return !r.detached && r.generation === generation && r.handle === handle && r.mux === mux;
	}, []);

	const clearOpenTimer = useCallback((generation: number) => {
		const r = runtime.current;
		if (r.generation !== generation || !r.openTimer) return;
		clearTimeout(r.openTimer);
		r.openTimer = null;
	}, []);

	const scheduleReattach = useCallback(() => {
		const r = runtime.current;
		if (r.detached || !r.terminal || !r.handle) {
			return;
		}
		// A socket dropping after the PTY ended (or errored) changes nothing.
		if (stateRef.current === "exited" || stateRef.current === "error") {
			return;
		}
		transition("reattaching");
		// Not ready → no timer; the daemonReady effect reconnects when it flips.
		if (!optionsRef.current.daemonReady) {
			return;
		}
		if (r.retryTimer) {
			return;
		}
		const delay = Math.min(RETRY_BASE_MS * 2 ** r.attempts, RETRY_MAX_MS);
		r.attempts += 1;
		r.retryTimer = setTimeout(() => {
			r.retryTimer = null;
			connectRef.current();
		}, delay);
	}, [transition]);

	const connect = useCallback(() => {
		const r = runtime.current;
		const { terminal, handle } = r;
		if (!terminal || !handle || r.detached) {
			return;
		}
		const generation = r.generation + 1;
		r.generation = generation;
		r.inputReady = false;
		teardownMux();

		const mux = (optionsRef.current.createMux ?? defaultCreateMux)();
		r.mux = mux;

		r.disposers.push(
			mux.onData(handle, (bytes) => {
				if (!isCurrentAttachment(generation, handle, mux)) return;
				terminal.write(bytes);
			}),
			mux.onOpened(handle, () => {
				if (!isCurrentAttachment(generation, handle, mux)) return;
				clearOpenTimer(generation);
				r.inputReady = true;
				r.attempts = 0;
				setError(undefined);
				transition("attached");
			}),
			mux.onExit(handle, () => {
				if (!isCurrentAttachment(generation, handle, mux)) return;
				clearOpenTimer(generation);
				r.inputReady = false;
				terminal.writeln("\r\n\x1b[2m[process exited]\x1b[0m");
				transition("exited");
				invalidateWorkspaces();
			}),
			mux.onError(handle, (message) => {
				if (!isCurrentAttachment(generation, handle, mux)) return;
				clearOpenTimer(generation);
				r.inputReady = false;
				terminal.writeln(`\r\n\x1b[2m[terminal error] ${message}\x1b[0m`);
				setError(message);
				transition("error");
				void captureRendererEvent("ao.renderer.terminal_attach_failed", { reason: "pane_error" });
				invalidateWorkspaces();
			}),
			mux.onConnectionChange((connectionState) => {
				if (!isCurrentAttachment(generation, handle, mux)) return;
				if (connectionState === "closed") {
					clearOpenTimer(generation);
					r.inputReady = false;
					scheduleReattach();
				}
			}),
		);
		const input = terminal.onUserInput((data) => {
			if (!isCurrentAttachment(generation, handle, mux) || !r.inputReady) {
				return;
			}
			mux.sendInput(handle, data);
		});
		// xterm only fires onResize when the grid actually changed; the debounce
		// additionally collapses a drag's burst of changes into one PTY resize.
		// Do not re-send the same grid: every backend resize raises SIGWINCH, which
		// makes full-screen apps repaint their whole screen.
		const resize = terminal.onResize(({ cols, rows }) => {
			if (!isCurrentAttachment(generation, handle, mux)) return;
			if (r.resizeTimer) clearTimeout(r.resizeTimer);
			r.resizeTimer = setTimeout(() => {
				r.resizeTimer = null;
				if (!isCurrentAttachment(generation, handle, mux)) return;
				if (r.lastSize?.cols === cols && r.lastSize.rows === rows) return;
				r.lastSize = { cols, rows };
				mux.resize(handle, cols, rows);
			}, RESIZE_DEBOUNCE_MS);
		});
		r.disposers.push(
			() => input.dispose(),
			() => resize.dispose(),
		);

		// Keep current pixels during reconnect. Fresh attach output repaints them;
		// clearing first exposes that repaint as a top-to-bottom flash.
		mux.open(handle, terminal.cols, terminal.rows);
		r.lastSize = { cols: terminal.cols, rows: terminal.rows };
		mux.resize(handle, terminal.cols, terminal.rows);
		r.openTimer = setTimeout(() => {
			if (!isCurrentAttachment(generation, handle, mux)) return;
			r.openTimer = null;
			// Only the first timeout of a reattach sequence is reported; the
			// backoff loop retrying against a restarting daemon is not news.
			if (r.attempts === 0) {
				void captureRendererEvent("ao.renderer.terminal_attach_failed", { reason: "open_timeout" });
			}
			transition("reattaching");
			teardownMux();
			scheduleReattach();
		}, OPEN_TIMEOUT_MS);
	}, [clearOpenTimer, invalidateWorkspaces, isCurrentAttachment, scheduleReattach, teardownMux, transition]);
	connectRef.current = connect;

	/**
	 * Bind a terminal to the current session's PTY. Call once the terminal is
	 * opened (and fitted); returns the detach function for effect cleanup.
	 */
	const attach = useCallback(
		(terminal: AttachableTerminal) => {
			const r = runtime.current;
			const handle = sessionRef.current?.terminalHandleId ?? null;
			r.terminal = terminal;
			r.handle = handle;
			r.detached = false;
			r.attempts = 0;
			r.lastSize = null;
			setError(undefined);
			if (handle) {
				if (optionsRef.current.daemonReady) {
					transition("connecting");
					connect();
				} else {
					transition("reattaching");
				}
			} else {
				transition("idle");
			}
			return () => {
				r.generation += 1;
				r.detached = true;
				teardownMux();
				r.terminal = null;
				r.handle = null;
				r.inputReady = false;
				setError(undefined);
				transition("idle");
			};
		},
		[connect, teardownMux, transition],
	);

	// Daemon came back while we were waiting: reconnect immediately, without
	// backoff debt from attempts made against the dead daemon.
	const daemonReady = options.daemonReady;
	useEffect(() => {
		const r = runtime.current;
		if (!daemonReady || r.detached) return;
		if (stateRef.current !== "reattaching" || r.retryTimer) return;
		r.attempts = 0;
		connect();
	}, [daemonReady, connect]);

	useEffect(() => {
		const r = runtime.current;
		const handle = session?.terminalHandleId ?? null;
		const previousStatus = previousSessionStatusRef.current;
		previousSessionStatusRef.current = session?.status;
		if (!handle || previousStatus !== "terminated" || session?.status === "terminated" || r.detached || !r.terminal) {
			return;
		}
		if (r.handle !== handle) return;
		if (stateRef.current !== "exited" && stateRef.current !== "error") return;
		if (optionsRef.current.daemonReady) {
			transition("connecting");
			connect();
		} else {
			transition("reattaching");
		}
	}, [connect, session?.status, session?.terminalHandleId, transition]);

	// Belt-and-braces: never leak a socket past unmount, even if the owner
	// forgot to call detach.
	useEffect(
		() => () => {
			const r = runtime.current;
			r.generation += 1;
			r.detached = true;
			r.inputReady = false;
			teardownMux();
		},
		[teardownMux],
	);

	return { attach, state, error };
}
