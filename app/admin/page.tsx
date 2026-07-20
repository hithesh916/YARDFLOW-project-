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
  Plus,
  Trash2,
  Building,
  ShieldCheck,
  Lock,
  MapPin,
  Phone,
  Receipt,
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

  // Only operators the admin actually created for THIS tenant count toward the
  // seat allowance. Seeded/global demo accounts (no tenantId) are never
  // attributed to a real tenant, and Administrator accounts (the admin
  // themselves) never consume a seat — the license seats are for operators the
  // admin generates, not the admin.
  const tenantOperators = operators.filter(o =>
    !!currentTenant &&
    o.tenantId === currentTenant.id &&
    o.role !== "Administrator" &&
    o.username !== "admin"
  );

  const [activeTab, setActiveTab] = useSessionStorage<"company" | "users">("admin_activeTab", "company");

  // Terminal Settings
  const [companyName, setCompanyName] = useSessionStorage("admin_companyName", "");
  const [companyAddress, setCompanyAddress] = useSessionStorage("admin_companyAddress", "");
  const [companyContact, setCompanyContact] = useSessionStorage("admin_companyContact", "");
  const [companyGst, setCompanyGst] = useSessionStorage("admin_companyGst", "");
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);

  // Once company details are saved, the profile is locked (read-only ID card).
  const companyLocked = !!settings?.companyName?.trim();

  // User Management
  const [opName, setOpName] = useSessionStorage("admin_opName", "");
  const [opUsername, setOpUsername] = useSessionStorage("admin_opUsername", "");
  const [opPasscode, setOpPasscode] = useSessionStorage("admin_opPasscode", "");
  const [opRole, setOpRole] = useSessionStorage("admin_opRole", "Gate Operator");

  const [settingsLoaded, setSettingsLoaded] = useSessionStorage("admin_settingsLoaded", false);

  useEffect(() => {
    if (settings && !settingsLoaded) {
      setCompanyName(settings.companyName || "");
      setCompanyAddress(settings.companyAddress || "");
      setCompanyContact(settings.companyContact || "");
      setCompanyGst(settings.companyGst || "");
      setSettingsLoaded(true);
    }
  }, [settings, settingsLoaded]);

  async function handleSaveCompany() {
    setBusy(true);
    const ok = await updateSettings({
      companyName: companyName.trim(),
      companyAddress: companyAddress.trim(),
      companyContact: companyContact.trim(),
      companyGst: companyGst.trim(),
      logoUrl: logoUrl === "removed" ? "" : (logoUrl ? logoUrl.trim() : (settings?.logoUrl || "")),
    });
    setBusy(false);
    if (ok) {
      toast.success("Company Information saved.");
      // Do not remove from session storage so it persists when navigating back
      setLogoUrl("");
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

return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h2 className="text-2xl font-black text-slate-800">Client Admin Dashboard</h2>
        <p className="text-xs text-slate-400">
          Manage your company settings and user accounts.
        </p>
      </div>

      <div className="flex border-b border-slate-200 text-xs overflow-x-auto">
        {[
          { id: "company", icon: Building, label: "Company Information" },
          { id: "users", icon: Users, label: "User Management" }
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
        companyLocked ? (
          /* ---- Locked company profile (ID-card style, read-only) ---- */
          <Panel className="p-0 overflow-hidden bg-white shadow-sm max-w-3xl">
            {/* Header band */}
            <div className="flex items-center gap-5 bg-gradient-to-r from-slate-800 to-slate-900 px-8 py-7">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-white/95">
                {settings?.logoUrl ? (
                  <img src={settings.logoUrl} alt="Company Logo" className="h-full w-full object-contain p-1.5" />
                ) : (
                  <Building size={34} className="text-slate-400" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">
                  Registered Company Profile
                </div>
                <h3 className="mt-0.5 truncate text-2xl font-black text-white">
                  {settings?.companyName}
                </h3>
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                  <ShieldCheck size={13} /> Verified &amp; Locked
                </div>
              </div>
            </div>

            {/* Detail rows */}
            <div className="divide-y divide-slate-100">
              <div className="flex items-start gap-3 px-8 py-5">
                <MapPin size={17} className="mt-0.5 shrink-0 text-slate-400" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Company Address</div>
                  <div className="mt-0.5 whitespace-pre-line text-sm font-semibold text-slate-800">
                    {settings?.companyAddress || <span className="font-normal text-slate-400">—</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 px-8 py-5">
                <Phone size={17} className="mt-0.5 shrink-0 text-slate-400" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact Details</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-800">
                    {settings?.companyContact || <span className="font-normal text-slate-400">—</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 px-8 py-5">
                <Receipt size={17} className="mt-0.5 shrink-0 text-slate-400" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GST Number</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-slate-800">
                    {settings?.companyGst || <span className="font-sans font-normal text-slate-400">—</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer note */}
            <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-8 py-4 text-xs font-medium text-slate-500">
              <Lock size={13} className="shrink-0" />
              This profile is locked and is printed on every gate, billing &amp; loading token.
            </div>
          </Panel>
        ) : (
          /* ---- One-time setup form (editable until saved) ---- */
          <Panel className="p-8 bg-white shadow-sm max-w-3xl">
            <h3 className="mb-1 text-base font-extrabold text-slate-800">Set Up Company Profile</h3>
            <p className="mb-6 text-xs text-slate-400">
              These details print on every token. Once saved, the profile is locked and can no longer be edited here.
            </p>
            <div className="flex flex-col gap-5">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">COMPANY NAME</label>
                <input value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">COMPANY LOGO (UPLOAD FILE)</label>
                <input
                  id="logo-upload"
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
                {(logoUrl !== "removed" && (logoUrl || settings?.logoUrl)) ? (
                  <div className="mt-2 flex flex-col items-start gap-2">
                    <img src={logoUrl || settings?.logoUrl} alt="Logo Preview" className="h-12 object-contain" />
                    <button
                      type="button"
                      onClick={() => {
                        setLogoUrl("removed");
                        const input = document.getElementById("logo-upload") as HTMLInputElement;
                        if (input) input.value = "";
                      }}
                      className="text-xs font-bold text-red-500 hover:text-red-700 hover:underline"
                    >
                      Remove Image
                    </button>
                  </div>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">COMPANY ADDRESS</label>
                <textarea value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm min-h-20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">CONTACT DETAILS</label>
                <input value={companyContact} onChange={e => setCompanyContact(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">GST NUMBER</label>
                <input value={companyGst} onChange={e => setCompanyGst(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-mono" />
              </div>
              <div className="flex items-center justify-between gap-3 mt-4">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600">
                  <Lock size={12} /> Locks after saving
                </span>
                <button onClick={handleSaveCompany} disabled={busy} className="rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                  Save Company Information
                </button>
              </div>
            </div>
          </Panel>
        )
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
    </div>
  );
}
