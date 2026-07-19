"use client";

import { useState, useEffect } from "react";
import { MapPin, Printer, Truck } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { useStore } from "@/lib/store";
import { fmtDate, fmtTime, getLocalDateString } from "@/lib/format";
import { printToken } from "@/lib/print-token";
import { ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function EntryPage() {
  const tickets = useStore((s) => s.tickets);
  const lastTokenId = useStore((s) => s.lastTokenId);
  const createTicket = useStore((s) => s.createTicket);
  const settings = useStore((s) => s.settings);
  const tz = settings?.timezone || "Asia/Kolkata";
  const todayStr = getLocalDateString(new Date(), tz);

  const [vehicle, setVehicle] = useState("");
  const [boe, setBoe] = useState("");
  const [agent, setAgent] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [entriesExpanded, setEntriesExpanded] = useState(false);
  // Cross-gate: BOE pre-filled from billing-gate record
  const [prefillBoe, setPrefillBoe] = useState<string | null>(null);

  // Cross-gate lookup: when vehicle or boe is typed, check if billing gate processed this vehicle first
  useEffect(() => {
    const v = vehicle.trim().toUpperCase();
    const b = boe.trim().toUpperCase();

    if (!v && !b) {
      setPrefillBoe(null);
      return;
    }

    // Try to find a match by BOE first (since billing gate uses BOE as primary key)
    let matched = tickets.find(
      (t) =>
        t.boe.toUpperCase() === b &&
        t.createdSource === "billing" &&
        t.status !== "exited" &&
        t.status !== "held"
    );

    // Fallback: match by vehicle number
    if (!matched && v) {
      matched = tickets.find(
        (t) =>
          (t.vehicle.toUpperCase() === v || t.boe.toUpperCase() === v) &&
          t.createdSource === "billing" &&
          t.status !== "exited" &&
          t.status !== "held"
      );
    }

    if (matched) {
      if (boe.trim().toUpperCase() !== matched.boe.toUpperCase()) {
        setBoe(matched.boe);
      }
      setAgent(matched.billingAgent || matched.agent || "");
      setRemarks(matched.billingRemarks || matched.remarks || "");
      setPrefillBoe(matched.boe);
    } else {
      setPrefillBoe(null);
    }
  }, [vehicle, boe, tickets]);

  const recent = [...tickets]
    .filter(
      (t) =>
        getLocalDateString(t.entryTime, tz) === todayStr &&
        t.createdSource !== "billing",
    )
    .sort((a, b) => b.entryTime.localeCompare(a.entryTime));

  const isEditing = vehicle.trim() !== "" || boe.trim() !== "" || agent.trim() !== "" || remarks.trim() !== "";
  const lastToken = isEditing
    ? null
    : (tickets.find((t) => t.id === lastTokenId) ?? recent[0] ?? null);

  async function generate() {
    const v = vehicle.trim().replace(/\s+/g, " ").toUpperCase();
    const b = boe.trim().toUpperCase();
    const a = agent.trim().replace(/[<>]/g, "").slice(0, 80);
    const r = remarks.trim().replace(/[<>]/g, "").slice(0, 500);

    if (!/^[A-Z0-9][A-Z0-9 -]{2,14}$/.test(v)) {
      toast.error("Enter a valid vehicle number (3–15 letters, digits, spaces or hyphens).");
      return;
    }

    if (!b) {
      toast.error("Work Order No is required.");
      return;
    }

    if (!/^[A-Z0-9][A-Z0-9-]{2,29}$/.test(b)) {
      toast.error("Enter a valid Work Order number (3–30 letters, digits or hyphens).");
      return;
    }

    // Active visit check: only block when same vehicle + same BOE is already active
    const activeExists = tickets.some(
      (t) =>
        t.vehicle === v &&
        t.boe.toUpperCase() === b &&
        t.status !== "exited" &&
        t.status !== "held"
    );
    if (activeExists) {
      toast.error("This vehicle already has an active yard visit for the same BOE.");
      return;
    }

    setBusy(true);
    const created = await createTicket({
      vehicle: v,
      boe: b,
      agent: a || "Unassigned",
      remarks: r,
    });
    setBusy(false);
    if (created) {
      await printToken(created);
      setVehicle("");
      setBoe("");
      setAgent("");
      setRemarks("");
      setPrefillBoe(null);
    }
  }


  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      {/* Left Column: Form */}
      <Panel className="p-8">
        <h2 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-800">
          <Truck className="text-blue-600" size={20} />
          Entry Pass Generation
        </h2>

        <label className="mb-2 block text-[13px] font-bold text-slate-700">
          Vehicle Number (Primary ID) *
        </label>
        <input
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && generate()}
          placeholder="TN 01 AA 1234"
          className="mb-5 w-full rounded-lg border border-input bg-slate-50 dark:bg-black px-3.5 py-3 text-xl font-bold uppercase placeholder:text-slate-400 placeholder:font-normal placeholder:normal-case outline-none focus:ring-2 focus:ring-ring"
        />

        {/* BOE — read-only when auto-filled from Billing Gate, editable otherwise */}
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 flex items-center gap-2 text-[13px] font-bold text-slate-700">
              BOE *
              {prefillBoe && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Linked from Billing Gate
                </span>
              )}
            </label>
            <input
              value={boe}
              onChange={(e) => setBoe(e.target.value.toUpperCase())}
              placeholder="MAA1234567890"
              className={`w-full rounded-lg border px-3.5 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-ring ${
                prefillBoe
                  ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800/30 dark:bg-emerald-950/10 text-emerald-800 dark:text-emerald-300"
                  : "border-input bg-slate-50 dark:bg-black"
              }`}
            />
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-bold text-slate-700">
              CHA / Agent Name
            </label>
            <input
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              placeholder="Global Logistics"
              className="w-full rounded-lg border border-input bg-slate-50 dark:bg-black px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <label className="mb-2 block text-[13px] font-bold text-slate-700">
          Entry Remarks (Optional)
        </label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Additional details..."
          className="mb-5 min-h-24 w-full resize-y rounded-lg border border-input bg-slate-50 dark:bg-black px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
          <p className="flex max-w-[240px] items-center gap-2 text-xs text-slate-400">
            <MapPin size={14} className="shrink-0" /> System auto-assigns next
            available yard slot.
          </p>
          <button
            onClick={generate}
            disabled={!vehicle.trim() || !boe.trim() || busy}
            className="rounded-lg bg-action px-6 py-3.5 text-sm font-extrabold text-white transition-colors hover:bg-action/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground cursor-pointer active:scale-[0.99] transition-all"
          >
            {busy ? "Processing…" : "PROCESS & PRINT TOKEN"}
          </button>
        </div>
      </Panel>

      {/* Live token preview */}
      <Panel className="bg-slate-50 p-6">
        <p className="mb-4 text-[11px] font-extrabold tracking-[0.08em] text-slate-500">
          LIVE TOKEN PREVIEW
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          {(vehicle || boe || lastToken) && (
            <div className="mb-3 rounded bg-blue-50 py-1.5 px-3 text-xs font-black tracking-[0.05em] text-blue-700 uppercase">
              TOKEN NO: G-{String((lastToken && !vehicle && !boe) ? lastToken.serial : "NEW").padStart(3, "0")}
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
            <TokenRow k="VEHICLE:" v={vehicle || lastToken?.vehicle || "—"} />
            <TokenRow k="BOE:" v={boe || lastToken?.boe || "—"} />
            <TokenRow k="CHA / AGENT:" v={agent || lastToken?.agent || "—"} />
            <TokenRow
              k="TIME:"
              v={vehicle || boe ? fmtTime(new Date().toISOString()) : (lastToken ? fmtTime(lastToken.entryTime) : "—")}
            />
            <TokenRow
              k="DATE:"
              v={vehicle || boe ? fmtDate(new Date()) : (lastToken ? fmtDate(new Date(lastToken.entryTime)) : "—")}
            />
          </div>

          <p className="mt-4 text-[10px] font-extrabold tracking-[0.05em] text-slate-400">
            VALID FOR TODAY ONLY
          </p>
        </div>
        <button
          onClick={() => lastToken && printToken(lastToken)}
          disabled={!lastToken}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-secondary py-3 text-[13px] font-bold text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer hover:bg-secondary/80 active:scale-95 transition-all"
        >
          <Printer size={16} /> Print Token
        </button>
      </Panel>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
        {/* Header Row */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[13px] font-bold text-slate-700">
            <Truck size={16} className="text-slate-500" />
            RECENT GATE ENTRIES
          </span>
          <button
            onClick={() => setEntriesExpanded(!entriesExpanded)}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer active:scale-95 transition-all"
          >
            {entriesExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Inline List Container */}
        <motion.div 
          layout
          className={`mt-3 flex flex-col gap-2 no-scrollbar ${entriesExpanded ? "max-h-[260px] overflow-y-auto pr-1" : ""}`}
        >
          <AnimatePresence initial={false}>
            {recent.length === 0 ? (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-slate-400 py-2 text-center"
              >
                No entries today.
              </motion.p>
            ) : (
              (entriesExpanded ? recent : recent.slice(0, 2)).map((t) => (
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
                    <span className="font-extrabold text-[12px] text-slate-800">{t.vehicle}</span>
                    <span className="text-[10px] text-slate-400">BOE: {t.boe}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[10px] font-extrabold text-slate-500 block">
                        G-{String(t.serial).padStart(3, "0")}
                      </span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">
                        {fmtTime(t.entryTime)}
                      </span>
                    </div>
                    <button
                      onClick={() => printToken(t)}
                      className="flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-slate-850 active:scale-95 transition-all cursor-pointer"
                    >
                      <Printer size={10} /> PRINT
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
          
          {entriesExpanded && recent.length > 4 && (
            <p className="text-center text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
              Scroll to view more
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function TokenRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{k}</span>
      <span className="font-bold">{v}</span>
    </div>
  );
}
