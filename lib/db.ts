// Phase-1 data layer. Persists to plain JSON files in /transactions so the
// ledger + audit trail are inspectable during the client demo. Every mutation
// is a read-modify-write guarded by an in-process lock. When the project is
// approved, replace the body of these functions with Prisma calls — the
// signatures and the API routes on top of them stay exactly the same.

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { buildSeed, pick, BAYS, CARGO } from "./seed";
import type {
  ActivityEntry,
  Ledger,
  Ticket,
  YardState,
} from "./types";

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "transactions")
  : path.join(process.cwd(), "transactions");
const LEDGER_FILE = path.join(DATA_DIR, "ledger.json");
const ACTIVITY_FILE = path.join(DATA_DIR, "activity-log.json");
const ACTIVITY_LIMIT = 500;

/* ---------- id + lock ---------- */
function rid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Serialize all writes so concurrent requests can't clobber the file.
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => {},
    () => {},
  );
  return run;
}

/* ---------- low-level fs ---------- */
async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function buildSeedActivity(tickets: Ticket[]): ActivityEntry[] {
  const acts: ActivityEntry[] = [];
  for (const t of tickets) {
    acts.push({
      id: rid(),
      at: t.entryTime,
      action: "entry",
      ticketId: t.id,
      serial: t.serial,
      vehicle: t.vehicle,
      detail: `${t.boe} · ${t.agent}`,
    });
    if (t.invoice)
      acts.push({
        id: rid(),
        at: t.entryTime,
        action: "billing_complete",
        ticketId: t.id,
        serial: t.serial,
        vehicle: t.vehicle,
        detail: t.invoice,
      });
    if (t.loadingEnd)
      acts.push({
        id: rid(),
        at: t.loadingEnd,
        action: "loading_complete",
        ticketId: t.id,
        serial: t.serial,
        vehicle: t.vehicle,
      });
    if (t.exitTime)
      acts.push({
        id: rid(),
        at: t.exitTime,
        action: "exit",
        ticketId: t.id,
        serial: t.serial,
        vehicle: t.vehicle,
      });
  }
  return acts.sort((a, b) => b.at.localeCompare(a.at));
}

const DEFAULT_SETTINGS = {
  terminalName: "",
  maxActiveBays: 20,
  timezone: "Asia/Kolkata",
};

// Memory cache fallbacks for serverless environments where fs is read-only or ephemeral
let memoryLedger: Ledger | null = null;
let memoryActivity: ActivityEntry[] | null = null;

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

async function checkAndTriggerDailyReset(l: Ledger) {
  const tz = l.settings?.timezone || "Asia/Kolkata";
  const todayStr = getTodayString(tz);
  
  if (!l.lastResetDate) {
    l.lastResetDate = todayStr;
    await writeLedger(l);
    return;
  }
  
  if (l.lastResetDate !== todayStr) {
    console.log(`[DAILY RESET] Resetting yard data for new day: ${todayStr} (last: ${l.lastResetDate})`);
    l.tickets = [];
    l.alerts = [];
    l.counters.serial = 0;
    l.counters.billingSerial = 0;
    l.counters.loadingSerial = 0;
    l.lastResetDate = todayStr;
    await writeLedger(l);
    
    const resetEntry = {
      id: rid(),
      at: new Date().toISOString(),
      action: "reset" as const,
      detail: `Automatic daily reset at midnight (${todayStr})`,
    };
    
    try {
      const currentActivity = await readActivity();
      const nextActivity = [resetEntry, ...currentActivity].slice(0, ACTIVITY_LIMIT);
      memoryActivity = nextActivity;
      await fs.writeFile(ACTIVITY_FILE, JSON.stringify(nextActivity, null, 2));
    } catch (e) {
      console.warn("Failed to update activity log on daily reset:", e);
    }
  }
}

async function readLedger(): Promise<Ledger> {
  try {
    const content = await fs.readFile(LEDGER_FILE, "utf8");
    const l = JSON.parse(content) as Ledger;
    const seed = buildSeed();
    if (!l.settings) {
      l.settings = { ...DEFAULT_SETTINGS };
    }
    if (!l.tenants) {
      l.tenants = seed.tenants;
    }
    if (!l.operators) {
      l.operators = seed.operators;
    }
    if (!l.permissions) {
      l.permissions = seed.permissions;
    }
    // Initialize missing counters for backwards compatibility
    if (l.counters.billingSerial === undefined) l.counters.billingSerial = 0;
    if (l.counters.loadingSerial === undefined) l.counters.loadingSerial = 0;
    memoryLedger = l;
    await checkAndTriggerDailyReset(l);
    return l;
  } catch (err) {
    if (memoryLedger) {
      await checkAndTriggerDailyReset(memoryLedger);
      return memoryLedger;
    }
    const seed = buildSeed();
    const tz = seed.settings?.timezone || "Asia/Kolkata";
    seed.lastResetDate = getTodayString(tz);
    memoryLedger = seed;
    try {
      await ensureDir();
      await fs.writeFile(LEDGER_FILE, JSON.stringify(seed, null, 2));
    } catch (e) {
      console.warn("Failed to write ledger file to disk, running in memory-only mode:", e);
    }
    return seed;
  }
}

async function writeLedger(l: Ledger) {
  memoryLedger = l;
  try {
    await ensureDir();
    await fs.writeFile(LEDGER_FILE, JSON.stringify(l, null, 2));
  } catch (e) {
    console.warn("Failed to write ledger file to disk, updating memory-only:", e);
  }
}

async function readActivity(): Promise<ActivityEntry[]> {
  try {
    const content = await fs.readFile(ACTIVITY_FILE, "utf8");
    const acts = JSON.parse(content) as ActivityEntry[];
    memoryActivity = acts;
    return acts;
  } catch {
    if (memoryActivity) {
      return memoryActivity;
    }
    const defaultActs = memoryLedger ? buildSeedActivity(memoryLedger.tickets) : [];
    memoryActivity = defaultActs;
    try {
      await ensureDir();
      await fs.writeFile(ACTIVITY_FILE, JSON.stringify(defaultActs, null, 2));
    } catch (e) {
      console.warn("Failed to write default activity file to disk:", e);
    }
    return defaultActs;
  }
}

async function appendActivity(entries: ActivityEntry[]) {
  if (!entries.length) return;
  const current = await readActivity();
  const next = [...entries, ...current].slice(0, ACTIVITY_LIMIT);
  memoryActivity = next;
  try {
    await ensureDir();
    await fs.writeFile(ACTIVITY_FILE, JSON.stringify(next, null, 2));
  } catch (e) {
    console.warn("Failed to write updated activity file to disk:", e);
  }
}

/* ---------- mutate wrapper ---------- */
type Logger = (a: Omit<ActivityEntry, "id" | "at">) => void;

async function mutate(
  fn: (l: Ledger, log: Logger) => void,
): Promise<YardState> {
  return locked(async () => {
    const ledger = await readLedger();
    const acts: ActivityEntry[] = [];
    const log: Logger = (a) =>
      acts.push({ id: rid(), at: new Date().toISOString(), ...a });
    fn(ledger, log);
    await writeLedger(ledger);
    await appendActivity(acts);
    const activity = await readActivity();
    return {
      tickets: ledger.tickets,
      alerts: ledger.alerts,
      activity,
      settings: ledger.settings || { ...DEFAULT_SETTINGS },
      tenants: ledger.tenants || [],
      operators: ledger.operators || [],
      permissions: ledger.permissions || [],
    };
  });
}

const find = (l: Ledger, id: string) => l.tickets.find((t) => t.id === id);

/* ---------- public API ---------- */
export async function getState(): Promise<YardState> {
  const ledger = await readLedger();
  const activity = await readActivity();
  return {
    tickets: ledger.tickets,
    alerts: ledger.alerts,
    activity,
    settings: ledger.settings || { ...DEFAULT_SETTINGS },
    tenants: ledger.tenants || [],
    operators: ledger.operators || [],
    permissions: ledger.permissions || [],
  };
}

export async function createTicket(input: {
  vehicle: string;
  boe?: string;
  agent?: string;
  cargo?: string;
  remarks?: string;
  createdSource?: "entry" | "billing";
}): Promise<{ state: YardState; ticket: Ticket | null }> {
  let created: Ticket | null = null;
  const state = await mutate((l, log) => {
    const timezone = l.settings?.timezone || "Asia/Kolkata";
    const now = new Date();
    const todayStr = getTodayString(timezone, now);

    const todaySerials = l.tickets
      .filter((t) => {
        return getTodayString(timezone, t.entryTime) === todayStr;
      })
      .map((t) => t.serial);

    const serial = todaySerials.length > 0 ? Math.max(...todaySerials) + 1 : 1;
    const datePart = todayStr.replace(/-/g, "");
    const id = `TK-${datePart}-${serial}`;

    l.counters.serial = serial;
    if (l.counters.boe === undefined) {
      l.counters.boe = (l.counters as any).job ?? 1000;
    }
    l.counters.boe += 1;

    const t: Ticket = {
      id,
      serial,
      vehicle: input.vehicle.trim().toUpperCase(),
      boe: input.boe?.trim() || `BOE-${Math.floor(10000 + Math.random() * 90000)}`,
      agent: input.agent?.trim() || "Unassigned",
      cargo: input.cargo?.trim() || pick(CARGO),
      status: "awaiting_billing",
      bay: pick(BAYS),
      remarks: input.remarks?.trim() || undefined,
      entryTime: now.toISOString(),
      loadingEnd: null,
      invoice: null,
      exitTime: null,
      holdReason: null,
      paymentStatus: "Not Paid",
      createdSource: input.createdSource || "entry",
    };
    l.tickets.push(t);
    created = t;
    log({
      action: "entry",
      ticketId: t.id,
      serial: t.serial,
      vehicle: t.vehicle,
      detail: `${t.boe} · ${t.agent}`,
    });
  });
  return { state, ticket: created };
}

export function completeLoading(
  id: string,
  extra?: { boe?: string; agent?: string; remarks?: string; gateToken?: string; billingToken?: string }
): Promise<YardState> {
  return mutate((l, log) => {
    const t = find(l, id);
    if (t && t.status === "awaiting_loading") {
      if (l.counters.loadingSerial === undefined) l.counters.loadingSerial = 0;
      l.counters.loadingSerial += 1;
      t.loadingSerial = l.counters.loadingSerial;
      t.status = "awaiting_exit";
      t.loadingEnd = new Date().toISOString();
      if (extra?.boe) t.boe = extra.boe;
      t.loadingAgent = extra?.agent ? extra.agent.trim() : t.billingAgent || t.agent;
      t.loadingRemarks = extra?.remarks ? extra.remarks.trim() : "";
      if (extra?.gateToken) t.manualGateToken = extra.gateToken.trim();
      if (extra?.billingToken) t.manualBillingToken = extra.billingToken.trim();
      log({
        action: "loading_complete",
        ticketId: t.id,
        serial: t.serial,
        vehicle: t.vehicle,
      });
    }
  });
}

export function skipLoading(id: string): Promise<YardState> {
  return mutate((l, log) => {
    const i = l.tickets.findIndex((t) => t.id === id);
    if (i >= 0) {
      const [t] = l.tickets.splice(i, 1);
      l.tickets.push(t);
      log({
        action: "loading_skip",
        ticketId: t.id,
        serial: t.serial,
        vehicle: t.vehicle,
        detail: "Re-queued to back of line",
      });
    }
  });
}

export function completeBilling(
  id: string,
  invoice: string,
  paymentStatus?: "Paid" | "Not Paid",
  extra?: { boe?: string; agent?: string; cargo?: string; remarks?: string },
): Promise<YardState> {
  return mutate((l, log) => {
    const t = find(l, id);
    if (t && t.status === "awaiting_billing") {
      if (l.counters.billingSerial === undefined) l.counters.billingSerial = 0;
      l.counters.billingSerial += 1;
      t.billingSerial = l.counters.billingSerial;
      t.status = "awaiting_loading";
      t.invoice = invoice.trim() || null;
      t.paymentStatus = paymentStatus || "Paid";
      t.billingTime = new Date().toISOString();
      t.billingAgent = extra?.agent ? extra.agent.trim() : t.agent;
      t.billingRemarks = extra?.remarks ? extra.remarks.trim() : "";
      if (extra?.boe) t.boe = extra.boe;
      if (extra?.cargo) t.cargo = extra.cargo;
      log({
        action: "billing_complete",
        ticketId: t.id,
        serial: t.serial,
        vehicle: t.vehicle,
        detail: t.invoice || "No invoice",
      });
    }
  });
}

export function skipBilling(id: string): Promise<YardState> {
  return mutate((l, log) => {
    const i = l.tickets.findIndex((t) => t.id === id);
    if (i >= 0) {
      const [t] = l.tickets.splice(i, 1);
      l.tickets.push(t);
      log({
        action: "billing_skip",
        ticketId: t.id,
        serial: t.serial,
        vehicle: t.vehicle,
        detail: "Re-queued to back of line",
      });
    }
  });
}

export function permitExit(id: string): Promise<YardState> {
  return mutate((l, log) => {
    const t = find(l, id);
    if (t && t.status === "awaiting_exit") {
      t.status = "exited";
      t.exitTime = new Date().toISOString();
      log({
        action: "exit",
        ticketId: t.id,
        serial: t.serial,
        vehicle: t.vehicle,
        detail: t.invoice ?? undefined,
      });
    }
  });
}

export function holdVehicle(id: string, reason: string): Promise<YardState> {
  return mutate((l, log) => {
    const t = find(l, id);
    if (t && t.status === "awaiting_exit") {
      t.status = "held";
      t.holdReason = reason.trim() || "Unspecified";
      log({
        action: "hold",
        ticketId: t.id,
        serial: t.serial,
        vehicle: t.vehicle,
        detail: t.holdReason,
      });
    }
  });
}

export function ackAlert(id: number): Promise<YardState> {
  return mutate((l, log) => {
    const a = l.alerts.find((x) => x.id === id);
    if (a && !a.acknowledged) {
      a.acknowledged = true;
      log({ action: "alert_ack", detail: a.message });
    }
  });
}

export async function reset(): Promise<YardState> {
  return locked(async () => {
    const seed = buildSeed();
    const tz = seed.settings?.timezone || "Asia/Kolkata";
    seed.lastResetDate = getTodayString(tz);
    await ensureDir();
    await writeLedger(seed);
    const activity = buildSeedActivity(seed.tickets);
    activity.unshift({
      id: rid(),
      at: new Date().toISOString(),
      action: "reset",
      detail: "Demo data reset",
    });
    await fs.writeFile(ACTIVITY_FILE, JSON.stringify(activity, null, 2));
    return {
      tickets: seed.tickets,
      alerts: seed.alerts,
      activity,
      settings: seed.settings || { ...DEFAULT_SETTINGS },
      tenants: seed.tenants || [],
      operators: seed.operators || [],
      permissions: seed.permissions || [],
    };
  });
}

export function updateSettings(settings: {
  terminalName: string;
  maxActiveBays: number;
  timezone: string;
}): Promise<YardState> {
  return mutate((l) => {
    l.settings = {
      terminalName: settings.terminalName.trim(),
      maxActiveBays: Number(settings.maxActiveBays) || 20,
      timezone: settings.timezone.trim(),
    };
  });
}

/* ---------- SaaS Tenant Management ---------- */
export async function createTenant(input: {
  name: string;
  domain: string;
  plan: "Enterprise Plan" | "Professional Plan" | "Basic Plan";
  seats: number;
}): Promise<YardState> {
  return mutate((l, log) => {
    const tenantId = `ten-${Date.now()}`;
    const dateStr = new Date().toISOString().split("T")[0];
    const expDate = new Date();
    expDate.setFullYear(expDate.getFullYear() + 1); // 1 year default
    const expiryStr = expDate.toISOString().split("T")[0];
    
    const key = `YF-${input.name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}-${new Date().getFullYear()}`;

    const newTenant = {
      id: tenantId,
      name: input.name,
      domain: input.domain,
      licenseKey: key,
      plan: input.plan,
      status: "Active" as const,
      onboardedDate: dateStr,
      expiryDate: expiryStr,
      seats: input.seats,
    };
    l.tenants = l.tenants || [];
    l.tenants.push(newTenant);
    log({ action: "entry", detail: `Onboarded SaaS client: ${input.name}` });
  });
}

export async function extendTenantLicense(id: string, years: number): Promise<YardState> {
  return mutate((l, log) => {
    const t = l.tenants?.find((t) => t.id === id);
    if (t) {
      const currentExpiry = new Date(t.expiryDate);
      currentExpiry.setFullYear(currentExpiry.getFullYear() + years);
      t.expiryDate = currentExpiry.toISOString().split("T")[0];
      t.status = "Active"; // reactivate if expired
      log({ action: "reset", detail: `Extended license for ${t.name} by ${years} yr(s)` });
    }
  });
}

export async function deleteTenant(id: string): Promise<YardState> {
  return mutate((l, log) => {
    const t = l.tenants?.find((t) => t.id === id);
    if (t) {
      l.tenants = l.tenants.filter((x) => x.id !== id);
      log({ action: "reset", detail: `Removed SaaS client: ${t.name}` });
    }
  });
}

/* ---------- Operator Management ---------- */
export async function createOperator(input: {
  name: string;
  username: string;
  passcode: string;
  role: string;
}): Promise<YardState> {
  return mutate((l, log) => {
    l.operators = l.operators || [];
    const seatLimit = l.tenants?.[0]?.seats || 5;
    if (l.operators.length >= seatLimit) {
      throw new Error(`Operator seat limit reached (${seatLimit}). Upgrade your license.`);
    }

    const newOp = {
      id: `op-${Date.now()}`,
      name: input.name,
      username: input.username.trim().toLowerCase(),
      passcode: input.passcode,
      role: input.role,
      isFirstLogin: true,
    };
    if (!l.operators.some((o) => o.username === newOp.username)) {
      l.operators.push(newOp);
      log({ action: "reset", detail: `Registered operator: ${input.name} (${input.role})` });
    }
  });
}

export async function deleteOperator(id: string): Promise<YardState> {
  return mutate((l, log) => {
    const op = l.operators?.find((o) => o.id === id);
    if (op) {
      l.operators = l.operators.filter((x) => x.id !== id);
      log({ action: "reset", detail: `Removed operator: ${op.name}` });
    }
  });
}

export async function changeOperatorPassword(username: string, passcode: string): Promise<YardState> {
  return mutate((l, log) => {
    const op = l.operators?.find((o) => o.username === username.trim().toLowerCase());
    if (op) {
      op.passcode = passcode;
      op.isFirstLogin = false;
      log({ action: "reset", detail: `Updated passcode for operator: ${op.name}` });
    }
  });
}

/* ---------- Role Permissions Management ---------- */
export async function updateRolePermissions(role: string, allowedPaths: string[]): Promise<YardState> {
  return mutate((l, log) => {
    l.permissions = l.permissions || [];
    let perm = l.permissions.find((p) => p.role === role);
    if (!perm) {
      perm = { role, allowedPaths };
      l.permissions.push(perm);
    } else {
      perm.allowedPaths = allowedPaths;
    }
    log({ action: "reset", detail: `Updated permissions grid for role: ${role}` });
  });
}

