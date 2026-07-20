"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  DoorOpen,
  QrCode as QrIcon,
  ChevronDown,
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

  const [manualId, setManualId] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [qrScanner, setQrScanner] = useState<any>(null);

  useEffect(() => {
    return () => {
      if (qrScanner && qrScanner.isScanning) {
        qrScanner.stop().catch((e: any) => console.error("Scanner cleanup failed", e));
      }
    };
  }, [qrScanner]);

  const fullExitQueue = tickets.filter((t) => t.status === "awaiting_exit");
  const queue = filterBySearch(fullExitQueue, search);

  const selectedId =
    exitSelectedId && fullExitQueue.some((t) => t.id === exitSelectedId)
      ? exitSelectedId
      : (queue[0]?.id ?? null);
  const selected = fullExitQueue.find((t) => t.id === selectedId) ?? null;

  const recentExits = [...tickets]
    .filter((t) => t.status === "exited")
    .sort((a, b) => (b.exitTime ?? "").localeCompare(a.exitTime ?? ""))
    .slice(0, 5);

  function findTicket(code: string) {
    const q = code.trim().replace(/\s+/g, " ").toLowerCase();
    if (!q) return null;
    return fullExitQueue.find((t) => {
      const lSerial = t.loadingSerial ?? t.serial;
      const bSerial = t.billingSerial ?? t.serial;
      const lToken = `l-${String(lSerial).padStart(3, "0")}`;
      const lTokenRaw = `l-${lSerial}`;
      
      const gToken = t.createdSource === "billing" && (!t.serial || t.serial === 0) ? "" : `g-${String(t.serial).padStart(3, "0")}`;
      const gTokenRaw = `g-${t.serial}`;
      
      const bToken = t.status === "awaiting_billing" ? "" : `b-${String(bSerial).padStart(3, "0")}`;
      const bTokenRaw = `b-${bSerial}`;
      
      const mGate = t.manualGateToken?.toLowerCase();
      const mBill = t.manualBillingToken?.toLowerCase();

      return (
        t.vehicle.toLowerCase() === q ||
        t.vehicle.toLowerCase().replace(/\s+/g, "") === q.replace(/\s+/g, "") ||
        t.id.toLowerCase() === q ||
        t.boe.toLowerCase() === q ||
        t.boe.toLowerCase().replace(/\s+/g, "") === q.replace(/\s+/g, "") ||
        lToken === q ||
        lTokenRaw === q ||
        (gToken && (gToken === q || gTokenRaw === q)) ||
        (bToken && (bToken === q || bTokenRaw === q)) ||
        (mGate && mGate === q) ||
        (mBill && mBill === q) ||
        (t.workOrder && t.workOrder.toLowerCase() === q) ||
        (t.workOrder && t.workOrder.toLowerCase().replace(/\s+/g, "") === q.replace(/\s+/g, "")) ||
        q.includes(t.vehicle.toLowerCase()) ||
        q.replace(/\s+/g, "").includes(t.vehicle.toLowerCase().replace(/\s+/g, "")) ||
        q.includes(t.id.toLowerCase())
      );
    });
  }

  function verifyManual() {
    const found = findTicket(manualId);
    if (found) {
      setExitSelected(found.id);
      setManualId("");
      toast.success(`Vehicle verified for exit: ${found.vehicle}`);
    } else {
      toast.error("No exit-ready vehicle matches that ID or Token No.");
    }
  }

  function simulateScan() {
    if (queue.length === 0) {
      toast.error("No vehicles waiting in the exit queue to scan.");
      return;
    }
    const target = queue[0];
    setManualId(target.vehicle);
    setExitSelected(target.id);
    toast.success(`[SIMULATED SCAN] Scanned loading pass QR for ${target.vehicle}`);
  }

  async function startScanner() {
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      setScanning(true);
      setTimeout(async () => {
        try {
          const scanner = new Html5Qrcode("reader");
          setQrScanner(scanner);
          await scanner.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 200, height: 200 },
            },
            (decodedText) => {
              handleScannedCode(decodedText, scanner);
            },
            () => {}
          );
        } catch (err) {
          toast.error("Failed to access camera. Please check permissions.");
          setScanning(false);
        }
      }, 300);
    } catch (e) {
      toast.error("Could not load camera scanner library.");
    }
  }

  function handleScannedCode(code: string, scannerInstance?: any) {
    const found = findTicket(code);
    const activeScanner = scannerInstance || qrScanner;
    if (activeScanner && activeScanner.isScanning) {
      activeScanner.stop().then(() => {
        setScanning(false);
        setQrScanner(null);
      }).catch((e: any) => console.error("Failed to stop scanner", e));
    } else {
      setScanning(false);
    }

    if (found) {
      setExitSelected(found.id);
      setManualId("");
      toast.success(`[CAMERA SCAN] Scanned successfully: ${found.vehicle}`);
    } else {
      toast.error(`Scanned code "${code}" did not match any exit-ready vehicles.`);
    }
  }

  async function stopScanner() {
    if (qrScanner && qrScanner.isScanning) {
      try {
        await qrScanner.stop();
      } catch (e) {
        console.error(e);
      }
    }
    setScanning(false);
    setQrScanner(null);
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
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        {/* Left panel: scan & Previews */}
        <div className="flex flex-col gap-5">
          {/* Scan / verification */}
          <Panel className="p-6 text-center">
            {scanning ? (
              <div className="mb-4">
                <div id="reader" className="mx-auto overflow-hidden rounded-xl border border-slate-200 bg-black w-[200px] h-[200px]"></div>
                <button
                  onClick={stopScanner}
                  className="mt-3.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 cursor-pointer active:scale-95 transition-all"
                >
                  Stop Camera
                </button>
              </div>
            ) : (
              <>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl border-2 border-dashed border-blue-300 text-blue-600 animate-pulse">
                  <QrIcon size={28} />
                </div>
                <p className="font-extrabold text-slate-800 text-[15px]">Scan Pass</p>
                <p className="mb-4 mt-1 text-xs text-slate-400">
                  Scan Loading Pass QR with device camera
                </p>
                <button
                  onClick={startScanner}
                  className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-[13px] font-extrabold text-primary-foreground transition-colors hover:bg-primary/95 cursor-pointer active:scale-[0.99] transition-all shadow-sm"
                >
                  <QrIcon size={14} /> Start Camera Scanner
                </button>
              </>
            )}

            <label className="mb-1.5 block text-left text-[11px] font-extrabold text-slate-500">
              SCAN PASS / MANUAL ENTRY
            </label>
            <input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && verifyManual()}
              autoFocus
              placeholder="ABC-1234"
              className="mb-3 w-full rounded-lg border border-input bg-slate-50 dark:bg-black px-3.5 py-3 text-center text-[15px] font-extrabold uppercase outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={verifyManual}
              className="mb-2.5 flex w-full items-center justify-center gap-2 rounded-lg bg-secondary py-3 text-[13px] font-extrabold text-secondary-foreground transition-colors hover:bg-secondary/90 cursor-pointer active:scale-[0.99] transition-all"
            >
              <ArrowRight size={16} /> Verify Manual ID
            </button>
          </Panel>

          {/* Live Gate Pass Preview */}
          <Panel className="bg-slate-50 p-6">
            <p className="mb-4 text-[11px] font-extrabold tracking-[0.08em] text-slate-500">
              LIVE GATE PASS PREVIEW
            </p>
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              {selected && (
                <div className="mb-3 font-black text-lg tracking-[0.05em] text-slate-800 uppercase">
                  TOKEN NO: E-{String(selected.loadingSerial ?? selected.serial).padStart(3, "0")}
                </div>
              )}
              <p className="font-extrabold leading-tight text-slate-900">
                YARDFLOW SYSTEMS
              </p>
              {settings?.terminalName && (
                <p className="mb-4 mt-0.5 text-[10px] text-slate-400">
                  {settings.terminalName}
                </p>
              )}
              <div className="my-3 border-t border-dashed border-slate-200" />
              <div className="mb-4 flex flex-col gap-1.5 text-left text-xs">
                <div className="flex justify-between font-bold">
                  <span className="text-slate-400">VEHICLE:</span>
                  <span className="text-slate-800">{selected?.vehicle ?? "—"}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-400">BOE NO:</span>
                  <span className="text-slate-800">{selected?.boe ?? "—"}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-400">INVOICE:</span>
                  <span className="text-slate-800">{selected?.invoice ?? "—"}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-400">EXIT:</span>
                  <span className="text-slate-800">{fmtTime(new Date())}</span>
                </div>
              </div>
              <div className="mx-auto mt-4 flex h-20 w-20 items-center justify-center">
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

        {/* Right panel: focus panel */}
        <div className="flex flex-col gap-5">
          {/* Focus Panel */}
          {selected && (
            <Panel className="border-l-4 border-l-emerald-600 p-8 animate-fadeIn">
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
                            : "text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800"
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
                    className="mb-3 mt-1.5 w-full resize-y rounded-lg border border-input bg-slate-50 dark:bg-black px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={hold}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive py-2.5 text-[13px] font-extrabold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50 cursor-pointer active:scale-95 transition-all"
                  >
                    <Ban size={14} /> Hold Vehicle
                  </button>
                </div>
              </div>

              <button
                onClick={permit}
                disabled={busy}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 text-[15px] font-extrabold text-primary-foreground transition-all hover:bg-primary/95 disabled:opacity-50 cursor-pointer active:scale-[0.99]"
              >
                <DoorOpen size={18} /> Permit Exit &amp; Open Gate
              </button>
            </Panel>
          )}
        </div>
      </div>

      {/* Today's Exited - Full Landscape Row */}
      <Panel className="p-6">
        <p className="mb-4 text-[11px] font-black tracking-[0.08em] text-slate-500 uppercase">
          TODAY&apos;S EXITED
        </p>
        {recentExits.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No exits recorded today yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {recentExits.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-4 py-3 shadow-sm hover:border-slate-350 transition-colors"
              >
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{t.vehicle}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Exit: {t.exitTime ? fmtTime(t.exitTime) : ""}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-500 block">
                    L-{String(t.loadingSerial ?? t.serial).padStart(3, "0")}
                  </span>
                  <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 mt-0.5">
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

function InfoBox({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
      <p className="text-[11px] font-bold text-slate-400">{k}</p>
      <p className="mt-0.5 font-bold text-slate-800 dark:text-slate-100">{v}</p>
    </div>
  );
}
