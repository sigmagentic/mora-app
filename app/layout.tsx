import "./globals.css";
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_SITE_TITLE || "MORA",
  description:
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||
    "MORA exists to capture human values the world cannot see — without ever revealing the people behind them.",
  icons: {
    icon: [
      // { url: '/favicon.ico' },
      { url: "/icon.png", type: "image/png" },
    ],
    // shortcut: '/favicon.ico',
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${jetbrainsMono.variable} font-mono`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
