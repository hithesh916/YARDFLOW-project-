"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import { Download, Briefcase, X } from "lucide-react";

function useSessionStorage<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.sessionStorage.getItem(key);
        if (saved !== null) {
          return JSON.parse(saved);
        }
      } catch (err) {
        console.warn("Failed to read from sessionStorage", err);
      }
    }
    return initialValue;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(state));
      } catch (err) {
        console.warn("Failed to write to sessionStorage", err);
      }
    }
  }, [key, state]);

  return [state, setState] as const;
}

export function LicenseInfoModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const tenants = useStore((s) => s.tenants);
  const currentUser = useStore((s) => s.currentUser);
  const operators = useStore((s) => s.operators);

  const currentTenant = currentUser?.tenantId
    ? tenants.find(t => t.id === currentUser.tenantId)
    : tenants[0];

  const tenantOperators = operators.filter(o =>
    (o.tenantId === currentTenant?.id || (!o.tenantId && currentTenant?.id === tenants[0]?.id)) &&
    o.username !== "admin"
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="w-full max-w-[500px] rounded-2xl border border-slate-200 bg-white p-8 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Briefcase className="text-blue-600" size={22} />
            License Information
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {currentTenant ? (
          <div className="flex flex-col gap-6">
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl text-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Current Plan</p>
              <p className="text-2xl font-black text-blue-600">{currentTenant.plan}</p>
              <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wide">
                {currentTenant.status}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="border border-slate-100 rounded-lg p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Expiry Date</p>
                <p className="text-sm font-bold text-slate-800">{new Date(currentTenant.expiryDate).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</p>
              </div>
              <div className="border border-slate-100 rounded-lg p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Operator Seats</p>
                <p className="text-sm font-bold text-slate-800">{tenantOperators.length} used of {currentTenant.seats} allowed</p>
              </div>
              <div className="border border-slate-100 rounded-lg p-4 col-span-2 bg-slate-50">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">License Key</p>
                <p className="text-sm font-mono font-bold text-slate-800 tracking-wider">{currentTenant.licenseKey}</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 text-center mt-2">
              To upgrade your plan, increase seats, or extend expiry, please contact the Super Admin.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No active license found.</p>
        )}

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function ModuleCustomizationModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  const [enableQrCode, setEnableQrCode] = useSessionStorage("modal_enableQrCode", true);
  const [boeLabel, setBoeLabel] = useSessionStorage("modal_boeLabel", "BOE Number");
  const [remarksOptional, setRemarksOptional] = useSessionStorage("modal_remarksOptional", true);
  const [busy, setBusy] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    if (isOpen && settings && !settingsLoaded) {
      setEnableQrCode(settings.formCustomization?.enableQrCode ?? true);
      setBoeLabel(settings.formCustomization?.renameFields?.boe || "BOE Number");
      setRemarksOptional(settings.formCustomization?.optionalFields?.includes("remarks") ?? true);
      setSettingsLoaded(true);
    }
  }, [isOpen, settings, settingsLoaded]);

  async function handleSave() {
    setBusy(true);
    const optionalFields = remarksOptional ? ["remarks"] : [];
    const renameFields = { boe: boeLabel.trim() || "BOE Number" };

    const ok = await updateSettings({
      formCustomization: {
        enableQrCode,
        renameFields,
        optionalFields
      }
    });
    setBusy(false);
    if (ok) {
      toast.success("Module Configuration saved.");
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="w-full max-w-[600px] rounded-2xl border border-slate-200 bg-white p-8 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extrabold text-slate-900">Module Customization</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-8">
          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-3 border-b pb-2">Features</h4>
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input type="checkbox" checked={enableQrCode} onChange={e => setEnableQrCode(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300" />
              <span className="font-semibold text-slate-700">Enable QR Code Generation</span>
            </label>
            <p className="text-[11px] text-slate-400 mt-1 ml-7">Appends a scannable QR code to all generated tickets and receipts.</p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-3 border-b pb-2">Rename Fields</h4>
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div>
                <p className="text-xs font-bold text-slate-700">BOE Number</p>
                <p className="text-[10px] text-slate-400">Default tracking identifier</p>
              </div>
              <input value={boeLabel} onChange={e => setBoeLabel(e.target.value)} placeholder="e.g. Work Order, Shipping ID" className="w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none" />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-3 border-b pb-2">Mandatory / Optional Fields</h4>
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input type="checkbox" checked={remarksOptional} onChange={e => setRemarksOptional(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300" />
              <span className="font-semibold text-slate-700">Make "Remarks" field Optional</span>
            </label>
            <p className="text-[11px] text-slate-400 mt-1 ml-7">If unchecked, operators will be forced to enter remarks for every ticket.</p>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={busy} className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {busy ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function GenerateReportsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const tickets = useStore((s) => s.tickets);

  const [startDate, setStartDate] = useSessionStorage("modal_startDate", "");
  const [endDate, setEndDate] = useSessionStorage("modal_endDate", "");
  const [repModules, setRepModules] = useSessionStorage<string[]>("modal_repModules", ["Entry", "Billing", "Loading", "Exit"]);

  function toggleReportModule(mod: string) {
    setRepModules(prev =>
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    );
  }

  function handleGenerateReport() {
    if (repModules.length === 0) {
      toast.error("Please select at least one module for the report.");
      return;
    }

    let filtered = tickets;
    if (startDate) {
      const start = new Date(startDate).getTime();
      filtered = filtered.filter(t => new Date(t.entryTime).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate).getTime();
      filtered = filtered.filter(t => new Date(t.entryTime).getTime() <= end + 86400000);
    }

    const csv = [
      ["Ticket ID", "BOE", "Vehicle", "Entry Time", "Status", ...repModules.map(m => `${m} Time`)].join(","),
      ...filtered.map(t =>
        [t.id, t.boe, t.vehicle, t.entryTime, t.status, ...repModules.map(m => {
          const key = m.toLowerCase().replace(" ", "");
          return t[key as keyof typeof t] || "";
        })].join(",")
      )
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yardflow-report-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Report downloaded successfully.");
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="w-full max-w-[600px] rounded-2xl border border-slate-200 bg-white p-8 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extrabold text-slate-900">Generate Custom Reports</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">START DATE (OPTIONAL)</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">END DATE (OPTIONAL)</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none" />
            </div>
          </div>

          <div>
            <label className="mb-3 block text-xs font-bold text-slate-600 uppercase">SELECT MODULES TO INCLUDE</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {["Entry", "Billing", "Loading", "Exit"].map(mod => (
                <label key={mod} className={`flex items-center justify-center p-3 rounded-lg border cursor-pointer transition-colors ${repModules.includes(mod) ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                  <input type="checkbox" checked={repModules.includes(mod)} onChange={() => toggleReportModule(mod)} className="sr-only" />
                  <span className="text-xs font-bold">{mod} Data</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleGenerateReport} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors">
            <Download size={16} /> Download Excel / CSV
          </button>
        </div>
      </div>
    </div>
  );
}
