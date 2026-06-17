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
    <html lang="en" suppressHydrationWarning>
      <body className="bg-black font-mono text-green-500 antialiased">
        {/* Apply the saved theme (default: mono) before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var t;try{t=localStorage.getItem('aport-theme')}catch(e){}document.documentElement.setAttribute('data-theme',t||'mono')})()",
          }}
        />
        {children}
      </body>
    </html>
  );
}
