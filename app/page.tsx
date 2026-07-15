"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  LogOut,
  ReceiptText,
  ShieldAlert,
  Truck,
} from "lucide-react";
import { Panel } from "@/components/panel";
import { Pill, type Tone } from "@/components/pill";
import { filterBySearch, useStore } from "@/lib/store";
import { pad } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Ticket } from "@/lib/types";

function avgMinutes(
  tickets: Ticket[],
  start: (t: Ticket) => string | null,
  end: (t: Ticket) => string | null,
): number | null {
  const spans = tickets
    .map((t) => {
      const s = start(t);
      const e = end(t);
      if (!s || !e) return null;
      return (new Date(e).getTime() - new Date(s).getTime()) / 60000;
    })
    .filter((n): n is number => n !== null && n >= 0);
  if (!spans.length) return null;
  return Math.round(spans.reduce((a, b) => a + b, 0) / spans.length);
}

function hm(mins: number): string {
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function Kpi({
  label,
  value,
  icon,
  sub,
  subTone = "slate",
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  sub: string;
  subTone?: "slate" | "red" | "green";
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
      <div
        className={cn(
          "text-xs font-semibold",
          subTone === "red" && "text-red-600",
          subTone === "green" && "text-emerald-600",
          subTone === "slate" && "text-slate-400",
        )}
      >
        {sub}
      </div>
    </Panel>
  );
}

export default function DashboardPage() {
  const tickets = useStore((s) => s.tickets);
  const search = useStore((s) => s.search);
  const alerts = useStore((s) => s.alerts);
  const ackAlert = useStore((s) => s.ackAlert);
  const settings = useStore((s) => s.settings);

  const filtered = filterBySearch(tickets, search);
  const currentLoading = filtered.filter(
    (t) => t.status === "awaiting_loading",
  ).length;
  const pendingBilling = filtered.filter(
    (t) => t.status === "awaiting_billing",
  ).length;
  const exitedToday = filtered.filter((t) => t.status === "exited").length;
  const waitingExit = filtered.filter(
    (t) => t.status === "awaiting_exit",
  ).length;
  const activeAlerts = alerts.filter((a) => !a.acknowledged);

  // Real, derived metrics (no hardcoded numbers).
  const avgLoad = avgMinutes(
    filtered,
    (t) => t.entryTime,
    (t) => t.loadingEnd,
  );
  const avgTurnaround = avgMinutes(
    filtered.filter((t) => t.status === "exited"),
    (t) => t.entryTime,
    (t) => t.exitTime,
  );

  const loadStatus: { label: string; tone: Tone } =
    currentLoading === 0
      ? { label: "CLEAR", tone: "slate" }
      : currentLoading <= 10
        ? { label: "STEADY", tone: "blue" }
        : { label: "BUSY", tone: "red" };

  const totalActive = currentLoading + pendingBilling + waitingExit;
  const flowPct = totalActive
    ? Math.round(((currentLoading * 0.5 + waitingExit) / totalActive) * 100)
    : 0;

  return (
    <>
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="PENDING BILLING"
          value={pad(pendingBilling)}
          icon={<ReceiptText size={18} />}
          sub={
            pendingBilling > 0
              ? `${pendingBilling} awaiting invoice`
              : "Queue clear"
          }
        />
        <Kpi
          label="CURRENT LOADING"
          value={currentLoading}
          icon={<Truck size={18} />}
          sub={avgLoad !== null ? `Avg load: ${hm(avgLoad)}` : "Avg load: —"}
        />
        <Kpi
          label="EXITED TODAY"
          value={exitedToday}
          icon={<CheckCircle2 size={18} />}
          sub={
            avgTurnaround !== null
              ? `Avg cycle: ${hm(avgTurnaround)}`
              : "No exits yet"
          }
          subTone={exitedToday > 0 ? "green" : "slate"}
        />
        <Kpi
          label="WAITING TO EXIT"
          value={waitingExit}
          icon={<Clock size={18} />}
          sub={waitingExit > 0 ? "Ready for dispatch" : "None waiting"}
        />
      </div>

      {/* Yard flow */}
      <Panel className="p-6">
        <div className="mb-9 flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold text-slate-800">
            Yard Flow
          </h2>
          <div className="flex gap-2">
            <span className="rounded-lg bg-slate-100 px-3 py-[7px] text-xs font-bold text-slate-600">
              Yard View
            </span>
            <span className="rounded-lg bg-slate-50 px-3 py-[7px] text-xs font-bold text-slate-300">
              Queue View
            </span>
          </div>
        </div>
        <div className="relative flex flex-col md:flex-row items-start md:items-start justify-between gap-8 md:gap-0 px-6 py-4 md:py-0">
          {/* Desktop horizontal connection line */}
          <div className="hidden md:block absolute left-6 right-6 top-[27px] h-1 rounded-full bg-slate-100" />
          <div
            className="hidden md:block absolute left-6 top-[27px] h-1 rounded-full bg-blue-600 transition-all duration-500"
            style={{ width: `${flowPct}%` }}
          />

          {/* Mobile vertical connection line */}
          <div className="md:hidden absolute top-6 bottom-6 left-[52px] w-1 rounded-full bg-slate-100" />
          <div
            className="md:hidden absolute top-6 left-[52px] w-1 rounded-full bg-blue-600 transition-all duration-500"
            style={{ height: `${flowPct}%` }}
          />

          <FlowStage
            tone={pendingBilling > 0 ? "active" : "dim"}
            icon={<ReceiptText size={22} />}
            l1="BILLING"
            l2={`${pendingBilling} PENDING`}
          />
          <FlowStage
            tone={currentLoading > 0 ? "active" : "mid"}
            icon={<Truck size={22} />}
            l1="LOADING"
            l2={`${currentLoading} ACTIVE`}
          />
          <FlowStage
            tone={waitingExit > 0 ? "active" : "dim"}
            icon={<LogOut size={22} />}
            l1="EXIT GATE"
            l2={`${waitingExit} WAITING`}
          />
        </div>
      </Panel>

      {/* Live status cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="p-5">
          <Pill tone={loadStatus.tone}>{loadStatus.label}</Pill>
          <p className="mt-3.5 text-[11px] text-slate-400">Avg Load Time</p>
          <p className="text-[22px] font-extrabold text-slate-900">
            {avgLoad !== null ? hm(avgLoad) : "—"}
          </p>
        </Panel>
        <Panel className="border-l-4 border-l-blue-600 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-800">
              Main Bay: Loading
            </h3>
            <Pill tone={loadStatus.tone}>{loadStatus.label}</Pill>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-slate-400">Bays Active</p>
              <p className="text-[22px] font-extrabold text-slate-900">
                {Math.min(currentLoading, settings.maxActiveBays)}/{settings.maxActiveBays}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-400">Turnaround</p>
              <p className="text-[22px] font-extrabold text-slate-900">
                {avgTurnaround !== null ? hm(avgTurnaround) : "—"}
              </p>
            </div>
          </div>
        </Panel>
        <Panel className="border-l-4 border-l-slate-300 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-800">
              Gate 2: Exit
            </h3>
            <Pill tone={waitingExit > 0 ? "blue" : "slate"}>
              {waitingExit > 0 ? "ACTIVE" : "CLEAR"}
            </Pill>
          </div>
          <p className="mt-3.5 text-[11px] text-slate-400">Ready for Exit</p>
          <p className="text-[22px] font-extrabold text-slate-900">
            {waitingExit} {waitingExit === 1 ? "truck" : "trucks"}
          </p>
        </Panel>
      </div>

      {/* Security alerts */}
      <div>
        <h2 className="mb-3 text-[15px] font-extrabold text-slate-800">
          Security Alerts
        </h2>
        {activeAlerts.length === 0 ? (
          <Panel className="p-6 text-center text-[13px] text-slate-400">
            No active alerts. Yard operating normally.
          </Panel>
        ) : (
          <div className="flex flex-col gap-3">
            {activeAlerts.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-6 rounded-xl bg-slate-900 p-5 text-white"
              >
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <ShieldAlert size={16} className="text-slate-300" />
                    <span className="text-[11px] font-extrabold tracking-[0.08em] text-slate-300">
                      SECURITY ALERT
                    </span>
                  </div>
                  <p className="max-w-[520px] text-[13px] leading-relaxed text-slate-200">
                    {a.message}
                  </p>
                  <button
                    onClick={() => ackAlert(a.id)}
                    className="mt-3.5 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
                  >
                    Acknowledge
                  </button>
                </div>
                <AlertTriangle size={40} className="text-red-400 opacity-40" />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function FlowStage({
  tone,
  icon,
  l1,
  l2,
}: {
  tone: "active" | "mid" | "dim";
  icon: React.ReactNode;
  l1: string;
  l2: string;
}) {
  return (
    <div className="relative z-[1] flex flex-row md:flex-col items-center md:items-center gap-4 md:gap-3 w-full md:w-auto">
      <div
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] z-[2]",
          tone === "active" && "bg-blue-600 text-white",
          tone === "mid" && "border border-slate-300 bg-white text-slate-700",
          tone === "dim" && "bg-slate-100 text-slate-400",
        )}
      >
        {icon}
      </div>
      <div className="rounded-lg border border-slate-200 px-4 py-2 text-left md:text-center flex-1 md:flex-none">
        <div className="text-xs font-extrabold tracking-wide text-slate-700">
          {l1}
        </div>
        <div className="text-[13px] font-bold text-blue-600">{l2}</div>
      </div>
    </div>
  );
}
