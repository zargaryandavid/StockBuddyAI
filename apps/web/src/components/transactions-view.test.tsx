// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionsView } from "./transactions-view";

const transactions = [
  {
    id: "t1",
    portfolio_id: "p1",
    ticker: "AAPL",
    kind: "buy" as const,
    quantity: 10,
    price: 150,
    transacted_at: "2026-03-02T12:00:00Z",
    created_at: "2026-03-02T12:00:00Z",
  },
  {
    id: "t2",
    portfolio_id: "p1",
    ticker: "NVDA",
    kind: "sell" as const,
    quantity: 2,
    price: 200,
    transacted_at: "2026-05-02T12:00:00Z",
    created_at: "2026-05-02T12:00:00Z",
  },
];

function renderView(overrides: Partial<Parameters<typeof TransactionsView>[0]> = {}) {
  const onRecord = vi.fn(async () => undefined);
  render(
    <TransactionsView
      portfolios={[{ id: "p1", name: "Core", cash: 0, portfolio_positions: [] }]}
      selectedId="p1"
      onSelectPortfolio={vi.fn()}
      transactions={transactions}
      loading={false}
      holdings={[
        { ticker: "AAPL", shares: 10, price: 210.456, name: "Apple Inc." },
        { ticker: "NVDA", shares: 8, price: 190, name: "NVIDIA" },
      ]}
      currency="USD"
      today="2026-10-24"
      blockedReason={null}
      onRecord={onRecord}
      {...overrides}
    />,
  );
  return onRecord;
}

describe("TransactionsView", () => {
  afterEach(cleanup);

  it("totals buys and sells and filters the list", () => {
    renderView();

    const totals = screen.getByLabelText("Transaction totals");
    expect(within(totals).getByText("$1,500.00")).toBeTruthy();
    expect(within(totals).getByText("$400.00")).toBeTruthy();
    expect(within(totals).getByText("$1,100.00")).toBeTruthy();
    expect(screen.getByText("Apple Inc.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sells" }));
    const table = screen.getByRole("table", { name: "Portfolio transaction history" });
    expect(within(table).queryByText("AAPL")).toBeNull();
    expect(within(table).getByText("NVDA")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Filter by symbol"), { target: { value: "aap" } });
    expect(within(table).getByText("AAPL")).toBeTruthy();
    expect(within(table).queryByText("NVDA")).toBeNull();
  });

  it("records a buy from the page with the current price filled in", async () => {
    const onRecord = renderView();

    fireEvent.click(screen.getByRole("button", { name: "Record transaction" }));
    const dialog = screen.getByRole("dialog", { name: "Record transaction" });
    expect(within(dialog).getByLabelText("Price per share (USD)")).toHaveProperty("value", "210.46");
    fireEvent.change(within(dialog).getByLabelText("Quantity"), { target: { value: "3" } });
    fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: "2026-09-15" } });
    expect(within(dialog).getByRole("status").textContent).toContain("Pays $631.38");
    fireEvent.click(within(dialog).getByRole("button", { name: "Record buy" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onRecord).toHaveBeenCalledWith({
      ticker: "AAPL",
      kind: "buy",
      quantity: 3,
      price: 210.46,
      transacted_at: "2026-09-15T12:00:00Z",
    });
  });

  it("blocks selling more than you hold and future dates, inside the dialog", () => {
    const onRecord = renderView();

    fireEvent.click(screen.getByRole("button", { name: "Record transaction" }));
    const dialog = screen.getByRole("dialog", { name: "Record transaction" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Sell" }));
    fireEvent.change(within(dialog).getByLabelText("Holding"), { target: { value: "NVDA" } });
    fireEvent.change(within(dialog).getByLabelText("Quantity"), { target: { value: "9" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record sell" }));
    expect(within(dialog).getByRole("alert").textContent).toContain("You hold 8 NVDA");

    fireEvent.change(within(dialog).getByLabelText("Quantity"), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: "2027-01-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record sell" }));
    expect(within(dialog).getByRole("alert").textContent).toContain("not in the future");
    expect(onRecord).not.toHaveBeenCalled();
  });

  it("explains why recording is unavailable and offers a first transaction when empty", () => {
    renderView({ transactions: [], blockedReason: "Save your portfolio changes before recording a transaction." });

    expect(screen.getByText("No transactions yet")).toBeTruthy();
    expect(screen.getByText("Save your portfolio changes before recording a transaction.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record your first transaction" })).toHaveProperty("disabled", true);
  });
});
