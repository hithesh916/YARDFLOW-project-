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
  changePassword: (username: string, passcode: string) => Promise<boolean>;

  // real-time polling
  startPolling: () => void;
  stopPolling: () => void;
}

// The logged-in user's workspace, read from the persisted session. Sent on every
// request as x-tenant-id so the server scopes reads/writes to this company's data.
// Absent for the superadmin and the hardcoded demo logins → shared default workspace.
export function tenantHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("yardflow_user");
    if (!raw) return {};
    const tid = JSON.parse(raw)?.tenantId;
    return tid ? { "x-tenant-id": String(tid) } : {};
  } catch {
    return {};
  }
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tenantHeaders() },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Request failed");
  return data;
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

  login: async (username, passcode) => {
    const cleanUser = username.trim().toLowerCase();

    // 1. Superadmin check (SaaS Platform Owner)
    if (cleanUser === "superadmin" && passcode === "super123") {
      const superUser: OperatorUser = {
        username: "superadmin",
        passcode: "super123",
        role: "superadmin",
        name: "Platform Owner",
        allowedPaths: ["/", "/entry", "/billing", "/loading", "/exit", "/reports", "/admin", "/superadmin"],
      };
      set({ currentUser: superUser });
      if (typeof window !== "undefined") {
        localStorage.setItem("yardflow_user", JSON.stringify(superUser));
      }
      return true;
    }

    // 1b. Hardcoded Developer Quick Logins (Entry and Billing)
    if (cleanUser === "entry" && passcode === "entry123") {
      const entryUser: OperatorUser = {
        username: "entry",
        passcode: "entry123",
        role: "Gate Operator",
        name: "Gate Operator",
        allowedPaths: ["/", "/entry"],
      };
      set({ currentUser: entryUser });
      if (typeof window !== "undefined") {
        localStorage.setItem("yardflow_user", JSON.stringify(entryUser));
      }
      return true;
    }

    if (cleanUser === "billing" && passcode === "billing123") {
      const billingUser: OperatorUser = {
        username: "billing",
        passcode: "billing123",
        role: "Billing Agent",
        name: "Billing Operator",
        allowedPaths: ["/", "/billing"],
      };
      set({ currentUser: billingUser });
      if (typeof window !== "undefined") {
        localStorage.setItem("yardflow_user", JSON.stringify(billingUser));
      }
      return true;
    }

    // 2. Scan dynamic database operator accounts
    const dynamicOp = get().operators.find(
      (o) => o.username === cleanUser && o.passcode === passcode,
    );
    if (dynamicOp) {
      const permGrid = get().permissions.find((p) => p.role === dynamicOp.role);

      let allowedPaths = ["/"];
      if (permGrid) {
        allowedPaths = permGrid.allowedPaths;
      } else {
        // Fallback default permissions
        if (dynamicOp.role === "Administrator" || dynamicOp.role === "Admin") {
          allowedPaths = ["/", "/entry", "/billing", "/loading", "/exit", "/reports", "/admin"];
        } else if (dynamicOp.role === "Gate Operator") {
          allowedPaths = ["/", "/entry"];
        } else if (dynamicOp.role === "Loading Operator") {
          allowedPaths = ["/", "/loading"];
        } else if (dynamicOp.role === "Billing Agent") {
          allowedPaths = ["/", "/billing"];
        } else if (dynamicOp.role === "Security Guard") {
          allowedPaths = ["/", "/exit"];
        }
      }

      // Strip superadmin access for dynamic operators
      allowedPaths = allowedPaths.filter((p) => p !== "/superadmin");

      const mappedUser: OperatorUser = {
        username: dynamicOp.username,
        passcode: dynamicOp.passcode,
        role: dynamicOp.role,
        name: dynamicOp.name,
        allowedPaths,
        isFirstLogin: dynamicOp.isFirstLogin,
        tenantId: dynamicOp.tenantId,
      };

      set({ currentUser: mappedUser });
      if (typeof window !== "undefined") {
        localStorage.setItem("yardflow_user", JSON.stringify(mappedUser));
      }
      // Re-fetch state under the new workspace header so a tenant admin sees
      // their own company's data immediately, not after the next poll tick.
      void get().hydrate();
      return true;
    }

    return false;
  },

  logout: () => {
    set({ currentUser: null });
    if (typeof window !== "undefined") {
      localStorage.removeItem("yardflow_user");
    }
  },

  hydrate: async () => {
    let storedUser: string | null = null;
    if (typeof window !== "undefined") {
      storedUser = localStorage.getItem("yardflow_user");
    }

    try {
      const res = await fetch("/api/state", { cache: "no-store", headers: tenantHeaders() });
      const state: YardState = await res.json();
      set({ ...state, ready: true });

      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser) as OperatorUser;
          if (parsed.username === "superadmin" && parsed.passcode === "super123") {
            // Rebuild the superadmin identity from canonical values rather than
            // trusting the persisted object — a session saved before a path
            // (e.g. /reports) was added would otherwise keep a stale nav.
            set({
              currentUser: {
                ...parsed,
                role: "superadmin",
                name: "Platform Owner",
                allowedPaths: ["/", "/entry", "/billing", "/loading", "/exit", "/reports", "/admin", "/superadmin"],
              },
            });
          } else {
            const freshOp = state.operators.find(
              (o) => o.username === parsed.username && o.passcode === parsed.passcode,
            );
            if (freshOp) {
              const freshPerm = state.permissions.find((p) => p.role === freshOp.role);
              const allowedPaths = (freshPerm ? freshPerm.allowedPaths : parsed.allowedPaths).filter((p) => p !== "/superadmin");
              set({
                currentUser: {
                  ...parsed,
                  allowedPaths,
                  tenantId: freshOp.tenantId,
                },
              });
            } else {
              localStorage.removeItem("yardflow_user");
              set({ currentUser: null });
            }
          }
        } catch {
          localStorage.removeItem("yardflow_user");
        }
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

  changePassword: async (username, passcode) => {
    try {
      const state = await postJson("/api/operators", {
        action: "change-password",
        username,
        passcode,
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
        const res = await fetch("/api/state", { cache: "no-store", headers: tenantHeaders() });
        if (res.ok) {
          const state: YardState = await res.json();
          
          // Capture current session changes if permission maps change
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
            } else {
              // Session expired
              nextSession = null;
              if (typeof window !== "undefined") {
                localStorage.removeItem("yardflow_user");
              }
            }
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
