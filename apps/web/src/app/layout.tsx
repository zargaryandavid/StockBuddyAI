import type { Metadata } from "next";
import { Inter, Noto_Sans_Armenian } from "next/font/google";
import { Suspense } from "react";

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

export const metadata: Metadata = {
  title: "StockBuddyAI",
  description: "A filing-driven, long-only portfolio review workspace.",
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
