"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, ReceiptText, Printer, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/pill";
import { filterBySearch, useStore } from "@/lib/store";
import { fmtTime, fmtDate, pad, getLocalDateString } from "@/lib/format";
import { printBillingToken } from "@/lib/print-token";
import type { Ticket } from "@/lib/types";
import { ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function BillingPage() {
  const tickets = useStore((s) => s.tickets);
  const search = useStore((s) => s.search);
  const ticketAction = useStore((s) => s.ticketAction);
  const settings = useStore((s) => s.settings);
  const tz = settings?.timezone || "Asia/Kolkata";
  const todayStr = getLocalDateString(new Date(), tz);

  // Get all tickets currently waiting for billing
  const billingQueue = filterBySearch(tickets, search).filter(
    (t) => t.status === "awaiting_billing",
  );

  const createTicket = useStore((s) => s.createTicket);

  const [boe, setBoe] = useState("");
  const [agent, setAgent] = useState("");
  const [remarks, setRemarks] = useState("");
  const [invoice, setInvoice] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"Paid" | "Not Paid">("Paid");
  const [busy, setBusy] = useState(false);
  const [lastBilled, setLastBilled] = useState<Ticket | null>(null);
  const [billedExpanded, setBilledExpanded] = useState(false);
  const [showAgentOptions, setShowAgentOptions] = useState(false);
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  // Track the matched ticket from the queue (for linking to existing entries)
  const [matchedTicket, setMatchedTicket] = useState<Ticket | null>(null);
  // Cross-gate: vehicle pre-filled from entry gate record
  const [prefillVehicle, setPrefillVehicle] = useState<string | null>(null);

  // Auto-populate form fields when typed BOE matches a ticket in queue or entry gate record
  useEffect(() => {
    const b = boe.trim().toUpperCase();
    if (!b) {
      setMatchedTicket(null);
      setPrefillVehicle(null);
      setAgentOptions([]);
      setShowAgentOptions(false);
      return;
    }

    // Search ALL active tickets matching the typed BOE (regardless of status)
    const allMatches = tickets.filter(
      (t) =>
        t.boe.toUpperCase() === b &&
        t.status !== "exited" &&
        t.status !== "held"
    );

    if (allMatches.length === 0) {
      setMatchedTicket(null);
      setPrefillVehicle(null);
      setAgentOptions([]);
      return;
    }

    // Prefer tickets awaiting_billing (directly actionable)
    const billingMatches = allMatches.filter((t) => t.status === "awaiting_billing");
    const matched = billingMatches[0] ?? allMatches[0];

    // Set agent options for multi-match dropdown
    const uniqueAgents = Array.from(
      new Set(billingMatches.map((t) => (t.billingAgent || t.agent || "Unassigned").trim()).filter(Boolean)),
    );
    setAgentOptions(uniqueAgents);
    if (uniqueAgents.length <= 1) setShowAgentOptions(false);

    // Always fill agent and remarks from matched ticket
    setAgent(matched.billingAgent || matched.agent || "");
    setRemarks(matched.remarks ?? "");
    setMatchedTicket(matched);

    // Show vehicle number ONLY when ticket was created at entry gate
    // (billing-first tickets have vehicle === boe which is not meaningful to show)
    if (matched.createdSource === "entry") {
      setPrefillVehicle(matched.vehicle);
    } else {
      setPrefillVehicle(null);
    }
  }, [boe, tickets]);

  const inboundLogs = [...tickets]
    .filter((t) => t.status !== "exited" && t.status !== "held"
      && getLocalDateString(t.entryTime, tz) === todayStr)
    .sort((a, b) => b.entryTime.localeCompare(a.entryTime));

  const recentBilled = [...tickets]
    .filter((t) =>
      (t.invoice !== null && t.invoice !== undefined)
      && getLocalDateString(t.entryTime, tz) === todayStr
    )
    .sort((a, b) => b.entryTime.localeCompare(a.entryTime));

  function selectFromQueue(t: Ticket) {
    setBoe(t.boe);
    setAgent(t.agent);
    setRemarks(t.remarks ?? "");
    setMatchedTicket(t);
    setPrefillVehicle(t.vehicle || null);
    toast.success(`Loaded details for ${t.vehicle} (${t.boe})`);
  }

  async function confirm() {
    const b = boe.trim().toUpperCase();
    if (!b) {
      toast.error("Work Order No is required.");
      return;
    }

    setBusy(true);

    // 1. Look up if BOE has a checked-in ticket awaiting billing
    let target = matchedTicket || tickets.find(
      (t) => t.boe.toUpperCase() === b && t.status === "awaiting_billing"
    );

    // 2. If no checked-in ticket exists, create a new one first
    if (!target) {
      const created = await createTicket({
        vehicle: b,
        boe: b,
        agent: agent.trim() || undefined,
        remarks: remarks.trim() || "Created directly at Billing Desk",
        createdSource: "billing",
      });
      if (!created) {
        setBusy(false);
        return;
      }
      target = created;
    }

    // 3. Complete billing on target ticket
    const inv = invoice.trim().toUpperCase() || "N/A";

    const ok = await ticketAction(target.id, "complete-billing", {
      invoice: inv,
      paymentStatus: paymentStatus,
      boe: b,
      agent: agent.trim() || target.agent,
      remarks: remarks.trim() || target.remarks,
    });

    setBusy(false);

    if (ok) {
      const freshTicket = useStore.getState().tickets.find((t) => t.id === target.id);
      const printTicket = freshTicket || {
        ...target,
        invoice: inv,
        paymentStatus,
        boe: b,
        agent: agent.trim() || target.agent,
      };
      setLastBilled(printTicket);
      await printBillingToken(printTicket);
      
      // Clear form inputs
      setBoe("");
      setAgent("");
      setRemarks("");
      setInvoice("");
      setPaymentStatus("Paid");
      setMatchedTicket(null);
      setPrefillVehicle(null);
      toast.success(`Billing approved (${paymentStatus}) — printing token`);
    }
  }

  return (    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      {/* Left panel: Billing Desk selection and form */}
      <Panel className="p-8">
        <h2 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-800">
          <ReceiptText className="text-blue-600" size={20} />
          Billing Pass Generation
        </h2>

        <div className="flex flex-col gap-6">
          {/* BOE Number (Primary) */}
          <div>
            <label className="mb-2 block text-[13px] font-bold text-slate-700">
              BOE *
            </label>
            <input
              value={boe}
              onChange={(e) => setBoe(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
              placeholder="MAA1234567890"
              className="w-full rounded-lg border border-input bg-slate-50 dark:bg-black px-3.5 py-3 text-xl font-bold uppercase placeholder:text-slate-400 placeholder:font-normal placeholder:normal-case outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Vehicle No — auto-filled from Entry Gate when BOE matches an entry-gate ticket */}
          <div>
            <label className="mb-2 flex items-center gap-2 text-[13px] font-bold text-slate-700">
              Vehicle No
              {prefillVehicle && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Linked from Entry Gate
                </span>
              )}
            </label>
            <input
              value={prefillVehicle ?? ""}
              readOnly
              placeholder={prefillVehicle ? "" : "Auto-filled when BOE matches entry gate record"}
              className={`w-full rounded-lg border px-3.5 py-3 text-sm font-bold outline-none cursor-not-allowed ${
                prefillVehicle
                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300"
                  : "border-input bg-transparent text-slate-400 dark:text-slate-500"
              }`}
            />
          </div>

          {/* Form details */}
          <div className="relative">
            <label className="mb-2 flex items-center justify-between text-[13px] font-bold text-slate-700">
              <span>CHA / Agent Name</span>
              {agentOptions.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowAgentOptions((prev) => !prev)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  {showAgentOptions ? "Hide names" : `Show ${agentOptions.length} names`}
                </button>
              )}
            </label>
            <div className="relative">
              <input
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                placeholder="Global Logistics"
                className="w-full rounded-lg border border-input bg-slate-50 dark:bg-black px-3.5 py-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowAgentOptions((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                aria-label="Toggle agent options"
              >
                <ChevronDown size={16} />
              </button>
            </div>
            {showAgentOptions && agentOptions.length > 0 && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                {agentOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setAgent(option);
                      setShowAgentOptions(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Payment Status & Invoice */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-slate-100 pt-5">
            <div>
              <label className="mb-2 block text-[13px] font-bold text-slate-700">
                Payment Status *
              </label>
              <div className="flex">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-250 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700 w-full justify-center">
                  <CheckCircle2 size={14} /> PAID (Charges Collected)
                </div>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-bold text-slate-700">
                Invoice / Receipt No
              </label>
              <input
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirm()}
                placeholder="E.G. INV-2026-9041 (OPTIONAL)"
                className="w-full rounded-lg border border-input bg-slate-50 dark:bg-black px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Remarks */}
          <div className="border-t border-slate-100 pt-5">
            <label className="mb-2 block text-[13px] font-bold text-slate-700">
              Billing Remarks (Optional)
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Additional details..."
              className="min-h-20 w-full resize-y rounded-lg border border-input bg-slate-50 dark:bg-black px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Action button */}
          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
            <p className="flex max-w-[240px] items-center gap-2 text-xs text-slate-400">
              <MapPin size={14} className="shrink-0" /> Generates independent B-serial billing token.
            </p>
            <button
              onClick={confirm}
              disabled={!boe.trim() || busy}
              className="rounded-lg bg-primary px-6 py-3.5 text-sm font-extrabold text-primary-foreground shadow-sm transition-colors hover:bg-primary/95 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground cursor-pointer active:scale-[0.99] transition-all"
            >
              {busy ? "Processing…" : "PROCESS & PRINT TOKEN"}
            </button>
          </div>
        </div>
      </Panel>

      {/* Right panel: Live billing pass preview and Inbound logs */}
      <div className="flex flex-col gap-5">
        {/* Live Billing Pass Preview */}
        <Panel className="bg-slate-50 p-6">
          <p className="mb-4 text-[11px] font-extrabold tracking-[0.08em] text-slate-500">
            LIVE BILLING PASS PREVIEW
          </p>
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            {(boe || lastBilled) && (
              <div className="mb-3 font-black text-lg tracking-[0.05em] text-slate-800 uppercase">
                TOKEN NO: B-{String((lastBilled && !boe) ? (lastBilled.billingSerial ?? lastBilled.serial) : "NEW").padStart(3, "0")}
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
              <TokenRow k="BOE:" v={boe || lastBilled?.boe || "—"} />
              <TokenRow k="AGENT / CHA:" v={agent || lastBilled?.billingAgent || lastBilled?.agent || "—"} />
              <TokenRow 
                k="INVOICE NO:" 
                v={invoice || lastBilled?.invoice || "—"} 
              />
              {(remarks || lastBilled?.billingRemarks) && (
                <TokenRow k="REMARKS:" v={remarks || lastBilled?.billingRemarks || "—"} />
              )}
              <TokenRow
                k="TIME:"
                v={boe ? fmtTime(new Date().toISOString()) : (lastBilled ? fmtTime(lastBilled.entryTime) : "—")}
              />
              <TokenRow
                k="DATE:"
                v={boe ? fmtDate(new Date()) : (lastBilled ? fmtDate(new Date(lastBilled.entryTime)) : "—")}
              />
            </div>

            {/* Payment Status Badge */}
            {(boe || lastBilled) && (
              <div className="mt-4 flex justify-center border-t border-slate-100 pt-4">
                <span className={`inline-block text-[24px] font-black tracking-wider px-6 py-2.5 rounded-lg border-[3.5px] uppercase ${
                  (paymentStatus === "Paid" || (!boe && lastBilled?.paymentStatus === "Paid"))
                    ? "border-emerald-600 text-emerald-600 dark:border-emerald-500 dark:text-emerald-500"
                    : "border-red-600 text-red-600 dark:border-red-500 dark:text-red-500"
                }`}>
                  {(paymentStatus === "Paid" || (!boe && lastBilled?.paymentStatus === "Paid")) ? "PAID" : "NOT PAID"}
                </span>
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
              } else if (lastBilled) {
                printBillingToken(lastBilled);
              }
            }}
            disabled={!boe.trim() && !lastBilled}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-3 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer active:scale-95 transition-all"
          >
            <Printer size={16} /> {boe.trim() ? "Approve & Print Pass" : "Reprint Last Pass"}
          </button>
        </Panel>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] font-bold text-slate-700">
              <ReceiptText size={16} className="text-slate-500" />
              TODAY&apos;S BILLED
            </span>
            <button
              onClick={() => setBilledExpanded(!billedExpanded)}
              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer active:scale-95 transition-all"
            >
              {billedExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {/* Inline List Container */}
          <motion.div 
            layout
            className={`mt-3 flex flex-col gap-2 no-scrollbar ${billedExpanded ? "max-h-[260px] overflow-y-auto pr-1" : ""}`}
          >
            <AnimatePresence initial={false}>
              {recentBilled.length === 0 ? (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-slate-400 py-2 text-center"
                >
                  No bills processed today.
                </motion.p>
              ) : (
                (billedExpanded ? recentBilled : recentBilled.slice(0, 2)).map((t) => (
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
                      <span className="text-[10px] text-slate-400">Inv: {t.invoice || "N/A"} · {t.billingAgent || t.agent}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-extrabold text-slate-500">
                        B-{String(t.billingSerial ?? t.serial).padStart(3, "0")}
                      </span>
                      <button
                        onClick={() => printBillingToken(t)}
                        className="flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-slate-850 active:scale-95 transition-all cursor-pointer"
                      >
                        <Printer size={10} /> PRINT
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
            
            {billedExpanded && recentBilled.length > 4 && (
              <p className="text-center text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                Scroll to view more
              </p>
            )}
          </motion.div>
        </div>

        <div className="rounded-xl bg-slate-900 p-5 text-white">
          <p className="mb-2 text-[11px] font-extrabold tracking-[0.06em]">
            BILLING PROTOCOL
          </p>
          <div className="flex flex-col gap-2 text-xs text-slate-300">
            <p className="flex items-start gap-2">
              <span className="text-blue-400 font-bold">✓</span> Validate that the driver has the correct gate pass and entry token.
            </p>
            <p className="flex items-start gap-2">
              <span className="text-blue-400 font-bold">✓</span> Each Work Order requires its own independent payment and token.
            </p>
            <p className="flex items-start gap-2">
              <span className="text-blue-400 font-bold">✓</span> The billing system creates separate billing tokens. Drivers will present these at the Loading Area.
            </p>
          </div>
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
