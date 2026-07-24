"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  DoorOpen,
  QrCode as QrIcon,
  ChevronDown,
  Camera,
  X,
  Loader2,
} from "lucide-react";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/pill";
import { QrCode } from "@/components/qr-code";
import { filterBySearch, useStore } from "@/lib/store";
import { durationBetween, fmtTime } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ExitPage() {
  const tickets = useStore((s) => s.tickets);
  const search = useStore((s) => s.search);
  const exitSelectedId = useStore((s) => s.exitSelectedId);
  const setExitSelected = useStore((s) => s.setExitSelected);
  const ticketAction = useStore((s) => s.ticketAction);
  const settings = useStore((s) => s.settings);
  const viewTenantId = useStore((s) => s.viewTenantId);
  const currentUser = useStore((s) => s.currentUser);

  const [manualId, setManualId] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const scannerRef = useRef<any>(null);
  const scannedOnce = useRef(false);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const fullExitQueue = tickets.filter((t) => t.status === "awaiting_exit");
  const queue = filterBySearch(fullExitQueue, search);

  // If the operator has EXPLICITLY selected a vehicle that then disappears from the
  // queue (e.g. another terminal exits it), fall back to the empty state — NOT to
  // queue[0]. Auto-jumping the focus panel to a different truck risks permitting the
  // wrong vehicle. A default preview of queue[0] only applies when nothing is selected.
  const selectedId = exitSelectedId
    ? (fullExitQueue.some((t) => t.id === exitSelectedId) ? exitSelectedId : null)
    : (queue[0]?.id ?? null);
  const selected = fullExitQueue.find((t) => t.id === selectedId) ?? null;

  const recentExits = [...tickets]
    .filter((t) => t.status === "exited")
    .sort((a, b) => (b.exitTime ?? "").localeCompare(a.exitTime ?? ""))
    .slice(0, 5);

  const heldVehicles = filterBySearch(
    tickets.filter((t) => t.status === "held"),
    search,
  );

  async function release(id: string) {
    setBusy(true);
    const ok = await ticketAction(id, "release-hold");
    setBusy(false);
    if (ok) toast.success("Vehicle released — back in the exit queue.");
  }

  /* ──────────────────────────────────────────────
     Core lookup — searches ALL awaiting_exit tickets
     by ticket.id (what the loading pass QR encodes)
     and falls back to tokens / vehicle / BOE.
  ────────────────────────────────────────────── */
  function matchInList(list: any[], raw: string): any | null {
    const q = raw.trim().toLowerCase();
    if (!q) return null;

    // 1. Exact ticket ID (what loading pass QR encodes). Exact match only — a
    // substring/`includes` match would let a foreign QR that merely CONTAINS a
    // ticket id auto-verify the wrong vehicle.
    const hit = list.find((t: any) => t.id.toLowerCase() === q);
    if (hit) return hit;

    // 2. Token / vehicle / BOE fallbacks
    return list.find((t: any) => {
      const lSerial = t.loadingSerial ?? t.serial;
      const bSerial = t.billingSerial ?? t.serial;
      const lToken  = `l-${String(lSerial).padStart(3, "0")}`;
      const bToken  = `b-${String(bSerial).padStart(3, "0")}`;
      const gToken  = t.createdSource === "billing" ? "" : `g-${String(t.serial).padStart(3, "0")}`;
      return (
        t.vehicle.toLowerCase() === q ||
        t.vehicle.toLowerCase().replace(/\s+/g, "") === q.replace(/\s+/g, "") ||
        t.boe.toLowerCase() === q ||
        lToken === q || `l-${lSerial}` === q ||
        bToken === q || `b-${bSerial}` === q ||
        (gToken && (gToken === q || `g-${t.serial}` === q)) ||
        (t.manualGateToken?.toLowerCase() === q) ||
        (t.manualBillingToken?.toLowerCase() === q) ||
        (t.workOrder?.toLowerCase() === q)
      );
    });
  }

  /* ──────────────────────────────────────────────
     Shared resolve — checks cache then hits server
  ────────────────────────────────────────────── */
  async function resolveCode(raw: string): Promise<any | null> {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // 1. Try the in-memory cache first (instant)
    const cached = matchInList(fullExitQueue, trimmed);
    if (cached) return cached;

    // 2. Hit the server for fresh state (handles stale cache). Use the SAME scoped URL
    // the poller uses: while a superadmin is viewing a client, this must fetch that
    // tenant's tickets — not the superadmin's own scope — or it would overwrite the
    // viewed workspace's data in the store.
    const stateUrl =
      viewTenantId && currentUser?.role === "superadmin"
        ? `/api/state?tenantId=${encodeURIComponent(viewTenantId)}`
        : "/api/state";
    try {
      const res = await fetch(stateUrl, { cache: "no-store" });
      if (!res.ok) return null;
      const freshState = await res.json();
      const freshQueue = (freshState.tickets || []).filter(
        (t: any) => t.status === "awaiting_exit"
      );
      const found = matchInList(freshQueue, trimmed);
      if (found) {
        // Sync store with fresh server state
        useStore.setState({ tickets: freshState.tickets });
      }
      return found ?? null;
    } catch {
      return null;
    }
  }

  /* ──────────────────────────────────────────────
     Camera scanner
  ────────────────────────────────────────────── */
  async function startScanner() {
    scannedOnce.current = false;
    setScanning(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 30,               // ⚡ high framerate
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1.0,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true, // use native browser BarcodeDetector API if available
          },
        } as any,
        (decodedText: string) => {
          if (scannedOnce.current) return; // fire only once
          scannedOnce.current = true;
          handleCameraScan(decodedText, scanner);
        },
        () => {} // ignore individual frame errors
      );
    } catch (err: any) {
      toast.error("Camera access failed — check browser permissions.");
      setScanning(false);
      scannerRef.current = null;
    }
  }

  async function stopScanner() {
    if (scannerRef.current?.isScanning) {
      try { await scannerRef.current.stop(); } catch {}
    }
    scannerRef.current = null;
    setScanning(false);
  }

  async function handleCameraScan(code: string, scannerInstance: any) {
    // Stop camera immediately so it doesn't keep firing
    if (scannerInstance?.isScanning) {
      try { await scannerInstance.stop(); } catch {}
    }
    scannerRef.current = null;
    setScanning(false);
    setVerifying(true);

    const found = await resolveCode(code);
    setVerifying(false);

    if (found) {
      setExitSelected(found.id);
      setManualId("");
      toast.success(`✅ ${found.vehicle} verified — ready for exit`, { duration: 3000 });
    } else {
      toast.error(`QR not matched. Scanned: "${code.slice(0, 40)}"`, { duration: 5000 });
    }
  }

  /* ──────────────────────────────────────────────
     Manual / keyboard entry
  ────────────────────────────────────────────── */
  async function verifyManual() {
    const input = manualId.trim();
    if (!input) return;
    setVerifying(true);
    const found = await resolveCode(input);
    setVerifying(false);
    if (found) {
      setExitSelected(found.id);
      setManualId("");
      toast.success(`✅ ${found.vehicle} verified — ready for exit`);
    } else {
      toast.error(`❌ No exit-ready vehicle found for: "${input}"`);
    }
  }

  /* ──────────────────────────────────────────────
     Permit / Hold actions
  ────────────────────────────────────────────── */
  async function permit() {
    if (!selected) return;
    // Gate staff must not release an unpaid or unbilled vehicle without a conscious
    // override — the workflow checklist above shows the real billing state.
    if (!selected.billingTime) {
      if (!window.confirm(`${selected.vehicle} has NO billing record. Release anyway?`)) return;
    } else if (selected.paymentStatus !== "Paid") {
      if (!window.confirm(`${selected.vehicle} is marked NOT PAID. Release anyway?`)) return;
    }
    setBusy(true);
    const ok = await ticketAction(selected.id, "permit-exit");
    setBusy(false);
    if (ok) {
      setExitSelected(null);
      toast.success("Exit recorded — gate cleared.");
    }
  }

  async function hold() {
    if (!selected) return;
    const reason = holdReason.trim().replace(/[<>]/g, "").slice(0, 500);
    if (!reason) { toast.error("A hold reason is required."); return; }
    setBusy(true);
    const ok = await ticketAction(selected.id, "hold", { reason });
    setBusy(false);
    if (ok) {
      setHoldReason("");
      setExitSelected(null);
      toast.warning("Vehicle placed on hold.");
    }
  }

  /* ──────────────────────────────────────────────
     Render
  ────────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_1fr]">

        {/* ── Left column: scanner + preview ── */}
        <div className="flex flex-col gap-4">

          {/* Scanner card */}
          <Panel className="overflow-hidden p-0">
            {scanning ? (
              /* ─ CAMERA VIEW ─ */
              <div className="relative bg-black">
                {/* Html5Qrcode mounts the video into this div */}
                <div
                  id="qr-reader"
                  className="w-full"
                  style={{ minHeight: 320 }}
                />

                {/* Scan-frame overlay */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative h-64 w-64">
                    {/* Corner brackets */}
                    {["top-0 left-0","top-0 right-0","bottom-0 left-0","bottom-0 right-0"].map((pos, i) => (
                      <span
                        key={i}
                        className={`absolute ${pos} h-8 w-8 border-[3px] border-emerald-400 ${
                          i === 0 ? "border-r-0 border-b-0 rounded-tl-lg" :
                          i === 1 ? "border-l-0 border-b-0 rounded-tr-lg" :
                          i === 2 ? "border-r-0 border-t-0 rounded-bl-lg" :
                                    "border-l-0 border-t-0 rounded-br-lg"
                        }`}
                      />
                    ))}
                    {/* Animated scan line */}
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-400 opacity-80 animate-[scanline_2s_linear_infinite]" />
                  </div>
                </div>

                {/* Stop button */}
                <button
                  onClick={stopScanner}
                  className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm hover:bg-red-600/80 transition-colors cursor-pointer"
                >
                  <X size={12} /> Stop
                </button>

                {/* Hint */}
                <p className="absolute bottom-4 inset-x-0 text-center text-[11px] font-semibold text-white/70">
                  Align QR inside the frame
                </p>
              </div>
            ) : (
              /* ─ IDLE STATE ─ */
              <div className="p-6">
                <button
                  onClick={startScanner}
                  disabled={verifying}
                  className="mb-4 flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 dark:bg-blue-950/10 dark:border-blue-800 py-8 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors cursor-pointer group disabled:opacity-50"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40 group-hover:scale-105 transition-transform">
                    <Camera size={26} />
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-extrabold">Scan Loading Pass QR</p>
                    <p className="text-[11px] text-blue-400 mt-0.5">Tap to open camera</p>
                  </div>
                </button>

                {/* Manual entry */}
                <label className="mb-1.5 block text-[11px] font-extrabold tracking-widest text-slate-400 uppercase">
                  Manual Entry
                </label>
                <div className="flex gap-2">
                  <input
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && verifyManual()}
                    autoFocus
                    placeholder="Vehicle / Token / BOE"
                    className="flex-1 rounded-lg border border-input bg-slate-50 dark:bg-black px-3.5 py-3 text-[13px] font-bold uppercase outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={verifyManual}
                    disabled={verifying || !manualId.trim()}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-3 text-[13px] font-extrabold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 cursor-pointer active:scale-95 transition-all"
                  >
                    {verifying ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                  </button>
                </div>
              </div>
            )}

            {/* Verifying overlay on top of camera */}
            {verifying && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-black/60 backdrop-blur-sm">
                <Loader2 size={36} className="animate-spin text-white" />
                <p className="text-sm font-bold text-white">Verifying…</p>
              </div>
            )}
          </Panel>

          {/* Live Gate Pass Preview */}
          <Panel className="bg-slate-50 dark:bg-slate-900/50 p-5">
            <p className="mb-3 text-[10px] font-extrabold tracking-[0.1em] text-slate-400 uppercase">
              Live Gate Pass Preview
            </p>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-center shadow-sm">
              {selected && (
                <div className="mb-2 text-sm font-black tracking-wider text-slate-700 dark:text-slate-200 uppercase">
                  TOKEN: L-{String(selected.loadingSerial ?? selected.serial).padStart(3, "0")}
                </div>
              )}
              <p className="font-extrabold text-slate-900 dark:text-white">YARDFLOW SYSTEMS</p>
              {settings?.terminalName && (
                <p className="mt-0.5 text-[10px] text-slate-400">{settings.terminalName}</p>
              )}
              <div className="my-3 border-t border-dashed border-slate-200 dark:border-slate-700" />
              <div className="mb-4 flex flex-col gap-1.5 text-left text-xs">
                {[
                  ["VEHICLE", selected?.vehicle ?? "—"],
                  ["BOE NO", selected?.boe ?? "—"],
                  ["INVOICE", selected?.invoice ?? "—"],
                  ["EXIT TIME", fmtTime(new Date())],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between font-bold">
                    <span className="text-slate-400">{k}:</span>
                    <span className="text-slate-800 dark:text-slate-200">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mx-auto flex h-20 w-20 items-center justify-center">
                {selected ? (
                  <QrCode value={selected.id} size={80} />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-400">
                    <QrIcon size={28} className="opacity-30" />
                  </div>
                )}
              </div>
              <p className="mt-3 text-[10px] text-slate-400">Thank you for your visit.</p>
            </div>
          </Panel>
        </div>

        {/* ── Right column: focus panel ── */}
        <div className="flex flex-col gap-5">
          {selected ? (
            <Panel className="border-l-4 border-l-emerald-500 p-8 animate-fadeIn">
              <div className="mb-1.5 flex items-start justify-between">
                <Pill tone="slate">READY FOR DISPATCH</Pill>
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1.5 font-extrabold text-emerald-600">
                    <CheckCircle2 size={16} /> All Clear
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    In yard {durationBetween(selected.entryTime, new Date().toISOString())}
                  </p>
                </div>
              </div>
              <div className="mb-1.5 mt-1 text-4xl font-extrabold">{selected.vehicle}</div>

              <div className="mb-6 grid grid-cols-2 gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button className="flex flex-col text-left rounded-lg bg-slate-50 p-3.5 transition-colors hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 outline-none w-full border border-slate-200 dark:border-slate-800 cursor-pointer">
                        <div className="flex items-center justify-between w-full text-[11px] font-bold text-slate-400">
                          <span>SERIAL NO</span>
                          <ChevronDown size={12} className="text-slate-400" />
                        </div>
                        <div className="mt-0.5 font-bold text-slate-800 dark:text-slate-100">
                          L-{String(selected.loadingSerial ?? selected.serial).padStart(3, "0")}
                        </div>
                      </button>
                    }
                  />
                  <DropdownMenuContent align="start" className="w-56 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-md max-h-60 overflow-y-auto">
                    {queue.map((t) => (
                      <DropdownMenuItem
                        key={t.id}
                        onClick={() => setExitSelected(t.id)}
                        className={`flex flex-col items-start gap-0.5 px-3 py-2 text-xs rounded-md transition-colors cursor-pointer ${
                          t.id === selected.id
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 font-extrabold"
                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-extrabold text-[13px]">{t.vehicle}</span>
                          <span className="text-[10px] text-slate-400">L-{String(t.loadingSerial ?? t.serial).padStart(3, "0")}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">BOE: {t.boe}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <InfoBox k="INVOICE NO" v={selected.invoice || "N/A"} />
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
                <div>
                  <p className="mb-4 text-[11px] font-extrabold tracking-[0.06em] text-slate-500">
                    WORKFLOW VERIFICATION
                  </p>
                  <VerifStep
                    t="1. Entry Recorded"
                    d={`Gate A-1 @ ${fmtTime(selected.entryTime)}`}
                    state={selected.entryTime ? "done" : "pending"}
                  />
                  <VerifStep
                    t="2. Billing Completed"
                    d={
                      !selected.billingTime
                        ? "Not billed — no invoice on record"
                        : selected.paymentStatus === "Paid"
                          ? `Invoice #${selected.invoice ?? "—"} · Paid`
                          : `Invoice #${selected.invoice ?? "—"} · NOT PAID`
                    }
                    state={!selected.billingTime ? "pending" : selected.paymentStatus === "Paid" ? "done" : "warn"}
                  />
                  <VerifStep
                    t="3. Loading Completed"
                    d={`${selected.bay} @ ${selected.loadingEnd ? fmtTime(selected.loadingEnd) : "—"}`}
                    state={selected.loadingEnd ? "done" : "pending"}
                  />
                </div>

                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-5">
                  <p className="mb-3 flex items-center gap-1.5 text-[11px] font-extrabold text-red-600">
                    <AlertTriangle size={14} /> EXCEPTION PROTOCOL
                  </p>
                  <label className="mb-0.5 block text-[13px] font-bold text-slate-700 dark:text-slate-300">
                    Reason for Hold
                  </label>
                  <textarea
                    value={holdReason}
                    onChange={(e) => setHoldReason(e.target.value)}
                    rows={3}
                    placeholder="Specify vehicle hold reason..."
                    className="mb-3 mt-1.5 w-full resize-y rounded-lg border border-input bg-white dark:bg-black px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={hold}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive py-2.5 text-[13px] font-extrabold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 cursor-pointer active:scale-95 transition-all"
                  >
                    <Ban size={14} /> Hold Vehicle
                  </button>
                </div>
              </div>

              <button
                onClick={permit}
                disabled={busy}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-[16px] font-extrabold text-white transition-all hover:bg-emerald-700 disabled:opacity-50 cursor-pointer active:scale-[0.99] shadow-lg shadow-emerald-500/20"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <DoorOpen size={18} />}
                {busy ? "Processing…" : "Permit Exit & Open Gate"}
              </button>
            </Panel>
          ) : (
            /* Empty state */
            <Panel className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
                <QrIcon size={28} />
              </div>
              <p className="font-extrabold text-slate-700 dark:text-slate-200">No vehicle selected</p>
              <p className="mt-1 max-w-xs text-sm text-slate-400">
                Scan the Loading Pass QR code or enter a vehicle / token number on the left.
              </p>
            </Panel>
          )}
        </div>
      </div>

      {/* Held vehicles — awaiting release back into the exit queue */}
      {heldVehicles.length > 0 && (
        <Panel className="p-6">
          <p className="mb-4 flex items-center gap-1.5 text-[11px] font-black tracking-[0.08em] text-amber-600 uppercase">
            <Ban size={13} /> On Hold ({heldVehicles.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {heldVehicles.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{t.vehicle}</p>
                  <p className="truncate text-[10px] text-slate-500 mt-0.5" title={t.holdReason ?? ""}>
                    {t.holdReason || "No reason recorded"}
                  </p>
                </div>
                <button
                  onClick={() => release(t.id)}
                  disabled={busy}
                  className="shrink-0 flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer active:scale-95 transition-all"
                >
                  <ArrowRight size={13} /> Release
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Today's exits */}
      <Panel className="p-6">
        <p className="mb-4 text-[11px] font-black tracking-[0.08em] text-slate-500 uppercase">
          Today&apos;s Exited
        </p>
        {recentExits.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">No exits recorded today yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {recentExits.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-4 py-3 shadow-sm"
              >
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{t.vehicle}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Exit: {t.exitTime ? fmtTime(t.exitTime) : ""}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-500 block">
                    L-{String(t.loadingSerial ?? t.serial).padStart(3, "0")}
                  </span>
                  <span className="inline-flex items-center rounded bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    EXITED
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ── Sub-components ── */
// The tick is driven by real ticket data — a green check only when the stage is
// genuinely complete, amber when it needs attention (e.g. billed but Not Paid), red
// when the stage is missing. Previously all three were hardcoded green, which told
// gate staff billing was done even when it was skipped or unpaid.
function VerifStep({ t, d, state = "done" }: { t: string; d: string; state?: "done" | "warn" | "pending" }) {
  const chip =
    state === "done"
      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600"
      : state === "warn"
        ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600"
        : "bg-red-50 dark:bg-red-950/40 text-red-600";
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${chip}`}>
        {state === "done" ? <CheckCircle2 size={14} /> : state === "warn" ? <AlertTriangle size={14} /> : <X size={14} />}
      </div>
      <div>
        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{t}</p>
        <p className="mt-0.5 text-xs text-slate-400">{d}</p>
      </div>
    </div>
  );
}

function InfoBox({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3.5 border border-slate-200 dark:border-slate-800">
      <p className="text-[11px] font-bold text-slate-400">{k}</p>
      <p className="mt-0.5 font-bold text-slate-800 dark:text-slate-100">{v}</p>
    </div>
  );
}
