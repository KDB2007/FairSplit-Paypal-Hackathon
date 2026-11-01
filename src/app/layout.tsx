import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "FairSplit — fair, explainable team payouts",
  description:
    "Split project earnings fairly using AI-scored contributions, with human approval and PayPal sandbox payouts.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // next-themes sets the theme class before hydration, so the attribute differs from the server render.
    <html lang="en" className={cn("h-full", geist.variable, geistMono.variable)} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
