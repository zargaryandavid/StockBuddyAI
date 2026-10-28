import type { Metadata } from "next";
import { Inter, Noto_Sans_Armenian } from "next/font/google";
import { Suspense } from "react";

import { SITE_URL } from "@/lib/site";

import { LocaleRoot } from "./locale-root";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Inter has no Armenian letters; this font fills in when the app is in Armenian.
const armenian = Noto_Sans_Armenian({
  variable: "--font-armenian",
  subsets: ["armenian"],
});

const DESCRIPTION =
  "Track your stocks, ETFs, bonds and cash in one place. See your real company exposure, your cash target and your path to financial freedom (FIRE). Private, no ads.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MyPortfolioBuddy · Portfolio tracker and FIRE planner for long-term investors",
    template: "%s · MyPortfolioBuddy",
  },
  description: DESCRIPTION,
  applicationName: "MyPortfolioBuddy",
  keywords: [
    "portfolio tracker",
    "investment portfolio",
    "stock portfolio analysis",
    "ETF look-through",
    "FIRE calculator",
    "financial independence",
    "compound interest calculator",
    "net worth tracker",
    "asset allocation",
    "dividend and bond tracker",
  ],
  openGraph: {
    type: "website",
    siteName: "MyPortfolioBuddy",
    title: "MyPortfolioBuddy · Your AI buddy for your portfolio",
    description: DESCRIPTION,
    url: "/",
    locale: "en_US",
    alternateLocale: ["hy_AM"],
  },
  twitter: {
    card: "summary_large_image",
    title: "MyPortfolioBuddy · Your AI buddy for your portfolio",
    description: DESCRIPTION,
  },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

// Sets <html lang> from the language cookie before the first paint.
const SET_LANG = `try{var m=document.cookie.match(/(?:^|; )lang=(en|hy)/);if(m)document.documentElement.lang=m[1]}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${armenian.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SET_LANG }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <LocaleRoot>{children}</LocaleRoot>
        </Suspense>
      </body>
    </html>
  );
}
