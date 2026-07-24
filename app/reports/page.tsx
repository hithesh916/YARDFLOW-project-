"use client";

import { useState } from "react";
import {
  Clock,
  DoorOpen,
  LogIn,
  ShieldAlert,
  Package,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { useStore } from "@/lib/store";
import { getLocalDateString, fmtTime, pad } from "@/lib/format";
import { STATUS_LABELS, type Ticket, type TicketStatus } from "@/lib/types";

const STATUS_ORDER: TicketStatus[] = [
  "awaiting_billing",
  "awaiting_loading",
  "awaiting_exit",
  "exited",
  "held",
];
const STATUS_TONE: Record<TicketStatus, string> = {
  awaiting_loading: "bg-slate-400",
  awaiting_billing: "bg-amber-500",
  awaiting_exit: "bg-blue-600",
  exited: "bg-emerald-600",
  held: "bg-red-500",
};

function Metric({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <Panel className="flex flex-col gap-2.5 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-[0.05em] text-slate-500">
          {label}
        </span>
        <span className="text-slate-400">{icon}</span>
      </div>
      <div className="text-3xl font-extrabold text-slate-900">{value}</div>
      <div className="text-xs font-semibold text-slate-400">{sub}</div>
    </Panel>
  );
}

export default function ReportsPage() {
  const tickets = useStore((s) => s.tickets);
  const settings = useStore((s) => s.settings);
  const tz = settings?.timezone || "Asia/Kolkata";
  const [dateRange, setDateRange] = useState<"today" | "week" | "all">("today");
  const [showWorkOrders, setShowWorkOrders] = useState(false);

  const now = new Date();
  const todayStr = getLocalDateString(now, tz);

  const filteredTickets = tickets.filter((t) => {
    if (dateRange === "today") {
      // Use the tenant timezone so "today" matches the server's day boundary and the
      // daily serial reset — not the viewer's browser timezone.
      return getLocalDateString(t.entryTime, tz) === todayStr;
    }
    if (dateRange === "week") {
      const d = new Date(t.entryTime);
      const diff = now.getTime() - d.getTime();
      // Guard against future-dated rows (diff < 0) so a clock-skewed entry can't slip in.
      return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
    }
    return true; // "all"
  });

  const enteredCount = filteredTickets.length;
  const exitedCount = filteredTickets.filter((t) => t.exitTime).length;
  const completed = filteredTickets.filter((t) => t.loadingEnd && t.entryTime);
  const avgLoad = completed.length
    ? Math.round(
        completed.reduce(
          (total, ticket) =>
            total +
            (new Date(ticket.loadingEnd as string).getTime() -
              new Date(ticket.entryTime).getTime()) /
              60000,
          0
        ) / completed.length
      )
    : 0;
  const held = filteredTickets.filter((t) => t.status === "held").length;

  const statusCounts = STATUS_ORDER.map((s) => ({
    status: s,
    count: filteredTickets.filter((t) => t.status === s).length,
  }));
  const maxStatus = Math.max(1, ...statusCounts.map((s) => s.count));

  const byAgent = Object.entries(
    filteredTickets.reduce<Record<string, number>>((acc, t) => {
      acc[t.agent] = (acc[t.agent] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxAgent = Math.max(1, ...byAgent.map(([, n]) => n));

  // Work-Order (BOE) rollup: group the filtered tickets by (BOE, business day) so a
  // recurring/shared BOE shows every vehicle/trip on it. Keyed by BOE + local date, so the
  // same BOE on different days lists as separate work orders (matching the daily trip reset).
  const workOrderGroups = Array.from(
    filteredTickets
      .reduce<Map<string, { boe: string; date: string; tickets: Ticket[] }>>((map, t) => {
        const date = getLocalDateString(t.entryTime, tz);
        const key = `${t.boe.trim().toUpperCase()}__${date}`;
        const g = map.get(key) ?? { boe: t.boe, date, tickets: [] };
        g.tickets.push(t);
        map.set(key, g);
        return map;
      }, new Map())
      .values(),
  )
    .map((g) => ({
      ...g,
      tickets: g.tickets
        .slice()
        .sort((a, b) => (a.boeVisit ?? 0) - (b.boeVisit ?? 0) || a.entryTime.localeCompare(b.entryTime)),
    }))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.tickets.length - a.tickets.length || a.boe.localeCompare(b.boe),
    );
  const sharedWorkOrders = workOrderGroups.filter((g) => g.tickets.length > 1).length;

  const ticketTokens = (t: Ticket) => {
    const out: string[] = [];
    if (t.serial > 0) out.push(`G-${pad(t.serial)}`);
    if (t.billingSerial) out.push(`B-${pad(t.billingSerial)}`);
    if (t.loadingSerial) out.push(`L-${pad(t.loadingSerial)}`);
    return out;
  };

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      awaiting_loading: "Loading queue",
      awaiting_billing: "Billing queue",
      awaiting_exit: "Exit queue",
      exited: "Exited",
      held: "Held",
    };
    return labels[status] || status;
  };

  function exportVisits() {
    const csvValue = (val: unknown) => {
      let s = String(val ?? "");
      // Neutralize spreadsheet formula injection: a cell starting with = + - @ (or a
      // tab/CR) is treated as a formula by Excel/Sheets. Prefix with a single quote.
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };

    const headers = [
      "Ticket",
      "Vehicle",
      "BOE",
      "Trip (BOE)",
      "Agent",
      "Status",
      "Entry time",
      "Loading complete",
      "Invoice",
      "Exit time",
    ];

    const rows = filteredTickets.map((t) => [
      t.id,
      t.vehicle,
      t.boe,
      t.boeVisit ?? "",
      t.agent,
      statusLabel(t.status),
      t.entryTime ? new Date(t.entryTime).toISOString() : "",
      t.loadingEnd ? new Date(t.loadingEnd).toISOString() : "",
      t.invoice || "",
      t.exitTime ? new Date(t.exitTime).toISOString() : "",
    ]);

    const content = [headers, ...rows]
      .map((row) => row.map(csvValue).join(","))
      .join("\n");

    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `yardflow-movement-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Movement log exported as CSV.");
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg w-fit text-xs font-bold border border-slate-200/55 dark:border-slate-800">
          <button
            onClick={() => setDateRange("today")}
            className={`px-4 py-2 rounded-md transition-colors ${
              dateRange === "today"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setDateRange("week")}
            className={`px-4 py-2 rounded-md transition-colors ${
              dateRange === "week"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setDateRange("all")}
            className={`px-4 py-2 rounded-md transition-colors ${
              dateRange === "all"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            All Time
          </button>
        </div>

        <button
          onClick={exportVisits}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
        >
          Export Movement Log CSV
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={dateRange === "today" ? "ENTRIES TODAY" : dateRange === "week" ? "ENTRIES THIS WEEK" : "TOTAL ENTRIES"}
          value={enteredCount}
          sub="Recorded at the gate"
          icon={<LogIn size={18} />}
        />
        <Metric
          label={dateRange === "today" ? "EXITS TODAY" : dateRange === "week" ? "EXITS THIS WEEK" : "TOTAL EXITS"}
          value={exitedCount}
          sub="Dispatches completed"
          icon={<DoorOpen size={18} />}
        />
        <Metric
          label="AVG. TURNAROUND"
          value={avgLoad ? `${avgLoad}m` : "—"}
          sub="Entry to loading completion"
          icon={<Clock size={18} />}
        />
        <Metric
          label="VEHICLES ON HOLD"
          value={held}
          sub={held > 0 ? "Needs supervisor review" : "No active exceptions"}
          icon={<ShieldAlert size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Status breakdown */}
        <Panel className="p-6">
          <h3 className="mb-5 text-[15px] font-extrabold text-slate-800">
            Pipeline Breakdown
          </h3>
          <div className="flex flex-col gap-4">
            {statusCounts.map(({ status, count }) => (
              <div key={status}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600">
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="font-bold text-slate-800">{count}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${STATUS_TONE[status]}`}
                    style={{ width: `${(count / maxStatus) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* By agent */}
        <Panel className="p-6">
          <h3 className="mb-5 text-[15px] font-extrabold text-slate-800">
            Movements by CHA / Agent
          </h3>
          <div className="flex flex-col gap-4">
            {byAgent.map(([agent, n]) => (
              <div key={agent}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600">{agent}</span>
                  <span className="font-bold text-slate-800">{n}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${(n / maxAgent) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Work-Order (BOE) rollup — every vehicle/trip grouped by BOE per day */}
      <Panel className="p-6">
        <button
          onClick={() => setShowWorkOrders((v) => !v)}
          className="flex w-full items-center justify-between text-left cursor-pointer"
        >
          <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-slate-800">
            <Package size={17} className="text-slate-500" />
            Work Orders (BOE)
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
              {workOrderGroups.length}
            </span>
            {sharedWorkOrders > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                {sharedWorkOrders} shared
              </span>
            )}
          </h3>
          {showWorkOrders ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </button>

        {showWorkOrders && (
          <div className="mt-4 flex flex-col gap-3 max-h-[520px] overflow-y-auto pr-1">
            {workOrderGroups.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">No work orders in this range.</p>
            )}
            {workOrderGroups.map((g) => (
              <div key={`${g.boe}__${g.date}`} className="rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-3.5 py-2">
                  <span className="flex items-center gap-2 text-[13px] font-extrabold text-slate-800 dark:text-slate-100">
                    {g.boe}
                    <span className="text-[11px] font-semibold text-slate-400">{g.date}</span>
                  </span>
                  <span className="rounded-full bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    {g.tickets.length} {g.tickets.length === 1 ? "vehicle" : "vehicles"}
                  </span>
                </div>
                <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
                  {g.tickets.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 px-3.5 py-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-500 dark:text-slate-400">
                          Trip {t.boeVisit ?? "—"}
                        </span>
                        <span className="truncate font-bold text-slate-800 dark:text-slate-100">
                          {t.createdSource === "billing" ? "Billing desk" : t.vehicle}
                        </span>
                        {ticketTokens(t).map((tok) => (
                          <span key={tok} className="shrink-0 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            {tok}
                          </span>
                        ))}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-slate-400">
                        <span>{STATUS_LABELS[t.status]}</span>
                        <span>{fmtTime(t.entryTime, tz)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
