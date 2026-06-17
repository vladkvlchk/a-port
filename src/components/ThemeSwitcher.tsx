"use client";

/* ===========================================================================
   Terminal theme switcher.
   Flips the active palette by setting `data-theme` on <html>; the colors live
   in globals.css ([data-theme="..."] blocks). The choice is persisted to
   localStorage and re-applied pre-paint by the init script in layout.tsx.
   Default theme: mono. Starts collapsed.
   =========================================================================== */

import { useEffect, useState } from "react";

const STORAGE_KEY = "aport-theme";

const THEMES: { key: string; label: string; swatch: string }[] = [
  { key: "matrix", label: "MATRIX", swatch: "#22c55e" },
  { key: "amber", label: "AMBER", swatch: "#f59e0b" },
  { key: "cyan", label: "ICE", swatch: "#06b6d4" },
  { key: "synth", label: "SYNTH", swatch: "#d946ef" },
  { key: "blood", label: "BLOOD", swatch: "#ef4444" },
  { key: "mono", label: "MONO", swatch: "#cbd5e1" },
];

export function ThemeSwitcher() {
  const [active, setActive] = useState("mono");
  const [open, setOpen] = useState(false);

  // Sync UI with whatever the pre-paint script already applied.
  useEffect(() => {
    const saved =
      document.documentElement.getAttribute("data-theme") ??
      readStored() ??
      "mono";
    setActive(saved);
  }, []);

  function readStored(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function apply(key: string) {
    document.documentElement.setAttribute("data-theme", key);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* ignore */
    }
    setActive(key);
  }

  return (
    <div className="fixed bottom-3 right-3 z-[60] select-none font-mono text-[11px]">
      <div className="border border-green-700 bg-black/90 shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4 border-b border-green-900 px-2 py-1 text-green-600">
          <span>{"// THEME_SELECT"}</span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="px-1 text-green-500 hover:bg-green-500 hover:text-black"
            aria-label={open ? "Згорнути" : "Розгорнути"}
          >
            {open ? "[-]" : "[+]"}
          </button>
        </div>

        {open && (
          <ul className="flex flex-col p-1">
            {THEMES.map((t) => {
              const isActive = t.key === active;
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => apply(t.key)}
                    className={`flex w-full items-center gap-2 px-2 py-1 text-left transition-none ${
                      isActive
                        ? "bg-green-500 text-black"
                        : "text-green-400 hover:bg-green-900/50"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="inline-block size-2.5"
                      style={{ backgroundColor: t.swatch }}
                    />
                    <span>
                      {isActive ? ">" : " "} {t.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
