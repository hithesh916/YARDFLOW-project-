"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

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
  ShieldCheck,
  Database,
  Building,
  Key,
  Users,
  Search,
  Calendar,
  Trash2,
  Plus,
  RefreshCw,
  Clock,
  Briefcase,
  AlertTriangle,
  Download,
  Settings,
  CheckCircle2,
  Ban,
  LayoutDashboard,
} from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/pill";
import { useStore } from "@/lib/store";
import { fmtDate } from "@/lib/format";
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

export default function SuperAdminHub() {
  const tenants = useStore((s) => s.tenants);
  const operators = useStore((s) => s.operators);
  const createTenant = useStore((s) => s.createTenant);
  const extendTenant = useStore((s) => s.extendTenant);
  const deleteTenant = useStore((s) => s.deleteTenant);
  const updateTenantConfig = useStore((s) => s.updateTenantConfig);
  const setTenantLicense = useStore((s) => s.setTenantLicense);
  const setViewTenant = useStore((s) => s.setViewTenant);
  const router = useRouter();

  const [activeTab, setActiveTab] = useSessionStorage<"tenants" | "registry" | "backend">("superadmin_activeTab", "tenants");
  const [search, setSearch] = useSessionStorage("superadmin_search", "");
  const [filterPlan, setFilterPlan] = useSessionStorage<string>("superadmin_filterPlan", "All Plans");
  const [filterStatus, setFilterStatus] = useSessionStorage<string>("superadmin_filterStatus", "All Statuses");

  // Onboarding form state
  const [name, setName] = useSessionStorage("superadmin_name", "");
  const [domain, setDomain] = useSessionStorage("superadmin_domain", "");
  const [plan, setPlan] = useSessionStorage<"Enterprise Plan" | "Professional Plan" | "Basic Plan">("superadmin_plan", "Enterprise Plan");
  const [seats, setSeats] = useSessionStorage("superadmin_seats", 5);
  const [modules, setModules] = useSessionStorage<string[]>("superadmin_modules", ["dashboard", "entry", "billing", "loading", "exit", "reports"]);
  const [adminUsername, setAdminUsername] = useSessionStorage("superadmin_adminUsername", "");
  const [adminPassword, setAdminPassword] = useSessionStorage("superadmin_adminPassword", "");
  const [busy, setBusy] = useState(false);
  const [openOnboard, setOpenOnboard] = useSessionStorage("superadmin_openOnboard", false);
  const [successCreds, setSuccessCreds] = useState<{username: string, password: string, domain: string} | null>(null);

  const [editTenantId, setEditTenantId] = useSessionStorage<string | null>("superadmin_editTenantId", null);
  const [editSeats, setEditSeats] = useSessionStorage("superadmin_editSeats", 5);
  const [editModules, setEditModules] = useSessionStorage<string[]>("superadmin_editModules", []);

  // Delete confirmation modal state
  const [deleteTenantId, setDeleteTenantId] = useState<string | null>(null);
  const deleteTenant_ = deleteTenantId ? tenants.find((t) => t.id === deleteTenantId) : null;

  // License management modal state
  const [manageTenantId, setManageTenantId] = useState<string | null>(null);
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<"Active" | "Expired" | "Suspended">("Active");
  const manageTenant = manageTenantId ? tenants.find((t) => t.id === manageTenantId) : null;

  function openManage(t: typeof tenants[number]) {
    setManageTenantId(t.id);
    setLicenseExpiry(t.expiryDate);
    setLicenseStatus(t.status);
  }

  // Whole-day difference between the expiry date and today (negative = already expired)
  function daysUntil(dateStr: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  }

  async function handleLicenseSave(e: React.FormEvent) {
    e.preventDefault();
    if (!manageTenantId || !licenseExpiry) {
      toast.error("Please choose a valid expiry date.");
      return;
    }
    setBusy(true);
    const ok = await setTenantLicense(manageTenantId, licenseExpiry, licenseStatus);
    setBusy(false);
    if (ok) setManageTenantId(null);
  }

  const AVAILABLE_MODULES = [
    { id: "dashboard", label: "Dashboard" },
    { id: "entry", label: "Entry Gate" },
    { id: "billing", label: "Billing" },
    { id: "loading", label: "Loading" },
    { id: "exit", label: "Exit Gate" },
    { id: "reports", label: "Reports" },
  ];

  function downloadTenantsCsv() {
    const headers = ["ID", "Company Name", "Domain", "Plan", "Status", "License Key", "Expiry Date", "Onboarded Date", "Seats"];
    const rows = tenants.map(t => [
      t.id,
      t.name,
      t.domain,
      t.plan,
      t.status,
      t.licenseKey,
      t.expiryDate,
      t.onboardedDate,
      t.seats
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `yardflow_tenants_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Tenants list exported to CSV.");
  }

  async function handleOnboard(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !adminUsername.trim() || !adminPassword.trim()) {
      toast.error("Please fill in company name and admin credentials.");
      return;
    }
    setBusy(true);
    const ok = await createTenant({
      name: name.trim(),
      domain: domain.trim(),
      plan,
      seats: Number(seats) || 5,
      modules,
      adminUsername: adminUsername.trim(),
      adminPassword: adminPassword.trim(),
    });
    setBusy(false);
    if (ok) {
      setSuccessCreds({ username: adminUsername.trim(), password: adminPassword.trim(), domain: domain.trim() });
      setName("");
      setDomain("");
      setSeats(5);
      setModules(["dashboard", "entry", "billing", "loading", "exit", "reports"]);
      setAdminUsername("");
      setAdminPassword("");
      setPlan("Enterprise Plan");
      setOpenOnboard(false);

      window.sessionStorage.removeItem("superadmin_name");
      window.sessionStorage.removeItem("superadmin_domain");
      window.sessionStorage.removeItem("superadmin_seats");
      window.sessionStorage.removeItem("superadmin_modules");
      window.sessionStorage.removeItem("superadmin_adminUsername");
      window.sessionStorage.removeItem("superadmin_adminPassword");
      window.sessionStorage.removeItem("superadmin_plan");
      window.sessionStorage.removeItem("superadmin_openOnboard");
    }
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editTenantId) return;
    setBusy(true);
    const ok = await updateTenantConfig(editTenantId, editSeats, editModules);
    setBusy(false);
    if (ok) {
      setEditTenantId(null);
      window.sessionStorage.removeItem("superadmin_editTenantId");
      window.sessionStorage.removeItem("superadmin_editSeats");
      window.sessionStorage.removeItem("superadmin_editModules");
    }
  }

  async function handleExtend(id: string) {
    const ok = await extendTenant(id, 1);
    if (ok) {
      toast.success("License extended by 1 Year.");
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    const ok = await deleteTenant(id);
    setBusy(false);
    setDeleteTenantId(null);
    if (ok) {
      toast.success("Tenant client removed successfully.");
    }
  }

  // Filter clients list
  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.domain.toLowerCase().includes(search.toLowerCase()) ||
      t.licenseKey.toLowerCase().includes(search.toLowerCase());

    const matchesPlan = filterPlan === "All Plans" || t.plan === filterPlan;
    const matchesStatus = filterStatus === "All Statuses" || t.status === filterStatus;

    return matchesSearch && matchesPlan && matchesStatus;
  });

  const activeLicenses = tenants.filter((t) => t.status === "Active").length;
  const expiredLicenses = tenants.filter((t) => t.status !== "Active").length;
  const totalSeats = tenants.reduce((sum, t) => sum + t.seats, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* SaaS Controller Title & Onboard Button */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <span className="rounded bg-blue-50 px-2.5 py-1 text-[10px] font-black tracking-wider text-blue-700 uppercase">
            SYSTEM OWNER PORTAL
          </span>
          <h2 className="mt-2 text-2xl font-black text-slate-800">
            Yardflow SaaS Controller
          </h2>
          <p className="text-xs text-slate-400">
            Onboard tenant companies, manage licenses, allocate operator seat counts, and monitor server capacity.
          </p>
        </div>

        {/* Onboard New Client dialog trigger */}
        <Dialog open={openOnboard} onOpenChange={setOpenOnboard}>
          <DialogTrigger
            render={
              <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700">
                <Plus size={16} /> Onboard New Client
              </button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Onboard Tenant Company</DialogTitle>
              <DialogDescription>
                Allocate a dedicated license slot and customize operator seats for the client terminal.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleOnboard} className="flex flex-col gap-4 py-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Company Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Apex Terminal Group"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  Primary Domain <span className="font-normal text-slate-400">(Optional)</span>
                </label>
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g. apex-terminals.com"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Subscription Plan</label>
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="Enterprise Plan">Enterprise Plan</option>
                    <option value="Professional Plan">Professional Plan</option>
                    <option value="Basic Plan">Basic Plan</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Operator Seat Cap</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={seats}
                    onChange={(e) => setSeats(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold text-slate-600">Enabled Modules</label>
                <div className="grid grid-cols-3 gap-2">
                  {AVAILABLE_MODULES.map((mod) => (
                    <label key={mod.id} className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2 cursor-pointer hover:bg-slate-100">
                      <input 
                        type="checkbox" 
                        checked={modules.includes(mod.id)}
                        onChange={(e) => {
                          if (e.target.checked) setModules([...modules, mod.id]);
                          else setModules(modules.filter((m) => m !== mod.id));
                        }}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span className="text-xs font-semibold text-slate-700">{mod.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Admin Username</label>
                  <input
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="e.g. admin"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Admin Password</label>
                  <input
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    type="password"
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
              <DialogFooter className="mt-4">
                <DialogClose
                  render={
                    <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                      Cancel
                    </button>
                  }
                />
                <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                  {busy ? "Onboarding..." : "Confirm Onboard"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Success Credentials Modal */}
        <Dialog open={!!successCreds} onOpenChange={(o) => !o && setSuccessCreds(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 size={20} /> Client Successfully Onboarded
              </DialogTitle>
              <DialogDescription>
                The new tenant environment is ready. Share these initial administrator credentials securely with the client.
              </DialogDescription>
            </DialogHeader>
            {successCreds && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-5 mt-2 flex flex-col gap-3">
                <div className="flex justify-between border-b border-emerald-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">Username</span>
                  <span className="text-sm font-extrabold text-slate-800">{successCreds.username}</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-xs font-bold text-slate-500 uppercase">Password</span>
                  <span className="text-sm font-extrabold text-slate-800 font-mono">{successCreds.password}</span>
                </div>
              </div>
            )}
            <DialogFooter className="mt-2">
              <button onClick={() => setSuccessCreds(null)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
                Done
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Config Modal */}
        <Dialog open={!!editTenantId} onOpenChange={(o) => !o && setEditTenantId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Tenant Configuration</DialogTitle>
              <DialogDescription>
                Update operator seat limits and enable/disable modules.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditSave} className="flex flex-col gap-4 py-2">
              <div>
                <label className="mb-2 block text-xs font-bold text-slate-600">Enabled Modules</label>
                <div className="grid grid-cols-3 gap-2">
                  {AVAILABLE_MODULES.map((mod) => (
                    <label key={mod.id} className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2 cursor-pointer hover:bg-slate-100">
                      <input 
                        type="checkbox" 
                        checked={editModules.includes(mod.id)}
                        onChange={(e) => {
                          if (e.target.checked) setEditModules([...editModules, mod.id]);
                          else setEditModules(editModules.filter((m) => m !== mod.id));
                        }}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span className="text-xs font-semibold text-slate-700">{mod.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Operator Seat Cap</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={editSeats}
                  onChange={(e) => setEditSeats(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <DialogFooter className="mt-4">
                <DialogClose
                  render={
                    <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                      Cancel
                    </button>
                  }
                />
                <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                  {busy ? "Saving..." : "Save Changes"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Tenant Confirmation Modal */}
        <Dialog open={!!deleteTenantId} onOpenChange={(o) => !o && setDeleteTenantId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this tenant?</DialogTitle>
              <DialogDescription>
                {deleteTenant_
                  ? `"${deleteTenant_.name}" will be permanently removed. This cannot be undone.`
                  : "This client will be permanently removed. This cannot be undone."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <DialogClose
                render={
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                }
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => deleteTenantId && handleDelete(deleteTenantId)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {busy ? "Deleting..." : "Delete Tenant"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* License Management Modal — opened by clicking a tenant card */}
        <Dialog open={!!manageTenantId} onOpenChange={(o) => !o && setManageTenantId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Briefcase size={18} className="text-blue-600" /> License Management
              </DialogTitle>
              <DialogDescription>
                Full license details for this tenant. Adjust the validity period or access
                status — the client's data is always preserved.
              </DialogDescription>
            </DialogHeader>

            {manageTenant && (() => {
              const remaining = daysUntil(licenseExpiry);
              const dateExpired = remaining < 0;
              const accessBlocked = licenseStatus !== "Active" || dateExpired;
              return (
                <form onSubmit={handleLicenseSave} className="flex flex-col gap-4 py-2">
                  {/* Read-only identity card */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-extrabold text-sm border border-blue-100">
                        {manageTenant.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-slate-800 truncate">{manageTenant.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{manageTenant.domain || "No domain set"}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="font-bold text-slate-400 uppercase tracking-wider">Tenant ID</span>
                        <span className="font-mono font-bold text-slate-600">{manageTenant.id}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="font-bold text-slate-400 uppercase tracking-wider">Plan</span>
                        <span className="font-bold text-purple-700">{manageTenant.plan}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="font-bold text-slate-400 uppercase tracking-wider">License Key</span>
                        <span className="font-mono font-bold text-slate-600">{manageTenant.licenseKey}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="font-bold text-slate-400 uppercase tracking-wider">Seats</span>
                        <span className="font-bold text-slate-600">{manageTenant.seats}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="font-bold text-slate-400 uppercase tracking-wider">Onboarded</span>
                        <span className="font-bold text-slate-600">{manageTenant.onboardedDate}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="font-bold text-slate-400 uppercase tracking-wider">Modules</span>
                        <span className="font-bold text-slate-600">{(manageTenant.modules || []).length} enabled</span>
                      </div>
                    </div>
                  </div>

                  {/* Live access indicator */}
                  <div className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs font-bold ${
                    accessBlocked
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}>
                    {accessBlocked ? <Ban size={15} /> : <CheckCircle2 size={15} />}
                    {accessBlocked
                      ? `Portal access is BLOCKED for this tenant${dateExpired && licenseStatus === "Active" ? " (license date expired)" : ""}. Their data is retained.`
                      : `Portal access is ACTIVE — ${remaining} day${remaining === 1 ? "" : "s"} remaining.`}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-600">License Expiry Date</label>
                      <input
                        type="date"
                        value={licenseExpiry}
                        onChange={(e) => setLicenseExpiry(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-600">Access Status</label>
                      <select
                        value={licenseStatus}
                        onChange={(e) => setLicenseStatus(e.target.value as "Active" | "Expired" | "Suspended")}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="Active">Active — full access</option>
                        <option value="Suspended">Suspended — access blocked</option>
                        <option value="Expired">Expired — access blocked</option>
                      </select>
                    </div>
                  </div>

                  <p className="text-[11px] leading-relaxed text-slate-400">
                    Set <span className="font-bold text-slate-500">Active</span> with a future date to grant
                    access (the client can then log in, operate, and download). A past date or a
                    Suspended/Expired status locks the portal while keeping every record intact until you
                    restore access.
                  </p>

                  <DialogFooter className="mt-2">
                    <button
                      type="button"
                      onClick={() => setManageTenantId(null)}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                      {busy ? "Saving..." : "Save License"}
                    </button>
                  </DialogFooter>
                </form>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs list matching Screenshot 1 */}
      <div className="flex border-b border-slate-200 text-xs">
        <button
          onClick={() => setActiveTab("tenants")}
          className={`flex items-center gap-2 py-3 px-4 font-bold border-b-2 transition-colors ${
            activeTab === "tenants"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Building size={15} /> TENANT CLIENTS
        </button>
        <button
          onClick={() => setActiveTab("registry")}
          className={`flex items-center gap-2 py-3 px-4 font-bold border-b-2 transition-colors ${
            activeTab === "registry"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <ShieldCheck size={15} /> SUPER-ADMIN REGISTRY & SECURITY
        </button>
        <button
          onClick={() => setActiveTab("backend")}
          className={`flex items-center gap-2 py-3 px-4 font-bold border-b-2 transition-colors ${
            activeTab === "backend"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Database size={15} /> DATABASES & BACKEND HUB
        </button>
      </div>

      {activeTab === "tenants" && (
        <>
          {/* Stats Cards Row matching Screenshot 1 */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Panel className="flex items-center gap-4 p-5 bg-white shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Building size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">TOTAL CLIENTS</p>
                <p className="text-2xl font-black text-slate-800 mt-0.5">{tenants.length}</p>
              </div>
            </Panel>
            <Panel className="flex items-center gap-4 p-5 bg-white shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <ShieldCheck size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">ACTIVE LICENSES</p>
                <p className="text-2xl font-black text-slate-800 mt-0.5">{activeLicenses}</p>
              </div>
            </Panel>
            <Panel className="flex items-center gap-4 p-5 bg-white shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <AlertTriangle size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">EXPIRED/SUSPENDED</p>
                <p className="text-2xl font-black text-slate-800 mt-0.5">{expiredLicenses}</p>
              </div>
            </Panel>
            <Panel className="flex items-center gap-4 p-5 bg-white shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Users size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">SAAS OPERATORS</p>
                <p className="text-xl font-bold text-slate-800 mt-0.5">
                  <span className="text-2xl font-black leading-none">{totalSeats}</span>
                  <span className="text-xs text-slate-400 font-bold ml-1.5">Total Seats</span>
                </p>
              </div>
            </Panel>
          </div>

          {/* Directory Search & Filters bar */}
          <Panel className="p-4 bg-white shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by company name, domain, license key..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2.5 pl-9 pr-3 text-xs outline-none focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <select
                value={filterPlan}
                onChange={(e) => setFilterPlan(e.target.value)}
                className="flex-1 md:flex-initial rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-300"
              >
                <option value="All Plans">All Plans</option>
                <option value="Enterprise Plan">Enterprise Plan</option>
                <option value="Professional Plan">Professional Plan</option>
                <option value="Basic Plan">Basic Plan</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 md:flex-initial rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-300"
              >
                <option value="All Statuses">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Expired">Expired</option>
                <option value="Suspended">Suspended</option>
              </select>
              <button
                onClick={() => {
                  setSearch("");
                  setFilterPlan("All Plans");
                  setFilterStatus("All Statuses");
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                title="Reset Filters"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={downloadTenantsCsv}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-extrabold text-slate-600 hover:bg-slate-50 transition-colors h-9"
                title="Download CSV"
              >
                <Download size={14} /> Export CSV
              </button>
            </div>
          </Panel>

          {/* Directory Listings */}
          <Panel className="p-6 bg-white shadow-sm">
            <h3 className="mb-5 flex items-center gap-2 text-[13px] font-black uppercase tracking-wider text-slate-400">
              ACTIVE TENANT DIRECTORY
            </h3>

            {filteredTenants.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No tenant clients match your search criteria.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {filteredTenants.map((t) => {
                  const isActive = t.status === "Active";
                  const isExpired = t.status === "Expired";
                  return (
                    <div
                      key={t.id}
                      onClick={() => openManage(t)}
                      className="flex cursor-pointer flex-col justify-between gap-4 rounded-xl border border-slate-100 p-5 transition-shadow hover:border-blue-200 hover:shadow-sm sm:flex-row sm:items-center bg-slate-50/20"
                      title="Click to manage license"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-extrabold text-sm border border-blue-100">
                          {t.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-extrabold text-slate-800">{t.name}</h4>
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-black tracking-wider text-slate-400 uppercase">
                              {t.id}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{t.domain}</p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <Calendar size={13} /> Onboarded: {t.onboardedDate}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={13} /> Expiry: {t.expiryDate}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users size={13} /> Seats: {t.seats}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Plan and License detail */}
                      <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap">
                        <div className="rounded-xl border border-slate-100 bg-white p-3.5 text-center min-w-[130px]">
                          <p className="text-[9px] font-black tracking-wider text-purple-700 uppercase">
                            {t.plan}
                          </p>
                          <div className="mt-1.5 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800">
                            <span className={`h-2 w-2 rounded-full ${isActive ? "bg-emerald-500" : isExpired ? "bg-red-500" : "bg-amber-500"}`}></span>
                            {t.status}
                          </div>
                          <p className="mt-1 font-mono text-[9px] text-slate-400 font-bold">
                            {t.licenseKey}
                          </p>
                        </div>

                        {/* License Extensions & Delete */}
                        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewTenant(t.id);
                              router.push("/");
                            }}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg border-2 border-blue-500 bg-blue-500 px-3 py-2 text-xs font-extrabold text-white hover:bg-blue-600 transition-colors"
                            title={`Open ${t.name}'s dashboard (read-only)`}
                          >
                            <LayoutDashboard size={14} /> View Dashboard
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditTenantId(t.id);
                              setEditSeats(t.seats);
                              setEditModules(t.modules || []);
                            }}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            <Settings size={14} /> Edit Config
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExtend(t.id);
                            }}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            Extend
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTenantId(t.id);
                            }}
                            className="rounded-lg border-2 border-rose-100 bg-white p-2 text-rose-500 hover:bg-rose-50 transition-colors"
                            title="Delete Tenant"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </>
      )}

      {activeTab === "registry" && (
        <Panel className="p-6 bg-white">
          <h3 className="mb-4 flex items-center gap-2 text-[15px] font-extrabold text-slate-800">
            <ShieldCheck className="text-purple-600" size={18} />
            Super-Admin Registry &amp; Credentials
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed mb-6">
            The platform owner/super-admin registry is a master credentials class defined internally to authenticate system deployments.
          </p>
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-600">
                <Key size={18} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">PLATFORM OWNER ID</p>
                <p className="text-sm font-extrabold text-slate-800 mt-0.5">superadmin</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg">
              <span>PASSCODE KEY: super123</span>
            </div>
          </div>
        </Panel>
      )}

      {activeTab === "backend" && (
        <Panel className="p-6 bg-white">
          <h3 className="mb-4 flex items-center gap-2 text-[15px] font-extrabold text-slate-800">
            <Database className="text-slate-600" size={18} />
            Active Databases &amp; Backend Hub
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed mb-4">
            Yardflow SaaS uses a local transactional JSON database. In production, this layer is configured to route to Postgres clusters dynamically via Prisma ORM.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/30">
              <p className="text-xs font-extrabold text-slate-700 mb-1">State Database Store</p>
              <code className="text-[11px] font-mono bg-slate-100 text-slate-600 p-1.5 rounded block mt-1 overflow-x-auto">
                /transactions/ledger.json
              </code>
            </div>
            <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/30">
              <p className="text-xs font-extrabold text-slate-700 mb-1">Audit Trail log</p>
              <code className="text-[11px] font-mono bg-slate-100 text-slate-600 p-1.5 rounded block mt-1 overflow-x-auto">
                /transactions/activity-log.json
              </code>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
