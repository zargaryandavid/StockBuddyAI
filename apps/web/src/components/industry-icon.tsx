import {
  Bike,
  Bitcoin,
  Briefcase,
  Building2,
  Car,
  ChartLine,
  Clapperboard,
  Cpu,
  Factory,
  Globe2,
  GraduationCap,
  HeartPulse,
  Landmark,
  Leaf,
  MessageCircle,
  Microscope,
  Network,
  PackageOpen,
  Pickaxe,
  Plane,
  PlugZap,
  RadioTower,
  Rocket,
  Shapes,
  Shield,
  Ship,
  ShoppingBag,
  ShoppingCart,
  Wheat,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";

export const industryIconOptions = [
  { value: "message-circle", label: "Communication", icon: MessageCircle },
  { value: "shopping-bag", label: "Shopping bag", icon: ShoppingBag },
  { value: "shopping-cart", label: "Shopping cart", icon: ShoppingCart },
  { value: "zap", label: "Energy", icon: Zap },
  { value: "landmark", label: "Financial", icon: Landmark },
  { value: "heart-pulse", label: "Health care", icon: HeartPulse },
  { value: "factory", label: "Industrial", icon: Factory },
  { value: "cpu", label: "Technology", icon: Cpu },
  { value: "package-open", label: "Materials", icon: PackageOpen },
  { value: "building-2", label: "Real estate", icon: Building2 },
  { value: "plug-zap", label: "Utilities", icon: PlugZap },
  { value: "shapes", label: "Other", icon: Shapes },
  { value: "chart-line", label: "Index or fund", icon: ChartLine },
  { value: "plane", label: "Aviation", icon: Plane },
  { value: "shield", label: "Insurance", icon: Shield },
  { value: "bitcoin", label: "Crypto", icon: Bitcoin },
  { value: "wheat", label: "Agriculture", icon: Wheat },
  { value: "car", label: "Automotive", icon: Car },
  { value: "clapperboard", label: "Entertainment", icon: Clapperboard },
  { value: "graduation-cap", label: "Education", icon: GraduationCap },
  { value: "rocket", label: "Space", icon: Rocket },
  { value: "microscope", label: "Science", icon: Microscope },
  { value: "radio-tower", label: "Wireless", icon: RadioTower },
  { value: "network", label: "Network", icon: Network },
  { value: "globe-2", label: "Global", icon: Globe2 },
  { value: "briefcase", label: "Business", icon: Briefcase },
  { value: "pickaxe", label: "Mining", icon: Pickaxe },
  { value: "leaf", label: "Environment", icon: Leaf },
  { value: "ship", label: "Shipping", icon: Ship },
  { value: "bike", label: "Fitness", icon: Bike },
] as const;

const iconByName = new Map<string, LucideIcon>(
  industryIconOptions.map((item) => [item.value, item.icon]),
);

const defaultIconByIndustry = new Map<string, string>([
  ["communication services", "message-circle"],
  ["consumer discretionary", "shopping-bag"],
  ["consumer staples", "shopping-cart"],
  ["energy", "zap"],
  ["financials", "landmark"],
  ["health care", "heart-pulse"],
  ["industrials", "factory"],
  ["information technology", "cpu"],
  ["materials", "package-open"],
  ["real estate", "building-2"],
  ["utilities", "plug-zap"],
  ["other", "shapes"],
]);

const keywordIcons: Array<[string[], string]> = [
  [["index", "etf", "fund"], "chart-line"],
  [["aero", "airline", "aviation", "defense"], "plane"],
  [["crypto", "bitcoin", "blockchain"], "bitcoin"],
  [["insurance", "security"], "shield"],
  [["agri", "farm", "food"], "wheat"],
  [["auto", "vehicle", "transport"], "car"],
  [["media", "entertainment", "film"], "clapperboard"],
  [["education", "school"], "graduation-cap"],
  [["space", "rocket"], "rocket"],
  [["science", "biotech", "research"], "microscope"],
  [["telecom", "wireless"], "radio-tower"],
  [["internet", "network"], "network"],
  [["global", "international"], "globe-2"],
  [["business", "professional"], "briefcase"],
  [["mining"], "pickaxe"],
  [["environment", "clean", "green"], "leaf"],
  [["marine", "shipping"], "ship"],
  [["fitness", "sport"], "bike"],
];

export function suggestIndustryIcon(name: string, used: Set<string>) {
  const folded = name.trim().toLocaleLowerCase();
  const preferred =
    defaultIconByIndustry.get(folded) ??
    keywordIcons.find(([keywords]) =>
      keywords.some((keyword) => folded.includes(keyword)),
    )?.[1];
  if (preferred && !used.has(preferred)) return preferred;
  const available = industryIconOptions
    .map((item) => item.value)
    .filter((icon) => !used.has(icon));
  if (!available.length) return "shapes";
  const checksum = Array.from(folded).reduce(
    (total, character) => total + (character.codePointAt(0) ?? 0),
    0,
  );
  return available[checksum % available.length];
}

export function IndustryIcon({
  icon,
  size = 20,
}: {
  icon: string;
  size?: number;
}) {
  return createElement(iconByName.get(icon) ?? Shapes, {
    "aria-hidden": true,
    size,
    strokeWidth: 1.8,
  });
}
