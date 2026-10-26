// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { FireDashboard } from "./fire-dashboard";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));

const salary = {
  id: "salary-1",
  kind: "income",
  category: "salary",
  name: "Paycheck",
  amount: 6000,
  currency: "USD",
  frequency: "monthly",
  starts_on: "2026-01-15",
  ends_on: null,
  principal: null,
  yield_pct: null,
  note: null,
};

const rent = {
  ...salary,
  id: "rent-1",
  kind: "expense",
  category: "rent",
  name: "Apartment rent",
  amount: 2000,
  starts_on: "2026-01-01",
};

describe("FireDashboard", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/fire/entries" && !init) return [salary, rent];
      if (path === "/api/fire/settings" && !init) {
        return {
          expected_return_pct: 0,
          retirement_annual_spend: null,
          monthly_invest: null,
          withdrawal_rate_pct: 4,
          inflation_pct: 0,
        };
      }
      if (path === "/api/fire/entries" && init?.method === "POST") {
        return { id: "new-1", ...JSON.parse(String(init.body)) };
      }
      if (path === "/api/fire/settings" && init?.method === "PUT") {
        return JSON.parse(String(init.body));
      }
      return {};
    });
  });
  afterEach(cleanup);

  function renderPage() {
    return render(
      <FireDashboard
        portfolioValue={50000}
        cash={1000}
        reports={[{ ticker: "AAPL", report_date: "2026-07-31" }]}
        today="2026-10-24"
      />,
    );
  }

  it("summarizes incomes and expenses into a FIRE number and timeline", async () => {
    renderPage();

    expect(await screen.findByText("Paycheck")).toBeTruthy();
    const summary = screen.getByRole("region", { name: "FIRE summary" });
    expect(within(summary).getByText("$6,000.00")).toBeTruthy();
    expect(within(summary).getByText("$2,000.00")).toBeTruthy();
    expect(within(summary).getByText("$4,000.00")).toBeTruthy();
    expect(within(summary).getByText("66.7%")).toBeTruthy();
    expect(within(summary).getByText("$600,000.00")).toBeTruthy();
    expect(within(summary).getByText("11 yrs 6 mo")).toBeTruthy();

    // 138 months after October 2026 is April 2038; the chart marks it and labels years.
    const chart = screen.getByRole("img", { name: /around Apr 2038/ });
    expect(within(chart).getByText("11 yrs 6 mo")).toBeTruthy();
    expect(within(chart).getByText("Apr 2038")).toBeTruthy();
    // The chart runs two years past FIRE, writes the value at the FIRE point, and the
    // legend describes the FIRE date.
    expect(within(chart).getAllByText("$600k").length).toBeGreaterThan(0);
    const legend = chart.closest("figure")?.querySelector("figcaption")?.textContent ?? "";
    expect(legend).toContain("At FIRE (Apr 2038):");
    expect(legend).not.toContain("2 more years");
    expect(within(chart).getByText("Today")).toBeTruthy();
    expect(within(chart).getByText("2030")).toBeTruthy();

    // Portfolio $50,000 with $1,000 cash: stocks $49,000 and cash $1,000.
    const mix = screen.getByRole("img", { name: /^Assets \$50,000\.00/ });
    expect(mix.getAttribute("aria-label")).toBe("Assets $50,000.00: Stocks 98.0%, Cash 2.0%");
    const mixFigure = mix.closest("figure") as HTMLElement;
    expect(within(mixFigure).getByText("0% expected return")).toBeTruthy();
    expect(within(mixFigure).getByText("0%, grows with stocks")).toBeTruthy();

    const incomes = screen.getByRole("region", { name: "Incomes" });
    expect(within(incomes).getByText("1 source")).toBeTruthy();
    expect(within(incomes).getByText("$6,000.00/mo")).toBeTruthy();
    const expenses = screen.getByRole("region", { name: "Expenses" });
    expect(within(expenses).getByText("$2,000.00/mo")).toBeTruthy();
  });

  it("adds a savings account and computes its monthly interest from balance and APY", async () => {
    renderPage();
    await screen.findByText("Paycheck");

    fireEvent.click(screen.getByRole("button", { name: "Add income" }));
    const dialog = screen.getByRole("dialog", { name: "Add income" });
    fireEvent.change(within(dialog).getByLabelText("Type"), { target: { value: "savings" } });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "HYSA" } });
    fireEvent.change(within(dialog).getByLabelText("Balance"), { target: { value: "12000" } });
    fireEvent.change(within(dialog).getByLabelText("Yield / APY (%)"), { target: { value: "4.5" } });

    expect(within(dialog).getByRole("status").textContent).toContain("Pays $45.00 each time");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add income" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const post = vi
      .mocked(api)
      .mock.calls.find(([path, init]) => path === "/api/fire/entries" && init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      kind: "income",
      category: "savings",
      name: "HYSA",
      amount: 45,
      frequency: "monthly",
      principal: 12000,
      yield_pct: 4.5,
    });
    const incomes = screen.getByRole("region", { name: "Incomes" });
    expect(within(incomes).getByText("HYSA")).toBeTruthy();
  });

  it("shows incomes, expenses, and report dates on the month calendar", async () => {
    renderPage();
    await screen.findByText("Paycheck");

    expect(screen.getByRole("heading", { name: "October 2026" })).toBeTruthy();
    expect(screen.getByText("+$6,000.00 Paycheck")).toBeTruthy();
    expect(screen.getByText("−$2,000.00 Apartment rent")).toBeTruthy();
    expect(screen.getByText("AAPL report (est.)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();
  });

  it("does not flash a missing exchange rate while the rate is still loading", async () => {
    let answerRate: (value: unknown) => void = () => undefined;
    let failRate: (reason: unknown) => void = () => undefined;
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/fire/entries" && !init) {
        return [{ ...salary, id: "bond-1", name: "AMTLB", currency: "AMD", amount: 1000000 }];
      }
      if (path === "/api/fx?from=AMD&to=USD") {
        return new Promise((resolve, reject) => {
          answerRate = resolve;
          failRate = reject;
        });
      }
      if (path === "/api/fire/settings") return {};
      return {};
    });
    renderPage();

    const incomes = await screen.findByRole("region", { name: "Incomes" });
    await within(incomes).findByText("AMTLB");
    expect(screen.queryByText(/No exchange rate is available/)).toBeNull();
    expect(within(incomes).getByText("Converting…")).toBeTruthy();

    // Only a rate that really could not be found shows the warning.
    failRate(new Error("No rate"));
    expect(await screen.findByText(/No exchange rate is available for AMD/)).toBeTruthy();
    expect(within(incomes).getByText("No AMD exchange rate yet")).toBeTruthy();
    answerRate(undefined);
  });

  it("shows a dram bond in AMD and converts it to dollars in the totals", async () => {
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/fire/entries" && !init) {
        return [
          {
            ...salary,
            id: "bond-1",
            category: "bond",
            name: "AMTLB",
            currency: "AMD",
            amount: 1270750,
            frequency: "semiannual",
            principal: 22100000,
            yield_pct: 11.5,
          },
        ];
      }
      if (path === "/api/fx?from=AMD&to=USD") return { from: "AMD", to: "USD", rate: 0.0025 };
      if (path === "/api/fire/settings") return {};
      return {};
    });
    renderPage();

    const incomes = await screen.findByRole("region", { name: "Incomes" });
    expect(await within(incomes).findByText("AMTLB")).toBeTruthy();
    expect(within(incomes).getByText(/AMD\s?1,270,750\.00/)).toBeTruthy();
    const summary = screen.getByRole("region", { name: "FIRE summary" });
    await waitFor(() => expect(within(summary).getAllByText("$529.48")).toHaveLength(2));
    expect(within(summary).getByText("$105,250.00")).toBeTruthy();
    // A semiannual AMD coupon still shows as one monthly dollar total in the heading.
    expect(within(incomes).getByText("$529.48/mo")).toBeTruthy();
    // The row shows the payment, its dollar value, the monthly share, and the rate used.
    const row = within(incomes).getByText("AMTLB").closest("li") as HTMLElement;
    expect(row.textContent).toMatch(/AMD\s?1,270,750\.00 every 6 months/);
    expect(row.textContent).toContain("≈ $3,176.88 total");
    expect(row.textContent).toContain("≈ $529.48/month");
    expect(row.textContent).toContain("(1 USD = 400 AMD)");
  });

  it("explains a maturity date before the first date inside the dialog, then saves the fix", async () => {
    const bond = {
      ...salary,
      id: "bond-2",
      category: "bond",
      name: "KTELB1",
      amount: 877.5,
      frequency: "semiannual",
      starts_on: "2026-12-01",
      principal: 23400,
      yield_pct: 7.5,
      quantity: 234,
      unit_price: 100,
    };
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/fire/entries" && !init) return [bond];
      if (path === "/api/fire/settings") return {};
      if (path === "/api/fire/entries/bond-2" && init?.method === "PUT") {
        return { id: "bond-2", ...JSON.parse(String(init.body)) };
      }
      return {};
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit KTELB1" }));
    const dialog = screen.getByRole("dialog", { name: "Edit income" });
    fireEvent.change(within(dialog).getByLabelText("Matures on"), { target: { value: "2026-11-20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(within(dialog).getByRole("alert").textContent).toContain(
      "maturity date (2026-11-20) is before the first date (2026-12-01)",
    );
    expect(vi.mocked(api).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);

    fireEvent.change(within(dialog).getByLabelText("First date"), { target: { value: "2026-05-20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const put = vi.mocked(api).mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({
      starts_on: "2026-05-20",
      ends_on: "2026-11-20",
    });
    expect(screen.getByText(/matures 2026-11-20/)).toBeTruthy();
  });

  it("shows a server error inside the dialog instead of behind it", async () => {
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/fire/entries" && !init) return [salary];
      if (path === "/api/fire/settings") return {};
      if (init?.method === "PUT") throw new Error("The end date must be on or after the start date");
      return {};
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit Paycheck" }));
    const dialog = screen.getByRole("dialog", { name: "Edit income" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "The end date must be on or after the start date",
    );
  });

  it("fills retirement spending with current expenses until the user changes it", async () => {
    renderPage();
    await screen.findByText("Paycheck");

    const spending = screen.getByLabelText("Yearly spending in retirement") as HTMLInputElement;
    expect(spending.value).toBe("24000");
    expect(screen.getAllByText("Current expenses × 12")).toHaveLength(1);
    expect((screen.getByLabelText("Invest each month") as HTMLInputElement).value).toBe("4000");

    fireEvent.focus(spending);
    fireEvent.change(spending, { target: { value: "30000" } });
    fireEvent.blur(spending);
    expect(spending.value).toBe("30000");
    expect(screen.getByRole("button", { name: "Use current expenses" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save assumptions" }));
    await waitFor(() =>
      expect(
        vi.mocked(api).mock.calls.find(([path, init]) => path === "/api/fire/settings" && init?.method === "PUT"),
      ).toBeTruthy(),
    );
    const put = vi
      .mocked(api)
      .mock.calls.find(([path, init]) => path === "/api/fire/settings" && init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body)).retirement_annual_spend).toBe(30000);

    fireEvent.click(screen.getByRole("button", { name: "Use current expenses" }));
    expect(spending.value).toBe("24000");
    expect(screen.getByText("Current expenses × 12")).toBeTruthy();
  });

  it("adds a bond from quantity and price per bond", async () => {
    renderPage();
    await screen.findByText("Paycheck");

    fireEvent.click(screen.getByRole("button", { name: "Add income" }));
    const dialog = screen.getByRole("dialog", { name: "Add income" });
    fireEvent.change(within(dialog).getByLabelText("Type"), { target: { value: "bond" } });
    fireEvent.change(within(dialog).getByLabelText("Currency"), { target: { value: "AMD" } });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "AMTLB" } });
    fireEvent.change(within(dialog).getByLabelText("Quantity"), { target: { value: "221" } });
    fireEvent.change(within(dialog).getByLabelText("Price per bond (AMD)"), { target: { value: "100000" } });
    fireEvent.change(within(dialog).getByLabelText("Coupon (%)"), { target: { value: "11.5" } });
    fireEvent.change(within(dialog).getByLabelText("Matures on"), { target: { value: "2029-05-12" } });

    expect(within(dialog).getByRole("status").textContent).toMatch(
      /Face value AMD\s?22,100,000\.00\. Pays AMD\s?1,270,750\.00 each time/,
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Add income" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const post = vi
      .mocked(api)
      .mock.calls.find(([path, init]) => path === "/api/fire/entries" && init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      category: "bond",
      currency: "AMD",
      quantity: 221,
      unit_price: 100000,
      principal: 22100000,
      amount: 1270750,
      frequency: "semiannual",
    });
  });

  it("shows rental assets as real estate and colors a covered emergency fund green", async () => {
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/fire/entries" && !init) {
        return [
          rent,
          {
            ...salary,
            id: "condo-1",
            category: "rent_income",
            name: "Condo rent",
            amount: 1800,
            asset_id: "asset-1",
          },
        ];
      }
      if (path === "/api/fire/assets" && !init) {
        return [
          { id: "asset-1", asset_type: "residential", name: "Condo", market_value: 450000, currency: "USD", note: null },
          { id: "asset-2", asset_type: "vehicle", name: "Van", market_value: 20000, currency: "USD", note: null },
        ];
      }
      if (path === "/api/fire/settings") return {};
      return {};
    });
    render(
      <FireDashboard portfolioValue={20000} cash={12000} reports={[]} today="2026-10-24" />,
    );

    expect(await screen.findByText(/Residential Property: Condo/)).toBeTruthy();
    // Assets have their own page; FIRE only uses them in the chart and income form.
    expect(screen.queryByRole("region", { name: "Your assets" })).toBeNull();
    const mix = screen.getByRole("img", { name: /^Assets/ });
    expect(mix.getAttribute("aria-label")).toContain("Real estate");
    expect(mix.getAttribute("aria-label")).toContain("Vehicles & equipment");
    expect(screen.getByText(/not counted in FIRE assets/)).toBeTruthy();
    expect(screen.getAllByText("Not in FIRE assets").length).toBe(2);
    // $12,000 cash ÷ $2,000 expenses = 6 months: covered, so the line is green.
    const emergency = screen.getByText("Emergency fund:").closest("li");
    expect(emergency?.className).toBe("fire-note-good");
    expect(emergency?.textContent).toContain("6.0 months");
  });

  it("creates an asset with its rental type when rental income is added, or links an existing one", async () => {
    let assets = [
      { id: "asset-9", asset_type: "land", name: "Lakeside lot", market_value: 90000, currency: "USD", note: null },
    ];
    const posted: Record<string, unknown>[] = [];
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/fire/entries" && !init) return [salary];
      if (path === "/api/fire/assets" && !init) return assets;
      if (path === "/api/fire/settings") return {};
      if (path === "/api/fire/entries" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posted.push(body);
        if (body.new_asset) {
          assets = [...assets, { id: "asset-10", note: null, ...body.new_asset }];
        }
        return { id: `entry-${posted.length}`, ...body, asset_id: body.asset_id ?? (body.new_asset ? "asset-10" : null) };
      }
      return {};
    });
    renderPage();
    await screen.findByText("Paycheck");

    fireEvent.click(screen.getByRole("button", { name: "Add income" }));
    let dialog = screen.getByRole("dialog", { name: "Add income" });
    fireEvent.change(within(dialog).getByLabelText("Type"), { target: { value: "rent_income" } });
    expect(within(dialog).getByLabelText("Asset")).toHaveProperty("value", "new");
    const types = within(dialog).getByLabelText("Rental type");
    expect([...(types as HTMLSelectElement).options].map((option) => option.text)).toEqual([
      "Residential Property",
      "Vacation / Short-Term Rental",
      "Commercial Property",
      "Land",
      "Vehicle Rental",
      "Equipment Rental",
      "Other Rental Income",
    ]);
    fireEvent.change(types, { target: { value: "vacation" } });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Beach house" } });
    fireEvent.change(within(dialog).getByLabelText("Amount (USD)"), { target: { value: "2500" } });
    fireEvent.change(within(dialog).getByLabelText("Market value (USD, optional)"), { target: { value: "600000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add income" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posted[0]).toMatchObject({
      category: "rent_income",
      asset_id: null,
      new_asset: { asset_type: "vacation", name: "Beach house", market_value: 600000, currency: "USD" },
    });
    // The new asset is loaded again, so the income names its rental type.
    expect(await screen.findByText(/Vacation \/ Short-Term Rental: Beach house/)).toBeTruthy();

    // An asset added in Assets can be linked from the income form.
    fireEvent.click(screen.getByRole("button", { name: "Add income" }));
    dialog = screen.getByRole("dialog", { name: "Add income" });
    fireEvent.change(within(dialog).getByLabelText("Type"), { target: { value: "rent_income" } });
    fireEvent.change(within(dialog).getByLabelText("Asset"), { target: { value: "asset-9" } });
    expect(within(dialog).queryByLabelText("Rental type")).toBeNull();
    expect(dialog.textContent).toContain("Land · market value $90,000.00");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Lot lease" } });
    fireEvent.change(within(dialog).getByLabelText("Amount (USD)"), { target: { value: "300" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add income" }));
    await waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).toMatchObject({ asset_id: "asset-9", new_asset: null });
  });

  it("explains FIRE and the calculation with the user's own numbers", async () => {
    renderPage();
    await screen.findByText("Paycheck");

    fireEvent.click(screen.getByRole("button", { name: "What is FIRE and how is it calculated?" }));
    const dialog = screen.getByRole("dialog", { name: "What is FIRE?" });
    expect(dialog.textContent).toContain("Financial Independence, Retire Early");
    // $2,000/mo expenses × 12 = $24,000 ÷ 4% = $600,000.
    expect(dialog.textContent).toContain("$24,000 ÷ 4% = $600,000");
    expect(dialog.textContent).toContain("25× your yearly spending");
    expect(dialog.textContent).toContain("11 yrs 6 mo");

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    // The Path to FIRE heading has its own ⓘ that opens the same explanation.
    const projection = screen.getByRole("region", { name: "Path to FIRE" });
    fireEvent.click(
      within(projection).getByRole("button", { name: "How is the path to FIRE calculated?" }),
    );
    expect(screen.getByRole("dialog", { name: "What is FIRE?" }).textContent).toContain(
      "$24,000 ÷ 4% = $600,000",
    );
  });

  it("updates the chart and totals while assumptions are typed, before saving", async () => {
    renderPage();
    await screen.findByText("Paycheck");
    const summary = screen.getByRole("region", { name: "FIRE summary" });
    expect(within(summary).getByText("11 yrs 6 mo")).toBeTruthy();

    // Spending $12,000/yr at 4% needs $300,000; $50,000 + $4,000/mo at 0% gets there in 63 months.
    const spending = screen.getByLabelText("Yearly spending in retirement");
    fireEvent.focus(spending);
    fireEvent.change(spending, { target: { value: "12000" } });

    expect(within(summary).getByText("$300,000.00")).toBeTruthy();
    expect(within(summary).getByText("5 yrs 3 mo")).toBeTruthy();
    expect(screen.getByRole("img", { name: /Projected assets reach \$300,000\.00 in 5 yrs 3 mo/ })).toBeTruthy();
    expect(screen.getByRole("status", { name: "" }).textContent).toContain("Unsaved");

    // A withdrawal rate still being typed (out of range) keeps the last valid one.
    fireEvent.change(screen.getByLabelText("Safe withdrawal rate (%)"), { target: { value: "0" } });
    expect(within(summary).getByText("$300,000.00")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Safe withdrawal rate (%)"), { target: { value: "5" } });
    expect(within(summary).getByText("$240,000.00")).toBeTruthy();
    expect(vi.mocked(api).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("warns about a risky withdrawal rate and applies inflation as it is typed", async () => {
    renderPage();
    await screen.findByText("Paycheck");
    const summary = screen.getByRole("region", { name: "FIRE summary" });

    fireEvent.change(screen.getByLabelText("Safe withdrawal rate (%)"), { target: { value: "7" } });
    expect(screen.getByText("Above 4.5% is risky. 4% is the usual safe rate.")).toBeTruthy();
    expect(screen.getByText(/aggressive: long studies/).closest("li")?.textContent).toContain(
      "At 4% you need $600,000",
    );

    fireEvent.change(screen.getByLabelText("Safe withdrawal rate (%)"), { target: { value: "4" } });
    expect(screen.queryByText(/Above 4.5% is risky/)).toBeNull();
    expect(within(summary).getByText("11 yrs 6 mo")).toBeTruthy();

    // With a 0% return, 3% inflation shrinks the pot in today's dollars, so FIRE is later.
    fireEvent.change(screen.getByLabelText("Inflation (%)"), { target: { value: "3" } });
    expect(within(summary).queryByText("11 yrs 6 mo")).toBeNull();
    expect(screen.getAllByText(/today.s dollars/).length).toBeGreaterThan(0);
  });

  it("shows FIRE progress, remaining amount, date, and ages from the date of birth", async () => {
    const onEditProfile = vi.fn();
    render(
      <FireDashboard
        portfolioValue={50000}
        cash={1000}
        reports={[]}
        today="2026-10-24"
        dateOfBirth="1987-05-10"
        onEditProfile={onEditProfile}
      />,
    );
    await screen.findByText("Paycheck");

    const progress = screen.getByRole("region", { name: "FIRE progress" });
    // Progress sits under Path to FIRE, and each ⓘ comes after its title.
    const projection = screen.getByRole("region", { name: "Path to FIRE" });
    expect(projection.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const title = screen.getByRole("heading", { name: "Path to FIRE" });
    const info = within(projection).getByRole("button", { name: "How is the path to FIRE calculated?" });
    expect(title.compareDocumentPosition(info) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // $50,000 of a $600,000 target: 8.3% funded, $550,000 remaining.
    expect(progress.textContent).toContain("8.3% funded");
    expect(progress.textContent).toContain("$50,000.00 of $600,000.00");
    expect(progress.textContent).toContain("$550,000.00 remaining");
    expect(within(progress).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("8.3");
    // 138 months after October 2026 is April 2038; born May 1987 → 39 now, 50 then.
    expect(progress.textContent).toContain("Current age39");
    expect(progress.textContent).toContain("Estimated FIRE age50");
    expect(progress.textContent).toContain("Estimated FIRE dateApril 2038");
    // With an age set, a pencil next to it edits the date of birth.
    expect(within(progress).queryByRole("button", { name: "Add your date of birth to see ages" })).toBeNull();
    fireEvent.click(within(progress).getByRole("button", { name: "Edit date of birth" }));
    expect(onEditProfile).toHaveBeenCalled();
  });

  it("hides ages without a date of birth but keeps the FIRE date", async () => {
    const onEditProfile = vi.fn();
    render(
      <FireDashboard
        portfolioValue={50000}
        cash={1000}
        reports={[]}
        today="2026-10-24"
        onEditProfile={onEditProfile}
      />,
    );
    await screen.findByText("Paycheck");

    const progress = screen.getByRole("region", { name: "FIRE progress" });
    expect(progress.textContent).not.toContain("Current age");
    expect(progress.textContent).not.toContain("Estimated FIRE age");
    expect(progress.textContent).toContain("April 2038");
    fireEvent.click(within(progress).getByRole("button", { name: "Add your date of birth to see ages" }));
    expect(onEditProfile).toHaveBeenCalled();
  });

  it("switches every total between monthly and annual, including the breakdowns", async () => {
    renderPage();
    await screen.findByText("Paycheck");
    const summary = screen.getByRole("region", { name: "FIRE summary" });
    const incomes = screen.getByRole("region", { name: "Incomes" });

    fireEvent.click(screen.getByRole("button", { name: "Monthly income breakdown" }));
    let dialog = screen.getByRole("dialog", { name: "Monthly Income Breakdown" });
    expect(dialog.textContent).toContain("Paycheck");
    expect(dialog.textContent).toContain("$6,000.00");
    expect(dialog.textContent).toContain("100.0%");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Annual" }));
    expect(within(summary).getByText("Annual income")).toBeTruthy();
    expect(within(summary).getByText("$72,000.00")).toBeTruthy();
    expect(within(summary).getByText("Left over each year")).toBeTruthy();
    expect(within(summary).getByText("$48,000.00")).toBeTruthy();
    expect(within(incomes).getByText("$72,000.00/yr")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Annual expense breakdown" }));
    dialog = screen.getByRole("dialog", { name: "Annual Expense Breakdown" });
    expect(dialog.textContent).toContain("Rent / mortgage");
    expect(dialog.textContent).toContain("$24,000.00/yr");
  });

  it("shows income and expenses by month or by week from their dates", async () => {
    renderPage();
    await screen.findByText("Paycheck");

    fireEvent.click(screen.getByRole("button", { name: "Income by week or month" }));
    let dialog = screen.getByRole("dialog", { name: "Income by month" });
    // The current month is the first bar, drawn in blue and labeled.
    const firstBar = dialog.querySelector("svg g");
    expect(firstBar?.getAttribute("class")).toBe("timeline-current");
    expect(firstBar?.textContent).toContain("This month");
    expect(within(dialog).getByRole("img", { name: /Oct 2026 \$6,000\.00/ })).toBeTruthy();
    expect(dialog.textContent).toContain("Next 12 months:");
    expect(dialog.textContent).toContain("$72,000.00");
    fireEvent.click(within(dialog).getByRole("button", { name: "Weeks" }));
    dialog = screen.getByRole("dialog", { name: "Income by week" });
    expect(dialog.textContent).toContain("Week of");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Expenses by week or month" }));
    dialog = screen.getByRole("dialog", { name: "Expenses by month" });
    expect(dialog.textContent).toContain("Apartment rent");
    expect(dialog.textContent).toContain("$24,000.00");
  });

  it("drops leading zeros as numbers are typed", async () => {
    renderPage();
    await screen.findByText("Paycheck");

    const inflation = screen.getByLabelText("Inflation (%)") as HTMLInputElement;
    fireEvent.change(inflation, { target: { value: "03" } });
    expect(inflation.value).toBe("3");

    const spending = screen.getByLabelText("Yearly spending in retirement") as HTMLInputElement;
    fireEvent.focus(spending);
    fireEvent.change(spending, { target: { value: "012000" } });
    expect(spending.value).toBe("12000");
  });
});
