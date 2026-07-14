"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/pill";
import { useStore } from "@/lib/store";
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

const PAGES = [
  { key: "/", label: "Dashboard", desc: "Main analytics" },
  { key: "/entry", label: "Entry Gate", desc: "Vehicle registry and print" },
  { key: "/loading", label: "Loading Approval", desc: "Cargo verification" },
  { key: "/billing", label: "Billing Approval", desc: "Invoice matching" },
  { key: "/exit", label: "Exit Gate", desc: "Final inspections" },
  { key: "/admin", label: "Admin Console", desc: "System user creation" },
];

export default function AdminPage() {
  const operators = useStore((s) => s.operators);
  const permissions = useStore((s) => s.permissions);
  const settings = useStore((s) => s.settings);
  const tickets = useStore((s) => s.tickets);
  const updateSettings = useStore((s) => s.updateSettings);
  const reset = useStore((s) => s.reset);

  const createOperator = useStore((s) => s.createOperator);
  const deleteOperator = useStore((s) => s.deleteOperator);
  const updatePermissions = useStore((s) => s.updatePermissions);

  const [activeTab, setActiveTab] = useState<"directory" | "grid" | "reports" | "receipt">("directory");

  // Terminal Settings
  const [terminalName, setTerminalName] = useState(settings?.terminalName || "");
  const [maxActiveBays, setMaxActiveBays] = useState(settings?.maxActiveBays || 20);
  const [timezone, setTimezone] = useState(settings?.timezone || "");
  const [busy, setBusy] = useState(false);

  // New Operator Form
  const [opName, setOpName] = useState("");
  const [opUsername, setOpUsername] = useState("");
  const [opPasscode, setOpPasscode] = useState("");
  const [opRole, setOpRole] = useState("Gate Operator");

  function downloadOperatorsCsv() {
    const headers = ["ID", "Name", "Username ID", "Passcode PIN", "Role"];
    const rows = operators.map(op => [
      op.id,
      op.name,
      op.username,
      op.passcode,
      op.role
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `yardflow_operators_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Operators registry exported to CSV.");
  }

  function triggerCsvDownload(filename: string, headers: string[], rows: any[][]) {
    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(val => `"${String(val ?? "").replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportEntrySheet() {
    const headers = ["Ticket ID", "Token Number", "Vehicle Number", "BOE Number", "Carrier Agent", "Remarks", "Entry Timestamp"];
    const rows = tickets.map(t => [
      t.id,
      t.serial,
      t.vehicle,
      t.boe,
      t.agent,
      t.remarks || "",
      t.entryTime
    ]);
    triggerCsvDownload(`yardflow_entry_gate_${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
    toast.success("Entry Gate data sheet downloaded.");
  }

  function exportBillingSheet() {
    const billed = tickets.filter(t => t.invoice !== null || t.paymentStatus);
    const headers = ["Ticket ID", "Token Number", "Vehicle Number", "Invoice Number", "BOE Number", "Payment Status", "Entry Timestamp"];
    const rows = billed.map(t => [
      t.id,
      t.serial,
      t.vehicle,
      t.invoice || "N/A",
      t.boe,
      t.paymentStatus || "Waiting",
      t.entryTime
    ]);
    triggerCsvDownload(`yardflow_billing_approval_${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
    toast.success("Billing Approval data sheet downloaded.");
  }

  function exportLoadingSheet() {
    const loaded = tickets.filter(t => t.loadingEnd !== null);
    const headers = ["Ticket ID", "Token Number", "Vehicle Number", "Assigned Bay", "Work Order / BOE", "Loading Completed Timestamp"];
    const rows = loaded.map(t => [
      t.id,
      t.serial,
      t.vehicle,
      t.bay || "N/A",
      t.boe,
      t.loadingEnd
    ]);
    triggerCsvDownload(`yardflow_loading_approval_${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
    toast.success("Loading Approval data sheet downloaded.");
  }

  function exportExitSheet() {
    const exited = tickets.filter(t => t.exitTime !== null);
    const headers = ["Ticket ID", "Token Number", "Vehicle Number", "BOE / Work Order", "Carrier Agent", "Cargo Detail", "Exit Timestamp"];
    const rows = exited.map(t => [
      t.id,
      t.serial,
      t.vehicle,
      t.boe,
      t.agent || "N/A",
      t.cargo || "N/A",
      t.exitTime
    ]);
    triggerCsvDownload(`yardflow_exit_gate_${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
    toast.success("Exit Gate data sheet downloaded.");
  }

  useEffect(() => {
    if (settings) {
      setTerminalName(settings.terminalName);
      setMaxActiveBays(settings.maxActiveBays);
      setTimezone(settings.timezone);
    }
  }, [settings]);

  async function handleSaveSettings() {
    if (!terminalName.trim()) {
      toast.error("Please enter a terminal name.");
      return;
    }
    setBusy(true);
    const ok = await updateSettings({
      terminalName: terminalName.trim(),
      maxActiveBays: Number(maxActiveBays) || 20,
      timezone: timezone.trim() || "Asia/Kolkata",
    });
    setBusy(false);
    if (ok) {
      toast.success("Terminal settings saved.");
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
    });
    setBusy(false);
    if (ok) {
      setOpName("");
      setOpUsername("");
      setOpPasscode("");
      toast.success("Operator registered successfully.");
    }
  }

  async function handleDeleteOperator(id: string) {
    const ok = await deleteOperator(id);
    if (ok) {
      toast.success("Operator deleted.");
    }
  }

  async function togglePermission(role: string, path: string) {
    const perm = permissions.find((p) => p.role === role);
    let allowedPaths = perm ? [...perm.allowedPaths] : [];

    // Dashboard path toggling also binds reports
    const extraPaths = path === "/" ? ["/reports"] : [];

    if (allowedPaths.includes(path)) {
      // Toggle OFF
      allowedPaths = allowedPaths.filter((p) => p !== path && !extraPaths.includes(p));
    } else {
      // Toggle ON
      allowedPaths.push(path);
      extraPaths.forEach((p) => {
        if (!allowedPaths.includes(p)) allowedPaths.push(p);
      });
    }

    await updatePermissions(role, allowedPaths);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Title Banner */}
      <div>
        <h2 className="text-2xl font-black text-slate-800">Admin Console</h2>
        <p className="text-xs text-slate-400">
          Terminal administration desk. Add operators, configure station paths, and edit terminal details.
        </p>
      </div>

      {/* Tabs list matching screenshots */}
      <div className="flex border-b border-slate-200 text-xs">
        <button
          onClick={() => setActiveTab("directory")}
          className={`flex items-center gap-2 py-3 px-4 font-bold border-b-2 transition-colors ${
            activeTab === "directory"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Users size={15} /> Operator Directory
        </button>
        <button
          onClick={() => setActiveTab("grid")}
          className={`flex items-center gap-2 py-3 px-4 font-bold border-b-2 transition-colors ${
            activeTab === "grid"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Grid size={15} /> Role Permissions Grid
        </button>
        <button
          onClick={() => setActiveTab("reports")}
          className={`flex items-center gap-2 py-3 px-4 font-bold border-b-2 transition-colors ${
            activeTab === "reports"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Settings size={15} /> Token Registry &amp; Report Gen
        </button>
        <button
          onClick={() => setActiveTab("receipt")}
          className={`flex items-center gap-2 py-3 px-4 font-bold border-b-2 transition-colors ${
            activeTab === "receipt"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Receipt size={15} /> Receipt Config
        </button>
      </div>

      {/* Operator Directory Tab */}
      {activeTab === "directory" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
          {/* Operator Registration Form */}
          <div className="flex flex-col gap-6">
            <Panel className="p-8 bg-white shadow-sm">
              <h3 className="mb-1 text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Plus size={18} className="text-blue-600" />
                Register Operator Account
              </h3>
              <p className="mb-6 text-xs text-slate-400">
                Add active terminal operators to the YARDFLOW network.
              </p>

              <form onSubmit={handleAddOperator} className="flex flex-col gap-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">DISPLAY NAME</label>
                  <input
                    value={opName}
                    onChange={(e) => setOpName(e.target.value)}
                    placeholder="e.g. Richard Hendricks"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">USERNAME (OPERATOR ID)</label>
                  <input
                    value={opUsername}
                    onChange={(e) => setOpUsername(e.target.value)}
                    placeholder="e.g. richard"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">PASSCODE / PIN</label>
                  <input
                    type="password"
                    value={opPasscode}
                    onChange={(e) => setOpPasscode(e.target.value)}
                    placeholder="e.g. 12345"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">OPERATOR ROLE</label>
                  <select
                    value={opRole}
                    onChange={(e) => setOpRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Register Account
                  </button>
                </div>
              </form>
            </Panel>
          </div>

          {/* Operator Directory List */}
          <Panel className="p-6 bg-white shadow-sm h-fit">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-[13px] font-black uppercase tracking-wider text-slate-400">
                OPERATOR REGISTRY
              </h3>
              <button
                onClick={downloadOperatorsCsv}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-extrabold text-slate-600 hover:bg-slate-50 transition-colors h-7"
                title="Download CSV"
              >
                <Download size={12} /> Export CSV
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mb-5">
              Manage operator credentials and assigned job permissions.
            </p>

            <div className="flex flex-col gap-3">
              {operators.map((op) => (
                <div
                  key={op.id}
                  className="flex items-center justify-between border-b border-slate-50 pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-800">{op.name}</h4>
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
                      <span className="font-mono text-blue-600 font-bold">{op.username}</span>
                      <span>·</span>
                      <span className="font-mono">{op.passcode}</span>
                      <span>·</span>
                      <span className="font-bold text-slate-500 uppercase">{op.role}</span>
                    </div>
                  </div>
                  {/* Delete button (cannot delete the initial seed admin to prevent lockout) */}
                  {op.username !== "admin" && (
                    <button
                      onClick={() => handleDeleteOperator(op.id)}
                      className="rounded-lg border border-rose-100 p-2 text-rose-500 hover:bg-rose-50 transition-colors"
                      title="Delete operator"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* Role Permissions Grid Tab */}
      {activeTab === "grid" && (
        <Panel className="p-6 bg-white shadow-sm overflow-x-auto">
          <div className="mb-6">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <ShieldCheck size={18} className="text-blue-600" />
              Permission Settings &amp; Access Matrix
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Toggle screen access settings per role. Unauthorized pages will immediately be blocked and hidden from Sidebar menus.
            </p>
          </div>

          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="py-3 px-4">OPERATIONAL ROLE</th>
                {PAGES.map((p) => (
                  <th key={p.key} className="py-3 px-4">
                    <p className="font-bold text-slate-700">{p.label}</p>
                    <p className="font-normal text-[9px] text-slate-400 mt-0.5 leading-none">{p.desc}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-bold">
              {ROLES.map((role) => {
                const perm = permissions.find((p) => p.role === role);
                const allowedPaths = perm ? perm.allowedPaths : [];
                return (
                  <tr key={role} className="hover:bg-slate-50/30">
                    <td className="py-4 px-4">
                      <p className="text-slate-800 font-extrabold">{role}</p>
                      <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                        {allowedPaths.filter((p) => p !== "/reports").length} of {PAGES.length} pages enabled
                      </p>
                    </td>
                    {PAGES.map((p) => {
                      const isEnabled = allowedPaths.includes(p.key);
                      // Admin always has all permissions to avoid lockout
                      const isDisabled = role === "Administrator";
                      return (
                        <td key={p.key} className="py-4 px-4">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              disabled={isDisabled}
                              onChange={() => togglePermission(role, p.key)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50"></div>
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Registry & Settings Tab */}
      {activeTab === "reports" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Terminal settings */}
          <Panel className="p-6 bg-white shadow-sm">
            <h3 className="mb-1 text-[15px] font-extrabold text-slate-800">
              Terminal Configuration
            </h3>
            <p className="mb-5 text-xs text-slate-400">
              Personalize settings for this browser terminal slot.
            </p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Terminal Name
                </label>
                <input
                  value={terminalName}
                  onChange={(e) => setTerminalName(e.target.value)}
                  maxLength={60}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">
                    Active-bay Capacity
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={maxActiveBays}
                    onChange={(e) => setMaxActiveBays(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">
                    Operations Timezone
                  </label>
                  <input
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    maxLength={50}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="mt-2 border-t border-slate-100 pt-4">
                <button
                  onClick={handleSaveSettings}
                  disabled={busy}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </Panel>

          {/* Database Actions */}
          <Panel className="p-6 bg-white shadow-sm h-fit">
            <h3 className="mb-1 text-[15px] font-extrabold text-slate-800">
              Clear Yard Data
            </h3>
            <p className="mb-5 text-xs text-slate-400">
              Wipe out transactional data, resetting all live logs to empty.
            </p>
            <div className="rounded-xl border border-rose-100 bg-rose-50/20 p-5">
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                Clearing will wipe out active ticket registries and reset daily counters.
              </p>
              <Dialog>
                <DialogTrigger
                  render={
                    <button className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700">
                      <RotateCcw size={14} /> Reset Yard Data
                    </button>
                  }
                />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Clear all yard data?</DialogTitle>
                    <DialogDescription>
                      This erases the ledger and audit logs, returning to a clean state. This cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose
                      render={
                        <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                          Cancel
                        </button>
                      }
                    />
                    <DialogClose
                      render={
                        <button
                          onClick={async () => {
                            setBusy(true);
                            await reset();
                            setBusy(false);
                          }}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
                        >
                          Clear
                        </button>
                      }
                    />
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </Panel>
          
          {/* Station spreadsheet downloads */}
          <Panel className="p-6 bg-white shadow-sm lg:col-span-2">
            <h3 className="mb-1 text-[15px] font-extrabold text-slate-800">
              Download Checkpoint Station Sheets
            </h3>
            <p className="mb-6 text-xs text-slate-400">
              Export isolated operational spreadsheets for individual checkpoint gates.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Entry Gate Card */}
              <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/20 flex flex-col justify-between h-36">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">ENTRY GATE</p>
                  <p className="text-xl font-black text-slate-800 mt-1">{tickets.length} Check-ins</p>
                </div>
                <button
                  onClick={exportEntrySheet}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors h-9"
                >
                  <Download size={13} /> Entry Sheet
                </button>
              </div>

              {/* Billing Card */}
              <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/20 flex flex-col justify-between h-36">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">BILLING APPROVAL</p>
                  <p className="text-xl font-black text-slate-800 mt-1">
                    {tickets.filter(t => t.invoice !== null || t.paymentStatus).length} Invoices
                  </p>
                </div>
                <button
                  onClick={exportBillingSheet}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors h-9"
                >
                  <Download size={13} /> Billing Sheet
                </button>
              </div>

              {/* Loading Card */}
              <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/20 flex flex-col justify-between h-36">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">LOADING APPROVAL</p>
                  <p className="text-xl font-black text-slate-800 mt-1">
                    {tickets.filter(t => t.loadingEnd !== null).length} Dispatches
                  </p>
                </div>
                <button
                  onClick={exportLoadingSheet}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors h-9"
                >
                  <Download size={13} /> Loading Sheet
                </button>
              </div>

              {/* Exit Gate Card */}
              <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/20 flex flex-col justify-between h-36">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">EXIT GATE</p>
                  <p className="text-xl font-black text-slate-800 mt-1">
                    {tickets.filter(t => t.exitTime !== null).length} Clearances
                  </p>
                </div>
                <button
                  onClick={exportExitSheet}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors h-9"
                >
                  <Download size={13} /> Exit Sheet
                </button>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* Receipt Config Tab */}
      {activeTab === "receipt" && (
        <Panel className="p-16 text-center text-[13px] text-slate-400 bg-white shadow-sm">
          No additional receipt configurations needed. Edit custom headers directly in settings.
        </Panel>
      )}
    </div>
  );
}
