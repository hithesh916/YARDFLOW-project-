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
  // Track the matched ticket from the queue (for linking to existing entries)
  const [matchedTicket, setMatchedTicket] = useState<Ticket | null>(null);

  // Auto-populate form fields if typed BOE matches an active ticket awaiting billing
  useEffect(() => {
    const b = boe.trim().toUpperCase();
    if (!b) { setMatchedTicket(null); return; }
    const matched = tickets.find(
      (t) => t.boe.toUpperCase() === b && t.status === "awaiting_billing"
    );
    if (matched) {
      setAgent(matched.agent);
      setRemarks(matched.remarks ?? "");
      setMatchedTicket(matched);
    } else {
      setMatchedTicket(null);
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
    toast.success(`Loaded details for ${t.vehicle} (${t.boe})`);
  }

  async function confirm() {
    const b = boe.trim().toUpperCase();
    if (!b) {
      toast.error("BOE Number is required.");
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
      toast.success(`Billing approved (${paymentStatus}) — printing token`);
    }
  }

  return (    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      {/* Left panel: Billing Desk selection and form */}
      <Panel className="p-8">

        <div className="flex flex-col gap-6">
          {/* BOE Number (Primary) */}
          <div>
            <label className="mb-2 block text-[13px] font-bold text-slate-700">
              BOE Number (Primary ID) *
            </label>
            <input
              value={boe}
              onChange={(e) => setBoe(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
              placeholder="BOE-10024"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-xl font-bold uppercase outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
            />
          </div>

          {/* Form details */}
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
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
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
              className="min-h-20 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
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
              className="rounded-lg bg-blue-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer active:scale-[0.99] transition-all"
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
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-[13px] font-extrabold text-white">
              YF
            </div>
            <p className="font-extrabold leading-tight text-slate-900">
              YARDFLOW MANAGER
            </p>
            <p className="mb-4 mt-0.5 text-[10px] text-slate-400">
              {settings?.terminalName || "Terminal A-1"}
            </p>
            <div className="my-3 border-t border-dashed border-slate-200" />
            <div className="mb-4 flex flex-col gap-1.5 text-left text-xs">
              <TokenRow k="VEHICLE:" v={matchedTicket?.vehicle || lastBilled?.vehicle || "—"} />
              <TokenRow k="BOE NO:" v={boe || lastBilled?.boe || "—"} />
              <TokenRow 
                k="INVOICE NO:" 
                v={invoice || lastBilled?.invoice || "—"} 
              />
              <TokenRow
                k="TIME:"
                v={boe ? fmtTime(new Date().toISOString()) : (lastBilled ? fmtTime(lastBilled.entryTime) : "—")}
              />
              <TokenRow
                k="DATE:"
                v={boe ? fmtDate(new Date()) : (lastBilled ? fmtDate(new Date(lastBilled.entryTime)) : "—")}
              />
            </div>

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

        <Panel className="p-6">
          <p className="mb-4 text-[11px] font-black tracking-[0.08em] text-slate-500 uppercase">
            INBOUND QUEUE LOGS
          </p>
          {inboundLogs.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Inbound queue is empty.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {inboundLogs.map((t) => {
                const isPaid = t.paymentStatus === "Paid";
                const isWaiting = t.status === "awaiting_billing";
                return (
                  <div
                    key={t.id}
                    onClick={() => isWaiting && selectFromQueue(t)}
                    className={`flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3 bg-white shadow-sm ${
                      isWaiting
                        ? "cursor-pointer hover:border-blue-300 hover:bg-blue-50/10 active:scale-[0.99] transition-all"
                        : ""
                    }`}
                    title={isWaiting ? "Click to load details into form" : ""}
                  >
                    <div>
                      <p className="text-sm font-extrabold text-slate-800">{t.vehicle}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        BoE: {t.boe}
                      </p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <span className="text-sm font-extrabold text-slate-600">
                        {isWaiting
                          ? `G-${String(t.serial).padStart(3, "0")}`
                          : `B-${String(t.billingSerial ?? t.serial).padStart(3, "0")}`}
                      </span>
                      {isWaiting ? (
                        <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          WAITING
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold ${
                            isPaid
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-550 bg-red-50 text-red-700"
                          }`}
                        >
                          {isPaid ? "PAID" : "UNPAID"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Recently Billed Log Registry */}
        <Panel className="p-6 bg-white shadow-sm">
          <p className="mb-4 text-[11px] font-black tracking-[0.08em] text-slate-500 uppercase">
            TODAY&apos;S BILLED
          </p>
          {recentBilled.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No bills processed today yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {recentBilled.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => printBillingToken(t)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-blue-600 active:scale-95 transition-all shadow-sm cursor-pointer"
                      title="Reprint Billing Pass"
                    >
                      <Printer size={13} />
                    </button>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{t.vehicle}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Inv: {t.invoice}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-500 block">
                      B-{String(t.billingSerial ?? t.serial).padStart(3, "0")}
                    </span>
                    <span className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 mt-0.5">
                      {t.paymentStatus?.toUpperCase() || "PAID"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="rounded-xl bg-slate-900 p-5 text-white">
          <p className="mb-2 text-[11px] font-extrabold tracking-[0.06em]">
            BILLING PROTOCOL
          </p>
          <div className="flex flex-col gap-2 text-xs text-slate-300">
            <p className="flex items-start gap-2">
              <span className="text-blue-400 font-bold">✓</span> Validate that the driver has the correct gate pass and entry token.
            </p>
            <p className="flex items-start gap-2">
              <span className="text-blue-400 font-bold">✓</span> Each Bill of Entry (BoE) requires its own independent payment and token.
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
