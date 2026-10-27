export type Role = "admin" | "user";

export type IndustrySetting = {
  name: string;
  icon: string;
};

export type BookSettings = {
  max_position_pct: number;
  max_industry_pct: number;
  deep_value_weight: number;
  trajectory_weight: number;
  use_transaction_history_analytics: boolean;
  /** Cash share portfolios without their own Min cash should keep. */
  min_cash_pct?: number;
  email_reminders_enabled?: boolean;
  /** Daily AI review limit per user, from the admin AI limits. */
  daily_ai_reviews?: number;
  industries: IndustrySetting[];
};

export type WorkspaceAccount = {
  email: string;
  role: Role;
  book: BookSettings;
};

export const defaultBook: BookSettings = {
  max_position_pct: 0.25,
  max_industry_pct: 0.25,
  deep_value_weight: 0.7,
  trajectory_weight: 0.3,
  use_transaction_history_analytics: true,
  min_cash_pct: 0.05,
  industries: [
    { name: "Communication Services", icon: "message-circle" },
    { name: "Consumer Discretionary", icon: "shopping-bag" },
    { name: "Consumer Staples", icon: "shopping-cart" },
    { name: "Energy", icon: "zap" },
    { name: "Financials", icon: "landmark" },
    { name: "Health Care", icon: "heart-pulse" },
    { name: "Industrials", icon: "factory" },
    { name: "Information Technology", icon: "cpu" },
    { name: "Materials", icon: "package-open" },
    { name: "Real Estate", icon: "building-2" },
    { name: "Utilities", icon: "plug-zap" },
    { name: "Other", icon: "shapes" },
  ],
};
