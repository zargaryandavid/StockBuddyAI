"use client";

import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { PortfolioAnalyticsDashboard } from "@/components/analytics/portfolio-analytics-dashboard";
import { FireDashboard } from "@/components/fire/fire-dashboard";
import { IndustryIcon } from "@/components/industry-icon";
import { EducationPage } from "@/components/education/education-page";
import { AssetsPage } from "@/components/fire/assets-page";
import { WishlistPage } from "@/components/wishlist/wishlist-page";
import { ProfileDialog, type ProfileValues } from "@/components/profile-dialog";
import { notEnoughData, RunTest } from "@/components/run-test";
import { SupportPage } from "@/components/support-page";
import { TodayPage, type TodayDestination } from "@/components/today/today-page";
import { parseBrokerCsv } from "@/lib/broker-csv";
import { AmountInput } from "@/components/amount-input";
import { GrowthCalculator, type GrowthStart } from "@/components/growth-calculator";
import { AnimatedNumber } from "@/components/animated-number";
import { EmptyState } from "@/components/empty-state";
import { FlashValue } from "@/components/flash-value";
import { BondsSection, useBondHoldings, useOnVisible } from "@/components/bonds-section";
import { CashLabel, CashSummary, cashTargetNote } from "@/components/cash-target";
import { cashShortfall, cashTarget, DEFAULT_CASH_TARGET } from "@/lib/analytics";
import { ReportReminderDialog } from "@/components/report-reminder-dialog";
import { TransactionsView, type TransactionInput } from "@/components/transactions-view";
import {
  Bot,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Ellipsis,
  Eye,
  EyeOff,
  Flame,
  Home,
  TrendingUp,
  Plus,
  X,
  Heart,
  GripVertical,
  History,
  Info,
  GraduationCap,
  Settings,
  Sparkles,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import {
  AnalysisRun,
  Portfolio,
  PortfolioTransaction,
  Recommendation,
  Signal,
  api,
  apiUpload,
} from "@/lib/api";
import {
  assetTypes,
  combinePositions,
  parsePortfolioCsvPreview,
  sectors as canonicalSectors,
  type ImportColumnMap,
  type ImportPreview,
  type Position,
} from "@/lib/portfolio";
import {
  calculatePortfolioMetrics,
  positionStatus,
  signedMoney,
  signedPercent,
} from "@/lib/portfolio-metrics";
import { translate, type Translate } from "@/lib/i18n/core";
import { useT } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";
import { defaultBook, type BookSettings, type Role } from "@/lib/workspace";

type MainTab = "today" | "test" | "growth" | "portfolio" | "fire" | "assets" | "wishlist" | "education" | "support";
type PortfolioView = "current" | "transactions" | "analytics";
type ImportMode = "manual" | "csv" | "picture";
type SortKey =
  | "custom"
  | "symbol"
  | "value"
  | "weight"
  | "gain"
  | "growth_1m"
  | "growth_6m"
  | "growth_1y"
  | "day"
  | "phase"
  | "status";
type SortDirection = "asc" | "desc";

export function Dashboard({
  email,
  today,
  role: initialRole = "user",
  book: initialBook = defaultBook,
  initialTab = "today",
  loadAccount = false,
}: {
  email: string;
  today: string;
  role?: Role;
  book?: BookSettings;
  /** The page shown after sign-in; FIRE by default. */
  initialTab?: MainTab;
  /** Fetch the role and book settings in the browser, so the page shows before they arrive. */
  loadAccount?: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(initialRole);
  const [book, setBook] = useState<BookSettings>(initialBook);
  useEffect(() => {
    if (!loadAccount) return;
    let active = true;
    Promise.all([api<{ role: Role }>("/api/me"), api<BookSettings>("/api/settings")])
      .then(([me, settings]) => {
        if (!active) return;
        if (me?.role) setRole(me.role);
        if (settings) setBook({ ...defaultBook, ...settings });
      })
      // Without them the page keeps working on the standard settings.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [loadAccount]);
  const t = useT();
  // Callbacks that feed the first portfolio load read the translator from here, so a
  // language switch does not reload the portfolio and drop unsaved edits.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [activeTab, setActiveTab] = useState<MainTab>(initialTab);
  const [portfolioView, setPortfolioView] = useState<PortfolioView>("current");
  const [importMode, setImportMode] = useState<ImportMode | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [draftPosition, setDraftPosition] = useState<Position>({
    ticker: "",
    shares: 0,
  });
  const [portfolioName, setPortfolioName] = useState("My portfolio");
  const [cash, setCash] = useState(0);
  const [baseCurrency, setBaseCurrency] = useState("USD");
  // Read by the portfolio loading callbacks for the same reason as tRef: changing the
  // currency must not reload the saved portfolio over the change.
  const baseCurrencyRef = useRef(baseCurrency);
  useEffect(() => {
    baseCurrencyRef.current = baseCurrency;
  }, [baseCurrency]);
  // Cash in other currencies, beside the cash in the portfolio's own currency.
  const [otherCash, setOtherCash] = useState<CashBalance[]>([]);
  // The currency the main Cash amount is typed in; it is converted into baseCurrency.
  const [cashCurrency, setCashCurrency] = useState("USD");
  const [cashRates, setCashRates] = useState<Record<string, number>>({});
  const [benchmark, setBenchmark] = useState("SPY");
  const [maxPosition, setMaxPosition] = useState<number | null>(null);
  const [maxSector, setMaxSector] = useState<number | null>(null);
  const [minCash, setMinCash] = useState(0);
  const [timeHorizon, setTimeHorizon] = useState<
    "Short Term" | "Medium Term" | "Long Term"
  >("Long Term");
  const [rebalanceThreshold, setRebalanceThreshold] = useState(0.05);
  const [resolvingRows, setResolvingRows] = useState<number[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveConfirmation, setSaveConfirmation] = useState<
    "saved" | "updated" | null
  >(null);
  const [extracting, setExtracting] = useState(false);
  const [excludeEtfIndex, setExcludeEtfIndex] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("custom");
  const portfolioSection = activeTab === "portfolio" || activeTab === "test" || activeTab === "growth";
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const needsProfile = activeTab === "fire" || activeTab === "today" || showProfile;
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Loaded the first time the FIRE page or the profile needs it.
  useEffect(() => {
    if (!needsProfile || profileLoaded) return;
    let active = true;
    api<ProfileValues>("/api/profile")
      .then((profile) => {
        if (!active) return;
        setDateOfBirth(profile?.date_of_birth ?? null);
        setDisplayName(profile?.display_name ?? null);
        setProfileLoaded(true);
      })
      // Without a profile the FIRE page simply hides ages.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [needsProfile, profileLoaded]);

  async function saveProfile(next: ProfileValues) {
    const saved = await api<ProfileValues>("/api/profile", {
      method: "PUT",
      body: JSON.stringify(next),
    });
    setDateOfBirth(saved?.date_of_birth ?? null);
    setDisplayName(saved?.display_name ?? null);
  }
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [reminderFor, setReminderFor] = useState<{
    ticker: string;
    companyName: string | null;
    lastReportDate: string;
  } | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [loadingPortfolios, setLoadingPortfolios] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [actionRow, setActionRow] = useState<number | null>(null);
  const [removeRow, setRemoveRow] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showReturns, setShowReturns] = useState(true);
  const [showLifecycle, setShowLifecycle] = useState(false);
  const [showMyPortfolioBuddyStatus, setShowMyPortfolioBuddyStatus] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [csvText, setCsvText] = useState("");
  const [columnMap, setColumnMap] = useState<ImportColumnMap>({
    ticker: "ticker",
    quantity: "shares",
    averageCost: "purchase_price",
  });
  const [transactionRow, setTransactionRow] = useState<number | null>(null);
  const [transactionKind, setTransactionKind] = useState<"buy" | "sell">("buy");
  const [transactionQuantity, setTransactionQuantity] = useState(1);
  const [transactionPrice, setTransactionPrice] = useState(0);
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  useEffect(() => {
    if (actionRow === null) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".position-actions")
      ) {
        setActionRow(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionRow(null);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionRow]);

  const sectors: readonly string[] = canonicalSectors;
  const iconForIndustry = (name: string) =>
    book.industries.find((industry) => industry.name === name)?.icon ?? "shapes";
  const selected = useMemo(
    () => portfolios.find((portfolio) => portfolio.id === selectedId),
    [portfolios, selectedId],
  );
  // Rates for cash held in other currencies (cached for a few minutes by the API helper).
  const otherCurrencies = useMemo(
    () =>
      [...new Set([cashCurrency, ...otherCash.map((item) => item.currency)].filter((code) => code !== baseCurrency))]
        .sort()
        .join(","),
    [otherCash, cashCurrency, baseCurrency],
  );
  useEffect(() => {
    if (!otherCurrencies) return;
    let active = true;
    Promise.allSettled(
      otherCurrencies.split(",").map((code) =>
        api<{ rate: number }>(`/api/fx?from=${encodeURIComponent(code)}&to=${encodeURIComponent(baseCurrency)}`).then(
          (result) => [code, result.rate] as const,
        ),
      ),
    ).then((results) => {
      if (!active) return;
      const next: Record<string, number> = {};
      for (const result of results) if (result.status === "fulfilled") next[result.value[0]] = result.value[1];
      setCashRates(next);
    });
    return () => {
      active = false;
    };
  }, [otherCurrencies, baseCurrency]);
  /** All cash in the portfolio's own currency; amounts without a rate are left out. */
  const totalCash = useMemo(
    () =>
      [{ currency: cashCurrency, amount: cash }, ...otherCash].reduce((sum, item) => {
        if (item.currency === baseCurrency) return sum + Number(item.amount || 0);
        const rate = cashRates[item.currency];
        return rate ? sum + Number(item.amount || 0) * rate : sum;
      }, 0),
    [cash, cashCurrency, otherCash, cashRates, baseCurrency],
  );
  // Bonds are entered in FIRE; the Portfolio page and Analytics show them for the full mix.
  const [bondsWanted, setBondsWanted] = useState(false);
  // Set when FIRE opens the Growth calculator with its own numbers.
  const [growthStart, setGrowthStart] = useState<GrowthStart | null>(null);
  const wantBonds = useCallback(() => setBondsWanted(true), []);
  const bondData = useBondHoldings(
    baseCurrency,
    today,
    bondsWanted || (activeTab === "portfolio" && portfolioView === "analytics"),
  );
  // Today shows the open portfolio as it is on screen, including changes not saved yet.
  const todayPortfolios = useMemo(
    () =>
      dirty && editingId
        ? portfolios.map((portfolio) =>
            portfolio.id === editingId
              ? {
                  ...portfolio,
                  ...savedCash([{ currency: cashCurrency, amount: Number(cash || 0) }, ...otherCash], baseCurrency),
                  base_currency: baseCurrency,
                  portfolio_positions: positions.filter((position) => position.ticker.trim()),
                }
              : portfolio,
          )
        : portfolios,
    [dirty, editingId, portfolios, cashCurrency, cash, otherCash, baseCurrency, positions],
  );
  const metrics = useMemo(
    () => calculatePortfolioMetrics(positions, totalCash),
    [positions, totalCash],
  );
  const cashGoal = cashTarget(minCash, book.min_cash_pct);
  const marketValue = metrics.holdingsValue;
  const costBasis = metrics.totalCostBasis;
  const allocationPositions = useMemo(
    () =>
      excludeEtfIndex
        ? positions.filter((position) => !position.is_etf_index)
        : positions,
    [excludeEtfIndex, positions],
  );
  const allocationPortfolioValue = useMemo(
    () =>
      allocationPositions.reduce(
        (total, position) =>
          total + Number(position.shares) * Number(position.price ?? 0),
        totalCash,
      ),
    [allocationPositions, totalCash],
  );
  const industryAllocations = useMemo(() => {
    const totals = new Map<string, { value: number; holdings: string[] }>();
    for (const position of allocationPositions) {
      const industry = position.sector || "Other";
      const value = Number(position.shares) * Number(position.price ?? 0);
      const current = totals.get(industry) ?? { value: 0, holdings: [] };
      current.value += value;
      current.holdings.push(position.ticker);
      totals.set(industry, current);
    }
    return [...totals.entries()]
      .filter(([, summary]) => summary.value > 0)
      .map(([industry, summary]) => ({
        industry,
        value: summary.value,
        holdings: summary.holdings,
        allocation: allocationPortfolioValue
          ? summary.value / allocationPortfolioValue
          : 0,
      }))
      .sort((left, right) => right.value - left.value);
  }, [allocationPortfolioValue, allocationPositions]);
  const gainSummary = useMemo(
    () =>
      positions.reduce(
        (summary, position) => {
          const result = gainLoss(position);
          if (!result || result.amount === 0) return summary;
          if (result.amount > 0) {
            summary.winners += 1;
            summary.positive += result.amount;
          } else {
            summary.losers += 1;
            summary.negative += result.amount;
          }
          summary.total += result.amount;
          return summary;
        },
        { winners: 0, losers: 0, positive: 0, negative: 0, total: 0 },
      ),
    [positions],
  );
  const gainRows = useMemo(
    () =>
      positions
        .map((position) => ({ position, result: gainLoss(position) }))
        .filter(
          (
            row,
          ): row is {
            position: Position;
            result: NonNullable<ReturnType<typeof gainLoss>>;
          } => Boolean(row.result && row.result.amount > 0),
        )
        .sort((left, right) => right.result.amount - left.result.amount),
    [positions],
  );
  const lossRows = useMemo(
    () =>
      positions
        .map((position) => ({ position, result: gainLoss(position) }))
        .filter(
          (
            row,
          ): row is {
            position: Position;
            result: NonNullable<ReturnType<typeof gainLoss>>;
          } => Boolean(row.result && row.result.amount < 0),
        )
        .sort((left, right) => left.result.amount - right.result.amount),
    [positions],
  );
  const positionLimit = maxPosition ?? book.max_position_pct;
  const sectorLimit = maxSector ?? book.max_industry_pct;
  const displayRows = useMemo(() => {
    const statusOrder = {
      "High Risk": 0,
      Review: 1,
      "Insufficient Data": 2,
      "Not Analyzed": 3,
      Healthy: 4,
    };
    const rows = positions.map((position, originalIndex) => {
      const metric = metrics.byTicker.get(position.ticker) ?? {
        marketValue: null,
        costBasis: null,
        unrealizedAmount: null,
        unrealizedPercent: null,
        dayAmount: null,
        dayPercent: null,
        weight: null,
      };
      const sectorAllocation = industryAllocations.find(
        (item) => item.industry === position.sector,
      )?.allocation;
      const sectorWarning =
        sectorAllocation != null && sectorAllocation > sectorLimit
          ? t(
              "Sector concentration exceeded: {sector} represents {share}% of the portfolio. Your configured limit is {limit}%.",
              {
                sector: t(position.sector ?? ""),
                share: (sectorAllocation * 100).toFixed(1),
                limit: (sectorLimit * 100).toFixed(1),
              },
            )
          : undefined;
      const status = positionStatus(position, metric, {
        positionLimit,
        sectorWarning,
        today,
      });
      return { position, originalIndex, metric, status };
    });
    return rows.sort((left, right) => {
      const values: Record<
        SortKey,
        [string | number | null, string | number | null]
      > = {
        custom: [left.originalIndex, right.originalIndex],
        symbol: [left.position.ticker, right.position.ticker],
        value: [left.metric.marketValue, right.metric.marketValue],
        weight: [left.metric.weight, right.metric.weight],
        gain: [left.metric.unrealizedAmount, right.metric.unrealizedAmount],
        growth_1m: [left.position.growth_1m ?? null, right.position.growth_1m ?? null],
        growth_6m: [left.position.growth_6m ?? null, right.position.growth_6m ?? null],
        growth_1y: [
          left.position.growth_1y ?? left.position.growth ?? null,
          right.position.growth_1y ?? right.position.growth ?? null,
        ],
        day: [left.metric.dayAmount, right.metric.dayAmount],
        phase: [
          left.position.lifecycle_phase ?? "Not Analyzed",
          right.position.lifecycle_phase ?? "Not Analyzed",
        ],
        status: [statusOrder[left.status.status], statusOrder[right.status.status]],
      };
      const [a, b] = values[sortKey];
      if (a == null && b == null) return left.originalIndex - right.originalIndex;
      if (a == null) return 1;
      if (b == null) return -1;
      const comparison =
        typeof a === "string" && typeof b === "string"
          ? a.localeCompare(b)
          : Number(a) - Number(b);
      return (sortDirection === "asc" ? comparison : -comparison) ||
        left.originalIndex - right.originalIndex;
    });
  }, [
    industryAllocations,
    metrics.byTicker,
    positionLimit,
    positions,
    sectorLimit,
    sortDirection,
    sortKey,
    t,
    today,
  ]);

  const resolvePosition = useCallback(
    async (position: Position): Promise<Position> => {
      const query = position.ticker.trim();
      if (!query) return position;
      const overview = await api<Omit<Position, "shares">>(
        `/api/securities/resolve?query=${encodeURIComponent(query)}&base_currency=${encodeURIComponent(baseCurrency)}`,
      );
      return withOverview(position, overview);
    },
    [baseCurrency],
  );

  const enrichPositions = useCallback(
    async (rows: Position[], { fresh = false, currency }: { fresh?: boolean; currency?: string } = {}) => {
      setSortKey("custom");
      setSaveConfirmation(null);
      setPositions(rows);
      const queries = rows.map((row) => row.ticker.trim()).filter(Boolean);
      // One request for the whole portfolio instead of one per holding.
      let results: ResolveResult[] = [];
      let failure: string | null = null;
      if (queries.length) {
        try {
          results = await api<ResolveResult[]>("/api/securities/resolve-batch", {
            method: "POST",
            body: JSON.stringify({ queries, base_currency: currency ?? baseCurrencyRef.current }),
            ...(fresh ? { cache: "reload" as const } : {}),
          });
        } catch (cause) {
          failure = cause instanceof Error ? cause.message : "";
        }
      }
      const byQuery = new Map((Array.isArray(results) ? results : []).map((item) => [item.query, item]));
      setPositions(
        rows.map((row) => {
          const query = row.ticker.trim();
          if (!query) return row;
          const found = byQuery.get(query);
          if (found?.data) return withOverview(row, found.data);
          const message = found?.error ?? failure;
          return {
            ...row,
            resolve_error: message
              ? tRef.current("Could not update {ticker}: {message}", {
                  ticker: row.ticker,
                  message: tRef.current(message),
                })
              : tRef.current("Could not update {ticker}.", { ticker: row.ticker }),
          };
        }),
      );
      setLoadingPortfolios(false);
    },
    [],
  );


  const openPortfolio = useCallback(
    (portfolio: Portfolio) => {
      setSelectedId(portfolio.id);
      setEditingId(portfolio.id);
      setPortfolioName(portfolio.name);
      const own = portfolio.base_currency ?? "USD";
      const others = Array.isArray(portfolio.other_cash) ? portfolio.other_cash : [];
      setBaseCurrency(own);
      // Cash kept only in another currency shows in the first Cash box with that currency.
      if (!Number(portfolio.cash) && others.length) {
        setCash(Number(others[0].amount) || 0);
        setCashCurrency(others[0].currency);
        setOtherCash(others.slice(1));
      } else {
        setCash(Number(portfolio.cash));
        setCashCurrency(own);
        setOtherCash(others);
      }
      setBenchmark(portfolio.benchmark ?? "SPY");
      setMaxPosition(portfolio.max_position_pct ?? null);
      setMaxSector(portfolio.max_sector_pct ?? null);
      setMinCash(portfolio.min_cash_pct ?? 0);
      setTimeHorizon(portfolio.time_horizon ?? "Long Term");
      setRebalanceThreshold(portfolio.rebalancing_threshold_pct ?? 0.05);
      setSortKey("custom");
      setSaveConfirmation(null);
      setDirty(false);
      const ordered = [...portfolio.portfolio_positions].sort(
        (left, right) => (left.display_order ?? 0) - (right.display_order ?? 0),
      );
      void enrichPositions(ordered, { currency: portfolio.base_currency ?? "USD" });
    },
    [enrichPositions],
  );

  /** A new portfolio currency (Portfolio settings): holdings are priced again in it. Cash
   *  keeps the currency it was typed in and is converted. */
  function changeBaseCurrency(code: string) {
    if (cashCurrency === baseCurrency) setCashCurrency(code);
    setBaseCurrency(code);
    setSaveConfirmation(null);
    setDirty(true);
    if (positions.length) void enrichPositions(positions, { currency: code });
  }

  function openFromToday(destination: TodayDestination) {
    if (destination === "analytics") {
      openAnalytics();
      return;
    }
    if (destination === "portfolio") setPortfolioView("current");
    setActiveTab(destination);
  }

  function startNewPortfolio() {
    setEditingId("");
    setSelectedId("");
    setPortfolioName("My portfolio");
    setCash(0);
    setBaseCurrency("USD");
    setOtherCash([]);
    setCashCurrency("USD");
    setBenchmark("SPY");
    setMaxPosition(null);
    setMaxSector(null);
    setMinCash(0);
    setTimeHorizon("Long Term");
    setRebalanceThreshold(0.05);
    setPositions([]);
    setPendingDeleteId("");
    setSortKey("custom");
    setError("");
    setNotice("");
    setSaveConfirmation(null);
    setDirty(false);
  }

  async function loadPortfolios() {
    const rows = await api<Portfolio[]>("/api/portfolios");
    setPortfolios(rows);
    setSelectedId((current) =>
      rows.some((portfolio) => portfolio.id === current)
        ? current
        : rows[0]?.id || "",
    );
    return rows;
  }

  function openAnalytics() {
    setActiveTab("portfolio");
    setPortfolioView("analytics");
    if (book.use_transaction_history_analytics) {
      void loadTransactionHistory(selectedId);
    }
  }

  async function loadTransactionHistory(portfolioId: string) {
    if (!portfolioId) {
      setTransactions([]);
      return;
    }
    setLoadingTransactions(true);
    try {
      setTransactions(
        await api<PortfolioTransaction[]>(
          `/api/portfolios/${portfolioId}/transactions`,
        ),
      );
    } catch (cause) {
      setError(
        friendlyError(
          cause instanceof Error
            ? cause
            : new Error("Could not load transaction history"),
          t,
        ),
      );
    } finally {
      setLoadingTransactions(false);
    }
  }

  useEffect(() => {
    let active = true;
    api<Portfolio[]>("/api/portfolios")
      .then((rows) => {
        if (!active) return;
        setPortfolios(rows);
        if (rows[0]) {
          openPortfolio(rows[0]);
        } else {
          setSelectedId("");
        }
      })
      .catch((cause: Error) => {
        // Stored in English and translated where it is shown.
        if (active) setError(friendlyError(cause, english));
      })
      .finally(() => {
        if (active) setLoadingPortfolios(false);
      });
    return () => {
      active = false;
    };
  }, [openPortfolio]);

  function chooseImportMode(mode: ImportMode) {
    setImportMode(mode);
    setImportPreview(null);
    if (mode === "manual") {
      setDraftPosition({ ticker: "", shares: 0 });
    }
    setError("");
    setNotice("");
  }

  async function addDraftPosition() {
    if (!draftPosition.ticker.trim()) {
      setError(t("Enter a ticker or company name."));
      return;
    }
    try {
      const resolved = await resolvePosition(draftPosition);
      setSortKey("custom");
      setPositions((current) => [...current, resolved]);
      setDirty(true);
      setDraftPosition({ ticker: "", shares: 0 });
      setImportMode(null);
      setError("");
    } catch (cause) {
      setError(
        friendlyError(
          cause instanceof Error ? cause : new Error("Could not identify this company"),
          t,
        ),
      );
    }
  }

  function updatePosition(index: number, patch: Partial<Position>) {
    setSaveConfirmation(null);
    setDirty(true);
    setPositions((current) =>
      current.map((position, row) =>
        row === index ? { ...position, ...patch } : position,
      ),
    );
  }

  function moveRow(from: number, to: number) {
    if (from === to || to < 0 || to >= positions.length) return;
    setPositions((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setExpandedRows(new Set());
    setActionRow(null);
    setSortKey("custom");
    setSaveConfirmation(null);
    setDirty(true);
  }

  function sortPositions(key: SortKey) {
    const direction: SortDirection =
      sortKey === key
        ? sortDirection === "asc"
          ? "desc"
          : "asc"
        : key === "symbol"
          ? "asc"
          : "desc";
    setSortKey(key);
    setSortDirection(direction);
  }

  async function resolveRow(index: number) {
    const position = positions[index];
    if (!position?.ticker.trim()) return;
    setResolvingRows((current) => [...current, index]);
    try {
      const resolved = await resolvePosition(position);
      updatePosition(index, resolved);
      setError("");
    } catch (cause) {
      setError(
        friendlyError(
          cause instanceof Error ? cause : new Error("Could not identify this company"),
          t,
        ),
      );
    } finally {
      setResolvingRows((current) => current.filter((row) => row !== index));
    }
  }

  async function extractPicture(file: File) {
    setExtracting(true);
    setError("");
    setNotice("");
    const body = new FormData();
    body.append("image", file);
    try {
      const result = await apiUpload<{ positions: Position[] }>(
        "/api/portfolios/extract-image",
        body,
      );
      if (!result.positions.length) {
        throw new Error("No clear ticker and share rows were found in this picture.");
      }
      setImportPreview({
        positions: result.positions,
        errors: [],
        headers: ["ticker", "shares"],
        duplicateTickers: duplicateTickers(result.positions),
      });
      setNotice(t("Picture read successfully. Confirm the preview before importing."));
    } catch (cause) {
      setError(
        friendlyError(cause instanceof Error ? cause : new Error("Could not read picture"), t),
      );
    } finally {
      setExtracting(false);
    }
  }

  async function commitImport(combine: boolean) {
    if (!importPreview) return;
    const next = [...positions];
    for (const incoming of importPreview.positions) {
      const index = next.findIndex(
        (position) => position.ticker.toUpperCase() === incoming.ticker.toUpperCase(),
      );
      if (index < 0) {
        next.push(incoming);
      } else if (combine) {
        next[index] = combinePositions(next[index], incoming);
      }
    }
    await enrichPositions(next);
    setImportPreview(null);
    setImportMode(null);
    setDirty(true);
    setError("");
    setNotice(
      combine
        ? t("Import added. Duplicate positions were combined using weighted average cost.")
        : t("Import added. Existing duplicate positions were kept unchanged."),
    );
  }

  async function recordTransaction(transaction: TransactionInput) {
    if (!editingId) throw new Error(t("Save this portfolio before recording a transaction."));
    const recorded = await api<PortfolioTransaction>(
      `/api/portfolios/${editingId}/transactions`,
      { method: "POST", body: JSON.stringify(transaction) },
    );
    const rows = await loadPortfolios();
    const refreshed = rows.find((portfolio) => portfolio.id === editingId);
    if (refreshed) openPortfolio(refreshed);
    setTransactions((current) =>
      [recorded, ...current.filter((item) => item.id !== recorded.id)].sort((a, b) =>
        b.transacted_at.localeCompare(a.transacted_at),
      ),
    );
    setNotice(
      t(
        transaction.kind === "buy"
          ? "Buy of {quantity} {ticker} recorded; holdings updated."
          : "Sell of {quantity} {ticker} recorded; holdings updated.",
        { quantity: transaction.quantity, ticker: transaction.ticker },
      ),
    );
  }

  async function applyTransaction(index: number) {
    const position = positions[index];
    if (!position || transactionQuantity <= 0 || transactionPrice < 0) return;
    if (!editingId) {
      setError(t("Save this portfolio before recording a transaction."));
      return;
    }
    if (dirty) {
      setError(t("Save your portfolio changes before recording a transaction."));
      return;
    }
    if (transactionKind === "sell") {
      if (transactionQuantity > Number(position.shares)) {
        setError(t("Sale quantity cannot exceed the held quantity."));
        return;
      }
    }
    setError("");
    try {
      const recorded = await api<PortfolioTransaction>(
        `/api/portfolios/${editingId}/transactions`,
        {
          method: "POST",
          body: JSON.stringify({
            ticker: position.ticker,
            kind: transactionKind,
            quantity: transactionQuantity,
            price: transactionPrice,
          }),
        },
      );
      const rows = await loadPortfolios();
      const refreshed = rows.find((portfolio) => portfolio.id === editingId);
      if (refreshed) openPortfolio(refreshed);
      setTransactions((current) => [
        recorded,
        ...current.filter((transaction) => transaction.id !== recorded.id),
      ]);
      setTransactionRow(null);
      setNotice(t("Transaction recorded and portfolio position updated."));
    } catch (cause) {
      setError(
        friendlyError(
          cause instanceof Error
            ? cause
            : new Error("Could not record the transaction"),
          t,
        ),
      );
    }
  }

  async function createPortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const wasUpdating = Boolean(editingId);
    setError("");
    setNotice("");
    const pendingPositions = positions.filter((position) => position.ticker.trim());
    if (!pendingPositions.length) {
      setError(t("Add at least one ticker and share amount."));
      return;
    }
    try {
      const resolvedPositions = await Promise.all(pendingPositions.map(resolvePosition));
      const cleanPositions = resolvedPositions.map((position, index) => ({
        ticker: position.ticker,
        shares: Number(position.shares),
        purchase_price:
          position.purchase_price == null ? null : Number(position.purchase_price),
        sector: position.sector || "Unknown",
        display_order: index,
        company_name: position.name || position.company_name || null,
        asset_type: position.asset_type || "Other",
        industry: position.industry || null,
        investment_category: position.investment_category || null,
        classification_source: position.classification_source || "automatic",
        quote_currency: position.quote_currency || null,
        lifecycle_phase: position.lifecycle_phase || "Not Analyzed",
        lifecycle_evidence: position.lifecycle_evidence || {},
        lifecycle_updated_at: position.lifecycle_updated_at || null,
        report_date: position.report_date || null,
        report_source: position.report_source || null,
        notes: position.notes || null,
      }));
      if (new Set(cleanPositions.map((position) => position.ticker)).size !== cleanPositions.length) {
        throw new Error(t("The portfolio contains the same company more than once."));
      }
      setPositions(resolvedPositions);
      const saved = await api<Portfolio>(
        editingId ? `/api/portfolios/${editingId}` : "/api/portfolios",
        {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({
          name: portfolioName,
          ...savedCash([{ currency: cashCurrency, amount: Number(cash || 0) }, ...otherCash], baseCurrency),
          base_currency: baseCurrency,
          benchmark,
          max_position_pct: maxPosition,
          max_sector_pct: maxSector,
          min_cash_pct: minCash,
          time_horizon: timeHorizon,
          rebalancing_threshold_pct: rebalanceThreshold,
          positions: cleanPositions,
        }),
        },
      );
      await loadPortfolios();
      setSelectedId(saved.id);
      setEditingId(saved.id);
      setSaveConfirmation(wasUpdating ? "updated" : "saved");
      setDirty(false);
      setNotice(wasUpdating ? t("Portfolio updated.") : t("Portfolio saved."));
    } catch (cause) {
      setError(
        friendlyError(cause instanceof Error ? cause : new Error("Could not save portfolio"), t),
      );
    }
  }

  async function deletePortfolio(portfolio: Portfolio) {
    setError("");
    setNotice("");
    try {
      await api<void>(`/api/portfolios/${portfolio.id}`, { method: "DELETE" });
      if (editingId === portfolio.id) {
        setEditingId("");
        setPortfolioName("My portfolio");
        setCash(0);
        setPositions([]);
        setSortKey("custom");
      }
      await loadPortfolios();
      setPendingDeleteId("");
      setNotice(t("Portfolio deleted."));
    } catch (cause) {
      setError(
        friendlyError(
          cause instanceof Error ? cause : new Error("Could not delete portfolio"),
          t,
        ),
      );
    }
  }

  async function accountDeleted() {
    await createClient().auth.signOut();
    router.push("/login?confirm=deleted");
    router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut();
    // A full load: nothing from the account stays in memory, and the sign-out
    // dialog keeps showing until the sign-in page is really there.
    window.location.replace("/login");
  }

  return (
    <main className="app-shell simple-shell">
      <AppHeader email={email} onSignOut={signOut} onOpenProfile={() => setShowProfile(true)}>
        <button
          type="button"
          className={activeTab === "today" ? "active" : ""}
          aria-current={activeTab === "today" ? "page" : undefined}
          onClick={() => setActiveTab("today")}
        >
          <Home size={16} aria-hidden="true" />
          {t("Today")}
        </button>
        <button
          type="button"
          className={activeTab === "fire" ? "active" : ""}
          aria-current={activeTab === "fire" ? "page" : undefined}
          onClick={() => setActiveTab("fire")}
        >
          <Flame size={16} aria-hidden="true" />
          FIRE
        </button>
        <button
          type="button"
          className={`nav-parent${activeTab === "portfolio" && portfolioView === "current" ? " active" : ""}${portfolioSection ? " open" : ""}`}
          aria-current={activeTab === "portfolio" && portfolioView === "current" ? "page" : undefined}
          onClick={() => {
            setActiveTab("portfolio");
            setPortfolioView("current");
          }}
        >
          <Briefcase size={16} aria-hidden="true" />
          {t("Portfolio")}
        </button>
        <div className="sidebar-subnav" role="group" aria-label={t("Portfolio tools")}>
          <button
            type="button"
            className={activeTab === "portfolio" && portfolioView === "analytics" ? "active" : ""}
            aria-current={activeTab === "portfolio" && portfolioView === "analytics" ? "page" : undefined}
            onClick={openAnalytics}
          >
            <IndustryIcon icon="chart-line" size={15} />
            {t("Analytics")}
          </button>
          <button
            type="button"
            className={activeTab === "portfolio" && portfolioView === "transactions" ? "active" : ""}
            aria-current={activeTab === "portfolio" && portfolioView === "transactions" ? "page" : undefined}
            onClick={() => {
              setActiveTab("portfolio");
              setPortfolioView("transactions");
              void loadTransactionHistory(selectedId);
            }}
          >
            <History size={15} aria-hidden="true" />
            {t("Transactions")}
          </button>
          <button
            type="button"
            className={activeTab === "test" ? "active" : ""}
            aria-current={activeTab === "test" ? "page" : undefined}
            onClick={() => setActiveTab("test")}
          >
            <Bot size={15} aria-hidden="true" />
            {t("Ask Buddy")}
          </button>
          <button
            type="button"
            className={activeTab === "growth" ? "active" : ""}
            aria-current={activeTab === "growth" ? "page" : undefined}
            onClick={() => setActiveTab("growth")}
          >
            <TrendingUp size={15} aria-hidden="true" />
            {t("Growth calculator")}
          </button>
        </div>
        <button
          type="button"
          className={activeTab === "assets" ? "active" : ""}
          aria-current={activeTab === "assets" ? "page" : undefined}
          onClick={() => setActiveTab("assets")}
        >
          <Building2 size={16} aria-hidden="true" />
          {t("Assets")}
        </button>
        <button
          type="button"
          className={activeTab === "wishlist" ? "active" : ""}
          aria-current={activeTab === "wishlist" ? "page" : undefined}
          onClick={() => setActiveTab("wishlist")}
        >
          <Sparkles size={16} aria-hidden="true" />
          {t("Wishlist")}
        </button>
        <button
          type="button"
          className={activeTab === "education" ? "active" : ""}
          aria-current={activeTab === "education" ? "page" : undefined}
          onClick={() => setActiveTab("education")}
        >
          <GraduationCap size={16} aria-hidden="true" />
          {t("Education")}
        </button>
        <button
          type="button"
          className={activeTab === "support" ? "active" : ""}
          aria-current={activeTab === "support" ? "page" : undefined}
          onClick={() => setActiveTab("support")}
        >
          <Heart size={16} aria-hidden="true" />
          {t("Support us")}
        </button>
        <button
          type="button"
          className="nav-soon"
          aria-disabled="true"
          title={t("Shop is coming soon")}
          onClick={(event) => event.preventDefault()}
        >
          <ShoppingBag size={16} aria-hidden="true" />
          {t("Shop")}
          <span className="nav-badge">{t("Soon")}</span>
        </button>
        <button
          type="button"
          className="nav-soon"
          aria-disabled="true"
          title={t("Settings are coming soon")}
          onClick={(event) => event.preventDefault()}
        >
          <Settings size={16} aria-hidden="true" />
          {t("Settings")}
          <span className="nav-badge">{t("Soon")}</span>
        </button>
        {role === "admin" && (
          <Link href="/admin">
            <ShieldCheck size={16} aria-hidden="true" />
            {t("Admin")}
          </Link>
        )}
      </AppHeader>

      {showProfile && (
        <ProfileDialog
          dateOfBirth={dateOfBirth}
          displayName={displayName}
          portfolios={portfolios.map((portfolio) => ({ id: portfolio.id, name: portfolio.name }))}
          currentPortfolioId={selectedId || null}
          today={today}
          onSave={saveProfile}
          onClose={() => setShowProfile(false)}
          canDeleteAccount={role !== "admin"}
          onAccountDeleted={() => void accountDeleted()}
        />
      )}

      {error && <div className="alert page-message" role="alert">{t(error)}</div>}
      {notice && <div className="notice page-message">{t(notice)}</div>}

      {/* Restarts on every page change: a thin bar across the top while the page opens. */}
      <div className="page-progress" key={`${activeTab}-${portfolioView}`} aria-hidden="true" />
      {activeTab === "today" ? (
        <section className="simple-page today-shell">
          <TodayPage
            name={displayName}
            portfolios={todayPortfolios}
            unsavedPortfolio={dirty && editingId ? portfolioName || t("My portfolio") : null}
            loadingPortfolios={loadingPortfolios}
            book={book}
            today={today}
            onOpen={openFromToday}
          />
        </section>
      ) : activeTab === "growth" ? (
        <section className="simple-page growth-shell">
          <GrowthCalculator
            key={growthStart ? JSON.stringify(growthStart) : "own"}
            portfolioValue={metrics.totalValue}
            currency={baseCurrency}
            start={growthStart}
          />
        </section>
      ) : activeTab === "wishlist" ? (
        <section className="simple-page wishlist-shell">
          <WishlistPage />
        </section>
      ) : activeTab === "assets" ? (
        <section className="simple-page assets-shell">
          <AssetsPage today={today} currency={baseCurrency} />
        </section>
      ) : activeTab === "support" ? (
        <section className="simple-page support-shell">
          <SupportPage />
        </section>
      ) : activeTab === "education" ? (
        <section className="simple-page education-shell">
          <EducationPage />
        </section>
      ) : activeTab === "fire" ? (
        <section className="simple-page fire-shell">
          <FireDashboard
            portfolioValue={metrics.totalValue}
            cash={totalCash}
            reports={positions
              .filter((position) => !position.is_etf_index && position.report_date)
              .map((position) => ({
                ticker: position.ticker,
                report_date: position.report_date as string,
              }))}
            today={today}
            currency={baseCurrency}
            dateOfBirth={dateOfBirth}
            onEditProfile={() => setShowProfile(true)}
            onSeeGrowth={(start) => {
              setGrowthStart(start);
              setActiveTab("growth");
            }}
          />
        </section>
      ) : activeTab === "portfolio" ? (
        <section className="simple-page portfolio-page">
          {portfolioView === "current" && (
            <header className="portfolio-page-head">
              <h1>{t("Portfolio")}</h1>
              {latestPriceDate(positions) && (
                <span className="portfolio-price-date">
                  {t("Prices as of {date}", { date: latestPriceDate(positions) as string })}
                </span>
              )}
              <button type="button" className="button portfolio-analytics-link" onClick={openAnalytics}>
                <IndustryIcon icon="chart-line" size={16} />
                {t("See analytics")}
              </button>
            </header>
          )}
          <div className={`portfolio-workspace ${portfolioView}-view`}>
            {portfolioView === "current" && (
              <aside className="panel portfolio-sidebar">
              <form onSubmit={createPortfolio} className="stack">
                <div className="field-row portfolio-details-row">
                  <label>
                    {t("Portfolio name")}
                    <input
                      value={portfolioName}
                      onChange={(event) => {
                        setPortfolioName(event.target.value);
                        setSaveConfirmation(null);
                        setDirty(true);
                      }}
                      placeholder={t("My portfolio")}
                      required
                    />
                  </label>
                  <div className="cash-field">
                    <span className="cash-field-label">
                      <span>{t("Cash")}</span>
                      <CashSummary
                        cash={totalCash}
                        share={metrics.cashPercentage ?? 0}
                        totalValue={metrics.totalValue}
                        target={cashGoal}
                        formatMoney={(value) => money(value, baseCurrency)}
                        t={t}
                      />
                    </span>
                    <span className="cash-inputs">
                      <span className="money-input">
                        <select
                          aria-label={t("Cash currency")}
                          value={cashCurrency}
                          onChange={(event) => {
                            setCashCurrency(event.target.value);
                            setSaveConfirmation(null);
                            setDirty(true);
                          }}
                        >
                          {[...new Set([cashCurrency, ...PORTFOLIO_CURRENCIES])].map((code) => (
                            <option key={code} value={code}>
                              {currencySign(code)} {code}
                            </option>
                          ))}
                        </select>
                        <AmountInput
                          aria-label={t("Cash")}
                          value={Number(cash) || 0}
                          onChange={(amount) => {
                            setCash(amount);
                            setSaveConfirmation(null);
                            setDirty(true);
                          }}
                          required
                        />
                      </span>
                      {otherCash.map((item, index) => (
                        <span className="money-input" key={index}>
                          <select
                            aria-label={t("Currency of extra cash {number}", { number: index + 1 })}
                            value={item.currency}
                            onChange={(event) => {
                              const currency = event.target.value;
                              setOtherCash((current) =>
                                current.map((row, at) => (at === index ? { ...row, currency } : row)),
                              );
                              setDirty(true);
                            }}
                          >
                            {[...new Set([item.currency, ...PORTFOLIO_CURRENCIES])].map((code) => (
                                <option key={code} value={code}>
                                  {currencySign(code)} {code}
                                </option>
                              ))}
                          </select>
                          <AmountInput
                            aria-label={t("Extra cash {number}", { number: index + 1 })}
                            value={Number(item.amount) || 0}
                            onChange={(amount) => {
                              setOtherCash((current) =>
                                current.map((row, at) => (at === index ? { ...row, amount } : row)),
                              );
                              setDirty(true);
                            }}
                          />
                          <button
                            type="button"
                            className="money-input-remove"
                            aria-label={t("Remove {currency} cash", { currency: item.currency })}
                            onClick={() => {
                              setOtherCash((current) => current.filter((_, at) => at !== index));
                              setDirty(true);
                            }}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </span>
                      ))}
                      {otherCash.length < 10 && (
                        <button
                          type="button"
                          className="cash-add"
                          aria-label={t("Add cash in another currency")}
                          title={t("Add cash in another currency")}
                          onClick={() => {
                            const used = new Set([cashCurrency, ...otherCash.map((item) => item.currency)]);
                            const currency = PORTFOLIO_CURRENCIES.find((code) => !used.has(code)) ?? "EUR";
                            setOtherCash((current) => [...current, { currency, amount: 0 }]);
                            setDirty(true);
                          }}
                        >
                          <Plus size={16} aria-hidden="true" />
                        </button>
                      )}
                    </span>
                    {[cashCurrency, ...otherCash.map((item) => item.currency)].some(
                      (code) => code !== baseCurrency && !cashRates[code],
                    ) ? (
                      <small className="muted">{t("Loading exchange rates…")}</small>
                    ) : (
                      [cashCurrency, ...otherCash.map((item) => item.currency)].some((code) => code !== baseCurrency) && (
                        <small className="muted">
                          {t("All cash together: {amount}, at today's exchange rates.", {
                            amount: money(totalCash, baseCurrency),
                          })}
                        </small>
                      )
                    )}
                  </div>
                </div>

                {loadingPortfolios ? (
                  <div className="portfolio-summary-grid" aria-label={t("Loading portfolio summary")}>
                    {Array.from({ length: 9 }).map((_, index) => (
                      <div className="summary-card skeleton" key={index} />
                    ))}
                  </div>
                ) : (
                  <section className="portfolio-summary-grid" aria-label={t("Portfolio summary")}>
                    <SummaryCard
                      label={t("Total portfolio value")}
                      value={<AnimatedNumber value={metrics.totalValue} format={(n) => money(n, baseCurrency)} />}
                    />
                    <SummaryCard
                      label={t("Total cost basis")}
                      value={money(metrics.totalCostBasis, baseCurrency)}
                      note={metrics.hasPartialCostBasis ? t("Partial cost data") : undefined}
                    />
                    <SummaryCard
                      label={t("Unrealized gain/loss")}
                      value={signedMoney(metrics.unrealizedAmount, baseCurrency)}
                      note={signedPercent(metrics.unrealizedPercent)}
                      tone={metrics.unrealizedAmount >= 0 ? "positive" : "negative"}
                      emphasis
                    />
                    <SummaryCard
                      label={t("Today’s gain/loss")}
                      value={signedMoney(metrics.dayAmount, baseCurrency)}
                      note={signedPercent(metrics.dayPercent)}
                      tone={metrics.dayAmount >= 0 ? "positive" : "negative"}
                    />
                    <SummaryCard
                      label={<CashLabel target={cashGoal} t={t} />}
                      value={`${money(totalCash, baseCurrency)} / ${((metrics.cashPercentage ?? 0) * 100).toFixed(1)}%`}
                      note={cashTargetNote(totalCash, metrics.totalValue, cashGoal, (value) => money(value, baseCurrency), t)}
                      short={cashShortfall(totalCash, metrics.totalValue, cashGoal) > 0.005}
                    />
                    <SummaryCard
                      label={t("Number of holdings")}
                      value={String(positions.length)}
                    />
                    <SummaryCard
                      label={t("Largest position")}
                      value={
                        metrics.largestPosition
                          ? `${metrics.largestPosition.ticker} · ${(
                              (metrics.byTicker.get(metrics.largestPosition.ticker)
                                ?.weight ?? 0) * 100
                            ).toFixed(1)}%`
                          : "—"
                      }
                    />
                    <SummaryCard label={t("Benchmark")} value={benchmarkLabel(benchmark, t)} />
                    <BondsVsStocksCard
                      bonds={bondData.loading ? null : bondData.total}
                      stocks={metrics.holdingsValue}
                      onVisible={wantBonds}
                    />
                  </section>
                )}

                <button
                  type="button"
                  className="portfolio-settings-toggle"
                  aria-expanded={settingsOpen}
                  onClick={() => setSettingsOpen((current) => !current)}
                >
                  {t("Portfolio settings")}
                  {settingsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {settingsOpen && (
                  <div className="portfolio-settings-grid">
                    <label>
                      {t("Base currency")}
                      <select
                        value={baseCurrency}
                        onChange={(event) => changeBaseCurrency(event.target.value)}
                      >
                        {[...new Set([baseCurrency, ...PORTFOLIO_CURRENCIES])].map((currency) => (
                          <option key={currency}>{currency}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("Benchmark")}
                      <select
                        value={benchmark}
                        onChange={(event) => {
                          setBenchmark(event.target.value);
                          setDirty(true);
                        }}
                      >
                        <option value="SPY">S&amp;P 500</option>
                        <option value="QQQ">Nasdaq-100</option>
                        <option value="DIA">Dow Jones</option>
                        <option value="IWM">Russell 2000</option>
                      </select>
                    </label>
                    <PercentSetting label={t("Max position (%)")} value={maxPosition} fallback={book.max_position_pct} onChange={(value) => { setMaxPosition(value); setDirty(true); }} />
                    <PercentSetting label={t("Max sector (%)")} value={maxSector} fallback={book.max_industry_pct} onChange={(value) => { setMaxSector(value); setDirty(true); }} />
                    <PercentSetting label={t("Min cash (%)")} value={minCash || null} fallback={book.min_cash_pct ?? DEFAULT_CASH_TARGET} onChange={(value) => { setMinCash(value ?? 0); setDirty(true); }} />
                    <label>
                      {t("Time horizon")}
                      <select value={timeHorizon} onChange={(event) => { setTimeHorizon(event.target.value as typeof timeHorizon); setDirty(true); }}>
                        <option value="Short Term">{t("Short Term")}</option>
                        <option value="Medium Term">{t("Medium Term")}</option>
                        <option value="Long Term">{t("Long Term")}</option>
                      </select>
                    </label>
                    <PercentSetting label={t("Rebalance at (%)")} value={rebalanceThreshold} onChange={(value) => { setRebalanceThreshold(value ?? 0); setDirty(true); }} />
                  </div>
                )}

                {!loadingPortfolios && positions.length === 0 && (
                  <EmptyState
                    art="portfolio"
                    title={t("No positions yet")}
                    text={t("Add a position or import a portfolio to begin.")}
                  />
                )}

                {positions.length > 0 && (
                  <>
                  <div className="column-visibility-controls" aria-label={t("Visible portfolio columns")}>
                    <span>{t("Columns")}</span>
                    <button
                      type="button"
                      aria-pressed={showReturns}
                      onClick={() => setShowReturns((visible) => !visible)}
                    >
                      {showReturns ? <Eye size={15} /> : <EyeOff size={15} />}
                      {t("Returns")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={showLifecycle}
                      onClick={() => setShowLifecycle((visible) => !visible)}
                    >
                      {showLifecycle ? <Eye size={15} /> : <EyeOff size={15} />}
                      {t("Lifecycle phase")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={showMyPortfolioBuddyStatus}
                      onClick={() => setShowMyPortfolioBuddyStatus((visible) => !visible)}
                    >
                      {showMyPortfolioBuddyStatus ? <Eye size={15} /> : <EyeOff size={15} />}
                      {t("MyPortfolioBuddy status")}
                    </button>
                  </div>
                  <div
                    className={`holdings-table${showReturns ? "" : " hide-returns"}${showLifecycle ? "" : " hide-lifecycle"}${showMyPortfolioBuddyStatus ? "" : " hide-stockbuddy-status"}`}
                    role="table"
                    aria-label={t("Current portfolio holdings")}
                    style={{
                      ["--holding-columns" as string]: holdingColumns({
                        returns: showReturns,
                        lifecycle: showLifecycle,
                        status: showMyPortfolioBuddyStatus,
                      }),
                    }}
                  >
                    <div className="holdings-primary-row holdings-header" role="row">
                      <SortButton label={t("Symbol and company")} alphabetic active={sortKey === "symbol"} direction={sortDirection} defaultDirection="asc" onClick={() => sortPositions("symbol")} />
                      <span role="columnheader">{t("Quantity")}</span>
                      <span role="columnheader" title={t("Weighted average purchase price when transactions are combined")}>{t("Purchase price")}</span>
                      <span role="columnheader">{t("Current price")}</span>
                      <span role="columnheader" title={t("Price divided by trailing 12-month earnings per share from SEC filings")}>{t("P/E")}</span>
                      <span className="report-date-col" role="columnheader">{t("Report date")}</span>
                      <SortButton label={t("Market value")} active={sortKey === "value"} direction={sortDirection} defaultDirection="desc" onClick={() => sortPositions("value")} />
                      <SortButton label={t("Portfolio weight")} active={sortKey === "weight"} direction={sortDirection} defaultDirection="desc" onClick={() => sortPositions("weight")} />
                      <SortButton label={t("Unrealized gain/loss")} active={sortKey === "gain"} direction={sortDirection} defaultDirection="desc" onClick={() => sortPositions("gain")} />
                      <SortButton className="return-col" label={t("1M")} active={sortKey === "growth_1m"} direction={sortDirection} defaultDirection="desc" onClick={() => sortPositions("growth_1m")} />
                      <SortButton className="return-col" label={t("6M")} active={sortKey === "growth_6m"} direction={sortDirection} defaultDirection="desc" onClick={() => sortPositions("growth_6m")} />
                      <SortButton className="return-col" label={t("1Y")} active={sortKey === "growth_1y"} direction={sortDirection} defaultDirection="desc" onClick={() => sortPositions("growth_1y")} />
                      <SortButton className="return-col" label={t("Day")} active={sortKey === "day"} direction={sortDirection} defaultDirection="desc" onClick={() => sortPositions("day")} />
                      <SortButton className="lifecycle-col" label={t("Lifecycle phase")} active={sortKey === "phase"} direction={sortDirection} defaultDirection="asc" onClick={() => sortPositions("phase")} />
                      <SortButton className="status-col" label={t("MyPortfolioBuddy status")} active={sortKey === "status"} direction={sortDirection} defaultDirection="asc" onClick={() => sortPositions("status")} />
                      <span role="columnheader">{t("Actions")}</span>
                    </div>
                    {displayRows.map(({ position, originalIndex: index, metric, status }) => {
                      const expanded = expandedRows.has(index);
                      return (
                        <div
                          className={`holding-record${dragFrom === index ? " dragging" : ""}${dragOver === index && dragFrom !== index ? " drop-target" : ""}`}
                          key={`${position.ticker}-${index}`}
                          onDragOver={(event) => {
                            if (dragFrom == null) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setDragOver(index);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (dragFrom != null) moveRow(dragFrom, index);
                            setDragFrom(null);
                            setDragOver(null);
                          }}
                        >
                          <div className={`holdings-primary-row ${metric.unrealizedAmount == null || metric.unrealizedAmount === 0 ? "" : metric.unrealizedAmount > 0 ? "gain-up" : "gain-down"}`} role="row">
                            <div className="holding-identity" role="cell">
                              <button
                                type="button"
                                className="drag-handle"
                                draggable
                                aria-label={
                                  position.ticker
                                    ? t("Move {ticker}. Drag, or use the up and down arrow keys.", { ticker: position.ticker })
                                    : t("Move row {number}. Drag, or use the up and down arrow keys.", { number: index + 1 })
                                }
                                title={t("Drag to reorder")}
                                onDragStart={(event) => {
                                  setSortKey("custom");
                                  setDragFrom(index);
                                  event.dataTransfer.effectAllowed = "move";
                                  event.dataTransfer.setData("text/plain", position.ticker);
                                  const row = event.currentTarget.closest(".holding-record");
                                  if (row instanceof HTMLElement) event.dataTransfer.setDragImage(row, 24, 20);
                                }}
                                onDragEnd={() => {
                                  setDragFrom(null);
                                  setDragOver(null);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                                  event.preventDefault();
                                  moveRow(index, index + (event.key === "ArrowUp" ? -1 : 1));
                                }}
                              >
                                <GripVertical size={15} aria-hidden="true" />
                              </button>
                              <button type="button" className="expand-position" aria-label={t(expanded ? "Collapse {ticker}" : "Expand {ticker}", { ticker: position.ticker })} aria-expanded={expanded} onClick={() => toggleExpanded(setExpandedRows, index)}>
                                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                              <div>
                                <input
                                  aria-label={t("Ticker {number}", { number: index + 1 })}
                                  value={position.ticker}
                                  onBlur={() => void resolveRow(index)}
                                  onChange={(event) => updatePosition(index, { ticker: event.target.value, price: undefined, resolve_error: null })}
                                />
                                <span>{resolvingRows.includes(index) ? t("Finding…") : position.name || position.company_name || t("Company unavailable")}</span>
                              </div>
                            </div>
                            <input aria-label={t("Quantity {number}", { number: index + 1 })} type="number" min="0" step="1" value={position.shares} onChange={(event) => updatePosition(index, { shares: Number(event.target.value.replace(/^0+(?=\d)/, "")) })} />
                            <input aria-label={t("Purchase price {number}", { number: index + 1 })} type="number" min="0" step="0.01" placeholder="—" value={position.purchase_price ?? ""} onChange={(event) => updatePosition(index, { purchase_price: event.target.value === "" ? null : Number(event.target.value) })} />
                            <span className="financial-cell" role="cell">{position.price == null ? <span className="data-state"><CircleAlert size={14} /> {t("Missing price")}</span> : <FlashValue value={position.price}>{money(position.price, baseCurrency)}</FlashValue>}</span>
                            <span className="financial-cell" role="cell" title={t("Price ÷ trailing 12-month EPS (SEC filings)")}>{position.is_etf_index ? t("N/A") : position.pe_ratio == null ? "—" : position.pe_ratio.toFixed(1)}</span>
                            <span className="financial-cell report-date-col" role="cell" title={position.report_source || t("Report source unavailable")}>
                              {position.is_etf_index ? t("N/A") : position.report_date ? (
                                <button
                                  type="button"
                                  className="report-date-button"
                                  aria-label={t("Set a report reminder for {ticker}, last report {date}", { ticker: position.ticker, date: position.report_date })}
                                  onClick={() => setReminderFor({ ticker: position.ticker, companyName: position.name || position.company_name || null, lastReportDate: position.report_date as string })}
                                >
                                  {position.report_date}
                                </button>
                              ) : t("Unavailable")}
                            </span>
                            <strong className="financial-cell" role="cell">{metric.marketValue == null ? "—" : <FlashValue value={metric.marketValue}>{money(metric.marketValue, baseCurrency)}</FlashValue>}</strong>
                            <span className="financial-cell" role="cell">{metric.weight == null ? "—" : `${(metric.weight * 100).toFixed(1)}%`}</span>
                            <strong className={`financial-cell gain-cell ${(metric.unrealizedAmount ?? 0) >= 0 ? "positive" : "negative"}`} role="cell">
                              {metric.unrealizedAmount == null ? "—" : <StackedChange amount={signedMoney(metric.unrealizedAmount, baseCurrency)} percent={signedPercent(metric.unrealizedPercent)} />}
                            </strong>
                            <span className="financial-cell return-col" role="cell" title={t("1-month return")}><GrowthValue value={position.growth_1m} /></span>
                            <span className="financial-cell return-col" role="cell" title={t("6-month return")}><GrowthValue value={position.growth_6m} /></span>
                            <span className="financial-cell return-col" role="cell" title={t("1-year return")}><GrowthValue value={position.growth_1y ?? position.growth} /></span>
                            <span className={`financial-cell return-col ${(metric.dayAmount ?? 0) >= 0 ? "positive" : "negative"}`} role="cell" title={t("Day change")}>
                              {metric.dayAmount == null ? "—" : <StackedChange amount={signedMoney(metric.dayAmount, baseCurrency)} percent={signedPercent(metric.dayPercent)} />}
                            </span>
                            <button type="button" className="phase-badge lifecycle-col" title={t("Open lifecycle evidence")} onClick={() => toggleExpanded(setExpandedRows, index)}>{t(position.lifecycle_phase || "Not Analyzed")}</button>
                            <button type="button" className={`status-badge status-col status-${status.status.toLowerCase().replaceAll(" ", "-")}`} title={status.warnings.map((warning) => t(warning)).join(" ") || t("No active warnings")} onClick={() => toggleExpanded(setExpandedRows, index)}>
                              {status.warnings.length > 0 && <Info size={13} />}
                              {t(status.status)}
                            </button>
                            <div className="position-actions">
                              <button type="button" aria-label={t("Actions for {ticker}", { ticker: position.ticker })} aria-expanded={actionRow === index} onClick={() => setActionRow(actionRow === index ? null : index)}><Ellipsis size={18} /></button>
                              {actionRow === index && (
                                <div className="actions-menu">
                                  <button type="button" onClick={() => { setSelectedId(editingId); setActiveTab("test"); }}>{t("Analyze position")}</button>
                                  <button type="button" onClick={() => { setTransactionRow(index); setTransactionPrice(Math.round(Number(position.price ?? position.purchase_price ?? 0) * 100) / 100); setActionRow(null); toggleExpanded(setExpandedRows, index, true); }}>{t("Add transaction")}</button>
                                  <button type="button" onClick={() => { setRemoveRow(index); setActionRow(null); }}>{t("Remove position")}</button>
                                </div>
                              )}
                            </div>
                          </div>
                          {removeRow === index && (
                            <div className="position-confirm" role="alert">
                              {t("Remove {ticker} from this portfolio?", { ticker: position.ticker })}
                              <button type="button" onClick={() => setRemoveRow(null)}>{t("Cancel")}</button>
                              <button type="button" onClick={() => { setPositions((current) => current.filter((_, row) => row !== index)); setRemoveRow(null); setDirty(true); }}>{t("Confirm removal")}</button>
                            </div>
                          )}
                          {expanded && (
                            <div className="position-detail-row">
                              <label>
                                {t("Asset type")}
                                <select aria-label={t("Asset type for {ticker}", { ticker: position.ticker })} value={position.asset_type || "Other"} onChange={(event) => updatePosition(index, { asset_type: event.target.value as Position["asset_type"], classification_source: "manual" })}>{assetTypes.map((value) => <option key={value} value={value}>{t(value)}</option>)}</select>
                              </label>
                              <label>
                                {t("Sector")}
                                <select aria-label={t("Sector for {ticker}", { ticker: position.ticker })} value={position.sector || "Unknown"} onChange={(event) => updatePosition(index, { sector: event.target.value, classification_source: "manual" })}>{sectors.map((value) => <option key={value} value={value}>{t(value)}</option>)}</select>
                              </label>
                              <span className="detail-industry">
                                {t("Industry")} <strong>{position.industry || t("Unknown")}</strong>
                              </span>
                              {transactionRow === index && (
                                <div className="transaction-editor" role="group" aria-label={t("Transaction for {ticker}", { ticker: position.ticker })}>
                                  <label>{t("Transaction")}<select value={transactionKind} onChange={(event) => setTransactionKind(event.target.value as "buy" | "sell")}><option value="buy">{t("Buy")}</option><option value="sell">{t("Sell")}</option></select></label>
                                  <label>{t("Quantity")}<input type="number" min="1" step="1" value={transactionQuantity} onChange={(event) => setTransactionQuantity(Number(event.target.value))} /></label>
                                  <label>{t("Price")}<input type="number" min="0" step="0.01" value={transactionPrice} onChange={(event) => setTransactionPrice(Number(event.target.value))} /></label>
                                  <div className="transaction-actions">
                                    <button type="button" className="button" onClick={() => setTransactionRow(null)}>{t("Cancel")}</button>
                                    <button type="button" className="button primary" onClick={() => void applyTransaction(index)}>{t("Apply")}</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  </>
                )}

                <div className="portfolio-add-actions" aria-label={t("Add holdings")}>
                  <button
                    type="button"
                    onClick={() => chooseImportMode("manual")}
                  >
                    {t("+ Add position")}
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseImportMode("csv")}
                  >
                    {t("+ Import CSV")}
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseImportMode("picture")}
                  >
                    {t("+ Import screenshot")}
                  </button>
                </div>

                <button
                  className={`button primary${saveConfirmation ? " is-saved" : ""}`}
                  type="submit"
                  disabled={extracting || !positions.length}
                >
                  {saveConfirmation === "updated"
                    ? t("Updated ✓")
                    : saveConfirmation === "saved"
                      ? t("Saved ✓")
                      : t("Save changes")}
                </button>
                {dirty && <p className="unsaved-state">{t("Unsaved changes")}</p>}
              </form>

              <BondsSection
                bonds={bondData.bonds}
                total={bondData.total}
                loading={bondData.loading}
                currency={baseCurrency}
                stocksValue={metrics.holdingsValue}
                onEdit={() => setActiveTab("fire")}
                onVisible={wantBonds}
              />

              {portfolios.length > 0 && (
                <section className="saved-portfolios">
                  <h2>{t("My portfolios")}</h2>
                  <div className="portfolio-list">
                    {portfolios.map((portfolio) => (
                      <div className="portfolio-list-item" key={portfolio.id}>
                        <button
                          type="button"
                          className={portfolio.id === selectedId ? "selected" : ""}
                          onClick={() => openPortfolio(portfolio)}
                        >
                          <strong>{portfolio.name}</strong>
                          <span>{t(portfolio.portfolio_positions.length === 1 ? "{count} holding" : "{count} holdings", { count: portfolio.portfolio_positions.length })}</span>
                        </button>
                        <div className="portfolio-delete-actions">
                          {pendingDeleteId === portfolio.id ? (
                            <>
                              <button
                                type="button"
                                className="cancel-delete"
                                onClick={() => setPendingDeleteId("")}
                              >
                                {t("Cancel")}
                              </button>
                              <button
                                type="button"
                                className="delete-portfolio confirm"
                                aria-label={t("Confirm delete {name}", { name: portfolio.name })}
                                onClick={() => void deletePortfolio(portfolio)}
                              >
                                {t("Confirm delete")}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="delete-portfolio"
                              aria-label={t("Delete {name}", { name: portfolio.name })}
                              onClick={() => setPendingDeleteId(portfolio.id)}
                            >
                              {t("Delete")}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="button new-portfolio"
                    onClick={startNewPortfolio}
                  >
                    {t("+ Create new portfolio")}
                  </button>
                </section>
              )}
              </aside>
            )}

            {portfolioView === "transactions" && (
              <TransactionsView
                portfolios={portfolios}
                selectedId={selectedId}
                onSelectPortfolio={(portfolioId) => {
                  const portfolio = portfolios.find((item) => item.id === portfolioId);
                  if (portfolio) {
                    openPortfolio(portfolio);
                    void loadTransactionHistory(portfolio.id);
                  }
                }}
                transactions={transactions}
                loading={loadingTransactions}
                holdings={positions
                  .filter((position) => position.ticker.trim() && Number(position.shares) > 0)
                  .map((position) => ({
                    ticker: position.ticker,
                    shares: Number(position.shares),
                    price: position.price,
                    name: position.name || position.company_name,
                  }))}
                currency={selected?.base_currency ?? baseCurrency}
                today={today}
                blockedReason={
                  !editingId
                    ? t("Save this portfolio first, then record its transactions.")
                    : dirty
                      ? t("Save your portfolio changes before recording a transaction.")
                      : null
                }
                onRecord={recordTransaction}
              />
            )}

            {portfolioView === "analytics" && (
              <PortfolioAnalyticsDashboard
                portfolios={portfolios}
                selectedId={selectedId}
                positions={positions}
                cash={totalCash}
                bondsValue={bondData.total}
                transactions={transactions}
                useTransactionHistory={book.use_transaction_history_analytics}
                loading={loadingPortfolios}
                asOfDate={today}
                limits={{
                  maxPositionPct:
                    selected?.max_position_pct ?? book.max_position_pct,
                  maxSectorPct:
                    selected?.max_sector_pct ?? book.max_industry_pct,
                  minCashPct: cashTarget(selected?.min_cash_pct, book.min_cash_pct),
                  rebalancingThresholdPct:
                    selected?.rebalancing_threshold_pct,
                }}
                onSelectPortfolio={(portfolioId) => {
                  const portfolio = portfolios.find(
                    (item) => item.id === portfolioId,
                  );
                  if (portfolio) openPortfolio(portfolio);
                  if (book.use_transaction_history_analytics) {
                    void loadTransactionHistory(portfolioId);
                  }
                }}
                onRefresh={() => enrichPositions(positions, { fresh: true })}
              />
            )}

            {false && (
              <section className="portfolio-analysis">
              <div className="portfolio-summary">
                <Metric label="Cash" value={money(cash)} />
                <Metric label="My spent" value={money(costBasis)} />
                <Metric
                  label="Current portfolio"
                  value={money(marketValue + cash)}
                />
                <div
                  className={`metric ${
                    gainSummary.total >= 0 ? "positive" : "negative"
                  }`}
                >
                  <span>Net gain / loss</span>
                  <strong>
                    {gainSummary.total >= 0 ? "+" : ""}
                    {money(gainSummary.total)}
                  </strong>
                </div>
              </div>

              <section className="gain-loss-cards" aria-label="Gain and loss summary">
                <article className="panel performance-card gains">
                  <p className="step">Gains</p>
                  <h2>Winning stocks</h2>
                  <strong className="performance-total">
                    +{money(gainSummary.positive)}
                  </strong>
                  <span>
                    {gainSummary.winners}{" "}
                    {gainSummary.winners === 1 ? "stock" : "stocks"} with positive gains
                  </span>
                  <div className="performance-stock-list">
                    {gainRows.map(({ position, result }) => (
                      <PerformanceStockRow
                        key={position.ticker}
                        position={position}
                        result={result}
                      />
                    ))}
                    {!gainRows.length && (
                      <p className="muted">No stocks with positive gains.</p>
                    )}
                  </div>
                </article>
                <article className="panel performance-card losses">
                  <p className="step">Losses</p>
                  <h2>Losing stocks</h2>
                  <strong className="performance-total">
                    {money(gainSummary.negative)}
                  </strong>
                  <span>
                    {gainSummary.losers}{" "}
                    {gainSummary.losers === 1 ? "stock" : "stocks"} with negative gains
                  </span>
                  <div className="performance-stock-list">
                    {lossRows.map(({ position, result }) => (
                      <PerformanceStockRow
                        key={position.ticker}
                        position={position}
                        result={result}
                      />
                    ))}
                    {!lossRows.length && (
                      <p className="muted">No stocks with negative gains.</p>
                    )}
                  </div>
                </article>
              </section>

              <label className="allocation-filter">
                <input
                  type="checkbox"
                  checked={excludeEtfIndex}
                  onChange={(event) => setExcludeEtfIndex(event.target.checked)}
                />
                <span>
                  <strong>Exclude ETF / Index</strong>
                  <small>Remove funds from position % and industry allocation</small>
                </span>
              </label>

              <section className="allocation-grid" aria-label="Portfolio allocations">
                <article className="panel allocation-panel">
                <div className="panel-heading">
                  <div>
                    <p className="step">Allocation</p>
                    <h2>Position sizes</h2>
                  </div>
                  <small>Based on latest completed daily close</small>
                </div>
                <div className="allocation-bars">
                  {allocationPositions.filter((position) => position.price && position.shares).map((position) => {
                    const value = Number(position.price) * Number(position.shares);
                    const allocation = allocationPortfolioValue
                      ? value / allocationPortfolioValue
                      : 0;
                    const breached = allocation > book.max_position_pct;
                    return (
                      <div
                        className={`allocation-row ${breached ? "allocation-breach" : ""}`}
                        key={position.ticker}
                      >
                        <div>
                          <strong>{position.ticker}</strong>
                          <span>
                            {(allocation * 100).toFixed(1)}%
                            {breached &&
                              ` · over ${(book.max_position_pct * 100).toFixed(1)}% limit`}
                          </span>
                        </div>
                        <div className="allocation-track">
                          <span style={{ width: `${Math.min(allocation * 100, 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {!allocationPositions.some(
                    (position) => position.price && position.shares,
                  ) && (
                    <p className="muted">
                      Resolve a stock to build the allocation chart.
                    </p>
                  )}
                </div>
                </article>

                <article className="panel allocation-panel">
                <div className="panel-heading">
                  <div>
                    <p className="step">Industries</p>
                    <h2>Industry allocation</h2>
                  </div>
                  <small>Compared with Admin limits</small>
                </div>
                <div className="allocation-bars">
                  {industryAllocations.map(({ industry, allocation, holdings }) => {
                    const limit = book.max_industry_pct;
                    const breached = allocation > limit;
                    return (
                      <div
                        className={`allocation-row ${breached ? "allocation-breach" : ""}`}
                        key={industry}
                      >
                        <div>
                          <strong>
                            <IndustryIcon icon={iconForIndustry(industry)} size={16} />
                            {industry}
                          </strong>
                          <span>
                            {(allocation * 100).toFixed(1)}%
                            {breached && ` · over ${(limit * 100).toFixed(1)}% limit`}
                          </span>
                        </div>
                        <p className="industry-holdings">{holdings.join(", ")}</p>
                        <div className="allocation-track">
                          <span style={{ width: `${Math.min(allocation * 100, 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {!industryAllocations.length && (
                    <p className="muted">Assign sectors to build industry allocation.</p>
                  )}
                </div>
                </article>
              </section>
              </section>
            )}
          </div>

          {reminderFor && (
            <ReportReminderDialog
              ticker={reminderFor.ticker}
              companyName={reminderFor.companyName}
              lastReportDate={reminderFor.lastReportDate}
              portfolioId={selectedId || null}
              email={email}
              today={today}
              emailEnabled={Boolean(book.email_reminders_enabled)}
              onClose={() => setReminderFor(null)}
            />
          )}

          {importMode && (
            <div
              className="modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !extracting) {
                  setImportMode(null);
                }
              }}
            >
              <section
                className="add-holding-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-holding-title"
              >
                <div className="modal-heading">
                  <h2 id="add-holding-title">
                    {importMode === "manual"
                      ? t("Add position")
                      : importMode === "csv"
                        ? t("Import CSV")
                        : t("Import screenshot")}
                  </h2>
                  <button
                    type="button"
                    aria-label={t("Close")}
                    disabled={extracting}
                    onClick={() => setImportMode(null)}
                  >
                    ×
                  </button>
                </div>

                {importMode === "manual" && (
                  <div className="modal-fields">
                    <label>
                      {t("Ticker or company")}
                      <input
                        autoFocus
                        value={draftPosition.ticker}
                        placeholder={t("AAPL or Apple")}
                        onChange={(event) =>
                          setDraftPosition((current) => ({
                            ...current,
                            ticker: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void addDraftPosition();
                        }}
                      />
                    </label>
                    <label>
                      {t("Shares")}
                      <input
                        aria-label={t("New stock shares")}
                        type="number"
                        min="0"
                        step="1"
                        value={draftPosition.shares}
                        onChange={(event) => {
                          const normalized = event.currentTarget.value.replace(
                            /^0+(?=\d)/,
                            "",
                          );
                          event.currentTarget.value = normalized;
                          setDraftPosition((current) => ({
                            ...current,
                            shares: Number(normalized),
                          }));
                        }}
                      />
                    </label>
                    <label>
                      {t("Purchase price")}
                      <input
                        aria-label={t("New stock purchase price")}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={t("Optional")}
                        value={draftPosition.purchase_price ?? ""}
                        onChange={(event) =>
                          setDraftPosition((current) => ({
                            ...current,
                            purchase_price:
                              event.target.value === "" ? null : Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => void addDraftPosition()}
                    >
                      {t("Add position")}
                    </button>
                  </div>
                )}

                {importMode === "csv" && (
                  <label className="file-drop compact-drop">
                    <span>{t("Choose a CSV file")}</span>
                    <small>
                      {t("A positions export from Fidelity, Schwab, Vanguard, E*TRADE, Interactive Brokers and others, or any file with ticker and shares columns.")}
                    </small>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        try {
                          const text = await file.text();
                          const firstPass = parsePortfolioCsvPreview(text);
                          const mapping = defaultColumnMap(firstPass.headers);
                          const preview = parsePortfolioCsvPreview(text, mapping);
                          // Broker exports (titles, totals, cash rows, "$1,234.56") read better
                          // with the broker reader; a plain ticker,shares file keeps the simple one.
                          const broker = parseBrokerCsv(text);
                          if (
                            broker.rows.length > preview.positions.length ||
                            (broker.rows.length > 0 && preview.errors.length > 0)
                          ) {
                            setCsvText("");
                            // MyPortfolioBuddy keeps whole shares; say so when a file has fractions.
                            const rounded = broker.rows.filter((row) => !Number.isInteger(row.shares));
                            setImportPreview({
                              positions: broker.rows
                                .filter((row) => Math.floor(row.shares) > 0)
                                .map((row) => {
                                  // Class shares are BRK-B at Yahoo and the SEC.
                                  const ticker = /^[A-Z]+\.[A-Z]$/.test(row.ticker) ? row.ticker.replace(".", "-") : row.ticker;
                                  const shares = Math.floor(row.shares);
                                  return row.purchase_price == null
                                    ? { ticker, shares }
                                    : { ticker, shares, purchase_price: row.purchase_price };
                                }),
                              errors: [
                                ...rounded.map((row) =>
                                  t("{ticker}: {shares} shares rounded down to {whole}; MyPortfolioBuddy keeps whole shares.", {
                                    ticker: row.ticker,
                                    shares: row.shares,
                                    whole: Math.floor(row.shares),
                                  }),
                                ),
                                ...broker.skipped.map((line) =>
                                t("Line {line}: {reason}", {
                                  line: line.line,
                                  reason: line.symbol ? `${line.symbol} · ${t(line.reason)}` : t(line.reason),
                                }),
                                ),
                              ],
                              headers: [],
                              duplicateTickers: [],
                            });
                            setError("");
                            setNotice(
                              [
                                broker.broker
                                  ? t("Read as a {broker} export. Confirm the preview before importing.", {
                                      broker: broker.broker,
                                    })
                                  : t("CSV parsed. Confirm the preview before importing."),
                                broker.cash != null
                                  ? t("The file also lists {amount} in cash; set Cash above if you want it included.", {
                                      amount: money(broker.cash, baseCurrency),
                                    })
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" "),
                            );
                            return;
                          }
                          setCsvText(text);
                          setColumnMap(mapping);
                          setImportPreview(preview);
                          setError(preview.errors.join(" "));
                          setNotice(t("CSV parsed. Confirm the preview before importing."));
                        } catch (cause) {
                          setError(cause instanceof Error ? cause.message : t("Invalid CSV"));
                        }
                      }}
                    />
                  </label>
                )}

                {importMode === "picture" && (
                  <>
                    <label className="file-drop compact-drop">
                      <span>
                        {extracting ? t("Reading picture…") : t("Choose a portfolio printscreen")}
                      </span>
                      <small>{t("PNG, JPEG, or WebP · maximum 8 MB")}</small>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={extracting}
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          await extractPicture(file);
                        }}
                      />
                    </label>
                    <p className="privacy-note">
                      {t("Sent to OpenAI for extraction and not stored by MyPortfolioBuddy.")}
                    </p>
                  </>
                )}

                {importPreview && (
                  <section className="import-preview" aria-label={t("Import preview")}>
                    <h3>{t("Import preview")}</h3>
                    {importMode === "csv" && importPreview.headers.length > 0 && (
                      <div className="column-mapping">
                        {(
                          [
                            ["ticker", "Ticker / Symbol"],
                            ["quantity", "Quantity"],
                            ["averageCost", "Purchase price"],
                          ] as const
                        ).map(([field, label]) => (
                          <label key={field}>
                            {t(label)}
                            <select
                              aria-label={t("Map {label}", { label: t(label) })}
                              value={columnMap[field] ?? ""}
                              onChange={(event) => {
                                const mapping = {
                                  ...columnMap,
                                  [field]: event.target.value,
                                };
                                setColumnMap(mapping);
                                setImportPreview(
                                  parsePortfolioCsvPreview(csvText, mapping),
                                );
                              }}
                            >
                              {field === "averageCost" && (
                                <option value="">{t("Not provided")}</option>
                              )}
                              {importPreview.headers.map((header) => (
                                <option key={header} value={header}>
                                  {header}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    )}
                    <p>
                      {importPreview.errors.length
                        ? t("{count} recognized rows · {errors} rows need attention", {
                            count: importPreview.positions.length,
                            errors: importPreview.errors.length,
                          })
                        : t("{count} recognized rows", { count: importPreview.positions.length })}
                    </p>
                    {importPreview.errors.length > 0 && (
                      <ul className="import-errors">
                        {importPreview.errors.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    )}
                    <div className="import-preview-rows">
                      {importPreview.positions.map((position, index) => (
                        <div key={`${position.ticker}-${index}`}>
                          <strong>{position.ticker}</strong>
                          <span>{t("{count} quantity", { count: position.shares })}</span>
                          <span>
                            {position.purchase_price == null
                              ? t("No purchase price")
                              : money(position.purchase_price, baseCurrency)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {(importPreview.duplicateTickers.length > 0 ||
                      importPreview.positions.some((incoming) =>
                        positions.some(
                          (current) =>
                            current.ticker.toUpperCase() ===
                            incoming.ticker.toUpperCase(),
                        ),
                      )) && (
                      <p className="import-warning">
                        {t(
                          "Duplicate positions detected. Choose whether to combine them using weighted average cost or keep existing rows unchanged.",
                        )}
                      </p>
                    )}
                    <div className="import-preview-actions">
                      <button type="button" onClick={() => setImportPreview(null)}>
                        {t("Cancel")}
                      </button>
                      <button type="button" onClick={() => void commitImport(false)}>
                        {t("Import and skip duplicates")}
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        onClick={() => void commitImport(true)}
                        disabled={importPreview.errors.length > 0}
                      >
                        {t("Import and combine duplicates")}
                      </button>
                    </div>
                  </section>
                )}
              </section>
            </div>
          )}
        </section>
      ) : (
        <RunTest
          portfolios={portfolios}
          dailyLimit={book.daily_ai_reviews ?? null}
          subtitle={t(
            "Pick the holdings you want a second opinion on. Five investor personas review each one and Buddy sums it up: keep, add, trim, or sell. Study output, not financial advice. Position cap {position}% · industry cap {industry}%.",
            {
              position: Math.round(book.max_position_pct * 100),
              industry: Math.round(book.max_industry_pct * 100),
            },
          )}
          friendlyError={(cause) => friendlyError(cause, t)}
          renderReport={(run) => <Report run={run} />}
        />
      )}
    </main>
  );
}

function StackedChange({ amount, percent }: { amount: string; percent: string }) {
  return (
    <span className="stacked-change">
      <span>{amount}</span>
      <small>{percent}</small>
    </span>
  );
}

function holdingColumns({
  returns,
  lifecycle,
  status,
}: {
  returns: boolean;
  lifecycle: boolean;
  status: boolean;
}) {
  const tracks = [
    "minmax(136px, 1.7fr)",
    "minmax(42px, 0.5fr)",
    "minmax(64px, 0.75fr)",
    "minmax(64px, 0.75fr)",
    "minmax(40px, 0.45fr)",
    "minmax(70px, 0.8fr)",
    "minmax(72px, 0.9fr)",
    "minmax(48px, 0.55fr)",
    "minmax(92px, 1.15fr)",
  ];
  if (returns) {
    tracks.push(
      "minmax(44px, 0.5fr)",
      "minmax(44px, 0.5fr)",
      "minmax(44px, 0.5fr)",
      "minmax(78px, 0.9fr)",
    );
  }
  if (lifecycle) tracks.push("minmax(84px, 0.8fr)");
  if (status) tracks.push("minmax(88px, 0.85fr)");
  tracks.push("48px");
  return tracks.join(" ");
}

function SortButton({
  label,
  alphabetic = false,
  active,
  direction,
  defaultDirection,
  onClick,
  className = "",
}: {
  label: string;
  /** Sorts text (A to Z) rather than numbers. */
  alphabetic?: boolean;
  active: boolean;
  direction: SortDirection;
  defaultDirection: SortDirection;
  onClick: () => void;
  className?: string;
}) {
  const nextDirection =
    active && direction === "asc"
      ? "desc"
      : active
        ? "asc"
        : defaultDirection;
  const t = useT();
  const sortLabel = alphabetic
    ? nextDirection === "asc"
      ? t("Sort {label} A to Z", { label })
      : t("Sort {label} Z to A", { label })
    : nextDirection === "asc"
      ? t("Sort {label} smallest to largest", { label })
      : t("Sort {label} largest to smallest", { label });
  return (
    <button
      type="button"
      className={`sort-button ${className} ${active ? "active" : ""}`}
      aria-label={sortLabel}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      <span aria-hidden="true">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

function PerformanceStockRow({
  position,
  result,
}: {
  position: Position;
  result: NonNullable<ReturnType<typeof gainLoss>>;
}) {
  const sign = result.amount >= 0 ? "+" : "";
  return (
    <div className="performance-stock-row">
      <div>
        <strong>{position.ticker}</strong>
        <span>{position.name || "Company name unavailable"}</span>
      </div>
      <div>
        <strong>
          {sign}
          {money(result.amount)}
        </strong>
        <span>
          {result.percent == null
            ? "—"
            : `${result.percent >= 0 ? "+" : ""}${result.percent.toFixed(1)}%`}
        </span>
      </div>
    </div>
  );
}

function GrowthValue({ value }: { value?: number | null }) {
  return (
    <span className={value == null ? "" : value >= 0 ? "positive" : "negative"}>
      {value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`}
    </span>
  );
}

function Report({ run }: { run: AnalysisRun }) {
  const t = useT();
  if (run.status === "pending" || run.status === "running") {
    return (
      <section className="report loading-card">
        <span className="pulse" />
        <div>
          <p className="step">{t("Analysis in progress")}</p>
          <h2>{t("Reading {ticker}’s filed history", { ticker: run.ticker })}</h2>
        </div>
      </section>
    );
  }
  if (run.status === "failed") {
    return (
      <section className="report alert">
        {t("Analysis failed: {error}", { error: run.error ? t(run.error) : "" })}
      </section>
    );
  }
  const recommendation = run.recommendations?.[0];
  const signals = run.analysis_signals ?? [];
  if (notEnoughData(run)) {
    return (
      <section className="report report-short">
        <p>
          <strong>
            {t("Not enough company data to review {ticker} on {date}.", {
              ticker: run.ticker,
              date: run.as_of,
            })}
          </strong>{" "}
          {t(
            "The personas need 4 quarters of financials filed with the SEC, and {ticker} doesn't have them yet (common for new listings, ETFs, and funds).",
            { ticker: run.ticker },
          )}
        </p>
      </section>
    );
  }
  return (
    <section className="report">
      <div className="report-header">
        <div>
          <p className="step">{t("03 / Recorded decision")}</p>
          <h2>{run.ticker} · {run.as_of}</h2>
        </div>
        {recommendation && <RecommendationBadge recommendation={recommendation} />}
      </div>
      {recommendation && (
        <div className="weight-grid">
          <Metric label={t("Current weight")} value={percent(recommendation.current_weight)} />
          <Metric label={t("Target weight")} value={percent(recommendation.target_weight)} />
          <Metric label={t("Reference close")} value={`$${Number(recommendation.mark).toFixed(2)}`} />
          <Metric
            label={t("Share change")}
            value={`${recommendation.delta_shares > 0 ? "+" : ""}${recommendation.delta_shares}`}
          />
        </div>
      )}
      <div className="signal-grid">
        {signals.map((signal) => <SignalCard key={`${signal.strategy}-${signal.persona}`} signal={signal} />)}
      </div>
      <p className="disclaimer">{t("Study output only. No order was sent to a broker.")}</p>
    </section>
  );
}

function RecommendationBadge({ recommendation }: { recommendation: Recommendation }) {
  const t = useT();
  return <span className={`recommendation ${recommendation.label}`}>{t(recommendation.label)}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

type ResolveResult = { query: string; data?: Omit<Position, "shares">; error?: string };
type CashBalance = { currency: string; amount: number };

/** What is saved: cash in the portfolio's own currency, and the rest by currency. */
function savedCash(entries: CashBalance[], base: string) {
  const byCurrency = new Map<string, number>();
  for (const entry of entries) {
    const amount = Number(entry.amount) || 0;
    if (amount > 0) byCurrency.set(entry.currency, (byCurrency.get(entry.currency) ?? 0) + amount);
  }
  return {
    cash: byCurrency.get(base) ?? 0,
    other_cash: [...byCurrency.entries()]
      .filter(([currency]) => currency !== base)
      .map(([currency, amount]) => ({ currency, amount })),
  };
}

const PORTFOLIO_CURRENCIES = ["USD", "AMD", "EUR", "GBP", "RUB", "CAD", "CHF", "AUD", "JPY"];

/** "$", "€", "֏"… for a currency code, or the code itself when it has no sign. */
function currencySign(currency: string) {
  try {
    return (
      new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}

/** A holding with fresh market data; classifications the person set by hand stay. */
function withOverview(position: Position, overview: Omit<Position, "shares">): Position {
  const manual = position.classification_source === "manual";
  return {
    ...position,
    ...overview,
    name: overview.name,
    company_name: overview.name,
    sector: manual
      ? position.sector
      : normalizeSector(overview.sector, overview.industry, overview.asset_type),
    industry: manual ? position.industry : overview.industry,
    asset_type: manual ? position.asset_type : overview.asset_type,
    investment_category: manual ? position.investment_category : overview.investment_category,
    classification_source: manual ? "manual" : "automatic",
    resolve_error: null,
  };
}

/** Bonds (from FIRE) against stocks and funds, as shares of the two together. */
function BondsVsStocksCard({
  bonds,
  stocks,
  onVisible,
}: {
  bonds: number | null;
  stocks: number;
  onVisible: () => void;
}) {
  const t = useT();
  const box = useRef<HTMLElement>(null);
  useOnVisible(box, onVisible);
  const total = (bonds ?? 0) + stocks;
  return (
    <article ref={box} className="summary-card">
      <span>{t("Bonds vs stocks")}</span>
      <strong>
        {bonds == null || !total
          ? "—"
          : `${Math.round((bonds / total) * 100)}% / ${100 - Math.round((bonds / total) * 100)}%`}
      </strong>
    </article>
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone,
  emphasis = false,
  short = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: string;
  tone?: "positive" | "negative";
  emphasis?: boolean;
  short?: boolean;
}) {
  return (
    <article className={`summary-card ${tone ?? ""}${short ? " short" : ""}`}>
      <span>{label}</span>
      <strong className={emphasis ? "emphasis" : undefined}>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

function PercentSetting({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: number | null;
  fallback?: number;
  onChange: (value: number | null) => void;
}) {
  const t = useT();
  return (
    <label>
      {label}
      <input
        type="number"
        min="0"
        max="100"
        step="0.1"
        placeholder={
          fallback == null ? "0" : t("Default {value}", { value: (fallback * 100).toFixed(1) })
        }
        value={value == null ? "" : value * 100}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? null : Number(event.target.value) / 100,
          )
        }
      />
    </label>
  );
}

function benchmarkLabel(ticker: string, t: Translate) {
  return (
    {
      SPY: "S&P 500",
      QQQ: "Nasdaq-100",
      DIA: "Dow Jones",
      IWM: "Russell 2000",
      VTI: t("Total US Market"),
    }[ticker] ?? ticker
  );
}

function latestPriceDate(positions: Position[]) {
  return positions
    .map((position) => position.price_timestamp ?? position.price_date)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

function duplicateTickers(positions: Position[]) {
  const counts = new Map<string, number>();
  for (const position of positions) {
    const ticker = position.ticker.trim().toUpperCase();
    counts.set(ticker, (counts.get(ticker) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([ticker]) => ticker);
}

function defaultColumnMap(headers: string[]): ImportColumnMap {
  return {
    ticker: headers.includes("ticker")
      ? "ticker"
      : headers.includes("symbol")
        ? "symbol"
        : headers[0] ?? "",
    quantity: headers.includes("quantity")
      ? "quantity"
      : headers.includes("shares")
        ? "shares"
        : headers[1] ?? "",
    averageCost: headers.includes("average cost")
      ? "average cost"
      : headers.includes("purchase_price")
        ? "purchase_price"
        : headers.includes("purchase price")
          ? "purchase price"
          : "",
  };
}

function toggleExpanded(
  setter: Dispatch<SetStateAction<Set<number>>>,
  index: number,
  force?: boolean,
) {
  setter((current) => {
    const next = new Set(current);
    const expanded = force ?? !next.has(index);
    if (expanded) next.add(index);
    else next.delete(index);
    return next;
  });
}

function normalizeSector(
  sector: string | null | undefined,
  industry: string | null | undefined,
  assetType: Position["asset_type"],
) {
  if (assetType === "ETF" || assetType === "Index" || assetType === "Mutual Fund") {
    return "Not Applicable";
  }
  if (sector && canonicalSectors.includes(sector as (typeof canonicalSectors)[number])) {
    return sector;
  }
  const value = `${sector ?? ""} ${industry ?? ""}`.toLowerCase();
  if (/(technology|software|semiconductor|computer|electronic)/.test(value)) {
    return "Information Technology";
  }
  if (/(bank|financial|insurance|capital market)/.test(value)) return "Financials";
  if (/(health|medical|biotech|pharma)/.test(value)) return "Health Care";
  if (/(energy|oil|gas)/.test(value)) return "Energy";
  if (/(utility|utilities)/.test(value)) return "Utilities";
  if (/(real estate|reit)/.test(value)) return "Real Estate";
  if (/(industrial|aerospace|transport)/.test(value)) return "Industrials";
  if (/(consumer defensive|consumer staples)/.test(value)) return "Consumer Staples";
  if (/(consumer|retail|auto)/.test(value)) return "Consumer Discretionary";
  if (/(communication|telecom|media)/.test(value)) return "Communication Services";
  if (/(material|chemical|mining)/.test(value)) return "Materials";
  return "Unknown";
}

function SignalCard({ signal }: { signal: Signal }) {
  const t = useT();
  return (
    <article className="signal-card">
      <div className="signal-title">
        <div><span>{signal.strategy}</span><h3>{signal.persona}</h3></div>
        <strong className={signal.signal}>{signal.abstained
            ? t("ABSTAIN")
            : t("{signal} {confidence}%", { signal: t(signal.signal), confidence: signal.confidence })}</strong>
      </div>
      <p>{signal.reasoning}</p>
    </article>
  );
}

function percent(value: number) {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}


function gainLoss(position: Position) {
  if (position.price == null || position.purchase_price == null) return null;
  const cost = Number(position.purchase_price) * Number(position.shares);
  const amount =
    (Number(position.price) - Number(position.purchase_price)) *
    Number(position.shares);
  return {
    amount,
    percent: cost ? (amount / cost) * 100 : null,
  };
}

/** Leaves text in English; used where the message is stored and translated when shown. */
const english: Translate = (text, vars) => translate("en", text, vars);

/** A readable, translated message for a failed request (API messages translate when known). */
function friendlyError(error: Error, t: Translate) {
  return ["Failed to fetch", "Load failed"].includes(error.message)
    ? t("Portfolio data is temporarily unavailable. Your unsaved changes are still here.")
    : t(error.message);
}
