"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle2, ReceiptText, Printer, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/pill";
import { activeVisitsForBoe, filterBySearch, useStore } from "@/lib/store";
import { fmtTime, fmtDate, pad, getLocalDateString } from "@/lib/format";
import { printBillingToken } from "@/lib/print-token";
import type { Ticket } from "@/lib/types";
import { ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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
  // When several vehicles share this BOE today, the operator must pick one (a BOE is a
  // one-to-many key) — these are the candidates shown in the chooser.
  const [boeChoices, setBoeChoices] = useState<Ticket[]>([]);
  // The specific ticket id the operator picked from the chooser (survives polls).
  const chosenIdRef = useRef<string>("");
  // The BOE we last auto-filled agent/remarks for — so a background poll can't re-fill.
  const lastFilledBoeRef = useRef<string>("");

  // Auto-populate form fields when typed BOE matches a ticket in queue or entry gate record
  useEffect(() => {
    const b = boe.trim().toUpperCase();
    if (!b) {
      setMatchedTicket(null);
      setPrefillVehicle(null);
      setAgentOptions([]);
      setShowAgentOptions(false);
      setBoeChoices([]);
      chosenIdRef.current = "";
      lastFilledBoeRef.current = "";
      return;
    }

    // Today's active tickets for this BOE (day-scoped: a same-BOE ticket left over from a
    // prior day never bleeds in). BOE is one-to-many, so this can be several vehicles.
    const allMatches = activeVisitsForBoe(tickets, b, tz);

    if (allMatches.length === 0) {
      setMatchedTicket(null);
      setPrefillVehicle(null);
      setAgentOptions([]);
      setBoeChoices([]);
      return;
    }

    // Prefer tickets awaiting_billing (directly actionable)
    const billingMatches = allMatches.filter((t) => t.status === "awaiting_billing");

    // Set agent options for multi-match dropdown
    const uniqueAgents = Array.from(
      new Set(billingMatches.map((t) => (t.billingAgent || t.agent || "Unassigned").trim()).filter(Boolean)),
    );
    setAgentOptions(uniqueAgents);
    if (uniqueAgents.length <= 1) setShowAgentOptions(false);

    // Multiple vehicles await billing under this BOE today → make the operator pick one
    // instead of silently billing the first. Skip the prompt once a choice is locked in.
    const chosen = billingMatches.find((t) => t.id === chosenIdRef.current);
    if (billingMatches.length > 1 && !chosen) {
      setBoeChoices(billingMatches);
      setMatchedTicket(null);
      setPrefillVehicle(null);
      return;
    }
    setBoeChoices([]);
    const matched = chosen ?? billingMatches[0] ?? allMatches[0];

    // Fill the operator-editable fields ONLY when the BOE itself changed (a user
    // action) — never on a background tickets poll, which would otherwise snap the
    // agent/remarks the operator is typing back to the stored values.
    if (lastFilledBoeRef.current !== b) {
      setAgent(matched.billingAgent || matched.agent || "");
      setRemarks(matched.remarks ?? "");
      lastFilledBoeRef.current = b;
    }
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
      // Scope by the BILLING timestamp (not entryTime): a vehicle entered late and billed
      // after midnight still belongs to today's billed list. Fall back to entryTime for
      // any legacy row that predates billingTime.
      && getLocalDateString(t.billingTime || t.entryTime, tz) === todayStr
    )
    .sort((a, b) => (b.billingTime || b.entryTime).localeCompare(a.billingTime || a.entryTime));

  function selectFromQueue(t: Ticket) {
    setBoe(t.boe);
    setAgent(t.agent);
    setRemarks(t.remarks ?? "");
    setMatchedTicket(t);
    setPrefillVehicle(t.vehicle || null);
    chosenIdRef.current = t.id;
    lastFilledBoeRef.current = t.boe.trim().toUpperCase();
    setBoeChoices([]);
    toast.success(`Loaded details for ${t.vehicle} (${t.boe})`);
  }

  // Operator picked one vehicle from the same-BOE chooser — lock it in for billing.
  function pickChoice(t: Ticket) {
    setMatchedTicket(t);
    setAgent(t.billingAgent || t.agent || "");
    setRemarks(t.remarks ?? "");
    setPrefillVehicle(t.createdSource === "entry" ? t.vehicle : null);
    chosenIdRef.current = t.id;
    lastFilledBoeRef.current = t.boe.trim().toUpperCase();
    setBoeChoices([]);
  }

  async function confirm() {
    // Guard against Enter-key / double-click re-entry while a submit is in flight —
    // otherwise a second run on stale state can create and bill a duplicate ticket.
    if (busy) return;
    const b = boe.trim().toUpperCase();
    if (!b) {
      toast.error("Work Order No is required.");
      return;
    }

    // Force a choice when several vehicles share this BOE today.
    if (boeChoices.length > 1 && !matchedTicket) {
      toast.error("Select which vehicle to bill for this Work Order.");
      return;
    }

    setBusy(true);

    try {
      // 1. Look up the checked-in ticket awaiting billing for this BOE (day-scoped). Prefer
      // the operator's explicit pick; else today's single awaiting_billing match.
      let target = (matchedTicket?.status === "awaiting_billing" ? matchedTicket : null)
        || activeVisitsForBoe(tickets, b, tz, { statuses: ["awaiting_billing"] })[0];

      // 2. If no checked-in ticket exists, create a new one first
      if (!target) {
        const created = await createTicket({
          vehicle: prefillVehicle || b,
          boe: b,
          agent: agent.trim() || undefined,
          remarks: remarks.trim() || "Created directly at Billing Desk",
          createdSource: "billing",
        });
        if (!created) {
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

      if (ok) {
        const freshTicket = useStore.getState().tickets.find((t) => t.id === target!.id);
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
        setBoeChoices([]);
        chosenIdRef.current = "";
        lastFilledBoeRef.current = "";
        toast.success(`Billing approved (${paymentStatus}) — printing token`);
      }
    } finally {
      setBusy(false);
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

            {/* Multiple vehicles share this Work Order today — pick the right one */}
            {boeChoices.length > 1 && (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20 p-2">
                <p className="px-1 pb-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                  {boeChoices.length} vehicles on this Work Order today — select one to bill:
                </p>
                <div className="flex flex-col gap-1">
                  {boeChoices.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickChoice(t)}
                      className="flex items-center justify-between rounded-md border border-amber-200 bg-white dark:border-amber-900/40 dark:bg-slate-950 px-2.5 py-2 text-left text-xs hover:border-amber-400 hover:bg-amber-50/60 dark:hover:bg-slate-900 cursor-pointer transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span className="rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-700 dark:text-amber-300">
                          Trip {t.boeVisit ?? "—"}
                        </span>
                        <span className="font-extrabold text-slate-800 dark:text-slate-100">
                          {t.createdSource === "billing" ? "Billing desk" : t.vehicle}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 text-slate-400">
                        {t.serial > 0 && (
                          <span className="font-bold">G-{pad(t.serial)}</span>
                        )}
                        <span>{fmtTime(t.entryTime, tz)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentStatus("Paid")}
                  className={
                    "flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-xs font-bold transition-colors cursor-pointer " +
                    (paymentStatus === "Paid"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-input bg-white dark:bg-black text-slate-500 hover:bg-slate-50")
                  }
                >
                  <CheckCircle2 size={14} /> PAID
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentStatus("Not Paid")}
                  className={
                    "flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-xs font-bold transition-colors cursor-pointer " +
                    (paymentStatus === "Not Paid"
                      ? "border-red-300 bg-red-50 text-red-700"
                      : "border-input bg-white dark:bg-black text-slate-500 hover:bg-slate-50")
                  }
                >
                  NOT PAID
                </button>
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
            <p className="font-extrabold leading-tight text-slate-900 uppercase">
              {settings?.companyName ? settings.companyName : "YARDFLOW MANAGER"}
            </p>
            {settings?.terminalName && (
              <p className="mt-0.5 text-[10px] text-slate-500 uppercase font-bold">
                {settings.terminalName}
              </p>
            )}
            {settings?.companyAddress && (
              <p className="mt-1 text-[9px] text-slate-400 whitespace-pre-line">
                {settings.companyAddress}
              </p>
            )}
            {settings?.companyContact && (
              <p className="mt-0.5 text-[9px] text-slate-400">
                Contact: {settings.companyContact}
              </p>
            )}
            {settings?.companyGst && (
              <p className="mb-4 mt-0.5 text-[9px] text-slate-400 font-bold">
                GST: {settings.companyGst}
              </p>
            )}
            {!settings?.companyGst && <div className="mb-4" />}
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
