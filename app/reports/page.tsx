"use client";

import { useState } from "react";
import {
  Ban,
  CheckCircle2,
  Clock,
  DoorOpen,
  LogIn,
  ReceiptText,
  RotateCcw,
  ShieldAlert,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Pill, type Tone } from "@/components/pill";
import { useStore } from "@/lib/store";
import { timeAgo } from "@/lib/format";
import { STATUS_LABELS, type ActivityAction, type TicketStatus } from "@/lib/types";

const ACTION_META: Record<
  ActivityAction,
  { label: string; tone: Tone; icon: React.ComponentType<{ size?: number }> }
> = {
  entry: { label: "Gate entry", tone: "blue", icon: LogIn },
  loading_complete: { label: "Loading completed", tone: "green", icon: CheckCircle2 },
  loading_skip: { label: "Loading skipped", tone: "amber", icon: Ban },
  billing_complete: { label: "Billing completed", tone: "green", icon: ReceiptText },
  billing_skip: { label: "Billing skipped", tone: "amber", icon: Ban },
  exit: { label: "Exited yard", tone: "green", icon: DoorOpen },
  hold: { label: "Vehicle held", tone: "red", icon: ShieldAlert },
  alert_ack: { label: "Alert acknowledged", tone: "slate", icon: ShieldAlert },
  reset: { label: "Demo data reset", tone: "slate", icon: RotateCcw },
};

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

function sameDay(d1: string | null, d2: Date): boolean {
  if (!d1) return false;
  const first = new Date(d1);
  return (
    first.getFullYear() === d2.getFullYear() &&
    first.getMonth() === d2.getMonth() &&
    first.getDate() === d2.getDate()
  );
}

export default function ReportsPage() {
  const tickets = useStore((s) => s.tickets);
  const activity = useStore((s) => s.activity);
  const [dateRange, setDateRange] = useState<"today" | "week" | "all">("today");

  const now = new Date();

  const filteredTickets = tickets.filter((t) => {
    if (dateRange === "today") {
      return sameDay(t.entryTime, now);
    }
    if (dateRange === "week") {
      const d = new Date(t.entryTime);
      const diff = now.getTime() - d.getTime();
      return diff <= 7 * 24 * 60 * 60 * 1000;
    }
    return true; // "all"
  });

  const filteredActivity = activity.filter((a) => {
    if (dateRange === "today") {
      return sameDay(a.at, now);
    }
    if (dateRange === "week") {
      const d = new Date(a.at);
      const diff = now.getTime() - d.getTime();
      return diff <= 7 * 24 * 60 * 60 * 1000;
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
    const csvValue = (val: unknown) =>
      `"${String(val ?? "").replace(/"/g, '""')}"`;

    const headers = [
      "Ticket",
      "Vehicle",
      "BOE",
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

      {/* Activity feed */}
      <Panel className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-extrabold text-slate-800">
              Transaction Log
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Latest yard movements and audit trails. Export is ready for reconciliation.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Pill tone="slate">{filteredActivity.length} events</Pill>
            <button
              onClick={exportVisits}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Export CSV
            </button>
          </div>
        </div>
        {filteredActivity.length === 0 ? (
          <p className="text-sm text-slate-400">No activity recorded for this period.</p>
        ) : (
          <div className="flex flex-col">
            {filteredActivity.slice(0, 40).map((a) => {
              const meta = ACTION_META[a.action];
              const Icon = meta.icon;
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between border-b border-slate-100 py-3 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <Pill tone={meta.tone} className="h-8 w-8 justify-center p-0">
                      <Icon size={14} />
                    </Pill>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {meta.label}
                        {a.vehicle ? (
                          <span className="font-semibold text-slate-500">
                            {" "}
                            · {a.vehicle}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-px text-xs text-slate-400">
                        {a.serial
                          ? a.action === "entry"
                            ? `SN G-${String(a.serial).padStart(3, "0")}`
                            : a.action.startsWith("billing")
                              ? `SN B-${String(a.serial).padStart(3, "0")}`
                              : a.action.startsWith("loading")
                                ? `SN L-${String(a.serial).padStart(3, "0")}`
                                : `SN #${a.serial}`
                          : ""}
                        {a.serial && a.detail ? " · " : ""}
                        {a.detail ?? ""}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">{timeAgo(a.at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}
