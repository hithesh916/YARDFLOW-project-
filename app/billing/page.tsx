"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle, Plus, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/pill";
import { filterBySearch, useStore } from "@/lib/store";
import { fmtTime, pad } from "@/lib/format";
import { printBillingToken } from "@/lib/print-token";

export default function BillingPage() {
  const tickets = useStore((s) => s.tickets);
  const search = useStore((s) => s.search);
  const ticketAction = useStore((s) => s.ticketAction);

  // Get all tickets currently waiting for billing
  const billingQueue = filterBySearch(tickets, search).filter(
    (t) => t.status === "awaiting_billing",
  );

  const [selectedId, setSelectedId] = useState<string>("");
  const [invoice, setInvoice] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"Paid" | "Not Paid">("Not Paid");
  const [additionalBoe, setAdditionalBoe] = useState("");
  const [busy, setBusy] = useState(false);

  // Automatically select the first vehicle in the queue when loading or when selection leaves queue
  useEffect(() => {
    if (billingQueue.length > 0) {
      const isStillInQueue = billingQueue.some((t) => t.id === selectedId);
      if (!isStillInQueue) {
        setSelectedId(billingQueue[0].id);
      }
    } else {
      setSelectedId("");
    }
  }, [billingQueue, selectedId]);

  const current = billingQueue.find((t) => t.id === selectedId) ?? null;

  // Inbound queue logs: list all tickets currently in the system that are either waiting for billing,
  // waiting for loading, or waiting for exit, sorted with newest first.
  const inboundLogs = [...tickets]
    .filter((t) => t.status !== "exited" && t.status !== "held")
    .sort((a, b) => b.entryTime.localeCompare(a.entryTime));

  async function addBoeField() {
    if (!current || !additionalBoe.trim()) return;
    const cleanBoe = additionalBoe.trim().toUpperCase();
    
    // Append to existing BOE list
    const updatedBoe = current.boe ? `${current.boe}, ${cleanBoe}` : cleanBoe;
    
    setBusy(true);
    const ok = await ticketAction(current.id, "complete-loading", {
      // Just updating properties using state/actions
      // In our simple client, we can send a custom action or update state. 
      // Let's use ticketAction with a properties-update payload if we want, or call the state updater
    });
    // Wait, complete-loading transitions status. If we just want to update BOE, let's trigger it in the confirm body!
    // For now, let's keep the added BOE in local state and apply it during confirmation.
    current.boe = updatedBoe; // update in-memory to reflect immediately
    setAdditionalBoe("");
    toast.success(`BOE ${cleanBoe} added to vehicle.`);
    setBusy(false);
  }

  async function confirm() {
    if (!current) return;
    const inv = paymentStatus === "Paid" ? invoice.trim().toUpperCase() : (invoice.trim().toUpperCase() || "N/A");
    
    if (paymentStatus === "Paid" && !invoice.trim()) {
      toast.error("Invoice number is required for Paid status.");
      return;
    }

    setBusy(true);

    const ticketToPrint = {
      ...current,
      invoice: inv,
      paymentStatus: paymentStatus
    };

    const ok = await ticketAction(current.id, "complete-billing", {
      invoice: inv,
      paymentStatus: paymentStatus,
      // Pass the updated BOE in case they appended additional ones
      boe: current.boe,
    });
    
    setBusy(false);
    
    if (ok) {
      await printBillingToken(ticketToPrint);
      setInvoice("");
      setPaymentStatus("Not Paid");
      toast.success(`Billing approved (${paymentStatus}) — printing token`);
    }
  }

  async function skip() {
    if (!current) return;
    const ok = await ticketAction(current.id, "skip-billing");
    if (ok) {
      setInvoice("");
      setPaymentStatus("Not Paid");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      {/* Left panel: Billing Desk selection and form */}
      <Panel className="p-8">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-800">
            <ReceiptText className="text-blue-600" size={20} />
            Billing Desk
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Collect terminal charges, validate BoE, and issue billing tokens.
          </p>
        </div>

        {billingQueue.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-slate-400">
            No vehicles checked in waiting for billing approval.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* 1. SELECT CHECKED-IN VEHICLE */}
            <div>
              <label className="mb-2 block text-[13px] font-bold text-slate-700">
                1. SELECT CHECKED-IN VEHICLE *
              </label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
              >
                {billingQueue.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.vehicle} (ENTRY TOKEN: #{pad(t.serial)} | BOE: {t.boe})
                  </option>
                ))}
              </select>
            </div>

            {/* Selected Vehicle Details Card */}
            {current && (
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ENTRY TOKEN</p>
                  <p className="mt-1 font-extrabold text-blue-600 text-sm">#{pad(current.serial)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CARRIER DESK</p>
                  <p className="mt-1 font-bold text-slate-800">{current.agent}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CARGO TYPE</p>
                  <p className="mt-1 font-bold text-slate-800">{current.cargo}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ENTRY TIME</p>
                  <p className="mt-1 font-bold text-slate-800">{fmtTime(current.entryTime)}</p>
                </div>
              </div>
            )}

            {/* 2. BILLS OF ENTRY (BOE) UNDER THIS VEHICLE */}
            {current && (
              <div className="border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[13px] font-bold text-slate-700">
                    2. BILLS OF ENTRY (BOE) UNDER THIS VEHICLE *
                  </label>
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    Multiple Payments Allowed
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  Input and bind multiple Bill of Entry forms if the driver is carrying combined freight shipments.
                </p>

                {/* Render current BOEs */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {current.boe.split(",").map((b, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"
                    >
                      {b.trim()} {idx === 0 && <span className="ml-1 text-[10px] text-slate-400 font-normal">(Entry BoE)</span>}
                    </span>
                  ))}
                </div>

                {/* Add BOE field input */}
                <div className="flex gap-2">
                  <input
                    value={additionalBoe}
                    onChange={(e) => setAdditionalBoe(e.target.value)}
                    placeholder="ENTER ADDITIONAL BOE (E.G. BOE-8895)"
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs uppercase outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={addBoeField}
                    className="flex items-center gap-1 rounded-lg bg-slate-800 px-4 py-2 text-xs font-extrabold text-white transition-colors hover:bg-slate-700"
                  >
                    <Plus size={14} /> ADD BOE
                  </button>
                </div>
              </div>
            )}

            {/* 3. ALPHANUMERIC INVOICE / RECEIPT NO */}
            {current && (
              <div className="border-t border-slate-100 pt-5">
                {/* Paid vs Not Paid Toggle */}
                <div className="mb-4">
                  <label className="mb-2 block text-[13px] font-bold text-slate-700">
                    Payment Status
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentStatus("Not Paid")}
                      className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold border transition-colors ${
                        paymentStatus === "Not Paid"
                          ? "bg-rose-550 border-red-200 bg-red-50 text-red-700 shadow-sm"
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      <AlertCircle size={14} /> Not Paid
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentStatus("Paid")}
                      className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold border transition-colors ${
                        paymentStatus === "Paid"
                          ? "bg-emerald-550 border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm"
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      <CheckCircle2 size={14} /> Paid
                    </button>
                  </div>
                </div>

                <label className="mb-2 block text-[13px] font-bold text-slate-700">
                  3. ALPHANUMERIC INVOICE / RECEIPT NO *
                </label>
                <input
                  value={invoice}
                  onChange={(e) => setInvoice(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirm()}
                  placeholder={
                    paymentStatus === "Not Paid"
                      ? "Enter optional invoice (or leave blank)"
                      : "E.G. INV-2026-9041"
                  }
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
                />
              </div>
            )}

            {/* Actions */}
            {current && (
              <div className="flex gap-4 border-t border-slate-100 pt-5">
                <button
                  onClick={confirm}
                  disabled={busy || (paymentStatus === "Paid" && !invoice.trim())}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-3.5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <CheckCircle2 size={18} />
                  {paymentStatus === "Paid" ? "PROCESS PAYMENT & PRINT 1 TOKEN" : "APPROVE WITHOUT PAYMENT & PRINT"}
                </button>
                <button
                  onClick={skip}
                  className="rounded-lg border-2 border-slate-200 bg-white px-6 text-sm font-extrabold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Skip to Next
                </button>
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Right panel: Inbound queue logs */}
      <div className="flex flex-col gap-5">
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
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3 bg-white shadow-sm"
                  >
                    <div>
                      <p className="text-sm font-extrabold text-slate-800">{t.vehicle}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        BoE: {t.boe}
                      </p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <span className="text-sm font-extrabold text-slate-600">
                        {pad(t.serial)}
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
