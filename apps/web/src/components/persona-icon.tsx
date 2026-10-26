"use client";

import { createElement } from "react";
import {
  Brain,
  Gem,
  Scale,
  Search,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from "lucide-react";

const personaIcons = new Map<string, LucideIcon>([
  ["graham", Scale],
  ["buffett", Gem],
  ["munger", Brain],
  ["lynch", Search],
  ["druckenmiller", TrendingUp],
]);

export function PersonaIcon({ persona }: { persona: string }) {
  return createElement(personaIcons.get(persona) ?? UserRound, {
    "aria-hidden": true,
    focusable: false,
    size: 22,
    strokeWidth: 1.8,
  });
}
