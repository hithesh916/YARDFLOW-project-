"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  DoorOpen,
  QrCode as QrIcon,
} from "lucide-react";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/pill";
import { QrCode } from "@/components/qr-code";
import { filterBySearch, useStore } from "@/lib/store";
import { durationBetween, fmtTime } from "@/lib/format";

export default function ExitPage() {
  const tickets = useStore((s) => s.tickets);
  const search = useStore((s) => s.search);
  const exitSelectedId = useStore((s) => s.exitSelectedId);
  const setExitSelected = useStore((s) => s.setExitSelected);
  const ticketAction = useStore((s) => s.ticketAction);

  const [manualId, setManualId] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [busy, setBusy] = useState(false);

  const queue = filterBySearch(tickets, search).filter(
    (t) => t.status === "awaiting_exit",
  );
  const selectedId =
    exitSelectedId && queue.some((t) => t.id === exitSelectedId)
      ? exitSelectedId
      : (queue[0]?.id ?? null);
  const selected = queue.find((t) => t.id === selectedId) ?? null;

  const recentExits = [...tickets]
    .filter((t) => t.status === "exited")
    .sort((a, b) => (b.exitTime ?? "").localeCompare(a.exitTime ?? ""))
    .slice(0, 5);

  function verifyManual() {
    const q = manualId.trim().toLowerCase();
    if (!q) return;
    const found = queue.find(
      (t) => t.vehicle.toLowerCase() === q || t.id.toLowerCase() === q
    );
    if (found) {
      setExitSelected(found.id);
      setManualId("");
      toast.success(`Vehicle verified for exit: ${found.vehicle}`);
    } else {
      toast.error("No exit-ready vehicle matches that vehicle or ticket ID.");
    }
  }

  async function permit() {
    if (!selected) return;
    setBusy(true);
    const ok = await ticketAction(selected.id, "permit-exit");
    setBusy(false);
    if (ok) {
      setExitSelected(null);
      toast.success("Exit recorded. Open the physical gate only after receiving the backend confirmation.");
    }
  }
  async function hold() {
    if (!selected) return;
    const reason = holdReason.trim().replace(/[<>]/g, "").slice(0, 500);
    if (!reason) {
      toast.error("A hold reason is required.");
      return;
    }
    setBusy(true);
    const ok = await ticketAction(selected.id, "hold", { reason });
    setBusy(false);
    if (ok) {
      setHoldReason("");
      setExitSelected(null);
      toast.warning("Vehicle placed on hold.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
      {/* Left: scan + gate pass */}
      <div className="flex flex-col gap-5">
        <Panel className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl border-2 border-dashed border-blue-300 text-blue-600">
            <QrIcon size={28} />
          </div>
          <p className="font-extrabold text-slate-800">Scan Token</p>
          <p className="mb-4 mt-0.5 text-xs text-slate-400">
            Scan Loading Pass QR code
          </p>
          <label className="mb-1.5 block text-left text-[11px] font-extrabold text-slate-500">
            SCAN PASS / MANUAL ENTRY
          </label>
          <input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verifyManual()}
            autoFocus
            placeholder="ABC-1234"
            className="mb-3 w-full rounded-lg border-2 border-blue-200 px-3.5 py-3 text-center text-[15px] font-extrabold uppercase outline-none focus:ring-[3px] focus:ring-blue-100"
          />
          <button
            onClick={verifyManual}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-[13px] font-extrabold text-white transition-colors hover:bg-blue-700"
          >
            <ArrowRight size={16} /> Verify Manual ID
          </button>
        </Panel>

        <Panel className="bg-slate-50 p-5">
          <p className="mb-4 text-[11px] font-extrabold tracking-[0.08em] text-slate-500">
            GATE PASS PREVIEW
          </p>
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-center">
            <p className="mb-3 border-b border-slate-100 pb-2.5 font-extrabold">
              YARDFLOW SYSTEMS
            </p>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-slate-400">VEHICLE:</span>
              <span className="font-bold">{selected?.vehicle ?? "—"}</span>
            </div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-slate-400">EXIT:</span>
              <span className="font-bold">{fmtTime(new Date())}</span>
            </div>
            <div className="mx-auto mt-3.5 flex h-20 w-20 items-center justify-center">
              {selected ? (
                <QrCode
                  value={`YARDFLOW|EXIT|${selected.vehicle}|${selected.invoice ?? ""}`}
                  size={80}
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-bold text-slate-500">
                  QR
                </div>
              )}
            </div>
            <p className="mt-3 text-[10px] text-slate-400">
              Thank you for your visit.
            </p>
          </div>
        </Panel>
      </div>

      {/* Right: focus panel */}
      {!selected ? (
        <Panel className="flex items-center justify-center p-16 text-center text-[13px] text-slate-400">
          No vehicle selected. Queue is empty or scan a token to begin.
        </Panel>
      ) : (
        <Panel className="border-l-4 border-l-emerald-600 p-8">
          <div className="mb-1.5 flex items-start justify-between">
            <Pill tone="slate">READY FOR DISPATCH</Pill>
            <div className="text-right">
              <p className="flex items-center justify-end gap-1.5 font-extrabold text-emerald-600">
                <CheckCircle2 size={16} /> All Clear
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                In yard{" "}
                {durationBetween(selected.entryTime, new Date().toISOString())}
              </p>
            </div>
          </div>
          <div className="mb-1.5 mt-1 text-4xl font-extrabold">
            {selected.vehicle}
          </div>
          <p className="mb-6 text-[13px] text-slate-400">
            SERIAL NO: #{selected.serial} | TYPE: {selected.cargo}
          </p>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
            <div>
              <p className="mb-4 text-[11px] font-extrabold tracking-[0.06em] text-slate-500">
                WORKFLOW VERIFICATION
              </p>
              <VerifStep
                t="1. Entry Recorded"
                d={`Gate A-1 @ ${fmtTime(selected.entryTime)}`}
              />
              <VerifStep
                t="2. Billing Completed"
                d={`Invoice #${selected.invoice ?? "—"}`}
              />
              <VerifStep
                t="3. Loading Completed"
                d={`${selected.bay} @ ${
                  selected.loadingEnd ? fmtTime(selected.loadingEnd) : "—"
                }`}
              />
            </div>

            <div className="rounded-xl bg-slate-50 p-5">
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-extrabold text-red-600">
                <AlertTriangle size={14} /> EXCEPTION PROTOCOL
              </p>
              <label className="mb-0.5 block text-[13px] font-bold text-slate-700">
                Reason for Hold
              </label>
              <textarea
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                rows={3}
                placeholder="Specify vehicle hold reason..."
                className="mb-3 mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:ring-[3px] focus:ring-blue-100"
              />
              <button
                onClick={hold}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-[13px] font-extrabold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                <Ban size={14} /> Hold Vehicle
              </button>
            </div>
          </div>

          <button
            onClick={permit}
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 py-4 text-[15px] font-extrabold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
          >
            <DoorOpen size={18} /> Permit Exit &amp; Open Gate
          </button>
        </Panel>
      )}

      {/* Exit log */}
      <Panel className="p-6 lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[13px] font-extrabold tracking-wide text-slate-800">
            RECENT EXIT LOG (LAST 5)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {["VEHICLE ID", "SERIAL", "EXIT TIME", "INVOICE", "STATUS"].map(
                  (h) => (
                    <th
                      key={h}
                      className="border-b border-slate-100 pb-2 text-left text-[11px] font-bold text-slate-400"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {recentExits.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-6 text-center text-slate-400"
                  >
                    No exits recorded yet.
                  </td>
                </tr>
              ) : (
                recentExits.map((t) => (
                  <tr key={t.id}>
                    <td className="border-b border-slate-50 py-3 font-bold text-slate-800">
                      {t.vehicle}
                    </td>
                    <td className="border-b border-slate-50 py-3 text-slate-600">
                      #{t.serial}
                    </td>
                    <td className="border-b border-slate-50 py-3 text-slate-600">
                      {t.exitTime ? fmtTime(t.exitTime) : "—"}
                    </td>
                    <td className="border-b border-slate-50 py-3 text-slate-600">
                      {t.invoice ?? ""}
                    </td>
                    <td className="border-b border-slate-50 py-3">
                      <Pill tone="green">EXITED</Pill>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function VerifStep({ t, d }: { t: string; d: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <CheckCircle2 size={14} />
      </div>
      <div>
        <p className="text-sm font-bold text-slate-800">{t}</p>
        <p className="mt-0.5 text-xs text-slate-400">{d}</p>
      </div>
    </div>
  );
}
