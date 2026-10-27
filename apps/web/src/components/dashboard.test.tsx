// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { Dashboard } from "./dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: vi.fn().mockResolvedValue([]),
    apiUpload: vi.fn(),
  };
});


/** What the one-request holdings lookup answers for these quotes. */
function batch(...quotes: Array<{ ticker: string } & Record<string, unknown>>) {
  return quotes.map((quote) => ({ query: quote.ticker, data: quote }));
}

describe("Dashboard navigation", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockResolvedValue([]);
  });

  it("opens on the FIRE page after sign-in", async () => {
    render(<Dashboard email="owner@example.com" today="2026-10-23" />);

    expect(await screen.findByRole("heading", { name: "FIRE plan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "FIRE" }).getAttribute("aria-current")).toBe("page");
  });

  it("puts FIRE first, then Portfolio with its tools, then Settings", () => {
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const labels = Array.from(nav.querySelectorAll("button, a")).map((item) =>
      item.textContent?.trim(),
    );
    expect(labels).toEqual([
      "FIRE",
      "Portfolio",
      "Analytics",
      "Transactions",
      "Ask Buddy",
      "Assets",
      "Wishlist",
      "Education",
      "Support us",
      "ShopSoon",
      "SettingsSoon",
    ]);
    const tools = within(nav).getByRole("group", { name: "Portfolio tools" });
    expect(within(tools).getAllByRole("button").map((item) => item.textContent)).toEqual([
      "Analytics",
      "Transactions",
      "Ask Buddy",
    ]);
    expect(screen.getByRole("button", { name: "Portfolio" }).getAttribute("aria-current")).toBe("page");

    const settings = screen.getByRole("button", { name: /Settings/ });
    expect(settings.getAttribute("aria-disabled")).toBe("true");
    for (const name of [/Shop/]) {
      expect(within(nav).getByRole("button", { name }).getAttribute("aria-disabled")).toBe("true");
    }
    fireEvent.click(settings);
    expect(screen.getByRole("button", { name: "Portfolio" }).getAttribute("aria-current")).toBe("page");

    fireEvent.click(within(tools).getByRole("button", { name: "Ask Buddy" }));
    expect(within(tools).getByRole("button", { name: "Ask Buddy" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Portfolio" }).getAttribute("aria-current")).toBeNull();
  });

  it("switches between a simple portfolio editor and the test screen", async () => {
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);

    expect(
      screen.queryByRole("heading", { name: "My current portfolio" }),
    ).toBeNull();
    expect(
      screen.queryByText(
        "Manage holdings, purchase prices, sectors, and saved portfolios.",
      ),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Portfolio" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Analytics" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "+ Add position" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Import CSV" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Import screenshot" })).toBeTruthy();
    expect(screen.queryByText("Current portfolio")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Transactions" }));
    expect(
      screen.getByRole("heading", { name: "Transactions" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
    expect(
      screen.getByRole("heading", {
        name: "Add holdings to see portfolio analytics",
      }),
    ).toBeTruthy();

    // "See analytics" at the top of the Portfolio page opens Analytics.
    fireEvent.click(screen.getByRole("button", { name: "Portfolio" }));
    fireEvent.click(screen.getByRole("button", { name: "See analytics" }));
    expect(
      screen.getByRole("heading", { name: "Add holdings to see portfolio analytics" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Portfolio" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add position" }));
    expect(screen.getByRole("dialog", { name: "Add position" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Ask Buddy" }));

    expect(screen.getByRole("heading", { name: "Ask Buddy" })).toBeTruthy();
    expect(screen.queryByText("Know why you still own it.")).toBeNull();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("loads persisted transaction history for the selected portfolio", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/api/portfolios") {
        return [
          {
            id: "portfolio-1",
            name: "Core",
            cash: 0,
            base_currency: "USD",
            portfolio_positions: [],
          },
        ] as never;
      }
      if (path === "/api/portfolios/portfolio-1/transactions") {
        return [
          {
            id: "transaction-1",
            portfolio_id: "portfolio-1",
            ticker: "AAPL",
            kind: "buy",
            quantity: 5,
            price: 130,
            transacted_at: "2026-10-23T19:00:00Z",
            created_at: "2026-10-23T19:00:00Z",
          },
        ] as never;
      }
      return [] as never;
    });

    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);
    await screen.findByText("Core");
    fireEvent.click(screen.getByRole("button", { name: "Transactions" }));

    const table = await screen.findByRole("table", {
      name: "Portfolio transaction history",
    });
    expect(within(table).getByText("AAPL")).toBeTruthy();
    expect(within(table).getByText("Buy")).toBeTruthy();
    expect(within(table).getByText("−$650.00")).toBeTruthy();
  });

  it("shows the admin studio link only for an admin", () => {
    render(
      <Dashboard initialTab="portfolio" email="admin@example.com" today="2026-10-23" role="admin" />,
    );
    expect(screen.getByRole("link", { name: "Admin" }).getAttribute("href")).toBe(
      "/admin",
    );
  });

  it("shows a clear API failure without discarding the editor", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);

    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(screen.getByRole("alert").textContent).toContain(
      "temporarily unavailable",
    );
    expect(screen.getByDisplayValue("My portfolio")).toBeTruthy();
  });

  it("removes leading zeroes from share amounts", async () => {
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);
    fireEvent.click(await screen.findByRole("button", { name: "+ Add position" }));
    const shares = screen.getByRole("spinbutton", { name: "New stock shares" });

    fireEvent.change(shares, { target: { value: "012" } });

    expect((shares as HTMLInputElement).value).toBe("12");
  });

  it("deletes a saved portfolio after confirmation", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce([
        {
          id: "portfolio-1",
          name: "MyAmeria Portfolio",
          cash: 0,
          portfolio_positions: [{ ticker: "AAL", shares: 1 }],
        },
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete MyAmeria Portfolio" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm delete MyAmeria Portfolio" }),
    );

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/portfolios/portfolio-1", {
        method: "DELETE",
      }),
    );
  });

  it("opens the first saved portfolio and can reset to a new one", async () => {
    vi.mocked(api).mockResolvedValueOnce([
      {
        id: "portfolio-1",
        name: "MyAmeria Portfolio",
        cash: 0,
        portfolio_positions: [],
      },
    ]);
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);

    await screen.findByRole("button", { name: "MyAmeria Portfolio 0 holdings" });

    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(screen.getByDisplayValue("MyAmeria Portfolio")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "+ Create new portfolio" }));

    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(screen.getByDisplayValue("My portfolio")).toBeTruthy();
  });

  it("shows Updated on the button after a successful portfolio update", async () => {
    const portfolio = {
      id: "portfolio-1",
      name: "My portfolio",
      cash: 0,
      portfolio_positions: [{ ticker: "AAPL", shares: 1 }],
    };
    const overview = {
      ticker: "AAPL",
      name: "Apple Inc.",
      price: 120,
      growth: 5,
      sector: "Technology",
    };
    vi.mocked(api)
      .mockResolvedValueOnce([portfolio])
      .mockResolvedValueOnce(batch(overview))
      .mockResolvedValueOnce(overview)
      .mockResolvedValueOnce(portfolio)
      .mockResolvedValueOnce([portfolio]);
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);

    await screen.findByText("Apple Inc.");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("button", { name: "Updated ✓" })).toBeTruthy();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Cash" }), {
      target: { value: "100" },
    });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });

  it("normalizes a company name to its ticker and metadata", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        ticker: "AAPL",
        name: "Apple Inc.",
        price: 275,
        growth: 12.5,
        growth_1y: 12.5,
        sector: "Information Technology",
        asset_type: "Common Stock",
        lifecycle_phase: "Hyper Growth",
        price_date: "2026-10-22",
        report_date: "2026-08-01",
        report_source: "SEC EDGAR",
      });
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);

    fireEvent.click(await screen.findByRole("button", { name: "+ Add position" }));
    const stock = screen.getByRole("textbox", { name: "Ticker or company" });
    fireEvent.change(stock, { target: { value: "Apple" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "New stock shares" }), {
      target: { value: "100" },
    });
    fireEvent.keyDown(stock, { key: "Enter" });

    expect(await screen.findByDisplayValue("AAPL")).toBeTruthy();
    expect(screen.getAllByText("Apple Inc.").length).toBeGreaterThan(0);
    expect(screen.getByText("$275.00")).toBeTruthy();
    expect(screen.getByText("2026-08-01").closest("[title]")?.getAttribute("title")).toBe("SEC EDGAR");
    fireEvent.click(screen.getByRole("button", { name: "Expand AAPL" }));
    expect(screen.getAllByText("+12.5%").length).toBeGreaterThan(0);
    expect(
      (screen.getByRole("combobox", { name: "Sector for AAPL" }) as HTMLSelectElement)
        .value,
    ).toBe("Information Technology");

    expect(screen.getByRole("spinbutton", { name: "Quantity 1" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
    expect(screen.getByRole("heading", { name: "Sectors" })).toBeTruthy();
    expect(screen.getByText("Information Technology")).toBeTruthy();
    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);
  });

  it("shows detected ETFs but excludes them from allocation limits", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce([
        {
          id: "portfolio-1",
          name: "Fund portfolio",
          cash: 0,
          portfolio_positions: [{ ticker: "VOO", shares: 1, sector: "Other" }],
        },
      ])
      .mockResolvedValueOnce(batch(
        {
        ticker: "VOO",
        name: "Vanguard S&P 500 ETF",
        price: 600,
        growth: 10,
        sector: null,
        price_date: "2026-10-22",
        is_etf_index: true,
      },
      ));
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);

    await screen.findByRole("button", { name: "Fund portfolio 1 holding" });
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
    expect(screen.getByRole("heading", { name: "Asset types" })).toBeTruthy();
    expect(screen.queryByLabelText("Exposure View")).toBeNull();
    expect(screen.getAllByText("VOO").length).toBeGreaterThan(0);
    expect(screen.getByText("ETF / Index")).toBeTruthy();
    expect(screen.getAllByText("Excluded from risk limits").length).toBeGreaterThan(0);
  });

  it("shows holding gain or loss and sorts positions", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce([
        {
          id: "portfolio-1",
          name: "Ordered portfolio",
          cash: 0,
          portfolio_positions: [
            {
              ticker: "AAPL",
              shares: 10,
              purchase_price: 100,
              sector: "Information Technology",
              display_order: 0,
            },
            {
              ticker: "MSFT",
              shares: 5,
              purchase_price: 200,
              sector: "Information Technology",
              display_order: 1,
            },
          ],
        },
      ])
      .mockResolvedValueOnce(batch(
        {
        ticker: "AAPL",
        name: "Apple Inc.",
        price: 120,
        growth: 4,
        sector: "Technology",
      },
        {
        ticker: "MSFT",
        name: "Microsoft Corp.",
        price: 180,
        growth: -2,
        sector: "Technology",
      },
      ));
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);

    const gain = (await screen.findByText("+$200.00")).closest(".stacked-change");
    expect(gain?.textContent).toBe("+$200.00+20.0%");
    const loss = screen.getByText("-$100.00").closest(".stacked-change");
    expect(loss?.textContent).toBe("-$100.00-10.0%");
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
    expect(screen.getByRole("heading", { name: "Gains" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Losses" })).toBeTruthy();
    expect(screen.getByText("Unrealized gain/loss")).toBeTruthy();
    expect(screen.getAllByText(/\+\$200/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/-\$100/).length).toBeGreaterThan(0);
    const gainsCard = screen.getByRole("heading", { name: "Gains" })
      .closest(".contributor-panel") as HTMLElement;
    const lossesCard = screen.getByRole("heading", { name: "Losses" })
      .closest(".contributor-panel") as HTMLElement;
    expect(within(gainsCard).getByText("AAPL")).toBeTruthy();
    expect(within(gainsCard).getByText("Apple Inc.")).toBeTruthy();
    expect(within(lossesCard).getByText("MSFT")).toBeTruthy();
    expect(within(lossesCard).getByText("Microsoft Corp.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Portfolio" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Sort Market value largest to smallest" }),
    );
    expect(
      screen
        .getAllByRole("textbox", { name: /Ticker/ })
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(["AAPL", "MSFT"]);
  });

  it("sorts every requested holding column in both directions", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce([
        {
          id: "portfolio-1",
          name: "Sortable portfolio",
          cash: 0,
          portfolio_positions: [
            { ticker: "CCC", shares: 10, purchase_price: 10, display_order: 0 },
            { ticker: "AAA", shares: 5, purchase_price: 90, display_order: 1 },
            { ticker: "BBB", shares: 2, purchase_price: 400, display_order: 2 },
          ],
        },
      ])
      .mockResolvedValueOnce(batch(
        {
        ticker: "CCC",
        name: "Company C",
        price: 20,
        growth: 5,
        growth_1m: 30,
        growth_6m: -10,
        growth_1y: 5,
        sector: "Technology",
      },
        {
        ticker: "AAA",
        name: "Company A",
        price: 100,
        growth: -5,
        growth_1m: 10,
        growth_6m: 20,
        growth_1y: -5,
        sector: "Technology",
      },
        {
        ticker: "BBB",
        name: "Company B",
        price: 300,
        growth: 30,
        growth_1m: -5,
        growth_6m: 5,
        growth_1y: 30,
        sector: "Technology",
      },
      ));
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);
    await screen.findAllByText("Company A");

    const tickerOrder = () =>
      screen
        .getAllByRole("textbox", { name: /Ticker/ })
        .map((input) => (input as HTMLInputElement).value);
    const sortAndExpect = (buttonName: string, expected: string[]) => {
      fireEvent.click(screen.getByRole("button", { name: buttonName }));
      expect(tickerOrder()).toEqual(expected);
    };

    sortAndExpect("Sort Symbol and company A to Z", ["AAA", "BBB", "CCC"]);
    sortAndExpect("Sort Symbol and company Z to A", ["CCC", "BBB", "AAA"]);
    sortAndExpect("Sort Symbol and company A to Z", ["AAA", "BBB", "CCC"]);
    sortAndExpect("Sort Market value largest to smallest", ["BBB", "AAA", "CCC"]);
    sortAndExpect("Sort Market value smallest to largest", ["CCC", "AAA", "BBB"]);
    sortAndExpect("Sort Portfolio weight largest to smallest", ["BBB", "AAA", "CCC"]);
    sortAndExpect("Sort Portfolio weight smallest to largest", ["CCC", "AAA", "BBB"]);
    sortAndExpect("Sort Unrealized gain/loss largest to smallest", ["CCC", "AAA", "BBB"]);
    sortAndExpect("Sort Unrealized gain/loss smallest to largest", ["BBB", "AAA", "CCC"]);
  });

  it("renders the compact primary row, responsive card structure, and explained warnings", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce([
        {
          id: "portfolio-1",
          name: "Concentrated",
          cash: 0,
          portfolio_positions: [
            {
              ticker: "NVDA",
              shares: 10,
              purchase_price: 80,
              asset_type: "Common Stock",
              sector: "Information Technology",
            },
          ],
        },
      ])
      .mockResolvedValueOnce(batch(
        {
        ticker: "NVDA",
        name: "NVIDIA Corporation",
        price: 100,
        day_change: 2,
        day_change_percent: 2,
        growth_1m: 4,
        sector: "Information Technology",
        industry: "Semiconductors",
        asset_type: "Common Stock",
        lifecycle_phase: "Hyper Growth",
        price_date: "2026-10-22",
        report_date: "2026-08-01",
        report_source: "SEC EDGAR",
      },
      ));
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);

    const status = await screen.findByRole("button", { name: "Review" });
    expect(status.getAttribute("title")).toContain(
      "Position limit exceeded: NVDA represents 100.0%",
    );
    expect(document.querySelector(".holding-record")).toBeTruthy();
    expect(screen.getByText("Total portfolio value")).toBeTruthy();
    expect(screen.getByText("Today’s gain/loss")).toBeTruthy();
    expect(screen.getByText("Purchase price")).toBeTruthy();
    expect(screen.getByText("Report date")).toBeTruthy();
    expect(screen.getByText("2026-08-01").closest("[title]")?.getAttribute("title")).toBe("SEC EDGAR");
    expect(screen.getByRole("button", { name: "Sort 1M largest to smallest" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sort 6M largest to smallest" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sort 1Y largest to smallest" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sort Day largest to smallest" })).toBeTruthy();
    expect(screen.getAllByText("+4.0%").length).toBeGreaterThan(0);
    const today = screen.getByText("Today’s gain/loss").closest(".summary-card");
    expect(today?.querySelector("strong")?.textContent).toBe("+$20.00");
    expect(today?.querySelector("small")?.textContent).toBe("+2.0%");
    expect(screen.queryByText("Semiconductors")).toBeNull();

    const lifecycleVisibility = screen.getByRole("button", {
      name: "Lifecycle phase",
    });
    const statusVisibility = screen.getByRole("button", {
      name: "StockBuddy status",
    });
    expect(lifecycleVisibility.getAttribute("aria-pressed")).toBe("false");
    expect(statusVisibility.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".holdings-table")?.className).toContain(
      "hide-lifecycle",
    );
    expect(document.querySelector(".holdings-table")?.className).toContain(
      "hide-stockbuddy-status",
    );
    fireEvent.click(lifecycleVisibility);
    fireEvent.click(statusVisibility);
    expect(lifecycleVisibility.getAttribute("aria-pressed")).toBe("true");
    expect(statusVisibility.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Actions for NVDA" }));
    expect(screen.getByRole("button", { name: "Analyze position" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add transaction" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove position" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Position" })).toBeNull();
    expect(screen.queryByRole("button", { name: "View Details" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Note" })).toBeNull();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("button", { name: "Analyze position" })).toBeNull();

    const expandNvda = screen.getByRole("button", { name: "Expand NVDA" });
    expect(expandNvda.closest('[role="row"]')?.className).toContain("gain-up");
    fireEvent.click(expandNvda);
    expect(screen.getByRole("button", { name: "Collapse NVDA" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Asset type for NVDA" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Sector for NVDA" })).toBeTruthy();
    expect(screen.getByText("Semiconductors")).toBeTruthy();
    expect(screen.queryByText("1-month return")).toBeNull();
    expect(screen.queryByText("Price timestamp")).toBeNull();
    expect(screen.queryByText("Lifecycle evidence")).toBeNull();
    expect(screen.queryByText("User notes")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Actions for NVDA" }));
    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    expect(screen.getByRole("group", { name: "Transaction for NVDA" })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Price" })).toHaveProperty("value", "100");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Transaction for NVDA" })).toBeNull();
  });

  it("starts a brand-new account with no made-up money", async () => {
    render(<Dashboard initialTab="fire" email="new@example.com" today="2026-10-27" />);

    const card = (await screen.findByText("Current assets")).parentElement as HTMLElement;
    await waitFor(() => expect(card.textContent).toContain("$0.00"));
    expect(document.body.textContent).not.toContain("10,000");

    fireEvent.click(screen.getByRole("button", { name: "Portfolio" }));
    expect(document.body.textContent).not.toContain("10,000");
    expect(screen.getByText(/Target 5%: \$0\.00/)).toBeTruthy();
  });
});
