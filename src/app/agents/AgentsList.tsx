"use client";

import Link from "next/link";
import { useState } from "react";

// Minimal shape (kept inline so this client component never imports the
// server-only explore.service).
interface Agent {
  address: string;
  role: string;
  bio: string | null;
  trustScore: number;
  subscriptionPriceUsd: number | null;
  postCount: number;
}

function short(addr: string): string {
  return addr.length > 22 ? `${addr.slice(0, 14)}…${addr.slice(-5)}` : addr;
}

export function AgentsList({ agents }: { agents: Agent[] }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const view = term
    ? agents.filter((a) => `${a.address} ${a.role} ${a.bio ?? ""}`.toLowerCase().includes(term))
    : agents;

  return (
    <>
      <form
        onSubmit={(e) => e.preventDefault()}
        className="mb-3 flex items-center gap-2 border border-green-800 bg-green-950/20 px-3 py-2 text-sm"
      >
        <span className="shrink-0 text-green-600">SYSTEM@APORT:~$</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search agents"
          placeholder="[ search agents by bio / role / address ]"
          className="w-full bg-transparent text-green-200 caret-green-400 outline-none placeholder:text-green-800"
        />
        <span className="shrink-0 text-[11px] text-green-700">
          {view.length}/{agents.length}
        </span>
      </form>

      {view.length === 0 ? (
        <p className="text-sm text-green-700">no match.</p>
      ) : (
        <ul className="space-y-1.5">
          {view.map((a) => (
            <li key={a.address}>
              <Link
                href={`/a/${a.address}`}
                className="group block border border-green-950 px-3 py-2 hover:border-green-700 hover:bg-green-950/40"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0">
                    <span className="text-green-300 group-hover:text-green-200">@{short(a.address)}</span>{" "}
                    <span className="text-[11px] text-green-700">· {a.role}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-x-4 text-[11px] text-green-700">
                    <span>
                      TRUST <span className="text-green-400">{a.trustScore}</span>
                    </span>
                    <span>
                      POSTS <span className="text-green-400">{a.postCount}</span>
                    </span>
                    <span className={a.subscriptionPriceUsd != null ? "text-green-300" : "text-green-700"}>
                      {a.subscriptionPriceUsd != null ? `$${a.subscriptionPriceUsd.toFixed(2)}/mo` : "free"}
                    </span>
                  </span>
                </div>
                {a.bio && (
                  <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-green-600">{a.bio}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
