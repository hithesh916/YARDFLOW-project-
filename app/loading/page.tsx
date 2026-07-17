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
  const [gateToken, setGateToken] = useState("");
  const [billingToken, setBillingToken] = useState("");
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
    // Only auto-populate if the user has NOT manually set multiple selected IDs via the search modal
    if (selectedTicketIds.length > 1) return;

    const matched = tickets.find(
      (t) => t.boe.toUpperCase() === b && t.status === "awaiting_loading"
    );
    if (matched) {
      setAgent(matched.billingAgent || matched.agent);
      setRemarks(matched.loadingRemarks || "");
      setGateToken(`G-${String(matched.serial).padStart(3, "0")}`);
      setBillingToken(`B-${String(matched.billingSerial ?? matched.serial).padStart(3, "0")}`);
      setMatchedTicket(matched);
      setSelectedTicketIds([matched.id]);
    } else {
      setMatchedTicket(null);
    }
  }, [boe, tickets, selectedTicketIds]);

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
    setGateToken(`G-${String(t.serial).padStart(3, "0")}`);
    setBillingToken(`B-${String(t.billingSerial ?? t.serial).padStart(3, "0")}`);
    setMatchedTicket(t);
    setSelectedTicketIds([t.id]);
    toast.success(`Loaded details for ${t.vehicle} (WO: ${t.boe})`);
  }

  async function confirm() {
    const b = boe.trim().toUpperCase();
    if (!b) {
      toast.error("Work Order No is required.");
      return;
    }

    setBusy(true);

    let targets: Ticket[] = [];
    if (selectedTicketIds.length > 0) {
      targets = tickets.filter(t => selectedTicketIds.includes(t.id) && t.status === "awaiting_loading");
    }

    if (targets.length === 0) {
      const target = matchedTicket || tickets.find(
        (t) => t.boe.toUpperCase() === b && t.status === "awaiting_loading"
      );
      if (target) {
        targets = [target];
      }
    }

    if (targets.length === 0) {
      toast.error("No active vehicle found with this Work Order No.");
      setBusy(false);
      return;
    }

    let successCount = 0;
    let lastProcessedTicket: Ticket | null = null;

    for (const target of targets) {
      const ok = await ticketAction(target.id, "complete-loading", {
        boe: targets.length === 1 ? b : target.boe,
        agent: agent.trim(),
        remarks: remarks.trim(),
        gateToken: gateToken.trim(),
        billingToken: billingToken.trim(),
      });
      if (ok) {
        successCount++;
        const freshTicket = useStore.getState().tickets.find((t) => t.id === target.id);
        lastProcessedTicket = freshTicket || {
          ...target,
          loadingEnd: new Date().toISOString(),
          loadingAgent: agent.trim() || target.billingAgent || target.agent,
          loadingRemarks: remarks.trim(),
          manualGateToken: gateToken.trim() || null,
          manualBillingToken: billingToken.trim() || null,
        };
        await printLoadingToken(lastProcessedTicket);
      }
    }

    setBusy(false);

    if (successCount > 0 && lastProcessedTicket) {
      setLastLoaded(lastProcessedTicket);
      setBoe("");
      setAgent("");
      setRemarks("");
      setGateToken("");
      setBillingToken("");
      setMatchedTicket(null);
      setSelectedTicketIds([]);
      toast.success(`Successfully loaded and printed ${successCount} pass(es)`);
    }
  }

  async function handleSkip() {
    if (selectedTicketIds.length === 0 || busy) return;
    setBusy(true);
    let skippedCount = 0;
    for (const id of selectedTicketIds) {
      const ok = await ticketAction(id, "skip-loading");
      if (ok) skippedCount++;
    }
    if (skippedCount > 0) {
      setBoe("");
      setAgent("");
      setRemarks("");
      setGateToken("");
      setBillingToken("");
      setMatchedTicket(null);
      setSelectedTicketIds([]);
      toast.success(`Skipped/Re-queued ${skippedCount} vehicle(s)`);
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
          <label className="mb-2 flex items-center justify-between text-[13px] font-bold text-slate-700">
            <span>Work Order No / BOE Number *</span>
            <button
              type="button"
              onClick={() => {
                setSelectedIds(selectedTicketIds);
                setShowSearchModal(true);
              }}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              🔍 Search Queue
            </button>
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
              Gate Token No
            </label>
            <input
              value={gateToken}
              onChange={(e) => setGateToken(e.target.value)}
              placeholder="e.g. G-001"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-semibold outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-[13px] font-bold text-slate-700">
              Billing Token No
            </label>
            <input
              value={billingToken}
              onChange={(e) => setBillingToken(e.target.value)}
              placeholder="e.g. B-001"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-semibold outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
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
              <TokenRow k="GATE TOKEN NO:" v={gateToken || (lastLoaded?.manualGateToken || (lastLoaded ? `G-${String(lastLoaded.serial).padStart(3, "0")}` : "—"))} />
              <TokenRow k="BILLING TOKEN:" v={billingToken || (lastLoaded?.manualBillingToken || (lastLoaded ? `B-${String(lastLoaded.billingSerial ?? lastLoaded.serial).padStart(3, "0")}` : "—"))} />
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

      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                Select Awaiting Loading Queue
              </h3>
              <button
                onClick={() => setShowSearchModal(false)}
                className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-205 text-sm font-bold cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <input
              type="text"
              value={modalSearch}
              onChange={(e) => setModalSearch(e.target.value)}
              placeholder="Search by Vehicle or BOE..."
              className="mb-4 w-full rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />

            <div className="max-h-60 overflow-y-auto mb-5 border border-slate-100 dark:border-slate-800 rounded-lg p-2 flex flex-col gap-2 bg-slate-50/50">
              {tickets
                .filter(
                  (t) =>
                    t.status === "awaiting_loading" &&
                    (t.vehicle.toLowerCase().includes(modalSearch.toLowerCase()) ||
                      t.boe.toLowerCase().includes(modalSearch.toLowerCase()))
                )
                .map((t) => {
                  const isChecked = selectedIds.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3 hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedIds(selectedIds.filter((id) => id !== t.id));
                          } else {
                            setSelectedIds([...selectedIds, t.id]);
                          }
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1 text-xs text-left">
                        <p className="font-extrabold text-slate-800 dark:text-slate-100">{t.vehicle}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">
                          BOE: {t.boe} · Carrier: {t.billingAgent || t.agent}
                        </p>
                      </div>
                      <div className="text-right text-[10px] font-mono text-slate-500 font-extrabold">
                        B-{String(t.billingSerial ?? t.serial).padStart(3, "0")}
                      </div>
                    </label>
                  );
                })}
              {tickets.filter((t) => t.status === "awaiting_loading" && (t.vehicle.toLowerCase().includes(modalSearch.toLowerCase()) || t.boe.toLowerCase().includes(modalSearch.toLowerCase()))).length === 0 && (
                <p className="text-center text-xs text-slate-400 py-6">No matching vehicles awaiting loading.</p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
              <button
                onClick={() => setShowSearchModal(false)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const selectedTickets = tickets.filter((t) => selectedIds.includes(t.id));
                  if (selectedTickets.length > 0) {
                    setSelectedTicketIds(selectedIds);
                    setBoe(selectedTickets.map((t) => t.boe).join(", "));
                    setAgent(selectedTickets[0].billingAgent || selectedTickets[0].agent);
                    setRemarks(selectedTickets.map((t) => t.loadingRemarks || "").filter(Boolean).join("; "));
                    setGateToken(
                      selectedTickets.map((t) => `G-${String(t.serial).padStart(3, "0")}`).join(", ")
                    );
                    setBillingToken(
                      selectedTickets
                        .map((t) => `B-${String(t.billingSerial ?? t.serial).padStart(3, "0")}`)
                        .join(", ")
                    );
                    if (selectedTickets.length === 1) {
                      setMatchedTicket(selectedTickets[0]);
                    } else {
                      setMatchedTicket(null);
                    }
                    toast.success(`Selected ${selectedTickets.length} ticket(s) from queue`);
                  }
                  setShowSearchModal(false);
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer"
              >
                Apply Selection
              </button>
            </div>
          </div>
        </div>
      )}
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
