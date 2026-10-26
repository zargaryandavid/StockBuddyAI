import { describe, expect, it } from "vitest";

import {
  combinePositions,
  parsePortfolioCsv,
  parsePortfolioCsvPreview,
} from "./portfolio";

describe("parsePortfolioCsv", () => {
  it("normalizes tickers and parses whole shares", () => {
    expect(parsePortfolioCsv("ticker,shares\naapl,20\nMSFT,10\n")).toEqual([
      { ticker: "AAPL", shares: 20 },
      { ticker: "MSFT", shares: 10 },
    ]);
  });

  it("rejects fractional shares", () => {
    expect(() => parsePortfolioCsv("ticker,shares\nAAPL,1.5\n")).toThrow(
      "non-negative whole number",
    );
  });

  it("imports an optional purchase price", () => {
    expect(
      parsePortfolioCsv("ticker,shares,purchase_price\nAAPL,12,185.50\n"),
    ).toEqual([{ ticker: "AAPL", shares: 12, purchase_price: 185.5 }]);
  });

  it("rejects duplicate tickers", () => {
    expect(() => parsePortfolioCsv("ticker,shares\nAAPL,1\naapl,2\n")).toThrow(
      "duplicate",
    );
  });

  it("supports column mapping and reports unrecognized rows in a preview", () => {
    const preview = parsePortfolioCsvPreview(
      "Security,Units,Book Cost\nAAPL,3,100\nbad ticker,2,50",
      { ticker: "security", quantity: "units", averageCost: "book cost" },
    );

    expect(preview.positions).toEqual([
      { ticker: "AAPL", shares: 3, purchase_price: 100 },
    ]);
    expect(preview.errors[0]).toContain("Row 3");
  });

  it("combines duplicate positions using weighted average cost", () => {
    expect(
      combinePositions(
        { ticker: "AAPL", shares: 10, purchase_price: 100 },
        { ticker: "AAPL", shares: 5, purchase_price: 130 },
      ),
    ).toMatchObject({ shares: 15, purchase_price: 110 });
  });
});
