import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../lib/i18n";
import { KpiCard } from "./KpiCard";

const renderKpi = (props: Parameters<typeof KpiCard>[0]) => render(<I18nProvider initial="en"><KpiCard {...props} /></I18nProvider>);

describe("KpiCard", () => {
  it("shows the value and a positive change in green when up is good", () => {
    renderKpi({ label: "Revenue", value: "€120k", current: 120, previous: 100 });
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    const delta = screen.getByText("+20%");
    expect(delta.closest("span")).toHaveClass("text-emerald-700");
  });

  it("colours an increase red when lower is better", () => {
    renderKpi({ label: "Absence", value: "4%", current: 0.04, previous: 0.03, goodWhen: "down", mode: "points" });
    expect(screen.getByText("+1.0 pp").closest("span")).toHaveClass("text-red-700");
  });

  it("announces the comparison to screen readers", () => {
    renderKpi({ label: "Revenue", value: "€90k", current: 90, previous: 100 });
    expect(screen.getByText("vs. previous period")).toHaveClass("sr-only");
  });

  it("omits the change without a previous value", () => {
    renderKpi({ label: "Pipeline", value: "€1m", sub: "weighted €300k" });
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.getByText("weighted €300k")).toBeInTheDocument();
  });
});
