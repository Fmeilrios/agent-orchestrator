import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, workspaceQueryMock } = vi.hoisted(() => ({
	navigateMock: vi.fn(),
	workspaceQueryMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

vi.mock("../hooks/useWorkspaceQuery", () => ({
	useWorkspaceQuery: workspaceQueryMock,
}));

import { SessionsBoard } from "./SessionsBoard";

function renderBoard(projectId?: string) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={queryClient}>
			<SessionsBoard projectId={projectId} />
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	navigateMock.mockReset();
	workspaceQueryMock.mockReset().mockReturnValue({ data: [], isError: false });
});

describe("SessionsBoard", () => {
	it("does not show an agent setup warning on the board", () => {
		renderBoard();

		expect(screen.queryByText(/reload agents/i)).not.toBeInTheDocument();
	});

	it("labels an idle session as Idle, not Working", () => {
		workspaceQueryMock.mockReturnValue({
			data: [
				{
					id: "p1",
					name: "radic",
					path: "/tmp/radic",
					sessions: [
						{
							id: "s1",
							workspaceId: "p1",
							workspaceName: "radic",
							title: "brand-font-pipeline",
							provider: "claude-code",
							branch: "ao/radic-5",
							status: "idle",
							activity: { state: "idle", lastActivityAt: "2026-01-01T00:00:00Z" },
							updatedAt: "2026-01-01T00:00:00Z",
							prs: [],
						},
					],
				},
			],
			isError: false,
		});

		renderBoard("p1");

		fireEvent.click(screen.getByRole("button", { name: /idle sessions/i }));
		const idleCard = screen.getByText("brand-font-pipeline").closest('[role="button"]') as HTMLElement;
		expect(within(idleCard).getByText("Idle")).toBeInTheDocument();
	});

	it("collapses idle sessions into a nested Working-column stack", () => {
		workspaceQueryMock.mockReturnValue({
			data: [
				{
					id: "p1",
					name: "radic",
					path: "/tmp/radic",
					sessions: [
						{
							id: "s0",
							workspaceId: "p1",
							workspaceName: "radic",
							title: "active-task",
							provider: "claude-code",
							branch: "ao/radic-4",
							status: "working",
							activity: { state: "active", lastActivityAt: "2026-01-01T00:00:00Z" },
							updatedAt: "2026-01-01T00:00:00Z",
							prs: [],
						},
						{
							id: "s1",
							workspaceId: "p1",
							workspaceName: "radic",
							title: "idle-no-pr-task",
							provider: "claude-code",
							branch: "ao/radic-5",
							status: "working",
							activity: { state: "idle", lastActivityAt: "2026-01-01T00:00:00Z" },
							updatedAt: "2026-01-01T00:00:00Z",
							prs: [],
						},
						{
							id: "s2",
							workspaceId: "p1",
							workspaceName: "radic",
							title: "idle-with-pr-task",
							provider: "claude-code",
							branch: "ao/radic-6",
							status: "working",
							activity: { state: "idle", lastActivityAt: "2026-01-01T00:00:00Z" },
							updatedAt: "2026-01-01T00:00:00Z",
							prs: [{ number: 7, url: "https://github.com/acme/radic/pull/7", state: "open" }],
						},
					],
				},
			],
			isError: false,
		});

		renderBoard("p1");

		expect(screen.getByText("active-task")).toBeInTheDocument();
		expect(screen.queryByText("idle-no-pr-task")).not.toBeInTheDocument();
		expect(screen.queryByText("idle-with-pr-task")).not.toBeInTheDocument();

		const idleStackToggle = screen.getByRole("button", { name: /idle sessions/i });
		expect(idleStackToggle).toHaveAttribute("aria-expanded", "false");
		expect(within(idleStackToggle).getByText("2")).toBeInTheDocument();

		fireEvent.click(idleStackToggle);

		expect(idleStackToggle).toHaveAttribute("aria-expanded", "true");
		const idleCard = screen.getByText("idle-no-pr-task").closest('[role="button"]') as HTMLElement;
		expect(screen.getByText("idle-with-pr-task")).toBeInTheDocument();
		const badge = within(idleCard).getByText("Working").closest("span");
		expect(badge).toHaveClass("text-working");
		expect(badge).not.toHaveClass("text-passive");
	});
});
