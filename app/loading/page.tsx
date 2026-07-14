"use client";

import { Ban, CheckCircle2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/pill";
import { filterBySearch, useStore } from "@/lib/store";
import { fmtTime, pad } from "@/lib/format";
import { printLoadingToken } from "@/lib/print-token";

export default function LoadingPage() {
  const tickets = useStore((s) => s.tickets);
  const search = useStore((s) => s.search);
  const scannedFor = useStore((s) => s.loadingScannedFor);
  const setScanned = useStore((s) => s.setScanned);
  const ticketAction = useStore((s) => s.ticketAction);

  const queue = filterBySearch(tickets, search).filter(
    (t) => t.status === "awaiting_loading",
  );
  const current = queue[0];

  const recentDone = [...tickets]
    .filter((t) => t.loadingEnd)
    .sort((a, b) => (b.loadingEnd ?? "").localeCompare(a.loadingEnd ?? ""))
    .slice(0, 3);

  if (!current) {
    return (
      <Panel className="p-16 text-center text-[13px] text-slate-400">
        No vehicles waiting for loading. Queue is clear.
      </Panel>
    );
  }

  const upcoming = queue.slice(1, 4);
  const scanned = scannedFor === current.id;

  async function completeLoading() {
    if (!scanned || !current) return;
    
    const ticketToPrint = {
      ...current,
      loadingEnd: new Date().toISOString(),
    };

    const ok = await ticketAction(current.id, "complete-loading");
    if (ok) {
      await printLoadingToken(ticketToPrint);
      setScanned(null);
    }
  }
  async function skip() {
    if (!current) return;
    const ok = await ticketAction(current.id, "skip-loading");
    if (ok) setScanned(null);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      {/* Current vehicle */}
      <Panel className="p-8">
        <div className="mb-2 flex items-center justify-between">
          <Pill tone="slate">NEXT IN LINE</Pill>
          <div className="text-right">
            <p className="text-[11px] text-slate-400">QUEUE POSITION</p>
            <p className="text-xl font-extrabold text-blue-600">
              01 / {queue.length}
            </p>
          </div>
        </div>
        <div className="my-5 text-4xl font-extrabold">{current.vehicle}</div>
        <div className="mb-6 grid grid-cols-3 gap-4">
          <InfoBox k="SERIAL NO" v={`#${current.serial}`} />
          <InfoBox k="BOE / WORK ORDER" v={current.boe} />
          <InfoBox k="CARGO TYPE" v={current.cargo} />
        </div>
        <div className="mb-6 flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 px-5 py-9">
          <ScanLine size={36} className="text-slate-300" />
          <p className="font-bold text-slate-700">
            {scanned
              ? "Vehicle pass scanned"
              : "Scan vehicle pass to initiate loading"}
          </p>
          <button
            onClick={() => setScanned(current.id)}
            className="rounded-lg bg-blue-600 px-[18px] py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-blue-700"
          >
            {scanned ? "Re-scan" : "Simulate Scan"}
          </button>
        </div>
        <div className="flex gap-4">
          <button
            onClick={completeLoading}
            disabled={!scanned}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-800 py-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            <CheckCircle2 size={18} /> Mark Loading Completed
          </button>
          <button
            onClick={skip}
            className="flex items-center gap-2 rounded-lg border-2 border-red-100 bg-white px-6 text-sm font-extrabold text-red-600 transition-colors hover:bg-red-100"
          >
            <Ban size={16} /> Skip Vehicle
          </button>
        </div>
      </Panel>

      {/* Recently loaded */}
      <Panel className="p-6">
        <p className="mb-4 text-[11px] font-extrabold tracking-[0.08em] text-slate-500">
          RECENTLY LOADED
        </p>
        {recentDone.length === 0 ? (
          <p className="text-xs text-slate-400">Nothing loaded yet.</p>
        ) : (
          recentDone.map((t) => (
            <div key={t.id} className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">{t.vehicle}</p>
                <p className="text-xs text-slate-400">SN #{t.serial}</p>
              </div>
              <div className="text-right">
                <p
                  className={`text-xs font-extrabold ${
                    t.status === "held" ? "text-red-500" : "text-emerald-600"
                  }`}
                >
                  {t.status === "held" ? "HELD" : "COMPLETED"}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {t.loadingEnd ? fmtTime(t.loadingEnd) : ""}
                </p>
              </div>
            </div>
          ))
        )}
      </Panel>

      {/* Upcoming queue */}
      <Panel className="p-6 lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-extrabold text-slate-800">
            Upcoming Queue
          </h3>
          <Pill tone="blue">{upcoming.length} Vehicles Pending</Pill>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-400">No further vehicles queued.</p>
        ) : (
          upcoming.map((t, i) => (
            <div
              key={t.id}
              className="mb-3 flex items-center justify-between rounded-lg border border-slate-100 px-5 py-4 last:mb-0"
            >
              <div className="flex items-center">
                <span className="mr-4 font-extrabold text-slate-300">
                  {pad(i + 2)}
                </span>
                <div>
                  <p className="font-extrabold text-slate-800">{t.vehicle}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Carrier: {t.agent}
                  </p>
                </div>
              </div>
              <div className="text-right text-xs text-slate-400">
                <div>SN: #{t.serial}</div>
                <div>Scheduled: {fmtTime(t.entryTime)}</div>
              </div>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}

function InfoBox({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3.5">
      <div className="text-[11px] font-bold text-slate-400">{k}</div>
      <div className="mt-0.5 font-bold text-slate-800">{v}</div>
    </div>
  );
}
