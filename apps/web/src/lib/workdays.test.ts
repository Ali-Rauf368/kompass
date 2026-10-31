import { countWorkingDays, holidays } from "./workdays";

describe("countWorkingDays", () => {
  it("counts weekdays only", () => {
    expect(countWorkingDays("2026-03-02", "2026-03-08")).toBe(5);
  });

  it("skips NRW holidays such as Corpus Christi", () => {
    expect(holidays(2026).has("2026-06-04")).toBe(true);
    expect(countWorkingDays("2026-06-01", "2026-06-05")).toBe(4);
  });

  it("returns 0 for empty or reversed ranges", () => {
    expect(countWorkingDays("", "2026-01-01")).toBe(0);
    expect(countWorkingDays("2026-03-10", "2026-03-01")).toBe(0);
  });
});
