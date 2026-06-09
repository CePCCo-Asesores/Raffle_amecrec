import { describe, it, expect } from "vitest";
import { cn, formatTicketNumber, getTicketDigits } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("deduplicates tailwind conflicts", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("ignores falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});

describe("formatTicketNumber", () => {
  it("pads to 2 digits for 100 tickets", () => {
    expect(formatTicketNumber(0, 100)).toBe("00");
    expect(formatTicketNumber(9, 100)).toBe("09");
    expect(formatTicketNumber(99, 100)).toBe("99");
  });

  it("pads to 3 digits for 1000 tickets", () => {
    expect(formatTicketNumber(0, 1000)).toBe("000");
    expect(formatTicketNumber(42, 1000)).toBe("042");
    expect(formatTicketNumber(999, 1000)).toBe("999");
  });

  it("pads to 5 digits for 100000 tickets", () => {
    expect(formatTicketNumber(0, 100000)).toBe("00000");
    expect(formatTicketNumber(7, 100000)).toBe("00007");
  });

  it("returns raw number when totalTickets <= 1", () => {
    expect(formatTicketNumber(0, 1)).toBe("0");
    expect(formatTicketNumber(0, 0)).toBe("0");
  });

  it("handles single-digit ranges correctly", () => {
    expect(formatTicketNumber(7, 10)).toBe("7");
    expect(formatTicketNumber(9, 10)).toBe("9");
  });
});

describe("getTicketDigits", () => {
  it("returns 1 for totalTickets <= 1", () => {
    expect(getTicketDigits(0)).toBe(1);
    expect(getTicketDigits(1)).toBe(1);
  });

  it("returns correct digit count", () => {
    expect(getTicketDigits(10)).toBe(1);
    expect(getTicketDigits(100)).toBe(2);
    expect(getTicketDigits(1000)).toBe(3);
    expect(getTicketDigits(100000)).toBe(5);
  });
});
