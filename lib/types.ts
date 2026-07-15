// Domain model for YARDFLOW. Kept framework-agnostic so it survives the
// eventual swap from the local file store (phase 1) to Prisma/Postgres.

export type TicketStatus =
  | "awaiting_loading"
  | "awaiting_billing"
  | "awaiting_exit"
  | "exited"
  | "held";

export interface Ticket {
  id: string;
  serial: number;
  vehicle: string;
  boe: string;
  agent: string;
  cargo: string;
  status: TicketStatus;
  bay: string;
  remarks?: string;
  entryTime: string; // ISO timestamp
  loadingEnd: string | null;
  invoice: string | null;
  exitTime: string | null;
  holdReason: string | null;
  paymentStatus?: "Paid" | "Not Paid" | null;
}

export interface Alert {
  id: number;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

export type ActivityAction =
  | "entry"
  | "loading_complete"
  | "loading_skip"
  | "billing_complete"
  | "billing_skip"
  | "exit"
  | "hold"
  | "alert_ack"
  | "reset";

export interface ActivityEntry {
  id: string;
  at: string; // ISO timestamp
  action: ActivityAction;
  ticketId?: string;
  serial?: number;
  vehicle?: string;
  detail?: string;
}

export interface TenantClient {
  id: string;
  name: string;
  domain: string;
  licenseKey: string;
  plan: "Enterprise Plan" | "Professional Plan" | "Basic Plan";
  status: "Active" | "Expired" | "Suspended";
  onboardedDate: string;
  expiryDate: string;
  seats: number;
}

export interface OperatorAccount {
  id: string;
  name: string;
  username: string;
  passcode: string;
  role: string;
}

export interface RolePermission {
  role: string;
  allowedPaths: string[];
}

export interface Counters {
  serial: number;
  boe: number;
}

export interface SystemSettings {
  terminalName: string;
  maxActiveBays: number;
  timezone: string;
}

/** Everything the client needs to render the whole app in one payload. */
export interface YardState {
  tickets: Ticket[];
  alerts: Alert[];
  activity: ActivityEntry[];
  settings: SystemSettings;
  tenants: TenantClient[];
  operators: OperatorAccount[];
  permissions: RolePermission[];
}

/** The persisted ledger (source of truth on disk). */
export interface Ledger {
  tickets: Ticket[];
  alerts: Alert[];
  counters: Counters;
  settings: SystemSettings;
  tenants: TenantClient[];
  operators: OperatorAccount[];
  permissions: RolePermission[];
  lastResetDate?: string;
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  awaiting_loading: "Awaiting Loading",
  awaiting_billing: "Awaiting Billing",
  awaiting_exit: "Awaiting Exit",
  exited: "Exited",
  held: "Held",
};

