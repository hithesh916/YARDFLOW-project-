"use client";

import { useEffect, useState } from "react";

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

import {
  Users,
  Grid,
  Settings,
  Receipt,
  Plus,
  Trash2,
  Database,
  RotateCcw,
  ShieldCheck,
  Download,
  Building,
  CreditCard,
  Briefcase
} from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/pill";
import { useStore } from "@/lib/store";
import { durationBetween } from "@/lib/format";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ROLES = [
  "Administrator",
  "Gate Operator",
  "Loading Operator",
  "Billing Agent",
  "Security Guard",
];

export default function AdminPage() {
  const operators = useStore((s) => s.operators);
  const permissions = useStore((s) => s.permissions);
  const settings = useStore((s) => s.settings);
  const tickets = useStore((s) => s.tickets);
  const tenants = useStore((s) => s.tenants);
  const currentUser = useStore((s) => s.currentUser);
  const updateSettings = useStore((s) => s.updateSettings);

  const createOperator = useStore((s) => s.createOperator);
  const deleteOperator = useStore((s) => s.deleteOperator);

  // We find the current tenant (or fallback to the first one for the local demo)
  const currentTenant = currentUser?.tenantId 
    ? tenants.find(t => t.id === currentUser.tenantId) 
    : tenants[0];

  const tenantOperators = operators.filter(o => 
    o.tenantId === currentTenant?.id || (!o.tenantId && currentTenant?.id === tenants[0]?.id)
  );

  const [activeTab, setActiveTab] = useSessionStorage<"company" | "users" | "modules" | "license" | "reports">("admin_activeTab", "company");

  // Terminal Settings
  const [companyName, setCompanyName] = useSessionStorage("admin_companyName", "");
  const [companyAddress, setCompanyAddress] = useSessionStorage("admin_companyAddress", "");
  const [companyContact, setCompanyContact] = useSessionStorage("admin_companyContact", "");
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);

  // User Management
  const [opName, setOpName] = useSessionStorage("admin_opName", "");
  const [opUsername, setOpUsername] = useSessionStorage("admin_opUsername", "");
  const [opPasscode, setOpPasscode] = useSessionStorage("admin_opPasscode", "");
  const [opRole, setOpRole] = useSessionStorage("admin_opRole", "Gate Operator");

  // Module Customization
  const [enableQrCode, setEnableQrCode] = useSessionStorage("admin_enableQrCode", true);
  const [boeLabel, setBoeLabel] = useSessionStorage("admin_boeLabel", "BOE Number");
  const [remarksOptional, setRemarksOptional] = useSessionStorage("admin_remarksOptional", true);

  // Reports
  const [startDate, setStartDate] = useSessionStorage("admin_startDate", "");
  const [endDate, setEndDate] = useSessionStorage("admin_endDate", "");
  const [repModules, setRepModules] = useSessionStorage<string[]>("admin_repModules", ["Entry", "Billing", "Loading", "Exit"]);

  const [settingsLoaded, setSettingsLoaded] = useSessionStorage("admin_settingsLoaded", false);

  useEffect(() => {
    if (settings && !settingsLoaded) {
      setCompanyName(settings.companyName || "");
      setCompanyAddress(settings.companyAddress || "");
      setCompanyContact(settings.companyContact || "");
      setEnableQrCode(settings.formCustomization?.enableQrCode ?? true);
      setBoeLabel(settings.formCustomization?.renameFields?.boe || "BOE Number");
      setRemarksOptional(settings.formCustomization?.optionalFields?.includes("remarks") ?? true);
      setSettingsLoaded(true);
    }
  }, [settings, settingsLoaded]);

  async function handleSaveCompany() {
    setBusy(true);
    const ok = await updateSettings({
      companyName: companyName.trim(),
      companyAddress: companyAddress.trim(),
      companyContact: companyContact.trim(),
      logoUrl: logoUrl ? logoUrl.trim() : (settings?.logoUrl || ""),
    });
    setBusy(false);
    if (ok) {
      toast.success("Company Information saved.");
      // Do not remove from session storage so it persists when navigating back
      setLogoUrl("");
      setSettingsLoaded(false);
    }
  }

  async function handleSaveModules() {
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
      // Do not remove from session storage so it persists when navigating back
      setSettingsLoaded(false);
    }
  }

  async function handleAddOperator(e: React.FormEvent) {
    e.preventDefault();
    if (!opName.trim() || !opUsername.trim() || !opPasscode) {
      toast.error("Please fill in name, username and passcode.");
      return;
    }
    setBusy(true);
    const ok = await createOperator({
      name: opName.trim(),
      username: opUsername.trim(),
      passcode: opPasscode,
      role: opRole,
      tenantId: currentTenant?.id,
    });
    setBusy(false);
    if (ok) {
      setOpName("");
      setOpUsername("");
      setOpPasscode("");
      setOpRole("Gate Operator");
      window.sessionStorage.removeItem("admin_opName");
      window.sessionStorage.removeItem("admin_opUsername");
      window.sessionStorage.removeItem("admin_opPasscode");
      window.sessionStorage.removeItem("admin_opRole");
      toast.success("User registered successfully.");
    }
  }

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

    const headers = ["Ticket ID", "Vehicle", "Entry Time", "Status"];
    if (repModules.includes("Entry")) headers.push("Agent", "Cargo");
    if (repModules.includes("Billing")) headers.push("Invoice", "Payment");
    if (repModules.includes("Loading")) headers.push("Bay", "Loading End");
    if (repModules.includes("Exit")) headers.push("Exit Time");

    const rows = filtered.map(t => {
      const row = [t.id, t.vehicle, t.entryTime, t.status];
      if (repModules.includes("Entry")) row.push(t.agent, t.cargo);
      if (repModules.includes("Billing")) row.push(t.invoice || "", t.paymentStatus || "");
      if (repModules.includes("Loading")) row.push(t.bay, t.loadingEnd || "");
      if (repModules.includes("Exit")) row.push(t.exitTime || "");
      return row;
    });

    const csvContent = [headers.join(","), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `YARDFLOW_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel/CSV Report Generated successfully!");
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h2 className="text-2xl font-black text-slate-800">Client Admin Dashboard</h2>
        <p className="text-xs text-slate-400">
          Manage your company settings, users, modules, and billing configurations.
        </p>
      </div>

      <div className="flex border-b border-slate-200 text-xs overflow-x-auto">
        {[
          { id: "company", icon: Building, label: "Company Information" },
          { id: "users", icon: Users, label: "User Management" },
          { id: "modules", icon: Settings, label: "Module Customization" },
          { id: "license", icon: CreditCard, label: "License Info" },
          { id: "reports", icon: Download, label: "Reports" }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 py-3 px-4 font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            <tab.icon size={15} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "company" && (
        <Panel className="p-8 bg-white shadow-sm max-w-3xl">
          <h3 className="mb-6 text-base font-extrabold text-slate-800">Update Company Details</h3>
          <div className="flex flex-col gap-5">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">COMPANY NAME</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">COMPANY LOGO (UPLOAD FILE)</label>
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setLogoUrl(reader.result as string);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm"
              />
              {(logoUrl || settings?.logoUrl) && <img src={logoUrl || settings?.logoUrl} alt="Logo Preview" className="h-12 mt-2 object-contain" />}
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">COMPANY ADDRESS</label>
              <textarea value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm min-h-20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">CONTACT DETAILS</label>
              <input value={companyContact} onChange={e => setCompanyContact(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm" />
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={handleSaveCompany} disabled={busy} className="rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-blue-700">
                Save Company Information
              </button>
            </div>
          </div>
        </Panel>
      )}

      {activeTab === "users" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel className="p-8 bg-white shadow-sm h-fit">
            <h3 className="mb-6 text-base font-extrabold text-slate-800">Create Users</h3>
            <form onSubmit={handleAddOperator} className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">NAME</label>
                <input value={opName} onChange={e => setOpName(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">USERNAME</label>
                <input value={opUsername} onChange={e => setOpUsername(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">PASSWORD</label>
                <input type="password" value={opPasscode} onChange={e => setOpPasscode(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">ASSIGN ROLE</label>
                <select value={opRole} onChange={e => setOpRole(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <p className="text-[10px] text-slate-500 mt-2">
                  Permissions automatically granted for {opRole}:
                  <br />
                  <span className="font-bold text-blue-600">
                    {permissions.find(p => p.role === opRole)?.allowedPaths.join(", ") || "None"}
                  </span>
                </p>
              </div>
              {currentTenant && tenantOperators.length >= currentTenant.seats && (
                <div className="text-xs text-red-500 font-bold mt-2">Seat limit reached ({currentTenant.seats}).</div>
              )}
              <div className="mt-2">
                <button type="submit" disabled={busy || (currentTenant && tenantOperators.length >= currentTenant.seats) as boolean} className="rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                  Save User
                </button>
              </div>
            </form>
          </Panel>

          <Panel className="p-8 bg-white shadow-sm h-fit">
            <h3 className="mb-6 text-base font-extrabold text-slate-800">Current Users ({tenantOperators.length} / {currentTenant?.seats || '∞'})</h3>
            <div className="flex flex-col gap-3">
              {tenantOperators.map((op) => (
                <div key={op.id} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{op.name}</h4>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{op.username} • {op.role}</p>
                  </div>
                  {op.username !== "admin" && (
                    <button onClick={() => deleteOperator(op.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "modules" && (
        <Panel className="p-8 bg-white shadow-sm max-w-3xl">
          <h3 className="mb-6 text-base font-extrabold text-slate-800">Module Customization</h3>
          
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

            <div className="flex justify-end mt-4">
              <button onClick={handleSaveModules} disabled={busy} className="rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-blue-700">
                Save Configuration
              </button>
            </div>
          </div>
        </Panel>
      )}

      {activeTab === "license" && (
        <Panel className="p-8 bg-white shadow-sm max-w-xl">
          <h3 className="mb-6 text-base font-extrabold text-slate-800 flex items-center gap-2">
            <Briefcase className="text-blue-600" size={20} />
            License Information
          </h3>
          
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
              
              <p className="text-xs text-slate-400 text-center mt-4">
                To upgrade your plan, increase seats, or extend expiry, please contact the Super Admin.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No active license found.</p>
          )}
        </Panel>
      )}

      {activeTab === "reports" && (
        <Panel className="p-8 bg-white shadow-sm max-w-3xl">
          <h3 className="mb-6 text-base font-extrabold text-slate-800">Generate Custom Reports</h3>
          
          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">START DATE (OPTIONAL)</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">END DATE (OPTIONAL)</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm" />
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

            <div className="flex justify-end border-t pt-6 mt-2">
              <button onClick={handleGenerateReport} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm">
                <Download size={16} /> Download Excel / CSV
              </button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
