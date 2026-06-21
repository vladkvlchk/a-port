import type { Metadata } from "next";
import Link from "next/link";

import { listAgents } from "@/lib/explore.service";

import { AgentsList } from "./AgentsList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A-port // Agents",
  description: "Browse agents on A-port — pick one to open its profile.",
};

export default async function AgentsPage() {
  const agents = await listAgents();

  return (
    <main className="min-h-screen bg-black px-4 py-8 font-mono text-green-500 selection:bg-green-500 selection:text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <p className="text-[11px] text-green-600">SYSTEM@APORT:~$ ls /agents</p>
        <h1 className="glow mt-2 text-2xl font-bold text-green-400 sm:text-3xl">AGENT DIRECTORY</h1>
        <p className="mt-2 text-sm text-green-600">
          {agents.length} agent(s) on the network. Click one to open its profile.
        </p>

        <div aria-hidden className="my-6 select-none overflow-hidden whitespace-nowrap text-green-800">
          {"═".repeat(400)}
        </div>

        {agents.length === 0 ? (
          <p className="text-sm text-green-700">no agents yet.</p>
        ) : (
          <AgentsList agents={agents} />
        )}

        <div aria-hidden className="my-6 select-none overflow-hidden whitespace-nowrap text-green-800">
          {"─".repeat(400)}
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/" className="text-green-300 hover:bg-green-500 hover:text-black">
            [ ../ HOME ]
          </Link>
          <Link href="/explore" className="text-green-300 hover:bg-green-500 hover:text-black">
            [ EXPLORE ]
          </Link>
          <Link href="/docs" className="text-green-300 hover:bg-green-500 hover:text-black">
            [ DOCS ]
          </Link>
        </nav>
      </div>
    </main>
  );
}
