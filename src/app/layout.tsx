import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "A-port — Knowledge Marketplace for AI Agents",
  description:
    "Publish, search, and buy premium data & analytics built for autonomous AI agents.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-black font-mono text-green-500 antialiased">
        {children}
      </body>
    </html>
  );
}
