"use client";

import { create } from "zustand";
import { toast } from "sonner";
import type {
  ActivityEntry,
  Alert,
  SystemSettings,
  Ticket,
  YardState,
  TenantClient,
  OperatorAccount,
  RolePermission,
} from "./types";
import { type OperatorUser } from "./users";

interface Store {
  // server-backed state
  tickets: Ticket[];
  alerts: Alert[];
  activity: ActivityEntry[];
  settings: SystemSettings;
  tenants: TenantClient[];
  operators: OperatorAccount[];
  permissions: RolePermission[];
  ready: boolean;

  // ephemeral UI state (client only)
  search: string;
  lastTokenId: string | null;
  loadingScannedFor: string | null;
  exitSelectedId: string | null;

  // auth state
  currentUser: OperatorUser | null;
  login: (username: string, passcode: string) => Promise<boolean>;
  logout: () => void;

  // superadmin-only: which tenant's dashboard we're currently viewing (read-only).
  // null = view our own/default scope. Drives a ?tenantId= param on /api/state.
  viewTenantId: string | null;
  setViewTenant: (id: string | null) => void;

  hydrate: () => Promise<void>;
  setSearch: (s: string) => void;
  setScanned: (id: string | null) => void;
  setExitSelected: (id: string | null) => void;

  createTicket: (input: {
    vehicle: string;
    boe?: string;
    agent?: string;
    cargo?: string;
    remarks?: string;
    createdSource?: "entry" | "billing";
  }) => Promise<Ticket | null>;
  ticketAction: (
    id: string,
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<boolean>;
  ackAlert: (id: number) => Promise<void>;
  updateSettings: (settings: Partial<SystemSettings>) => Promise<boolean>;
  reset: () => Promise<void>;

  // SaaS and Admin mutations
  createTenant: (input: {
    name: string;
    domain: string;
    plan: "Enterprise Plan" | "Professional Plan" | "Basic Plan";
    seats: number;
    modules: string[];
    adminUsername?: string;
    adminPassword?: string;
  }) => Promise<boolean>;
  updateTenantConfig: (id: string, seats: number, modules: string[]) => Promise<boolean>;
  extendTenant: (id: string, years: number) => Promise<boolean>;
  setTenantLicense: (id: string, expiryDate: string, status: "Active" | "Expired" | "Suspended") => Promise<boolean>;
  deleteTenant: (id: string) => Promise<boolean>;
  createOperator: (input: {
    name: string;
    username: string;
    passcode: string;
    role: string;
    tenantId?: string;
  }) => Promise<boolean>;
  deleteOperator: (id: string) => Promise<boolean>;
  updatePermissions: (role: string, allowedPaths: string[]) => Promise<boolean>;
  changePassword: (username: string, passcode: string, currentPasscode?: string) => Promise<boolean>;

  // real-time polling
  startPolling: () => void;
  stopPolling: () => void;
}

// Auth + tenant scope now live in a signed httpOnly session cookie set by the
// server at login. The cookie travels automatically with same-origin fetches, so
// the client no longer sends (or is trusted for) an x-tenant-id header.
async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Request failed");
  return data;
}

// Build the /api/state URL, honoring a superadmin's "view tenant" selection. The
// ?tenantId= override is only ever attached for a superadmin session — the server
// ignores it for anyone else, and we mirror that guard here so a stale selection
// can't leak into a normal user's request.
function stateUrl(viewTenantId: string | null, user: OperatorUser | null): string {
  if (viewTenantId && user?.role === "superadmin") {
    return `/api/state?tenantId=${encodeURIComponent(viewTenantId)}`;
  }
  return "/api/state";
}

// Module-level interval so it survives Zustand re-renders
let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _polling = false; // prevent overlapping fetches

export const useStore = create<Store>((set, get) => ({
  tickets: [],
  alerts: [],
  activity: [],
  settings: {
    terminalName: "",
    maxActiveBays: 20,
    timezone: "Asia/Kolkata",
  },
  tenants: [],
  operators: [],
  permissions: [],
  ready: false,

  search: "",
  lastTokenId: null,
  loadingScannedFor: null,
  exitSelectedId: null,

  currentUser: null,
  viewTenantId: null,

  login: async (username, passcode) => {
    // Credentials are verified on the SERVER. On success the server sets a signed
    // session cookie and returns the safe identity (no passcode). We keep a copy
    // in localStorage only for instant nav rendering — the cookie is the real auth.
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, passcode }),
      });
      if (!res.ok) return false;
      const { user } = (await res.json()) as { user: OperatorUser };
      set({ currentUser: user });
      if (typeof window !== "undefined") {
        localStorage.setItem("yardflow_user", JSON.stringify(user));
      }
      // Load this workspace's data immediately (cookie now scopes the request).
      void get().hydrate();
      return true;
    } catch {
      return false;
    }
  },

  // Superadmin selects a client company to view (read-only), or null to return to
  // their own scope. Re-hydrates so the store repopulates with that tenant's data.
  setViewTenant: (id) => {
    set({ viewTenantId: id });
    void get().hydrate();
  },

  logout: () => {
    set({ currentUser: null, viewTenantId: null });
    if (typeof window !== "undefined") {
      localStorage.removeItem("yardflow_user");
    }
    // Clear the server session cookie; ignore failures (best effort).
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  },

  hydrate: async () => {
    // Ask the server who we are (verified session cookie). This replaces the old
    // client-side identity rebuild that matched a persisted passcode.
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      if (meRes.ok) {
        const { user } = (await meRes.json()) as { user: OperatorUser };
        set({ currentUser: user });
        if (typeof window !== "undefined") {
          localStorage.setItem("yardflow_user", JSON.stringify(user));
        }
      } else {
        set({ currentUser: null });
        if (typeof window !== "undefined") {
          localStorage.removeItem("yardflow_user");
        }
      }
    } catch {
      // Network hiccup — keep whatever nav we already have.
    }

    try {
      // Cookie scopes this to our workspace; 401 (no session) just yields no data.
      // A superadmin viewing a client passes ?tenantId= (see stateUrl).
      const { viewTenantId, currentUser } = get();
      const res = await fetch(stateUrl(viewTenantId, currentUser), { cache: "no-store" });
      if (res.ok) {
        const state: YardState = await res.json();
        set({ ...state, ready: true });
      } else {
        set({ ready: true });
      }
    } catch {
      toast.error("Could not load yard data.");
      set({ ready: true });
    }
  },

  setSearch: (search) => set({ search }),
  setScanned: (loadingScannedFor) => set({ loadingScannedFor }),
  setExitSelected: (exitSelectedId) => set({ exitSelectedId }),

  createTicket: async (input) => {
    try {
      const { state, ticket } = (await postJson("/api/tickets", input)) as {
        state: YardState;
        ticket: Ticket | null;
      };
      set({ ...state, lastTokenId: ticket?.id ?? null });
      if (ticket) toast.success(`Token #${ticket.serial} issued — ${ticket.vehicle}`);
      return ticket;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create ticket.");
      return null;
    }
  },

  ticketAction: async (id, action, payload) => {
    try {
      const { state } = (await postJson(`/api/tickets/${id}`, {
        action,
        ...payload,
      })) as { state: YardState };
      set({ ...state });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
      return false;
    }
  },

  ackAlert: async (id) => {
    try {
      const { state } = (await postJson(`/api/alerts/${id}/ack`)) as {
        state: YardState;
      };
      set({ ...state });
    } catch {
      toast.error("Could not acknowledge alert.");
    }
  },

  updateSettings: async (settings) => {
    try {
      const { state } = (await postJson("/api/settings", settings)) as {
        state: YardState;
      };
      set({ ...state });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save configuration.");
      return false;
    }
  },

  reset: async () => {
    try {
      const { state } = (await postJson("/api/reset")) as { state: YardState };
      set({
        ...state,
        lastTokenId: null,
        loadingScannedFor: null,
        exitSelectedId: null,
        search: "",
      });
      toast.success("Demo data reset.");
    } catch {
      toast.error("Could not reset demo data.");
    }
  },

  createTenant: async (input) => {
    try {
      const state = await postJson("/api/tenants", { action: "create", ...input });
      set({ ...state });
      toast.success(`Client ${input.name} onboarded successfully.`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Onboarding failed.");
      return false;
    }
  },

  updateTenantConfig: async (id, seats, modules) => {
    try {
      const state = await postJson("/api/tenants", { action: "updateConfig", id, seats, modules });
      set({ ...state });
      toast.success("Tenant configuration updated.");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed.");
      return false;
    }
  },

  extendTenant: async (id, years) => {
    try {
      const state = await postJson("/api/tenants", { action: "extend", id, years });
      set({ ...state });
      toast.success("License subscription extended.");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extension failed.");
      return false;
    }
  },

  setTenantLicense: async (id, expiryDate, status) => {
    try {
      const state = await postJson("/api/tenants", { action: "setLicense", id, expiryDate, status });
      set({ ...state });
      toast.success("License updated successfully.");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "License update failed.");
      return false;
    }
  },

  deleteTenant: async (id) => {
    try {
      const state = await postJson("/api/tenants", { action: "delete", id });
      set({ ...state });
      toast.success("Tenant client removed.");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Removal failed.");
      return false;
    }
  },

  createOperator: async (input) => {
    try {
      const state = await postJson("/api/operators", { action: "create", ...input });
      set({ ...state });
      toast.success(`Operator ${input.name} registered.`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operator registration failed.");
      return false;
    }
  },

  deleteOperator: async (id) => {
    try {
      const state = await postJson("/api/operators", { action: "delete", id });
      set({ ...state });
      toast.success("Operator account deleted.");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deletion failed.");
      return false;
    }
  },

  updatePermissions: async (role, allowedPaths) => {
    try {
      const state = await postJson("/api/permissions", { role, allowedPaths });
      set({ ...state });
      toast.success(`Permissions updated for ${role}.`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Updating permissions failed.");
      return false;
    }
  },

  changePassword: async (username, passcode, currentPasscode) => {
    try {
      const state = await postJson("/api/operators", {
        action: "change-password",
        username,
        passcode,
        currentPasscode,
      });
      set({ ...state });
      
      const current = get().currentUser;
      if (current && current.username === username.trim().toLowerCase()) {
        const nextUser = {
          ...current,
          passcode,
          isFirstLogin: false,
        };
        set({ currentUser: nextUser });
        if (typeof window !== "undefined") {
          localStorage.setItem("yardflow_user", JSON.stringify(nextUser));
        }
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Password change failed.");
      return false;
    }
  },

  startPolling: () => {
    if (_pollTimer) return; // already polling
    _pollTimer = setInterval(async () => {
      if (_polling) return;
      _polling = true;
      try {
        // Cookie carries auth + tenant scope automatically. A superadmin viewing a
        // client keeps that tenant's data refreshing via the ?tenantId= param.
        const { viewTenantId, currentUser: pollUser } = get();
        const res = await fetch(stateUrl(viewTenantId, pollUser), { cache: "no-store" });
        if (res.status === 401) {
          // Session gone/expired server-side — drop the client session too.
          set({ currentUser: null });
          if (typeof window !== "undefined") {
            localStorage.removeItem("yardflow_user");
          }
          return;
        }
        if (res.ok) {
          const state: YardState = await res.json();

          // Keep nav fresh if the admin edited this role's permissions. Matched
          // by username only (passcodes no longer travel to the client).
          const currentSession = get().currentUser;
          let nextSession = currentSession;
          if (currentSession && currentSession.username !== "superadmin") {
            const freshOp = state.operators.find(
              (o) => o.username === currentSession.username
            );
            if (freshOp) {
              const freshPerm = state.permissions.find((p) => p.role === freshOp.role);
              const allowedPaths = (freshPerm ? freshPerm.allowedPaths : currentSession.allowedPaths).filter((p) => p !== "/superadmin");
              nextSession = {
                ...currentSession,
                allowedPaths,
                tenantId: freshOp.tenantId,
              };
            }
            // If not found in this workspace snapshot, leave the session as-is;
            // /api/state 401 (above) is the authority on expiry, not this list.
          }

          set({
            tickets: state.tickets,
            alerts: state.alerts,
            activity: state.activity,
            settings: state.settings,
            tenants: state.tenants,
            operators: state.operators,
            permissions: state.permissions,
            currentUser: nextSession,
          });
        }
      } catch {
        // silent background poll handler
      } finally {
        _polling = false;
      }
    }, 10_000); // refresh every 10 seconds
  },

  stopPolling: () => {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  },
}));

/** Case-insensitive filter across vehicle / boe / serial. */
export function filterBySearch(tickets: Ticket[], search: string): Ticket[] {
  const q = search.trim().replace(/\s+/g, " ").toLowerCase();
  if (!q) return tickets;
  return tickets.filter(
    (t) =>
      t.vehicle.replace(/\s+/g, " ").toLowerCase().includes(q) ||
      t.boe.replace(/\s+/g, " ").toLowerCase().includes(q) ||
      String(t.serial).includes(q),
  );
}
