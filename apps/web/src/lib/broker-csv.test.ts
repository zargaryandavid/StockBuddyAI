import { describe, expect, it } from "vitest";

import { cleanTicker, parseBrokerCsv, parseNumber, SKIP_REASONS } from "./broker-csv";

const bySymbol = (rows: { ticker: string }[]) => Object.fromEntries(rows.map((row) => [row.ticker, row]));

describe("parseNumber", () => {
  it("handles currency, thousands, parentheses, signs and blanks", () => {
    expect(parseNumber("$1,234.56")).toBe(1234.56);
    expect(parseNumber("(12.34)")).toBe(-12.34);
    expect(parseNumber("($1,000.00)")).toBe(-1000);
    expect(parseNumber("$-12.00")).toBe(-12);
    expect(parseNumber("-$5")).toBe(-5);
    expect(parseNumber("+3.5")).toBe(3.5);
    expect(parseNumber("12.5%")).toBe(12.5);
    expect(parseNumber("1 234,56", true)).toBe(1234.56);
    expect(parseNumber("1.234,56 €", true)).toBe(1234.56);
    for (const blank of ["", "--", "n/a", "N/A", "-", undefined]) expect(parseNumber(blank)).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });
});

describe("cleanTicker", () => {
  it("uppercases and normalises symbols", () => {
    expect(cleanTicker(" aapl ")).toBe("AAPL");
    expect(cleanTicker("SPAXX**")).toBe("SPAXX");
    expect(cleanTicker("BRK/B")).toBe("BRK.B");
    expect(cleanTicker("BRK B")).toBe("BRK.B");
    expect(cleanTicker("MSFT NASDAQ")).toBe("MSFT");
  });
});

describe("parseBrokerCsv", () => {
  it("parses a Fidelity positions export with money market, pending activity and disclaimers", () => {
    const csv = `﻿Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type
Z12345678,Individual,SPAXX**,HELD IN MONEY MARKET,,,,$1520.33,,,,,5.12%,,,Cash,
Z12345678,Individual,AAPL,APPLE INC,10,$190.00,+$1.20,$1900.00,+$12.00,+0.63%,+$400.00,+26.67%,6.40%,$1500.00,$150.00,Cash,
Z12345678,Individual,VOO,VANGUARD INDEX FDS S&P 500 ETF SHS NEW,5.5,$450.00,-$2.00,$2475.00,-$11.00,-0.44%,+$275.00,+12.50%,8.34%,"$2,200.00",$400.00,Cash,
Z12345678,Individual, -AAPL240119C150,AAPL JAN 19 2024 $150 CALL,1,$5.00,,$500.00,,,,,,$300.00,$3.00,Margin,
X98765432,ROTH IRA,AAPL,APPLE INC,30,$190.00,+$1.20,$5700.00,,,,,,"$5,100.00",$170.00,Cash,
X98765432,ROTH IRA,FDRXX**,FIDELITY GOVERNMENT CASH RESERVES,,,,$100.00,,,,,,,,Cash,
Pending Activity,,,,,,,$-12.00,,,,,,,,,

"The data and information in this spreadsheet is provided to you solely for your use and is not for distribution. The spreadsheet is provided for informational purposes only, and is not intended to provide advice, nor should it be construed as an offer to sell, a solicitation of an offer to buy or a recommendation for any security or insurance product by Fidelity or any third party."

"Brokerage services are provided by Fidelity Brokerage Services LLC (FBS), 900 Salem Street, Smithfield, RI 02917."
"Date downloaded Oct-27-2026 10:15 a.m ET"
`;
    const result = parseBrokerCsv(csv);
    expect(result.broker).toBe("Fidelity");
    expect(result.cash).toBe(1620.33);
    const rows = bySymbol(result.rows);
    expect(Object.keys(rows).sort()).toEqual(["AAPL", "VOO"]);
    // 10 @ 150 + 30 @ 170 → 40 @ 165
    expect(rows.AAPL).toEqual({ ticker: "AAPL", shares: 40, purchase_price: 165 });
    expect(rows.VOO).toEqual({ ticker: "VOO", shares: 5.5, purchase_price: 400 });
    expect(result.skipped).toEqual([{ line: 5, reason: SKIP_REASONS.option, symbol: "-AAPL240119C150" }]);
  });

  it("parses a Schwab export with a title line, cash, account total and total-only cost basis", () => {
    const csv = `"Positions for account Individual ...123 as of 09:52 PM ET, 10/27/2026"
""
"Symbol","Description","Qty (Quantity)","Price","Price Chng $ (Price Change $)","Price Chng % (Price Change %)","Mkt Val (Market Value)","Day Chng $ (Day Change $)","Day Chng % (Day Change %)","Cost Basis","Gain $ (Gain/Loss $)","Gain % (Gain/Loss %)","Reinvest?","Reinvest Capital Gains?","% of Acct (% of Account)","Security Type"
"MSFT","MICROSOFT CORP","25","$410.50","$2.10","0.51%","$10,262.50","$52.50","0.51%","$7,500.00","$2,762.50","36.83%","Yes","N/A","40.1%","Equity"
"SCHD","SCHWAB US DIVIDEND EQUITY ETF","100","$27.80","-$0.10","-0.36%","$2,780.00","-$10.00","-0.36%","$2,650.00","$130.00","4.91%","Yes","N/A","10.9%","ETFs & Closed End Funds"
"BRK/B","BERKSHIRE HATHAWAY CL B","2","$450.00","$1.00","0.22%","$900.00","$2.00","0.22%","--","--","--","No","N/A","3.5%","Equity"
"AAPL 01/16/2027 200.00 C","CALL APPLE INC $200 EXP 01/16/27","1","$12.00","","","$1,200.00","","","$900.00","$300.00","33.3%","N/A","N/A","4.7%","Option"
"Cash & Cash Investments","--","--","--","--","--","$10,500.75","$0.00","0%","--","--","--","--","--","41.0%","Cash and Money Market"
"Account Total","--","--","--","--","--","$25,643.25","$44.50","0.17%","$11,050.00","$3,192.50","28.9%","--","--","--","--"
`;
    const result = parseBrokerCsv(csv);
    expect(result.broker).toBe("Charles Schwab");
    expect(result.cash).toBe(10500.75);
    expect(result.rows).toEqual([
      { ticker: "MSFT", shares: 25, purchase_price: 300 },
      { ticker: "SCHD", shares: 100, purchase_price: 26.5 },
      { ticker: "BRK.B", shares: 2, purchase_price: null },
    ]);
    expect(result.skipped).toEqual([{ line: 7, reason: SKIP_REASONS.option, symbol: "AAPL 01/16/2027 200.00 C" }]);
  });

  it("parses a Vanguard export and stops before the transactions table", () => {
    const csv = `Account Number,Investment Name,Symbol,Shares,Share Price,Total Value,
12345678,Vanguard Federal Money Market Fund,VMFXX,830.12,1,830.12,
12345678,Vanguard Total Stock Market ETF,VTI,12.3456,260.10,3211.04,
12345678,Vanguard Total International Stock ETF,VXUS,40,62.5,2500,
87654321,Vanguard Total Stock Market ETF,VTI,7.6544,260.10,1990.91,



Account Number,Trade Date,Settlement Date,Transaction Type,Transaction Description,Investment Name,Symbol,Shares,Share Price,Principal Amount,Commissions and Fees,Net Amount,Accrued Interest,Account Type,
12345678,2026-10-01,2026-10-02,Buy,Buy,Vanguard Total Stock Market ETF,VTI,1.0000,250.00,-250.00,0.0,-250.00,0.0,CASH,
`;
    const result = parseBrokerCsv(csv);
    expect(result.broker).toBe("Vanguard");
    expect(result.cash).toBe(830.12);
    expect(result.rows).toEqual([
      { ticker: "VTI", shares: 20, purchase_price: null },
      { ticker: "VXUS", shares: 40, purchase_price: null },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("parses an E*TRADE portfolio download with account summary, CASH and TOTAL rows", () => {
    const csv = `Account Summary
Account,Net Account Value,Total Gain $,Total Gain %,Day's Gain Unrealized $,Day's Gain Unrealized %,Available For Withdrawal,Cash Purchasing Power
Brokerage -1234,"12,345.67",1234.5,11.1,12.3,0.1,500,500

View Summary - All Positions
Symbol,Last Price $,Change $,Change %,Quantity,Price Paid $,Day's Gain $,Total Gain $,Total Gain %,Value $
NVDA,130.5,1.5,1.16,20,95.25,30,705,37.01,2610
KO,62.1,-0.2,-0.32,15,58,-3,61.5,7.07,931.5
CASH,,,,,,,,,"1,250.40"
TOTAL,,,,,,27,766.5,,"4,791.90"
`;
    const result = parseBrokerCsv(csv);
    expect(result.broker).toBe("E*TRADE");
    expect(result.cash).toBe(1250.4);
    expect(result.rows).toEqual([
      { ticker: "NVDA", shares: 20, purchase_price: 95.25 },
      { ticker: "KO", shares: 15, purchase_price: 58 },
    ]);
  });

  it("parses a Robinhood-style export with fractional shares", () => {
    const csv = `Name,Symbol,Shares,Price,Average Cost,Total Return,Equity
Tesla,TSLA,3.125,$250.00,$210.40,$123.75,$781.25
Apple,AAPL,0.5,$190.00,$180.00,$5.00,$95.00
`;
    const result = parseBrokerCsv(csv);
    expect(result.broker).toBe("Robinhood");
    expect(result.cash).toBeNull();
    expect(result.rows).toEqual([
      { ticker: "TSLA", shares: 3.125, purchase_price: 210.4 },
      { ticker: "AAPL", shares: 0.5, purchase_price: 180 },
    ]);
  });

  it("parses an Interactive Brokers activity statement, using only Open Positions summary rows", () => {
    const csv = `Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers LLC
Statement,Data,Period,"October 27, 2026"
Net Asset Value,Header,Asset Class,Prior Total,Current Long,Current Short,Current Total,Change
Net Asset Value,Data,Cash ,1000,1200,0,1200,200
Mark-to-Market Performance Summary,Header,Asset Category,Symbol,Prior Quantity,Current Quantity,Prior Price,Current Price
Mark-to-Market Performance Summary,Data,Stocks,AAPL,100,100,180,190
Open Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Quantity,Mult,Cost Price,Cost Basis,Close Price,Value,Unrealized P/L,Code
Open Positions,Data,Summary,Stocks,USD,AAPL,100,1,150.25,15025,190,19000,3975,
Open Positions,Data,Lot,Stocks,USD,AAPL,60,1,140,8400,190,11400,3000,
Open Positions,Data,Summary,Stocks,USD,SHOP,10,1,70.5,705,80,800,95,
Open Positions,Total,,Stocks,USD,,,,,15730,,19800,4070,
Open Positions,Data,Summary,Equity and Index Options,USD,AAPL 17JAN27 200 C,1,100,5.2,520,6,600,80,
Open Positions,Total,,Equity and Index Options,USD,,,,,520,,600,80,
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price
Trades,Data,Order,Stocks,USD,SHOP,"2026-10-01, 10:00:00",10,70.5
`;
    const result = parseBrokerCsv(csv);
    expect(result.broker).toBe("Interactive Brokers");
    expect(result.rows).toEqual([
      { ticker: "AAPL", shares: 100, purchase_price: 150.25 },
      { ticker: "SHOP", shares: 10, purchase_price: 70.5 },
    ]);
    expect(result.skipped).toEqual([{ line: 13, reason: SKIP_REASONS.option, symbol: "AAPL 17JAN27 200 C" }]);
  });

  it("parses an IBKR TWS portfolio export (Financial Instrument / Position / Avg Price)", () => {
    const csv = `Financial Instrument,Position,Avg Price,Market Value
AMZN NASDAQ,12,145.10,"2,100.00"
`;
    const result = parseBrokerCsv(csv);
    expect(result.broker).toBe("Interactive Brokers");
    expect(result.rows).toEqual([{ ticker: "AMZN", shares: 12, purchase_price: 145.1 }]);
  });

  it("parses a semicolon file with decimal commas", () => {
    const csv = `Portfolio export 27.10.2026
Ticker;Name;Anzahl;Shares;Avg Cost;Market Value
SAP;SAP SE;;10;120,50;1.850,00
ASML;ASML Holding;;2;600;1.400,00
ADS;Adidas;;1.000;180,25;200.000,00
`;
    const result = parseBrokerCsv(csv);
    expect(result.broker).toBeNull();
    expect(result.rows).toEqual([
      { ticker: "SAP", shares: 10, purchase_price: 120.5 },
      { ticker: "ASML", shares: 2, purchase_price: 600 },
      { ticker: "ADS", shares: 1000, purchase_price: 180.25 },
    ]);
  });

  it("parses a tab-separated Webull export", () => {
    const csv = "Webull positions\nSymbol\tName\tQuantity\tAvg Price\tMarket Value\nAMD\tAdvanced Micro Devices\t8\t$110.00\t$1,200.00\n";
    const result = parseBrokerCsv(csv);
    expect(result.broker).toBe("Webull");
    expect(result.rows).toEqual([{ ticker: "AMD", shares: 8, purchase_price: 110 }]);
  });

  it("cleans up a messy generic file and explains every skipped line", () => {
    const csv = `My holdings (exported by hand)\r
\r
 TICKER , Quantity , Total Cost , Notes \r
msft ,"1,000","$300,000.00",core\r
googl*,5,(10.00),bad cost\r
"BRK B",3,"$1,200.00",\r
Some long note line without a number,,,\r
!!!,4,40,\r
XYZ,,100,missing qty\r
TSLA,-2,500,short\r
msft,1000,"$400,000.00",second account\r
Money Market,,"$2,000.00",\r
AAPL 240119C00150000,1,500,option\r
Total,,"$701,200.00",\r
`;
    const result = parseBrokerCsv(csv);
    expect(result.broker).toBeNull();
    expect(result.cash).toBe(2000);
    expect(result.rows).toEqual([
      { ticker: "MSFT", shares: 2000, purchase_price: 350 },
      { ticker: "GOOGL", shares: 5, purchase_price: null },
      { ticker: "BRK.B", shares: 3, purchase_price: 400 },
    ]);
    expect(result.skipped).toEqual([
      { line: 8, reason: SKIP_REASONS.invalidTicker, symbol: "!!!" },
      { line: 9, reason: SKIP_REASONS.missingShares, symbol: "XYZ" },
      { line: 10, reason: SKIP_REASONS.nonPositive, symbol: "TSLA" },
      { line: 13, reason: SKIP_REASONS.option, symbol: "AAPL 240119C00150000" },
    ]);
  });

  it("reports a missing header instead of guessing", () => {
    const result = parseBrokerCsv("hello,world\n1,2\n");
    expect(result.rows).toEqual([]);
    expect(result.cash).toBeNull();
    expect(result.skipped).toEqual([{ line: 1, reason: SKIP_REASONS.noHeader }]);
  });
});
