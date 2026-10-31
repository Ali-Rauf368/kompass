import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveProvider } from "../lib/live";
import { ME, mockFetch, renderWithProviders } from "../test/utils";
import { LeavePage } from "./Leave";

const page = (items: unknown[] = []) => ({ path: "/leave?", body: { items, total: items.length, page: 1, pageSize: 20, pages: 1 } });
const balance = { path: "/leave/balance", body: { year: 2026, entitlement: 30, approved: 12, pending: 3, remaining: 15 } };

describe("LeavePage", () => {
  it("shows the vacation balance", async () => {
    mockFetch([ME(), balance, page()]);
    renderWithProviders(<LiveProvider enabled={false}><LeavePage /></LiveProvider>, { route: "/hr/leave" });
    expect(await screen.findByText("15 days left")).toBeInTheDocument();
    expect(screen.getByText("12 taken · 3 pending · 30 entitlement")).toBeInTheDocument();
  });

  it("counts working days as the user picks dates and submits the request", async () => {
    const calls = mockFetch([ME(), balance, page(), { method: "POST", path: "/leave", status: 201, body: { leave: { id: 9 } } }]);
    renderWithProviders(<LiveProvider enabled={false}><LeavePage /></LiveProvider>, { route: "/hr/leave" });
    await userEvent.click(await screen.findByRole("button", { name: "Request leave" }));
    const dialog = await screen.findByRole("dialog");
    // Mon 1 June – Fri 5 June 2026 contains Corpus Christi (Thu 4 June)
    await userEvent.type(within(dialog).getByLabelText("From"), "2026-06-01");
    await userEvent.type(within(dialog).getByLabelText("To"), "2026-06-05");
    expect(within(dialog).getByText("4")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Submit request" }));
    expect(await screen.findByText("Request submitted. Your manager has been notified.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ type: "VACATION", startDate: "2026-06-01", endDate: "2026-06-05" });
  });

  it("only offers the approvals tab to managers and HR", async () => {
    mockFetch([ME(["EMPLOYEE"]), balance, page()]);
    const { unmount } = renderWithProviders(<LiveProvider enabled={false}><LeavePage /></LiveProvider>, { route: "/hr/leave" });
    expect(await screen.findByRole("tab", { name: "My requests" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "To approve" })).not.toBeInTheDocument();
    unmount();

    mockFetch([ME(["MANAGER", "EMPLOYEE"]), balance, page()]);
    renderWithProviders(<LiveProvider enabled={false}><LeavePage /></LiveProvider>, { route: "/hr/leave" });
    expect(await screen.findByRole("tab", { name: "To approve" })).toBeInTheDocument();
  });
});
