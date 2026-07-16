"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, ClipboardCheck, Printer, Ban, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/pill";
import { filterBySearch, useStore } from "@/lib/store";
import { fmtTime, fmtDate, pad, getLocalDateString } from "@/lib/format";
import { printLoadingToken } from "@/lib/print-token";
import type { Ticket } from "@/lib/types";
import { QrCode } from "@/components/qr-code";
import { motion, AnimatePresence } from "framer-motion";

export default function LoadingPage() {
  const tickets = useStore((s) => s.tickets);
  const search = useStore((s) => s.search);
  const ticketAction = useStore((s) => s.ticketAction);
  const settings = useStore((s) => s.settings);
  const tz = settings?.timezone || "Asia/Kolkata";
  const todayStr = getLocalDateString(new Date(), tz);

  // Get all tickets currently waiting for loading
  const loadingQueue = filterBySearch(tickets, search).filter(
    (t) => t.status === "awaiting_loading",
  );

  const [boe, setBoe] = useState("");
  const [agent, setAgent] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<Ticket | null>(null);
  const [matchedTicket, setMatchedTicket] = useState<Ticket | null>(null);
  const [loadedExpanded, setLoadedExpanded] = useState(false);

  // Auto-populate form fields if typed BOE / Work Order matches a ticket in the queue
  useEffect(() => {
    const b = boe.trim().toUpperCase();
    if (!b) {
      setMatchedTicket(null);
      return;
    }
    const matched = tickets.find(
      (t) => t.boe.toUpperCase() === b && t.status === "awaiting_loading"
    );
    if (matched) {
      setAgent(matched.billingAgent || matched.agent);
      setRemarks(matched.loadingRemarks || "");
      setMatchedTicket(matched);
    } else {
      setMatchedTicket(null);
    }
  }, [boe, tickets]);

  const recentDone = [...tickets]
    .filter((t) =>
      t.loadingEnd &&
      getLocalDateString(t.entryTime, tz) === todayStr
    )
    .sort((a, b) => (b.loadingEnd ?? "").localeCompare(a.loadingEnd ?? ""));

  const upcoming = loadingQueue.filter((t) => t.id !== (matchedTicket?.id ?? "")).slice(0, 3);

  function selectFromQueue(t: Ticket) {
    setBoe(t.boe);
    setAgent(t.billingAgent || t.agent);
    setRemarks(t.loadingRemarks || "");
    setMatchedTicket(t);
    toast.success(`Loaded details for ${t.vehicle} (WO: ${t.boe})`);
  }

  async function confirm() {
    const b = boe.trim().toUpperCase();
    if (!b) {
      toast.error("Work Order No is required.");
      return;
    }

    setBusy(true);

    let target = matchedTicket || tickets.find(
      (t) => t.boe.toUpperCase() === b && t.status === "awaiting_loading"
    );

    if (!target) {
      toast.error("No active vehicle found with this Work Order No.");
      setBusy(false);
      return;
    }

    const ok = await ticketAction(target.id, "complete-loading", {
      boe: b,
      agent: agent.trim(),
      remarks: remarks.trim(),
    });

    setBusy(false);

    if (ok) {
      const freshTicket = useStore.getState().tickets.find((t) => t.id === target.id);
      const printTicket = freshTicket || {
        ...target,
        loadingEnd: new Date().toISOString(),
        loadingAgent: agent.trim() || target.billingAgent || target.agent,
        loadingRemarks: remarks.trim(),
      };
      setLastLoaded(printTicket);
      await printLoadingToken(printTicket);
      setBoe("");
      setAgent("");
      setRemarks("");
      setMatchedTicket(null);
    }
  }

  async function handleSkip() {
    if (!matchedTicket || busy) return;
    setBusy(true);
    const ok = await ticketAction(matchedTicket.id, "skip-loading");
    if (ok) {
      setBoe("");
      setAgent("");
      setRemarks("");
      setMatchedTicket(null);
    }
    setBusy(false);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      {/* Left Column: Form */}
      <Panel className="p-8">
        <h2 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-800">
          <ClipboardCheck className="text-blue-600" size={20} />
          Loading Pass Approval
        </h2>

        <div className="mb-5">
          <label className="mb-2 block text-[13px] font-bold text-slate-700">
            Work Order No / BOE Number *
          </label>
          <input
            value={boe}
            onChange={(e) => setBoe(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirm()}
            placeholder="BOE-10024"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-xl font-bold uppercase outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
          />
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-[13px] font-bold text-slate-700">
              CHA / Agent Name
            </label>
            <input
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              placeholder="Global Logistics"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-bold text-slate-700">
              Gate Token No (Read Only)
            </label>
            <input
              value={matchedTicket ? `G-${String(matchedTicket.serial).padStart(3, "0")}` : "—"}
              readOnly
              className="w-full rounded-lg border border-slate-200 bg-transparent px-3.5 py-3 text-sm font-semibold text-slate-500 dark:text-slate-400 outline-none cursor-not-allowed"
            />
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-[13px] font-bold text-slate-700">
              Billing Token No (Read Only)
            </label>
            <input
              value={matchedTicket ? `B-${String(matchedTicket.billingSerial ?? matchedTicket.serial).padStart(3, "0")}` : "—"}
              readOnly
              className="w-full rounded-lg border border-slate-200 bg-transparent px-3.5 py-3 text-sm font-semibold text-slate-500 dark:text-slate-400 outline-none cursor-not-allowed"
            />
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-bold text-slate-700">
              Date & Time (Auto Generated)
            </label>
            <input
              value={`${fmtDate(new Date())} ${fmtTime(new Date().toISOString())}`}
              readOnly
              className="w-full rounded-lg border border-slate-200 bg-transparent px-3.5 py-3 text-sm font-semibold text-slate-500 dark:text-slate-400 outline-none cursor-not-allowed"
            />
          </div>
        </div>

        <label className="mb-2 block text-[13px] font-bold text-slate-700">
          Loading Remarks (Optional)
        </label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Loading bays status, carrier notes..."
          className="mb-5 min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
        />

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
          <button
            onClick={handleSkip}
            disabled={!matchedTicket || busy}
            className="flex items-center gap-2 rounded-lg border border-red-150 bg-white px-5 py-3 text-sm font-extrabold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer active:scale-95 transition-all"
          >
            <Ban size={15} /> Skip/Requeue
          </button>
          <button
            onClick={confirm}
            disabled={!boe.trim() || busy}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer active:scale-[0.99] transition-all"
          >
            {busy ? "Processing…" : "PROCESS & PRINT TOKEN"}
          </button>
        </div>
      </Panel>

      {/* Right Column: Preview & custom expandable list */}
      <div className="flex flex-col gap-5">
        <Panel className="bg-slate-50 p-6">
          <p className="mb-4 text-[11px] font-extrabold tracking-[0.08em] text-slate-500">
            LIVE LOADING PASS PREVIEW
          </p>
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            {(boe || lastLoaded) && (
              <div className="mb-3 font-black text-lg tracking-[0.05em] text-slate-800 uppercase">
                TOKEN NO: L-{String((lastLoaded && !boe) ? (lastLoaded.loadingSerial ?? lastLoaded.serial) : "NEW").padStart(3, "0")}
              </div>
            )}
            <p className="font-extrabold leading-tight text-slate-900">
              YARDFLOW MANAGER
            </p>
            {settings?.terminalName && (
              <p className="mb-4 mt-0.5 text-[10px] text-slate-400">
                {settings.terminalName}
              </p>
            )}
            <div className="my-3 border-t border-dashed border-slate-200" />
            <div className="mb-4 flex flex-col gap-1.5 text-left text-xs">
              <TokenRow k="WORK ORDER NO:" v={boe || lastLoaded?.boe || "—"} />
              <TokenRow k="CHA / AGENT:" v={agent || lastLoaded?.loadingAgent || lastLoaded?.agent || "—"} />
              <TokenRow k="GATE TOKEN NO:" v={matchedTicket ? `G-${String(matchedTicket.serial).padStart(3, "0")}` : (lastLoaded ? `G-${String(lastLoaded.serial).padStart(3, "0")}` : "—")} />
              <TokenRow k="BILLING TOKEN:" v={matchedTicket ? `B-${String(matchedTicket.billingSerial ?? matchedTicket.serial).padStart(3, "0")}` : (lastLoaded ? `B-${String(lastLoaded.billingSerial ?? lastLoaded.serial).padStart(3, "0")}` : "—")} />
              <TokenRow
                k="LOADING TIME:"
                v={boe ? fmtTime(new Date().toISOString()) : (lastLoaded?.loadingEnd ? fmtTime(lastLoaded.loadingEnd) : "—")}
              />
            </div>
            
            {/* Scannable QR Code for Exit Gate Scan */}
            {(matchedTicket || lastLoaded) && (
              <div className="mt-4 flex flex-col items-center justify-center border-t border-slate-100 pt-4">
                <QrCode value={matchedTicket?.vehicle || lastLoaded?.vehicle || ""} size={112} className="border border-slate-200 p-1" />
                <p className="mt-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  Exit Gate Scan Code
                </p>
              </div>
            )}

            <p className="mt-4 text-[10px] font-extrabold tracking-[0.05em] text-slate-400">
              VALID FOR TODAY ONLY
            </p>
          </div>
          <button
            onClick={() => {
              if (boe.trim()) {
                confirm();
              } else if (lastLoaded) {
                printLoadingToken(lastLoaded);
              }
            }}
            disabled={!boe.trim() && !lastLoaded}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-3 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer active:scale-95 transition-all"
          >
            <Printer size={16} /> {boe.trim() ? "Approve & Print Pass" : "Reprint Last Pass"}
          </button>
        </Panel>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] font-bold text-slate-700">
              <ClipboardCheck size={16} className="text-slate-500" />
              RECENTLY LOADED
            </span>
            <button
              onClick={() => setLoadedExpanded(!loadedExpanded)}
              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer active:scale-95 transition-all"
            >
              {loadedExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {/* Inline List Container */}
          <motion.div 
            layout
            className={`mt-3 flex flex-col gap-2 no-scrollbar ${loadedExpanded ? "max-h-[260px] overflow-y-auto pr-1" : ""}`}
          >
            <AnimatePresence initial={false}>
              {recentDone.length === 0 ? (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-slate-400 py-2 text-center"
                >
                  Nothing loaded yet.
                </motion.p>
              ) : (
                (loadedExpanded ? recentDone : recentDone.slice(0, 2)).map((t) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs transition-colors hover:border-slate-350"
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-extrabold text-[12px] text-slate-800">{t.boe}</span>
                      <span className="text-[10px] text-slate-400">SN L-{String(t.loadingSerial ?? t.serial).padStart(3, "0")} · {t.loadingAgent || t.agent}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-extrabold text-slate-500">
                        {t.loadingEnd ? fmtTime(t.loadingEnd) : ""}
                      </span>
                      <button
                        onClick={() => printLoadingToken(t)}
                        className="flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-slate-850 active:scale-95 transition-all cursor-pointer"
                      >
                        <Printer size={10} /> PRINT
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
            
            {loadedExpanded && recentDone.length > 4 && (
              <p className="text-center text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                Scroll to view more
              </p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function TokenRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between font-bold">
      <span className="text-slate-400">{k}</span>
      <span className="text-slate-800">{v}</span>
    </div>
  );
}
