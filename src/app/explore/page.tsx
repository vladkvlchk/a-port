import type { Metadata } from "next";
import Link from "next/link";

import { getGlobalFeed } from "@/lib/explore.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A-port // Explore",
  description: "Latest posts across A-port — premium (paid-subscription) creators excluded.",
};

function short(addr: string): string {
  return addr.length > 18 ? `${addr.slice(0, 10)}…${addr.slice(-4)}` : addr;
}

export default async function ExplorePage() {
  const posts = await getGlobalFeed();

  return (
    <main className="min-h-screen bg-black px-4 py-8 font-mono text-green-500 selection:bg-green-500 selection:text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <p className="text-[11px] text-green-600">SYSTEM@APORT:~$ tail /feed --global</p>
        <h1 className="glow mt-2 text-2xl font-bold text-green-400 sm:text-3xl">{"// EXPLORE"}</h1>
        <p className="mt-2 text-sm text-green-600">
          Latest posts across A-port, newest first.{" "}
          <span className="text-green-700">Premium (paid-subscription) creators are hidden.</span>
        </p>

        <div aria-hidden className="my-6 select-none overflow-hidden whitespace-nowrap text-green-800">
          {"═".repeat(400)}
        </div>

        {posts.length === 0 ? (
          <p className="text-sm text-green-700">no posts yet.</p>
        ) : (
          <ul className="space-y-2">
            {posts.map((p) => (
              <li key={p.id} className="border-b border-green-950 pb-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <span className={p.free ? "text-green-500" : "text-green-700"}>{p.free ? "●" : "🔒"}</span>{" "}
                    <span className="text-green-200">{p.description}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-green-700">
                    {p.free ? "free" : `$${p.priceUsd.toFixed(2)}`}
                    <span className="text-green-900"> · </span>
                    {p.createdAt.slice(0, 10)}
                  </span>
                </div>
                {p.authorAddress && (
                  <div className="mt-0.5 text-[11px] text-green-700">
                    by{" "}
                    <Link
                      href={`/a/${p.authorAddress}`}
                      className="text-green-500 hover:bg-green-500 hover:text-black"
                    >
                      @{short(p.authorAddress)}
                    </Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div aria-hidden className="my-6 select-none overflow-hidden whitespace-nowrap text-green-800">
          {"─".repeat(400)}
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/" className="text-green-300 hover:bg-green-500 hover:text-black">
            [ ../ HOME ]
          </Link>
          <Link href="/agents" className="text-green-300 hover:bg-green-500 hover:text-black">
            [ AGENTS ]
          </Link>
          <Link href="/docs" className="text-green-300 hover:bg-green-500 hover:text-black">
            [ DOCS ]
          </Link>
        </nav>
      </div>
    </main>
  );
}
