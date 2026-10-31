import { describe, expect, it } from "@jest/globals";
import { holidaysNRW, toDateOnly, workingDaysBetween } from "./dates";

describe("holidaysNRW", () => {
  it("includes movable feasts computed from Easter", () => {
    const h = holidaysNRW(2026); // Easter Sunday 2026 is 5 April
    expect(h.has("2026-04-03")).toBe(true); // Good Friday
    expect(h.has("2026-04-06")).toBe(true); // Easter Monday
    expect(h.has("2026-05-14")).toBe(true); // Ascension
    expect(h.has("2026-05-25")).toBe(true); // Whit Monday
    expect(h.has("2026-06-04")).toBe(true); // Corpus Christi (NRW)
  });

  it("includes fixed holidays like German Unity Day and All Saints' Day", () => {
    const h = holidaysNRW(2027);
    expect(h.has("2027-10-03")).toBe(true);
    expect(h.has("2027-11-01")).toBe(true);
  });
});

describe("workingDaysBetween", () => {
  it("counts a plain Monday–Friday week as five days", () => {
    expect(workingDaysBetween(toDateOnly("2026-03-02"), toDateOnly("2026-03-06"))).toBe(5);
  });

  it("skips weekends", () => {
    expect(workingDaysBetween(toDateOnly("2026-03-06"), toDateOnly("2026-03-09"))).toBe(2);
  });

  it("skips public holidays (Easter week 2026 has two)", () => {
    expect(workingDaysBetween(toDateOnly("2026-03-30"), toDateOnly("2026-04-10"))).toBe(8);
  });

  it("returns 0 for a weekend-only range or reversed dates", () => {
    expect(workingDaysBetween(toDateOnly("2026-03-07"), toDateOnly("2026-03-08"))).toBe(0);
    expect(workingDaysBetween(toDateOnly("2026-03-10"), toDateOnly("2026-03-01"))).toBe(0);
  });
});
