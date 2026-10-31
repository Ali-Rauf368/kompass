import { formatCents, formatEur, formatPercent, formatRelative, fullName } from "./format";

describe("formatting", () => {
  it("formats euros the German way", () => {
    expect(formatEur(1234.5, "de")).toMatch(/1\.235\s?€/);
    expect(formatCents(1999, "de")).toMatch(/19,99\s?€/);
  });

  it("formats euros the English way", () => {
    expect(formatEur(1234.5, "en")).toBe("€1,235");
  });

  it("formats percentages", () => {
    expect(formatPercent(0.4231, "en", 1)).toBe("42.3%");
  });

  it("describes times relative to now", () => {
    const now = Date.parse("2026-05-01T12:00:00Z");
    expect(formatRelative("2026-05-01T15:00:00Z", "en", now)).toBe("in 3 hours");
    expect(formatRelative("2026-04-29T12:00:00Z", "en", now)).toBe("2 days ago");
  });

  it("joins names and handles missing people", () => {
    expect(fullName({ firstName: "Lea", lastName: "Fischer" })).toBe("Lea Fischer");
    expect(fullName(null)).toBe("—");
  });
});
