// Data layer — backed by a real database via Prisma (Phase 2). This replaces the
// original JSON file store. Every exported function keeps the exact same
// signature and return shape it had in the file-store version, so the 9 API
// routes and the client store are unaffected.
//
// Operational data (tickets, alerts, activity, counters, settings) is isolated
// PER TENANT: each onboarded company gets its own dataset, keyed by tenantId.
// The caller's tenantId is derived SERVER-SIDE from a signed session cookie (see
// lib/auth.ts + lib/api-auth.ts) — never from a client-supplied header — so a
// caller can only ever touch their own workspace. Seeded demo accounts and the
// superadmin (no tenantId) fall back to the shared DEFAULT_TENANT workspace.
// tenants/operators/permissions remain global (managed by the superadmin).
// Passwords are stored as scrypt hashes and verified server-side (see authenticate).

import prisma from "./prisma";
import { hashPassword, verifyPassword, isHashed, sameTenant } from "./auth";
import { buildSeed, pick, BAYS, CARGO } from "./seed";
import type {
  ActivityAction,
  ActivityEntry,
  Alert,
  OperatorAccount,
  RolePermission,
  SystemSettings,
  TenantClient,
  TenantProfile,
  Ticket,
  TicketStatus,
  YardState,
} from "./types";

// The shared fallback workspace. Callers with no tenantId (seeded demo accounts,
// the superadmin) operate here; each onboarded company operates under its own id.
const DEFAULT_TENANT = "default";
const ACTIVITY_LIMIT = 500;

// Resolve a caller-supplied tenantId to the workspace its data lives in, falling
// back to the shared default workspace when none is provided.
function tenantOf(tenantId?: string | null): string {
  const t = tenantId?.trim();
  return t ? t : DEFAULT_TENANT;
}

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
// The superadmin is a DB operator (not a hardcoded login). Because ensureSeeded
// only plants the full seed when the DEFAULT workspace is brand-new, an ALREADY-
// seeded database (e.g. production, seeded before this account existed) would
// never get a superadmin row. This idempotent guard fixes that: it creates the
// account once if — and only if — no superadmin exists yet, and never touches an
// existing one (so a rotated password is preserved).
let superChecked = false;
async function ensureSuperadmin() {
  if (superChecked) return;
  try {
    const existing = await prisma.operator.findFirst({ where: { username: "superadmin" } });
    if (!existing) {
      const passcode = await hashPassword("super123");
      await prisma.operator.create({
        data: {
          id: "op-super",
          name: "Platform Owner",
          username: "superadmin",
          passcode,
          role: "superadmin",
          tenantId: null,
          isFirstLogin: false,
        },
      });
    }
  } catch (e) {
    // A concurrent request may have created it — that's fine.
    console.warn("ensureSuperadmin skipped (likely already exists):", e);
  }
  superChecked = true;
}

let seedChecked = false;
async function ensureSeeded() {
  await ensureSuperadmin();
  if (seedChecked) return;
  const existing = await prisma.settings.findUnique({ where: { tenantId: DEFAULT_TENANT } });
  if (!existing) {
    const seed = buildSeed();
    const tz = seed.settings?.timezone || "Asia/Kolkata";
    // Hash the seed passcodes before insert (scrypt is async, so it can't run
    // inside the synchronous $transaction array below).
    const hashedOps = await Promise.all(
      seed.operators.map(async (o) => ({ ...o, passcode: await hashPassword(o.passcode) })),
    );
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
        ...hashedOps.map((o) =>
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

// Ensure a freshly onboarded tenant has the rows its dataset needs: its own
// Settings + Counter (empty tickets/alerts/activity are implicit). Idempotent,
// and cached per-instance so it costs at most one lookup per tenant per process.
const provisionedTenants = new Set<string>();
async function ensureTenantWorkspace(tenantId: string) {
  if (tenantId === DEFAULT_TENANT || provisionedTenants.has(tenantId)) return;
  const seed = buildSeed();
  const tz = seed.settings?.timezone || "Asia/Kolkata";
  try {
    // Always upsert both rows: Settings may exist (created by createTenant) but
    // Counter might be missing if provisioning was partial, or vice-versa.
    await prisma.$transaction([
      prisma.settings.upsert({
        where: { tenantId },
        update: {},
        create: { tenantId, ...seed.settings },
      }),
      prisma.counter.upsert({
        where: { tenantId },
        update: {},
        create: { tenantId, ...seed.counters, lastResetDate: getTodayString(tz) },
      }),
    ]);
  } catch (e) {
    // A concurrent request may have provisioned it already — that's fine.
    console.warn("ensureTenantWorkspace skipped (likely already provisioned):", e);
  }
  provisionedTenants.add(tenantId);
}

// Lazy midnight reset for a single tenant, keyed on its timezone — same semantics
// as the old checkAndTriggerDailyReset: wipe that tenant's tickets/alerts and zero
// its three daily serials (boe is preserved) when the day rolls over.
async function checkDailyReset(tenantId: string = DEFAULT_TENANT) {
  const [counter, settings] = await Promise.all([
    prisma.counter.findUnique({ where: { tenantId } }),
    prisma.settings.findUnique({ where: { tenantId } }),
  ]);
  if (!counter) return;
  const tz = settings?.timezone || "Asia/Kolkata";
  const todayStr = getTodayString(tz);

  if (!counter.lastResetDate) {
    await prisma.counter.update({ where: { tenantId }, data: { lastResetDate: todayStr } });
    return;
  }

  if (counter.lastResetDate !== todayStr) {
    console.log(`[DAILY RESET] Resetting yard data for ${tenantId}, new day: ${todayStr} (last: ${counter.lastResetDate})`);
    await prisma.$transaction([
      prisma.ticket.deleteMany({ where: { tenantId } }),
      prisma.alert.deleteMany({ where: { tenantId } }),
      prisma.counter.update({
        where: { tenantId },
        data: { serial: 0, billingSerial: 0, loadingSerial: 0, lastResetDate: todayStr },
      }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId,
          at: new Date().toISOString(),
          action: "reset",
          detail: `Automatic daily reset at midnight (${todayStr})`,
        },
      }),
    ]);
  }
}

// Run before every read/write, matching the old readLedger side effects. The
// global demo seed always runs; per-tenant workspaces are provisioned lazily.
async function prep(tenantId: string = DEFAULT_TENANT) {
  await ensureSeeded();
  await ensureTenantWorkspace(tenantId);
  await checkDailyReset(tenantId);
}

/* ---------- state assembly ---------- */
// Assemble the client snapshot for one workspace. Operational data (tickets/
// alerts/activity/settings) is scoped to `tenantId`; tenants/operators/permissions
// stay global (the superadmin manages them across all companies).
async function buildState(tenantId: string = DEFAULT_TENANT): Promise<YardState> {
  const [tickets, alerts, activity, settingsRow, tenants, operators, permissions] = await Promise.all([
    prisma.ticket.findMany({ where: { tenantId }, orderBy: [{ queuePos: "asc" }, { createdAt: "asc" }] }),
    prisma.alert.findMany({ where: { tenantId }, orderBy: { id: "asc" } }),
    prisma.activityEntry.findMany({ where: { tenantId }, orderBy: { at: "desc" }, take: ACTIVITY_LIMIT }),
    prisma.settings.findUnique({ where: { tenantId } }),
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
    // Never ship passcodes (hashes) to the client. The snapshot is for display/
    // nav only; authentication happens server-side against the DB.
    operators: operators.map((o) => ({ ...toOperator(o), passcode: "" })),
    permissions: permissions.map(toPermission),
  };
}

// Interactive-transaction client type (for helpers used inside $transaction).
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function nextQueuePos(tx: Tx, tenantId: string = DEFAULT_TENANT): Promise<number> {
  const agg = await tx.ticket.aggregate({ where: { tenantId }, _max: { queuePos: true } });
  return (agg._max.queuePos ?? 0) + 1;
}

/* ---------- public API ---------- */
export async function getState(tenantId?: string): Promise<YardState> {
  const tid = tenantOf(tenantId);
  await prep(tid);
  return buildState(tid);
}

// Superadmin-only: every onboarded tenant's directory metadata joined with its
// registered company profile (from that tenant's Settings row). Tenants without
// a Settings row (or with an empty profile) come back with the company fields
// undefined so the caller can show "not set up yet". The shared `default`
// workspace is intentionally excluded — it is not an onboarded client.
export async function listTenantProfiles(): Promise<TenantProfile[]> {
  const [tenants, settings] = await Promise.all([
    prisma.tenant.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.settings.findMany(),
  ]);
  const byTenant = new Map(settings.map((s) => [s.tenantId, s]));
  return tenants.map((t) => {
    const s = byTenant.get(t.id);
    return {
      ...toTenant(t),
      companyName: s?.companyName ?? undefined,
      companyAddress: s?.companyAddress ?? undefined,
      companyContact: s?.companyContact ?? undefined,
      companyEmail: s?.companyEmail ?? undefined,
      companyGst: s?.companyGst ?? undefined,
      logoUrl: s?.logoUrl ?? undefined,
    };
  });
}

export async function createTicket(input: {
  vehicle: string;
  boe?: string;
  agent?: string;
  cargo?: string;
  remarks?: string;
  createdSource?: "entry" | "billing";
}, tenantId?: string): Promise<{ state: YardState; ticket: Ticket | null }> {
  const DEFAULT_TENANT = tenantOf(tenantId); // scope all queries below to the caller's workspace (shadows the module default)
  await prep(DEFAULT_TENANT);
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
    const idBase =
      input.createdSource === "billing"
        ? `B-${datePart}-${Math.floor(1000 + Math.random() * 9000)}`
        : `TK-${datePart}-${serial}`;
    // Ticket `id` is a GLOBAL primary key but `serial` is per-tenant, so two
    // companies registering on the same day would collide on `TK-<date>-<serial>`
    // and the second insert would throw. Namespace non-default tenants by their
    // (already-unique) tenantId. The default/demo workspace keeps bare ids for
    // backward compatibility with existing rows and printed QR tokens.
    const id = DEFAULT_TENANT === "default" ? idBase : `${DEFAULT_TENANT}-${idBase}`;

    const counter = await tx.counter.findUnique({ where: { tenantId: DEFAULT_TENANT } });
    const newBoe = (counter?.boe ?? 1000) + 1;
    // Use upsert instead of update so that the row is created on-the-fly if it
    // somehow doesn't exist yet (e.g. partially-provisioned tenant workspace).
    const todayForCounter = getTodayString("Asia/Kolkata");
    await tx.counter.upsert({
      where: { tenantId: DEFAULT_TENANT },
      update: { boe: newBoe, ...(input.createdSource !== "billing" ? { serial } : {}) },
      create: { tenantId: DEFAULT_TENANT, boe: newBoe, serial: input.createdSource !== "billing" ? serial : 0, billingSerial: 0, loadingSerial: 0, lastResetDate: todayForCounter },
    });

    const queuePos = await nextQueuePos(tx, DEFAULT_TENANT);
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

  const state = await buildState(DEFAULT_TENANT);
  return { state, ticket: created ? toTicket(created) : null };
}

export async function updateEntryForBillingTicket(
  id: string,
  extra: { vehicle: string; remarks?: string; agent?: string },
  tenantId?: string,
): Promise<YardState> {
  const DEFAULT_TENANT = tenantOf(tenantId); // scope all queries below to the caller's workspace (shadows the module default)
  await prep(DEFAULT_TENANT);
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
  return buildState(DEFAULT_TENANT);
}

export async function completeLoading(
  id: string,
  extra?: { boe?: string; workOrder?: string; agent?: string; remarks?: string; gateToken?: string; billingToken?: string },
  tenantId?: string,
): Promise<YardState> {
  const DEFAULT_TENANT = tenantOf(tenantId); // scope all queries below to the caller's workspace (shadows the module default)
  await prep(DEFAULT_TENANT);
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

      await tx.counter.upsert({
        where: { tenantId: DEFAULT_TENANT },
        update: { loadingSerial },
        create: { tenantId: DEFAULT_TENANT, boe: 1000, serial: 0, billingSerial: 0, loadingSerial, lastResetDate: todayStr },
      });
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
  return buildState(DEFAULT_TENANT);
}

export async function skipLoading(id: string, tenantId?: string): Promise<YardState> {
  const DEFAULT_TENANT = tenantOf(tenantId); // scope all queries below to the caller's workspace (shadows the module default)
  await prep(DEFAULT_TENANT);
  const t = await prisma.ticket.findUnique({ where: { id } });
  if (t && t.tenantId === DEFAULT_TENANT) {
    await prisma.$transaction(async (tx) => {
      const pos = await nextQueuePos(tx, DEFAULT_TENANT);
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
  return buildState(DEFAULT_TENANT);
}

export async function completeBilling(
  id: string,
  invoice: string,
  paymentStatus?: "Paid" | "Not Paid",
  extra?: { boe?: string; agent?: string; cargo?: string; remarks?: string },
  tenantId?: string,
): Promise<YardState> {
  const DEFAULT_TENANT = tenantOf(tenantId); // scope all queries below to the caller's workspace (shadows the module default)
  await prep(DEFAULT_TENANT);
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
      await tx.counter.upsert({
        where: { tenantId: DEFAULT_TENANT },
        update: { billingSerial },
        create: { tenantId: DEFAULT_TENANT, boe: 1000, serial: 0, billingSerial, loadingSerial: 0, lastResetDate: todayStr },
      });
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
  return buildState(DEFAULT_TENANT);
}

export async function skipBilling(id: string, tenantId?: string): Promise<YardState> {
  const DEFAULT_TENANT = tenantOf(tenantId); // scope all queries below to the caller's workspace (shadows the module default)
  await prep(DEFAULT_TENANT);
  const t = await prisma.ticket.findUnique({ where: { id } });
  if (t && t.tenantId === DEFAULT_TENANT) {
    await prisma.$transaction(async (tx) => {
      const pos = await nextQueuePos(tx, DEFAULT_TENANT);
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
  return buildState(DEFAULT_TENANT);
}

export async function permitExit(id: string, tenantId?: string): Promise<YardState> {
  const DEFAULT_TENANT = tenantOf(tenantId); // scope all queries below to the caller's workspace (shadows the module default)
  await prep(DEFAULT_TENANT);
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
  return buildState(DEFAULT_TENANT);
}

export async function holdVehicle(id: string, reason: string, tenantId?: string): Promise<YardState> {
  const DEFAULT_TENANT = tenantOf(tenantId); // scope all queries below to the caller's workspace (shadows the module default)
  await prep(DEFAULT_TENANT);
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
  return buildState(DEFAULT_TENANT);
}

export async function ackAlert(id: number, tenantId?: string): Promise<YardState> {
  const DEFAULT_TENANT = tenantOf(tenantId); // scope all queries below to the caller's workspace (shadows the module default)
  await prep(DEFAULT_TENANT);
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
  return buildState(DEFAULT_TENANT);
}

// Reset ONE workspace's operational data. Previously this wiped every tenant,
// operator and permission globally (a public endpoint could nuke all clients) —
// now it is scoped to `tenantId` and never deletes other tenants' data. The
// route gates this to the superadmin. Only the shared demo workspace additionally
// restores the seed operators/permissions/settings.
export async function reset(tenantId?: string): Promise<YardState> {
  const scope = tenantOf(tenantId);
  const seed = buildSeed();
  const tz = seed.settings?.timezone || "Asia/Kolkata";
  const todayStr = getTodayString(tz);

  await prisma.$transaction([
    prisma.ticket.deleteMany({ where: { tenantId: scope } }),
    prisma.alert.deleteMany({ where: { tenantId: scope } }),
    prisma.activityEntry.deleteMany({ where: { tenantId: scope } }),
    prisma.counter.upsert({
      where: { tenantId: scope },
      update: { serial: 0, billingSerial: 0, loadingSerial: 0, boe: seed.counters.boe, lastResetDate: todayStr },
      create: { tenantId: scope, ...seed.counters, lastResetDate: todayStr },
    }),
    prisma.activityEntry.create({
      data: {
        id: rid(),
        tenantId: scope,
        at: new Date().toISOString(),
        action: "reset",
        detail: "Workspace data reset",
      },
    }),
  ]);

  if (scope === DEFAULT_TENANT) {
    // Restore the demo logins + permissions to their known defaults. Seed ids
    // (op-super, op-1..op-5) never collide with real tenant operators
    // (op-<timestamp>), so upserting them leaves onboarded accounts untouched.
    const hashedOps = await Promise.all(
      seed.operators.map(async (o) => ({ ...o, passcode: await hashPassword(o.passcode) })),
    );
    await prisma.$transaction([
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
      ...hashedOps.map((o) =>
        prisma.operator.upsert({
          where: { id: o.id },
          update: { name: o.name, username: o.username, passcode: o.passcode, role: o.role, isFirstLogin: o.isFirstLogin ?? false },
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
          update: { allowedPaths: p.allowedPaths },
          create: { role: p.role, allowedPaths: p.allowedPaths },
        }),
      ),
    ]);
  }
  return buildState(scope);
}

export async function updateSettings(settings: Partial<SystemSettings>, tenantId?: string): Promise<YardState> {
  const DEFAULT_TENANT = tenantOf(tenantId); // scope all queries below to the caller's workspace (shadows the module default)
  await prep(DEFAULT_TENANT);
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
  return buildState(DEFAULT_TENANT);
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

  // A fresh company needs its own empty dataset: dedicated Settings + Counter
  // rows keyed to its tenantId (tickets/alerts/activity start empty by absence).
  const seed = buildSeed();
  const tz = seed.settings?.timezone || "Asia/Kolkata";
  const adminHash =
    input.adminUsername && input.adminPassword ? await hashPassword(input.adminPassword) : null;

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
    await tx.settings.create({ data: { tenantId, ...seed.settings } });
    await tx.counter.create({
      data: { tenantId, ...seed.counters, lastResetDate: getTodayString(tz) },
    });
    if (input.adminUsername && adminHash) {
      await tx.operator.create({
        data: {
          id: `op-${Date.now()}`,
          name: "System Admin",
          username: input.adminUsername.trim().toLowerCase(),
          passcode: adminHash,
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

export async function setTenantLicense(
  id: string,
  expiryDate: string,
  status: "Active" | "Expired" | "Suspended",
): Promise<YardState> {
  await prep();
  const t = await prisma.tenant.findUnique({ where: { id } });
  if (t) {
    await prisma.$transaction([
      prisma.tenant.update({ where: { id }, data: { expiryDate, status } }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: DEFAULT_TENANT,
          at: new Date().toISOString(),
          action: "reset",
          detail: `Updated license for ${t.name}: status ${status}, valid until ${expiryDate}`,
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
  // Scope the returned snapshot + audit entry to the workspace the new operator
  // belongs to, so the admin's store stays on their own tenant's data.
  const scope = tenantOf(input.tenantId);
  await prep(scope);
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "asc" } });
  const operators = await prisma.operator.findMany();

  // Seat limits are a per-company license: only operators created FOR that
  // company count, and Administrator accounts (the admin themselves) never
  // consume a seat — mirrors the client-side check on the admin page. Creations
  // without a tenant (superadmin/default workspace) are not seat-capped.
  if (input.tenantId) {
    const tenant = tenants.find((t) => t.id === input.tenantId);
    const seatLimit = tenant?.seats || 5;
    const seatsUsed = operators.filter(
      (o) => o.tenantId === input.tenantId && o.role !== "Administrator" && o.username !== "admin",
    ).length;
    if (seatsUsed >= seatLimit) {
      throw new Error(`Operator seat limit reached (${seatLimit}). Upgrade your license.`);
    }
  }

  const username = input.username.trim().toLowerCase();
  if (!operators.some((o) => o.username === username)) {
    const passcode = await hashPassword(input.passcode);
    await prisma.$transaction([
      prisma.operator.create({
        data: {
          id: `op-${Date.now()}`,
          name: input.name,
          username,
          passcode,
          role: input.role,
          tenantId: input.tenantId ?? null,
          isFirstLogin: true,
        },
      }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: scope,
          at: new Date().toISOString(),
          action: "reset",
          detail: `Registered operator: ${input.name} (${input.role})`,
        },
      }),
    ]);
  }
  return buildState(scope);
}

export async function deleteOperator(
  id: string,
  caller: { role: string; tenantId: string | null },
): Promise<YardState> {
  const scope = tenantOf(caller.tenantId);
  await prep(scope);
  const op = await prisma.operator.findUnique({ where: { id } });
  if (op) {
    // A non-superadmin admin may only delete operators inside their own tenant.
    const allowed = caller.role === "superadmin" || sameTenant(op.tenantId, caller.tenantId);
    if (!allowed) {
      throw new Error("Not authorized to remove this operator.");
    }
    await prisma.$transaction([
      prisma.operator.delete({ where: { id } }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: scope,
          at: new Date().toISOString(),
          action: "reset",
          detail: `Removed operator: ${op.name}`,
        },
      }),
    ]);
  }
  return buildState(scope);
}

// Change a password with SERVER-SIDE authorization. A caller may only change:
//   - their own password, or
//   - (as Administrator/superadmin) a password within their own tenant,
//   - (as superadmin) any password.
// Previously this looked the operator up by username with no auth check at all,
// so anyone could reset anyone's password. The caller identity comes from the
// verified session, never the request body.
export async function changeOperatorPassword(
  targetUsername: string,
  passcode: string,
  caller: { username: string; role: string; tenantId: string | null },
  currentPasscode?: string,
): Promise<YardState> {
  const scope = tenantOf(caller.tenantId);
  await prep(scope);
  const uname = targetUsername.trim().toLowerCase();
  const op = await prisma.operator.findFirst({ where: { username: uname } });
  if (op) {
    const callerIsSuper = caller.role === "superadmin";
    const callerIsAdmin =
      callerIsSuper || caller.role === "Administrator" || caller.role === "Admin";
    const isSelf = uname === caller.username.trim().toLowerCase();
    const allowed =
      isSelf ||
      callerIsSuper ||
      (callerIsAdmin && sameTenant(op.tenantId, caller.tenantId));
    if (!allowed) {
      throw new Error("Not authorized to change this password.");
    }
    // Self-service change must prove knowledge of the current passcode. An admin
    // resetting a DIFFERENT operator's password (isSelf === false) does not.
    if (isSelf) {
      const ok = currentPasscode ? await verifyPassword(op.passcode, currentPasscode) : false;
      if (!ok) throw new Error("Current passcode is incorrect.");
    }
    const hashed = await hashPassword(passcode);
    await prisma.$transaction([
      prisma.operator.update({ where: { id: op.id }, data: { passcode: hashed, isFirstLogin: false } }),
      prisma.activityEntry.create({
        data: {
          id: rid(),
          tenantId: scope,
          at: new Date().toISOString(),
          action: "reset",
          detail: `Updated passcode for operator: ${op.name}`,
        },
      }),
    ]);
  }
  return buildState(scope);
}

/* ---------- Role Permissions Management ---------- */
export async function updateRolePermissions(role: string, allowedPaths: string[], tenantId?: string): Promise<YardState> {
  const DEFAULT_TENANT = tenantOf(tenantId); // scope the returned snapshot + audit entry to the caller's workspace (shadows the module default)
  await prep(DEFAULT_TENANT);
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
  return buildState(DEFAULT_TENANT);
}

/* ---------- Server-side authentication ---------- */

// The safe identity returned to the client after login / for /me. Never carries a
// passcode. `allowedPaths` drives client nav only — the server, not this list, is
// the security boundary.
export interface AuthIdentity {
  username: string;
  name: string;
  role: string;
  tenantId: string | null;
  allowedPaths: string[];
  isFirstLogin: boolean;
}

// Resolve a role's nav paths from the permissions grid, mirroring the fallback
// logic the client used to run. Superadmin always gets everything; everyone else
// has /superadmin stripped.
function allowedPathsFor(role: string, permissions: RolePermission[]): string[] {
  if (role === "superadmin") {
    return ["/", "/entry", "/billing", "/loading", "/exit", "/reports", "/admin", "/superadmin"];
  }
  const grid = permissions.find((p) => p.role === role);
  let paths = grid?.allowedPaths;
  if (!paths) {
    if (role === "Administrator" || role === "Admin") {
      paths = ["/", "/entry", "/billing", "/loading", "/exit", "/reports", "/admin"];
    } else if (role === "Gate Operator") {
      paths = ["/", "/entry"];
    } else if (role === "Loading Operator") {
      paths = ["/", "/loading"];
    } else if (role === "Billing Agent") {
      paths = ["/", "/billing"];
    } else if (role === "Security Guard") {
      paths = ["/", "/exit"];
    } else {
      paths = ["/"];
    }
  }
  return paths.filter((p) => p !== "/superadmin");
}

function toIdentity(op: OperatorRow, permissions: RolePermission[]): AuthIdentity {
  return {
    username: op.username,
    name: op.name,
    role: op.role,
    tenantId: op.tenantId ?? null,
    allowedPaths: allowedPathsFor(op.role, permissions),
    isFirstLogin: op.isFirstLogin,
  };
}

// Verify a username + passcode against the DB. Returns the safe identity on
// success, or null on unknown user / bad password. Transparently upgrades a
// legacy plaintext passcode to a scrypt hash on the first correct sign-in.
export async function authenticate(username: string, passcode: string): Promise<AuthIdentity | null> {
  await ensureSeeded();
  const uname = username.trim().toLowerCase();
  const op = await prisma.operator.findFirst({ where: { username: uname } });
  if (!op) return null;

  const ok = await verifyPassword(op.passcode, passcode);
  if (!ok) return null;

  // Lazy migration: the stored value was legacy plaintext — replace it with a
  // hash now that we've confirmed it. No separate migration script needed.
  if (!isHashed(op.passcode)) {
    try {
      const upgraded = await hashPassword(passcode);
      await prisma.operator.update({ where: { id: op.id }, data: { passcode: upgraded } });
    } catch {
      // Non-fatal: login still succeeds; we'll upgrade next time.
    }
  }

  const permissions = await prisma.rolePermission.findMany();
  return toIdentity(op, permissions.map(toPermission));
}

// Fetch the current identity for an already-authenticated session (used by /me),
// so the client always reflects the live role/permissions/tenant.
export async function getIdentity(username: string): Promise<AuthIdentity | null> {
  await ensureSeeded();
  const op = await prisma.operator.findFirst({ where: { username: username.trim().toLowerCase() } });
  if (!op) return null;
  const permissions = await prisma.rolePermission.findMany();
  return toIdentity(op, permissions.map(toPermission));
}
