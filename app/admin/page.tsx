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
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/pill";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { durationBetween } from "@/lib/format";
import type { TenantProfile } from "@/lib/types";
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

function ProfileRow({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-6 py-4">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
        <div
          className={cn(
            "mt-0.5 whitespace-pre-line text-sm font-semibold text-slate-800",
            mono && "font-mono",
          )}
        >
          {value?.trim() ? value : <span className="font-sans font-normal text-slate-400">—</span>}
        </div>
      </div>
    </div>
  );
}

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

  // Superadmin sees every onboarded client's company profile here instead of a
  // single own-company card. Fetched from a superadmin-only endpoint.
  const isSuperadmin = currentUser?.role === "superadmin";
  const [clientProfiles, setClientProfiles] = useState<TenantProfile[] | null>(null);

  useEffect(() => {
    if (!isSuperadmin) return;
    let cancelled = false;
    fetch("/api/tenants/profiles", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { profiles: [] }))
      .then((d) => {
        if (!cancelled) setClientProfiles(d.profiles ?? []);
      })
      .catch(() => {
        if (!cancelled) setClientProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperadmin]);

  // Once company details are saved, the profile shows as a read-only ID card.
  // The admin can reopen it for editing via the Edit button (editingCompany).
  const companyLocked = !!settings?.companyName?.trim();
  const [editingCompany, setEditingCompany] = useState(false);

  // Reopen the saved profile for editing, pre-filling the form from current
  // settings so the admin edits the live values (not a stale sessionStorage copy).
  function startEditCompany() {
    setCompanyName(settings?.companyName || "");
    setCompanyAddress(settings?.companyAddress || "");
    setCompanyContact(settings?.companyContact || "");
    setCompanyGst(settings?.companyGst || "");
    setLogoUrl("");
    setEditingCompany(true);
  }

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
      setEditingCompany(false);
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
        isSuperadmin ? (
          /* ---- Superadmin: every onboarded client's company profile ---- */
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-800">Onboarded Client Companies</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
                {clientProfiles?.length ?? 0}
              </span>
            </div>
            {clientProfiles === null ? (
              <Panel className="p-8 text-sm text-slate-400">Loading client companies…</Panel>
            ) : clientProfiles.length === 0 ? (
              <Panel className="p-8 text-sm text-slate-400">No client companies onboarded yet.</Panel>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {clientProfiles.map((p) => {
                  const hasProfile = !!p.companyName?.trim();
                  return (
                    <Panel key={p.id} className="p-0 overflow-hidden bg-white shadow-sm">
                      {/* Header band */}
                      <div className="flex items-center gap-4 bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-5">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-white/95">
                          {p.logoUrl ? (
                            <img src={p.logoUrl} alt="Company Logo" className="h-full w-full object-contain p-1.5" />
                          ) : (
                            <Building size={28} className="text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">
                            Registered Company Profile
                          </div>
                          <h4 className="mt-0.5 truncate text-lg font-black text-white">
                            {p.companyName?.trim() || p.name}
                          </h4>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-200">
                              {p.plan}
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                p.status === "Active"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-rose-500/15 text-rose-300",
                              )}
                            >
                              {p.status}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Detail rows */}
                      <div className="divide-y divide-slate-100">
                        <ProfileRow icon={<MapPin size={17} />} label="Company Address" value={p.companyAddress} />
                        <ProfileRow icon={<Phone size={17} />} label="Contact Details" value={p.companyContact} />
                        <ProfileRow icon={<Receipt size={17} />} label="GST Number" value={p.companyGst} mono />
                        <ProfileRow
                          icon={<Building size={17} />}
                          label="Domain / Seats"
                          value={`${p.domain?.trim() || "—"} • ${p.seats} seat${p.seats === 1 ? "" : "s"}`}
                        />
                      </div>

                      {!hasProfile && (
                        <div className="border-t border-slate-100 bg-amber-50 px-6 py-3 text-xs font-medium text-amber-700">
                          This client hasn't completed their company profile yet.
                        </div>
                      )}
                    </Panel>
                  );
                })}
              </div>
            )}
          </div>
        ) : companyLocked && !editingCompany ? (
          /* ---- Saved company profile (ID-card style, read-only until Edit) ---- */
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
              <button
                onClick={startEditCompany}
                className="ml-auto flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 transition-colors"
              >
                <Pencil size={13} /> Edit
              </button>
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
              This profile is printed on every gate, billing &amp; loading token. Use Edit to update it.
            </div>
          </Panel>
        ) : (
          /* ---- One-time setup form (editable until saved) ---- */
          <Panel className="p-8 bg-white shadow-sm max-w-3xl">
            <h3 className="mb-1 text-base font-extrabold text-slate-800">
              {editingCompany ? "Edit Company Profile" : "Set Up Company Profile"}
            </h3>
            <p className="mb-6 text-xs text-slate-400">
              These details print on every gate, billing &amp; loading token.
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
              <div className="flex items-center justify-end gap-3 mt-4">
                {editingCompany && (
                  <button
                    type="button"
                    onClick={() => setEditingCompany(false)}
                    disabled={busy}
                    className="rounded-lg border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
                <button onClick={handleSaveCompany} disabled={busy} className="rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                  {busy ? "Saving..." : editingCompany ? "Save Changes" : "Save Company Information"}
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
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove operator "${op.name}" (${op.username})? This cannot be undone.`)) {
                          deleteOperator(op.id);
                        }
                      }}
                      className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                    >
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
