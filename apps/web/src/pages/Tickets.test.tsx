import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../lib/i18n";
import { SlaCell } from "./Tickets";

const now = Date.parse("2026-05-01T12:00:00Z");
const cell = (t: Parameters<typeof SlaCell>[0]["ticket"]) => render(<I18nProvider initial="en"><SlaCell ticket={t} now={now} /></I18nProvider>);

describe("SlaCell", () => {
  it("shows time remaining", () => {
    cell({ slaDueAt: "2026-05-02T12:00:00Z", resolvedAt: null, status: "OPEN" });
    expect(screen.getByText("due tomorrow")).toBeInTheDocument();
  });

  it("warns when the SLA is breached", () => {
    cell({ slaDueAt: "2026-05-01T09:00:00Z", resolvedAt: null, status: "IN_PROGRESS" });
    expect(screen.getByText("breached 3 hours ago")).toHaveClass("text-red-700");
  });

  it("reports met or missed for resolved tickets", () => {
    const { unmount } = cell({ slaDueAt: "2026-05-01T09:00:00Z", resolvedAt: "2026-05-01T08:00:00Z", status: "RESOLVED" });
    expect(screen.getByText("met")).toBeInTheDocument();
    unmount();
    cell({ slaDueAt: "2026-05-01T09:00:00Z", resolvedAt: "2026-05-01T10:00:00Z", status: "RESOLVED" });
    expect(screen.getByText("missed")).toBeInTheDocument();
  });
});
