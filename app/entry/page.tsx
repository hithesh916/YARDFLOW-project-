"use client";

import { useState } from "react";
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
      toast.error("BOE Number is required.");
      return;
    }

    if (!/^[A-Z0-9][A-Z0-9-]{2,29}$/.test(b)) {
      toast.error("Enter a valid BOE number (3–30 letters, digits or hyphens).");
      return;
    }

    // Active visit check
    const activeExists = tickets.some(
      (t) => t.vehicle === v && t.status !== "exited" && t.status !== "held"
    );
    if (activeExists) {
      toast.error("This vehicle already has an active yard visit.");
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
      setVehicle("");
      setBoe("");
      setAgent("");
      setRemarks("");
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
          onChange={(e) => setVehicle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate()}
          placeholder="ABC-1234"
          className="mb-5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-xl font-bold uppercase outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
        />
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-[13px] font-bold text-slate-700">
              BOE Number *
            </label>
            <input
              value={boe}
              onChange={(e) => setBoe(e.target.value)}
              placeholder="BOE-10024"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
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
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
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
          className="mb-5 min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
        />
        <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
          <p className="flex max-w-[240px] items-center gap-2 text-xs text-slate-400">
            <MapPin size={14} className="shrink-0" /> System auto-assigns next
            available yard slot.
          </p>
          <button
            onClick={generate}
            disabled={!vehicle.trim() || !boe.trim() || busy}
            className="rounded-lg bg-orange-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer"
          >
            {busy ? "Generating…" : "Generate Token"}
          </button>
        </div>
      </Panel>

      {/* Live token preview */}
      <Panel className="bg-slate-50 p-6">
        <p className="mb-4 text-[11px] font-extrabold tracking-[0.08em] text-slate-500">
          LIVE TOKEN PREVIEW
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          {lastToken && (
            <div className="mb-3 rounded bg-blue-50 py-1.5 px-3 text-xs font-black tracking-[0.05em] text-blue-700 uppercase">
              TOKEN NO: G-{String(lastToken.serial).padStart(3, "0")}
            </div>
          )}
          <p className="font-extrabold leading-tight text-slate-900">
            YARDFLOW MANAGER
          </p>
          <p className="mb-4 mt-0.5 text-[10px] text-slate-400">
            {settings?.terminalName || "Terminal A-1"}
          </p>
          <div className="my-3 border-t border-dashed border-slate-200" />
          <div className="mb-4 flex flex-col gap-1.5 text-left text-xs">
            <TokenRow k="VEHICLE:" v={lastToken?.vehicle ?? "—"} />
            <TokenRow k="BOE NO:" v={lastToken?.boe ?? "—"} />
            <TokenRow
              k="TIME:"
              v={lastToken ? fmtTime(lastToken.entryTime) : "—"}
            />
            <TokenRow
              k="DATE:"
              v={lastToken ? fmtDate(new Date(lastToken.entryTime)) : "—"}
            />
          </div>

          <p className="mt-4 text-[10px] font-extrabold tracking-[0.05em] text-slate-400">
            VALID FOR TODAY ONLY
          </p>
        </div>
        <button
          onClick={() => lastToken && printToken(lastToken)}
          disabled={!lastToken}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-3 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-30"
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
                    <span className="text-[10px] text-slate-400">BoE: {t.boe}</span>
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
