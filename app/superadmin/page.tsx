"use client";

import { useState } from "react";
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

  const [activeTab, setActiveTab] = useState<"tenants" | "registry" | "backend">("tenants");
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState<string>("All Plans");
  const [filterStatus, setFilterStatus] = useState<string>("All Statuses");

  // Onboarding form state
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [plan, setPlan] = useState<"Enterprise Plan" | "Professional Plan" | "Basic Plan">("Enterprise Plan");
  const [seats, setSeats] = useState(5);
  const [busy, setBusy] = useState(false);
  const [openOnboard, setOpenOnboard] = useState(false);

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
    if (!name.trim() || !domain.trim()) {
      toast.error("Please fill in company name and domain.");
      return;
    }
    setBusy(true);
    const ok = await createTenant({
      name: name.trim(),
      domain: domain.trim(),
      plan,
      seats: Number(seats) || 5,
    });
    setBusy(false);
    if (ok) {
      setName("");
      setDomain("");
      setSeats(5);
      setOpenOnboard(false);
    }
  }

  async function handleExtend(id: string) {
    const ok = await extendTenant(id, 1);
    if (ok) {
      toast.success("License extended by 1 Year.");
    }
  }

  async function handleDelete(id: string) {
    const ok = await deleteTenant(id);
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
                <label className="mb-1 block text-xs font-bold text-slate-600">Primary Domain</label>
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
                      className="flex flex-col justify-between gap-4 rounded-xl border border-slate-100 p-5 hover:shadow-sm sm:flex-row sm:items-center bg-slate-50/20"
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
                        <div className="flex gap-2 w-full sm:w-auto">
                          <button
                            onClick={() => handleExtend(t.id)}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg border-2 border-slate-200 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            Extend License
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="rounded-lg border-2 border-rose-100 bg-white p-2.5 text-rose-500 hover:bg-rose-50 transition-colors"
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
