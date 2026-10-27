// Education content: built-in lessons, books, and admin-written articles. Lessons are
// general education, not advice.

export type LessonLink = { label: string; href: string; kind: "article" | "video" | "tool" };

export type Lesson = {
  id: string;
  title: string;
  summary: string;
  points: string[];
  links: LessonLink[];
};

export const LESSONS: Lesson[] = [
  {
    id: "fire-basics",
    title: "What FIRE is",
    summary:
      "Financial Independence, Retire Early: save and invest enough that investment returns can pay for your life.",
    points: [
      "Your FIRE number is roughly 25× your yearly spending (spending ÷ 4%).",
      "Savings rate matters most: the share of income you keep and invest decides how fast you get there.",
      "Spending less helps twice: you save more now and need a smaller pot later.",
      "Lean FIRE, regular FIRE, and fat FIRE differ only in how much yearly spending the pot must cover.",
    ],
    links: [
      { label: "Investopedia: FIRE explained", href: "https://www.investopedia.com/terms/f/financial-independence-retire-early-fire.asp", kind: "article" },
      { label: "Investor.gov: Introduction to investing", href: "https://www.investor.gov/introduction-investing", kind: "article" },
    ],
  },
  {
    id: "withdrawal-rate",
    title: "The 4% rule and safe withdrawal",
    summary:
      "Historically, withdrawing about 4% of a stock-and-bond portfolio in year one, then adjusting for inflation, lasted 30 years in most periods.",
    points: [
      "A higher rate needs a smaller pot but raises the chance of running out, especially for retirements longer than 30 years.",
      "Many early retirees plan for 3.25%–3.75% for extra safety.",
      "Being flexible, spending a little less after bad market years, makes any rate safer.",
    ],
    links: [
      { label: "Investopedia: The 4% rule", href: "https://www.investopedia.com/terms/f/four-percent-rule.asp", kind: "article" },
    ],
  },
  {
    id: "compounding",
    title: "Compounding",
    summary: "Returns earn their own returns, so growth speeds up the longer money stays invested.",
    points: [
      "At 7% a year, money roughly doubles every 10 years (the rule of 72: 72 ÷ 7 ≈ 10).",
      "Starting early matters more than the amount: time does most of the work.",
      "Fees compound too: 1% a year can take a large share of the final value over decades.",
    ],
    links: [
      { label: "Khan Academy: Interest and compounding (video)", href: "https://www.khanacademy.org/economics-finance-domain/core-finance/interest-tutorial", kind: "video" },
      { label: "Investor.gov: Compound interest calculator", href: "https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator", kind: "tool" },
      { label: "Investopedia: Compound interest", href: "https://www.investopedia.com/terms/c/compoundinterest.asp", kind: "article" },
    ],
  },
  {
    id: "inflation",
    title: "Inflation",
    summary: "Prices rise over time, so the same money buys less every year.",
    points: [
      "At 3% inflation, prices double in about 24 years.",
      "Cash and fixed-rate bonds lose buying power; stocks have historically outpaced inflation over long periods.",
      "StockBuddy shows FIRE projections in today's dollars, so inflation is already taken out.",
    ],
    links: [
      { label: "Khan Academy: Inflation (video)", href: "https://www.khanacademy.org/economics-finance-domain/core-finance/inflation-tutorial", kind: "video" },
      { label: "Investopedia: Inflation", href: "https://www.investopedia.com/terms/i/inflation.asp", kind: "article" },
    ],
  },
  {
    id: "index-funds",
    title: "Index funds vs. single stocks",
    summary: "An index fund buys every company in a market index, so one company's trouble barely moves it.",
    points: [
      "Most professional fund managers fail to beat their index over 10–15 years after fees.",
      "Broad index funds are cheap (often under 0.1% a year) and need little upkeep.",
      "Single stocks can win big, but each one can also fall a lot on its own news.",
    ],
    links: [
      { label: "Investopedia: Index funds", href: "https://www.investopedia.com/terms/i/indexfund.asp", kind: "article" },
      { label: "Khan Academy: Core finance (videos)", href: "https://www.khanacademy.org/economics-finance-domain/core-finance", kind: "video" },
    ],
  },
  {
    id: "diversification",
    title: "Diversification and concentration",
    summary: "Spreading money across many holdings and sectors means no single loss can sink the plan.",
    points: [
      "A common rule of thumb is 5–10% at most in one stock and 20–25% in one sector.",
      "Holdings that move together (for example several big tech stocks) add less diversification than their count suggests.",
      "Rebalancing back to target weights now and then keeps risk from drifting up.",
    ],
    links: [
      { label: "Investor.gov: Diversify your investments", href: "https://www.investor.gov/introduction-investing/investing-basics/save-and-invest/diversify-your-investments", kind: "article" },
      { label: "Investopedia: Diversification", href: "https://www.investopedia.com/terms/d/diversification.asp", kind: "article" },
    ],
  },
  {
    id: "emergency-fund",
    title: "Emergency fund",
    summary: "Cash set aside for job loss or surprises, so you never have to sell investments at a bad time.",
    points: [
      "A common target is 3–6 months of expenses; more if your income is irregular.",
      "Keep it safe and easy to reach: a savings account or short CD, not stocks.",
      "Rebuild it first after you use it.",
    ],
    links: [
      { label: "CFPB: Building an emergency fund", href: "https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/", kind: "article" },
      { label: "Investopedia: Emergency fund", href: "https://www.investopedia.com/terms/e/emergency_fund.asp", kind: "article" },
    ],
  },
  {
    id: "bonds-savings",
    title: "Bonds, CDs, and savings yields",
    summary: "Lending money for interest: steadier than stocks, but with lower long-term growth.",
    points: [
      "A bond pays a coupon on its face value and returns the face value at maturity.",
      "APY is the yearly yield of a savings account or CD including compounding.",
      "When rates rise, existing bond prices fall; holding to maturity still returns face value if the issuer pays.",
    ],
    links: [
      { label: "Investopedia: Bonds", href: "https://www.investopedia.com/terms/b/bond.asp", kind: "article" },
      { label: "Investopedia: APY", href: "https://www.investopedia.com/terms/a/apy.asp", kind: "article" },
      { label: "TreasuryDirect: Treasury bonds", href: "https://www.treasurydirect.gov/marketable-securities/treasury-bonds/", kind: "article" },
    ],
  },
];

/** A financial article written in Admin and shown to every user. */
export type EducationArticle = {
  id: string;
  title: string;
  body: string;
  image_path: string | null;
  image_url: string | null;
  published: boolean;
  position: number;
  created_at?: string;
  updated_at?: string;
};

/** The first lines of an article, for its card. */
export function articleExcerpt(body: string, length = 160) {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length <= length ? text : `${text.slice(0, length).replace(/\s+\S*$/, "")}…`;
}
