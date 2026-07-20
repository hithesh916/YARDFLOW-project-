// Data layer — backed by a real database via Prisma (Phase 2). This replaces the
// original JSON file store. Every exported function keeps the exact same
// signature and return shape it had in the file-store version, so the 9 API
// routes and the client store are unaffected.
//
// Operational data (tickets, alerts, activity, counters, settings) lives under a
// single default workspace (DEFAULT_TENANT). tenants/operators/permissions are
// global (managed by the superadmin), exactly as before. Per-tenant isolation is
// a future query-filter change — the schema already carries tenantId.

import prisma from "./prisma";
import { buildSeed, pick, BAYS, CARGO } from "./seed";
import type {
  ActivityAction,
  ActivityEntry,
  Alert,
  OperatorAccount,
  RolePermission,
  SystemSettings,
  TenantClient,
  Ticket,
  TicketStatus,
  YardState,
} from "./types";

// All operational data lives under this workspace for now. Phase 3 swaps this
// for the authenticated user's tenantId.
const DEFAULT_TENANT = "default";
const ACTIVITY_LIMIT = 500;

const DEFAULT_SETTINGS: SystemSettings = {
  terminalName: "",
  maxActiveBays: 20,
  timezone: "Asia/Kolkata",
};

/* ---------- id + date helpers (unchanged behavior) ---------- */
function rid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getTodayString(timezone: string = "Asia/Kolkata", dateInput?: Date | string): string {
  try {
    const d = dateInput ? (typeof dateInput === "string" ? new Date(dateInput) : dateInput) : new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    return `${y}-${m}-${day}`;
  } catch {
    const d = dateInput ? (typeof dateInput === "string" ? new Date(dateInput) : dateInput) : new Date();
    return d.toISOString().split("T")[0];
  }
}

/* ---------- row -> domain mappers ---------- */
type TicketRow = Awaited<ReturnType<typeof prisma.ticket.findFirstOrThrow>>;
type AlertRow = Awaited<ReturnType<typeof prisma.alert.findFirstOrThrow>>;
type ActivityRow = Awaited<ReturnType<typeof prisma.activityEntry.findFirstOrThrow>>;
type TenantRow = Awaited<ReturnType<typeof prisma.tenant.findFirstOrThrow>>;
type OperatorRow = Awaited<ReturnType<typeof prisma.operator.findFirstOrThrow>>;
type PermissionRow = Awaited<ReturnType<typeof prisma.rolePermission.findFirstOrThrow>>;
type SettingsRow = Awaited<ReturnType<typeof prisma.settings.findFirstOrThrow>>;

function toTicket(r: TicketRow): Ticket {
  return {
    id: r.id,
    serial: r.serial,
    billingSerial: r.billingSerial ?? undefined,
    loadingSerial: r.loadingSerial ?? undefined,
    vehicle: r.vehicle,
    boe: r.boe,
    agent: r.agent,
    cargo: r.cargo,
    status: r.status as TicketStatus,
    bay: r.bay,
    remarks: r.remarks ?? undefined,
    entryTime: r.entryTime,
    loadingEnd: r.loadingEnd ?? null,
    invoice: r.invoice ?? null,
    exitTime: r.exitTime ?? null,
    holdReason: r.holdReason ?? null,
    paymentStatus: (r.paymentStatus ?? null) as Ticket["paymentStatus"],
    createdSource: (r.createdSource ?? null) as Ticket["createdSource"],
    billingAgent: r.billingAgent ?? null,
    billingRemarks: r.billingRemarks ?? null,
    billingTime: r.billingTime ?? null,
    loadingAgent: r.loadingAgent ?? null,
    loadingRemarks: r.loadingRemarks ?? null,
    manualGateToken: r.manualGateToken ?? undefined,
    manualBillingToken: r.manualBillingToken ?? undefined,
    workOrder: r.workOrder ?? null,
  };
}

function toAlert(r: AlertRow): Alert {
  return {
    id: r.id,
    message: r.message,
    acknowledged: r.acknowledged,
    createdAt: r.createdAt,
  };
}

function toActivity(r: ActivityRow): ActivityEntry {
  return {
    id: r.id,
    at: r.at,
    action: r.action as ActivityAction,
    ticketId: r.ticketId ?? undefined,
    serial: r.serial ?? undefined,
    vehicle: r.vehicle ?? undefined,
    detail: r.detail ?? undefined,
  };
}

function toTenant(r: TenantRow): TenantClient {
  return {
    id: r.id,
    name: r.name,
    domain: r.domain,
    licenseKey: r.licenseKey,
    plan: r.plan as TenantClient["plan"],
    status: r.status as TenantClient["status"],
    onboardedDate: r.onboardedDate,
    expiryDate: r.expiryDate,
    seats: r.seats,
    modules: (r.modules as string[]) ?? [],
  };
}

function toOperator(r: OperatorRow): OperatorAccount {
  return {
    id: r.id,
    name: r.name,
    username: r.username,
    passcode: r.passcode,
    role: r.role,
    tenantId: r.tenantId ?? undefined,
    isFirstLogin: r.isFirstLogin,
  };
}

function toPermission(r: PermissionRow): RolePermission {
  return {
    role: r.role,
    allowedPaths: (r.allowedPaths as string[]) ?? [],
  };
}

function toSettings(r: SettingsRow): SystemSettings {
  return {
    terminalName: r.terminalName,
    maxActiveBays: r.maxActiveBays,
    timezone: r.timezone,
    companyName: r.companyName ?? undefined,
    companyAddress: r.companyAddress ?? undefined,
    companyContact: r.companyContact ?? undefined,
    companyEmail: r.companyEmail ?? undefined,
    companyGst: r.companyGst ?? undefined,
    logoUrl: r.logoUrl ?? undefined,
    formCustomization: (r.formCustomization as SystemSettings["formCustomization"]) ?? undefined,
  };
}

/* ---------- lazy seed + daily reset ---------- */
// Mirrors the old file store's "auto-seed on first run": if the default
// workspace has no Settings row yet, plant the seed operators/permissions/
// settings/counter so the app works with zero manual setup.
let seedChecked = false;
async function ensureSeeded() {
  if (seedChecked) return;
  const existing = await prisma.settings.findUnique({ where: { tenantId: DEFAULT_TENANT } });
  if (!existing) {
    const seed = buildSeed();
    const tz = seed.settings?.timezone || "Asia/Kolkata";
    try {
      await prisma.$transaction([
        prisma.settings.upsert({
          where: { tenantId: DEFAULT_TENANT },
          update: {},
          create: { tenantId: DEFAULT_TENANT, ...seed.settings },
        }),
        prisma.counter.upsert({
          where: { tenantId: DEFAULT_TENANT },
          update: {},
          create: { tenantId: DEFAULT_TENANT, ...seed.counters, lastResetDate: getTodayString(tz) },
        }),
        ...seed.operators.map((o) =>
          prisma.operator.upsert({
            where: { id: o.id },
            update: {},
            create: {
              id: o.id,
              name: o.name,
              username: o.username,
              passcode: o.passcode,
              role: o.role,
              tenantId: o.tenantId ?? null,
              isFirstLogin: o.isFirstLogin ?? false,
            },
          }),
        ),
        ...seed.permissions.map((p) =>
          prisma.rolePermission.upsert({
            where: { role: p.role },
            update: {},
            create: { role: p.role, allowedPaths: p.allowedPaths },
          }),
        ),
      ]);
    } catch (e) {
      // A concurrent first request may have seeded already — that's fine.
      console.warn("ensureSeeded skipped (likely already seeded):", e);
    }
  }
  seedChecked = true;
}

// Lazy midnight reset, keyed on the tenant timezone — same semantics as the old
// checkAndTriggerDailyReset: wipe tickets/alerts and zero the three daily serials
// (boe is preserved) when the day rolls over.
async function checkDailyReset() {
  const [counter, settings] = await Promise.all([
    prisma.counter.findUnique({ where: { tenantId: DEFAULT_TENANT } }),
    prisma.settings.findUnique({ where: { tenantId: DEFAULT_TENANT } }),
  ]);
  if (!counter) return;
  const tz = settings?.timezone || "Asia/Kolkata";
  const todayStr = getTodayString(tz);

  if (!counter.lastResetDate) {
    await prisma.counter.update({ where: { tenantId: DEFAULT_TENANT }, data: { lastResetDate: todayStr } });
    return;
  }

  if (counter.lastResetDate !== todayStr) {
    console.log(`[DAILY RESET] Resetting yard data for new day: ${todayStr} (last: ${counter.lastResetDate})`);
    await prisma.$transaction([
      prisma.ticket.deleteMany({ where: { tenantId: DEFAULT_TENANT } }),
      prisma.alert.deleteMany({ where: { tenantId: DEFAULT_TENANT } }),
      prisma.counter.update({
        where: { tenantId: DEFAULT_TENANT },
        data: { serial: 0, billingSerial: 0, loadingSerial: 0, lastResetDate: todayStr },
      }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "reset",
          detail: `Automatic daily reset at midnight (${todayStr})`,
        },
      }),
    ]);
  }
}

// Run before every read/write, matching the old readLedger side effects.
async function prep() {
  await ensureSeeded();
  await checkDailyReset();
}

/* ---------- state assembly ---------- */
async function buildState(): Promise<YardState> {
  const [tickets, alerts, activity, settingsRow, tenants, operators, permissions] = await Promise.all([
    prisma.ticket.findMany({ where: { tenantId: DEFAULT_TENANT }, orderBy: [{ queuePos: "asc" }, { createdAt: "asc" }] }),
    prisma.alert.findMany({ where: { tenantId: DEFAULT_TENANT }, orderBy: { id: "asc" } }),
    prisma.activityEntry.findMany({ where: { tenantId: DEFAULT_TENANT }, orderBy: { at: "desc" }, take: ACTIVITY_LIMIT }),
    prisma.settings.findUnique({ where: { tenantId: DEFAULT_TENANT } }),
    prisma.tenant.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.operator.findMany({ orderBy: { id: "asc" } }),
    prisma.rolePermission.findMany(),
  ]);
  return {
    tickets: tickets.map(toTicket),
    alerts: alerts.map(toAlert),
    activity: activity.map(toActivity),
    settings: settingsRow ? toSettings(settingsRow) : { ...DEFAULT_SETTINGS },
    tenants: tenants.map(toTenant),
    operators: operators.map(toOperator),
    permissions: permissions.map(toPermission),
  };
}

// Interactive-transaction client type (for helpers used inside $transaction).
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function nextQueuePos(tx: Tx): Promise<number> {
  const agg = await tx.ticket.aggregate({ where: { tenantId: DEFAULT_TENANT }, _max: { queuePos: true } });
  return (agg._max.queuePos ?? 0) + 1;
}

/* ---------- public API ---------- */
export async function getState(): Promise<YardState> {
  await prep();
  return buildState();
}

export async function createTicket(input: {
  vehicle: string;
  boe?: string;
  agent?: string;
  cargo?: string;
  remarks?: string;
  createdSource?: "entry" | "billing";
}): Promise<{ state: YardState; ticket: Ticket | null }> {
  await prep();
  const created = await prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findUnique({ where: { tenantId: DEFAULT_TENANT } });
    const timezone = settings?.timezone || "Asia/Kolkata";
    const now = new Date();
    const todayStr = getTodayString(timezone, now);

    const allTickets = await tx.ticket.findMany({ where: { tenantId: DEFAULT_TENANT } });
    const todaySerials = allTickets
      .filter((t) => getTodayString(timezone, t.entryTime) === todayStr && t.createdSource !== "billing")
      .map((t) => t.serial);

    const serial = input.createdSource === "billing" ? 0 : todaySerials.length > 0 ? Math.max(...todaySerials) + 1 : 1;
    const datePart = todayStr.replace(/-/g, "");
    const id =
      input.createdSource === "billing"
        ? `B-${datePart}-${Math.floor(1000 + Math.random() * 9000)}`
        : `TK-${datePart}-${serial}`;

    const counter = await tx.counter.findUnique({ where: { tenantId: DEFAULT_TENANT } });
    const newBoe = (counter?.boe ?? 1000) + 1;
    await tx.counter.update({
      where: { tenantId: DEFAULT_TENANT },
      data: { boe: newBoe, ...(input.createdSource !== "billing" ? { serial } : {}) },
    });

    const queuePos = await nextQueuePos(tx);
    const ticket = await tx.ticket.create({
      data: {
        id,
        tenantId: DEFAULT_TENANT,
        queuePos,
        serial,
        vehicle: input.vehicle.trim().toUpperCase(),
        boe: input.boe?.trim() || `BOE-${Math.floor(10000 + Math.random() * 90000)}`,
        agent: input.agent?.trim() || "Unassigned",
        cargo: input.cargo?.trim() || pick(CARGO),
        status: "awaiting_billing",
        bay: pick(BAYS),
        remarks: input.remarks?.trim() || null,
        entryTime: now.toISOString(),
        loadingEnd: null,
        invoice: null,
        exitTime: null,
        holdReason: null,
        paymentStatus: "Not Paid",
        createdSource: input.createdSource || "entry",
      },
    });

    await tx.activityEntry.create({
      data: {
        id: rid(),
        tenantId: DEFAULT_TENANT,
        at: new Date().toISOString(),
        action: "entry",
        ticketId: ticket.id,
        serial: ticket.serial,
        vehicle: ticket.vehicle,
        detail: `${ticket.boe} · ${ticket.agent}`,
      },
    });
    return ticket;
  });

  const state = await buildState();
  return { state, ticket: created ? toTicket(created) : null };
}

export async function updateEntryForBillingTicket(
  id: string,
  extra: { vehicle: string; remarks?: string; agent?: string },
): Promise<YardState> {
  await prep();
  await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id } });
    if (t && t.tenantId === DEFAULT_TENANT && t.createdSource === "billing" && (!t.serial || t.serial === 0)) {
      const settings = await tx.settings.findUnique({ where: { tenantId: DEFAULT_TENANT } });
      const timezone = settings?.timezone || "Asia/Kolkata";
      const now = new Date();
      const todayStr = getTodayString(timezone, now);

      const allTickets = await tx.ticket.findMany({ where: { tenantId: DEFAULT_TENANT } });
      const todaySerials = allTickets
        .filter((tk) => getTodayString(timezone, tk.entryTime) === todayStr && tk.serial > 0)
        .map((tk) => tk.serial);
      const serial = todaySerials.length > 0 ? Math.max(...todaySerials) + 1 : 1;

      await tx.counter.update({ where: { tenantId: DEFAULT_TENANT }, data: { serial } });
      await tx.ticket.update({
        where: { id },
        data: {
          serial,
          vehicle: extra.vehicle.trim().toUpperCase(),
          entryTime: now.toISOString(),
          createdSource: "entry",
          ...(extra.remarks ? { remarks: extra.remarks.trim() } : {}),
          ...(extra.agent ? { agent: extra.agent.trim() } : {}),
        },
      });
      await tx.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "entry",
          ticketId: t.id,
          serial,
          vehicle: extra.vehicle.trim().toUpperCase(),
          detail: `Gate linked to pre-billed BOE: ${t.boe}`,
        },
      });
    }
  });
  return buildState();
}

export async function completeLoading(
  id: string,
  extra?: { boe?: string; workOrder?: string; agent?: string; remarks?: string; gateToken?: string; billingToken?: string },
): Promise<YardState> {
  await prep();
  await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id } });
    if (t && t.tenantId === DEFAULT_TENANT && (t.status === "awaiting_loading" || t.status === "awaiting_billing")) {
      const settings = await tx.settings.findUnique({ where: { tenantId: DEFAULT_TENANT } });
      const tz = settings?.timezone || "Asia/Kolkata";
      const todayStr = getTodayString(tz);

      const counter = await tx.counter.findUnique({ where: { tenantId: DEFAULT_TENANT } });
      let loadingSerial = counter?.loadingSerial ?? 0;

      // Belt-and-suspenders: recover the true max from today's tickets.
      const allTickets = await tx.ticket.findMany({ where: { tenantId: DEFAULT_TENANT } });
      const maxExistingLoading = allTickets
        .filter((tk) => tk.loadingSerial != null && getTodayString(tz, tk.loadingEnd || tk.entryTime) === todayStr)
        .reduce((max, tk) => Math.max(max, tk.loadingSerial!), 0);
      if (loadingSerial < maxExistingLoading) loadingSerial = maxExistingLoading;
      loadingSerial += 1;

      await tx.counter.update({ where: { tenantId: DEFAULT_TENANT }, data: { loadingSerial } });
      await tx.ticket.update({
        where: { id },
        data: {
          loadingSerial,
          status: "awaiting_exit",
          loadingEnd: new Date().toISOString(),
          ...(extra?.workOrder ? { workOrder: extra.workOrder } : {}),
          loadingAgent: extra?.agent ? extra.agent.trim() : t.billingAgent || t.agent,
          loadingRemarks: extra?.remarks ? extra.remarks.trim() : "",
          ...(extra?.gateToken ? { manualGateToken: extra.gateToken.trim() } : {}),
          ...(extra?.billingToken ? { manualBillingToken: extra.billingToken.trim() } : {}),
        },
      });
      await tx.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "loading_complete",
          ticketId: t.id,
          serial: t.serial,
          vehicle: t.vehicle,
        },
      });
    }
  });
  return buildState();
}

export async function skipLoading(id: string): Promise<YardState> {
  await prep();
  const t = await prisma.ticket.findUnique({ where: { id } });
  if (t && t.tenantId === DEFAULT_TENANT) {
    await prisma.$transaction(async (tx) => {
      const pos = await nextQueuePos(tx);
      await tx.ticket.update({ where: { id }, data: { queuePos: pos } });
      await tx.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "loading_skip",
          ticketId: t.id,
          serial: t.serial,
          vehicle: t.vehicle,
          detail: "Re-queued to back of line",
        },
      });
    });
  }
  return buildState();
}

export async function completeBilling(
  id: string,
  invoice: string,
  paymentStatus?: "Paid" | "Not Paid",
  extra?: { boe?: string; agent?: string; cargo?: string; remarks?: string },
): Promise<YardState> {
  await prep();
  await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id } });
    if (t && t.tenantId === DEFAULT_TENANT && t.status === "awaiting_billing") {
      const settings = await tx.settings.findUnique({ where: { tenantId: DEFAULT_TENANT } });
      const tz = settings?.timezone || "Asia/Kolkata";
      const todayStr = getTodayString(tz);

      const counter = await tx.counter.findUnique({ where: { tenantId: DEFAULT_TENANT } });
      let billingSerial = counter?.billingSerial ?? 0;

      const allTickets = await tx.ticket.findMany({ where: { tenantId: DEFAULT_TENANT } });
      const maxExisting = allTickets
        .filter((tk) => tk.billingSerial != null && getTodayString(tz, tk.billingTime || tk.entryTime) === todayStr)
        .reduce((max, tk) => Math.max(max, tk.billingSerial!), 0);
      if (billingSerial < maxExisting) billingSerial = maxExisting;
      billingSerial += 1;

      const nextInvoice = invoice.trim() || null;
      await tx.counter.update({ where: { tenantId: DEFAULT_TENANT }, data: { billingSerial } });
      await tx.ticket.update({
        where: { id },
        data: {
          billingSerial,
          status: "awaiting_loading",
          invoice: nextInvoice,
          paymentStatus: paymentStatus || "Paid",
          billingTime: new Date().toISOString(),
          billingAgent: extra?.agent ? extra.agent.trim() : t.agent,
          billingRemarks: extra?.remarks ? extra.remarks.trim() : "",
          ...(extra?.boe ? { boe: extra.boe } : {}),
          ...(extra?.cargo ? { cargo: extra.cargo } : {}),
        },
      });
      await tx.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "billing_complete",
          ticketId: t.id,
          serial: t.serial,
          vehicle: t.vehicle,
          detail: nextInvoice || "No invoice",
        },
      });
    }
  });
  return buildState();
}

export async function skipBilling(id: string): Promise<YardState> {
  await prep();
  const t = await prisma.ticket.findUnique({ where: { id } });
  if (t && t.tenantId === DEFAULT_TENANT) {
    await prisma.$transaction(async (tx) => {
      const pos = await nextQueuePos(tx);
      await tx.ticket.update({ where: { id }, data: { queuePos: pos } });
      await tx.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "billing_skip",
          ticketId: t.id,
          serial: t.serial,
          vehicle: t.vehicle,
          detail: "Re-queued to back of line",
        },
      });
    });
  }
  return buildState();
}

export async function permitExit(id: string): Promise<YardState> {
  await prep();
  const t = await prisma.ticket.findUnique({ where: { id } });
  if (t && t.tenantId === DEFAULT_TENANT && t.status === "awaiting_exit") {
    await prisma.$transaction([
      prisma.ticket.update({ where: { id }, data: { status: "exited", exitTime: new Date().toISOString() } }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "exit",
          ticketId: t.id,
          serial: t.serial,
          vehicle: t.vehicle,
          detail: t.invoice ?? undefined,
        },
      }),
    ]);
  }
  return buildState();
}

export async function holdVehicle(id: string, reason: string): Promise<YardState> {
  await prep();
  const t = await prisma.ticket.findUnique({ where: { id } });
  if (t && t.tenantId === DEFAULT_TENANT && t.status === "awaiting_exit") {
    const holdReason = reason.trim() || "Unspecified";
    await prisma.$transaction([
      prisma.ticket.update({ where: { id }, data: { status: "held", holdReason } }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "hold",
          ticketId: t.id,
          serial: t.serial,
          vehicle: t.vehicle,
          detail: holdReason,
        },
      }),
    ]);
  }
  return buildState();
}

export async function ackAlert(id: number): Promise<YardState> {
  await prep();
  const a = await prisma.alert.findUnique({ where: { id } });
  if (a && a.tenantId === DEFAULT_TENANT && !a.acknowledged) {
    await prisma.$transaction([
      prisma.alert.update({ where: { id }, data: { acknowledged: true } }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "alert_ack",
          detail: a.message,
        },
      }),
    ]);
  }
  return buildState();
}

export async function reset(): Promise<YardState> {
  const seed = buildSeed();
  const tz = seed.settings?.timezone || "Asia/Kolkata";
  const todayStr = getTodayString(tz);
  await prisma.$transaction([
    prisma.ticket.deleteMany({ where: { tenantId: DEFAULT_TENANT } }),
    prisma.alert.deleteMany({ where: { tenantId: DEFAULT_TENANT } }),
    prisma.activityEntry.deleteMany({ where: { tenantId: DEFAULT_TENANT } }),
    prisma.tenant.deleteMany({}),
    prisma.operator.deleteMany({}),
    prisma.rolePermission.deleteMany({}),
    prisma.settings.upsert({
      where: { tenantId: DEFAULT_TENANT },
      update: {
        terminalName: seed.settings.terminalName,
        maxActiveBays: seed.settings.maxActiveBays,
        timezone: seed.settings.timezone,
        companyName: null,
        companyAddress: null,
        companyContact: null,
        companyEmail: null,
        companyGst: null,
        logoUrl: null,
        formCustomization: undefined,
      },
      create: { tenantId: DEFAULT_TENANT, ...seed.settings },
    }),
    prisma.counter.upsert({
      where: { tenantId: DEFAULT_TENANT },
      update: { serial: 0, billingSerial: 0, loadingSerial: 0, boe: seed.counters.boe, lastResetDate: todayStr },
      create: { tenantId: DEFAULT_TENANT, ...seed.counters, lastResetDate: todayStr },
    }),
    ...seed.operators.map((o) =>
      prisma.operator.create({
        data: {
          id: o.id,
          name: o.name,
          username: o.username,
          passcode: o.passcode,
          role: o.role,
          tenantId: o.tenantId ?? null,
          isFirstLogin: o.isFirstLogin ?? false,
        },
      }),
    ),
    ...seed.permissions.map((p) =>
      prisma.rolePermission.create({ data: { role: p.role, allowedPaths: p.allowedPaths } }),
    ),
    prisma.activityEntry.create({
      data: {
        id: rid(),
        tenantId: DEFAULT_TENANT,
        at: new Date().toISOString(),
        action: "reset",
        detail: "Demo data reset",
      },
    }),
  ]);
  return buildState();
}

export async function updateSettings(settings: Partial<SystemSettings>): Promise<YardState> {
  await prep();
  const cur = await prisma.settings.findUnique({ where: { tenantId: DEFAULT_TENANT } });
  const base = cur ? toSettings(cur) : { ...DEFAULT_SETTINGS };

  const data: Record<string, unknown> = {
    terminalName: settings.terminalName?.trim() || base.terminalName,
    maxActiveBays: Number(settings.maxActiveBays) || base.maxActiveBays,
    timezone: settings.timezone?.trim() || base.timezone,
  };
  // Only touch optional fields the caller actually provided.
  const optional: (keyof SystemSettings)[] = [
    "companyName",
    "companyAddress",
    "companyContact",
    "companyEmail",
    "companyGst",
    "logoUrl",
    "formCustomization",
  ];
  for (const key of optional) {
    if (key in settings) data[key] = settings[key] ?? null;
  }

  await prisma.settings.upsert({
    where: { tenantId: DEFAULT_TENANT },
    update: data,
    create: {
      tenantId: DEFAULT_TENANT,
      terminalName: data.terminalName as string,
      maxActiveBays: data.maxActiveBays as number,
      timezone: data.timezone as string,
      companyName: (data.companyName as string | null) ?? null,
      companyAddress: (data.companyAddress as string | null) ?? null,
      companyContact: (data.companyContact as string | null) ?? null,
      companyEmail: (data.companyEmail as string | null) ?? null,
      companyGst: (data.companyGst as string | null) ?? null,
      logoUrl: (data.logoUrl as string | null) ?? null,
      formCustomization: (data.formCustomization as SystemSettings["formCustomization"]) ?? undefined,
    },
  });
  return buildState();
}

/* ---------- SaaS Tenant Management ---------- */
export async function createTenant(input: {
  name: string;
  domain: string;
  plan: "Enterprise Plan" | "Professional Plan" | "Basic Plan";
  seats: number;
  modules: string[];
  adminUsername?: string;
  adminPassword?: string;
}): Promise<YardState> {
  await prep();
  const tenantId = `ten-${Date.now()}`;
  const dateStr = new Date().toISOString().split("T")[0];
  const expDate = new Date();
  expDate.setFullYear(expDate.getFullYear() + 1);
  const expiryStr = expDate.toISOString().split("T")[0];
  const key = `YF-${input.name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}-${new Date().getFullYear()}`;

  await prisma.$transaction(async (tx) => {
    await tx.tenant.create({
      data: {
        id: tenantId,
        name: input.name,
        domain: input.domain,
        licenseKey: key,
        plan: input.plan,
        status: "Active",
        onboardedDate: dateStr,
        expiryDate: expiryStr,
        seats: input.seats,
        modules: input.modules,
      },
    });
    if (input.adminUsername && input.adminPassword) {
      await tx.operator.create({
        data: {
          id: `op-${Date.now()}`,
          name: "System Admin",
          username: input.adminUsername.trim().toLowerCase(),
          passcode: input.adminPassword,
          role: "Administrator",
          tenantId,
          isFirstLogin: true,
        },
      });
    }
    await tx.activityEntry.create({
      data: {
        id: rid(),
        tenantId: DEFAULT_TENANT,
        at: new Date().toISOString(),
        action: "entry",
        detail: `Onboarded SaaS client: ${input.name}`,
      },
    });
  });
  return buildState();
}

export async function updateTenantConfig(id: string, seats: number, modules: string[]): Promise<YardState> {
  await prep();
  const t = await prisma.tenant.findUnique({ where: { id } });
  if (t) {
    await prisma.$transaction([
      prisma.tenant.update({ where: { id }, data: { seats, modules } }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "reset",
          detail: `Updated configuration for SaaS client: ${t.name}`,
        },
      }),
    ]);
  }
  return buildState();
}

export async function extendTenantLicense(id: string, years: number): Promise<YardState> {
  await prep();
  const t = await prisma.tenant.findUnique({ where: { id } });
  if (t) {
    const currentExpiry = new Date(t.expiryDate);
    currentExpiry.setFullYear(currentExpiry.getFullYear() + years);
    const expiryStr = currentExpiry.toISOString().split("T")[0];
    await prisma.$transaction([
      prisma.tenant.update({ where: { id }, data: { expiryDate: expiryStr, status: "Active" } }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "reset",
          detail: `Extended license for ${t.name} by ${years} yr(s)`,
        },
      }),
    ]);
  }
  return buildState();
}

export async function deleteTenant(id: string): Promise<YardState> {
  await prep();
  const t = await prisma.tenant.findUnique({ where: { id } });
  if (t) {
    await prisma.$transaction([
      prisma.tenant.delete({ where: { id } }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "reset",
          detail: `Removed SaaS client: ${t.name}`,
        },
      }),
    ]);
  }
  return buildState();
}

/* ---------- Operator Management ---------- */
export async function createOperator(input: {
  name: string;
  username: string;
  passcode: string;
  role: string;
  tenantId?: string;
}): Promise<YardState> {
  await prep();
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "asc" } });
  const operators = await prisma.operator.findMany();

  const tenant = input.tenantId ? tenants.find((t) => t.id === input.tenantId) : tenants[0];
  const seatLimit = tenant?.seats || 5;
  const firstTenantId = tenants[0]?.id;
  const tenantOperators = operators.filter(
    (o) => o.tenantId === input.tenantId || (!o.tenantId && (!input.tenantId || input.tenantId === firstTenantId)),
  );

  if (tenantOperators.length >= seatLimit) {
    throw new Error(`Operator seat limit reached (${seatLimit}). Upgrade your license.`);
  }

  const username = input.username.trim().toLowerCase();
  if (!operators.some((o) => o.username === username)) {
    await prisma.$transaction([
      prisma.operator.create({
        data: {
          id: `op-${Date.now()}`,
          name: input.name,
          username,
          passcode: input.passcode,
          role: input.role,
          tenantId: input.tenantId ?? null,
          isFirstLogin: true,
        },
      }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "reset",
          detail: `Registered operator: ${input.name} (${input.role})`,
        },
      }),
    ]);
  }
  return buildState();
}

export async function deleteOperator(id: string): Promise<YardState> {
  await prep();
  const op = await prisma.operator.findUnique({ where: { id } });
  if (op) {
    await prisma.$transaction([
      prisma.operator.delete({ where: { id } }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "reset",
          detail: `Removed operator: ${op.name}`,
        },
      }),
    ]);
  }
  return buildState();
}

export async function changeOperatorPassword(username: string, passcode: string): Promise<YardState> {
  await prep();
  const op = await prisma.operator.findFirst({ where: { username: username.trim().toLowerCase() } });
  if (op) {
    await prisma.$transaction([
      prisma.operator.update({ where: { id: op.id }, data: { passcode, isFirstLogin: false } }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "reset",
          detail: `Updated passcode for operator: ${op.name}`,
        },
      }),
    ]);
  }
  return buildState();
}

/* ---------- Role Permissions Management ---------- */
export async function updateRolePermissions(role: string, allowedPaths: string[]): Promise<YardState> {
  await prep();
  await prisma.$transaction([
    prisma.rolePermission.upsert({
      where: { role },
      update: { allowedPaths },
      create: { role, allowedPaths },
    }),
    prisma.activityEntry.create({
      data: {
        id: rid(),
        tenantId: DEFAULT_TENANT,
        at: new Date().toISOString(),
        action: "reset",
        detail: `Updated permissions grid for role: ${role}`,
      },
    }),
  ]);
  return buildState();
}
