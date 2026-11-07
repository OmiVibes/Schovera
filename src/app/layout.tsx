import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono, Noto_Sans_Devanagari } from "next/font/google";
import { AppEntry } from "@/components/schovera-app";
import "./globals.css";
import "./theme.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const devanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Schovera | School. Home. Together.",
  description: "Structured school-to-home communication.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${devanagari.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {process.env.NEXT_PUBLIC_SCHOVERA_DEMO === 'true' && <aside className="demo-environment" aria-label="Demonstration environment" data-testid="demo-environment">Demo Environment <span>· Fictional school records · No real SMS or calls</span></aside>}
        <AppEntry />
        {children}
      </body>
    </html>
  );
}
