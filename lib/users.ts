export interface OperatorUser {
  username: string;
  // Optional: server-side auth (Phase 3) no longer ships the passcode to the
  // client. The persisted session identity carries no secret.
  passcode?: string;
  role: string;
  name: string;
  allowedPaths: string[];
  isFirstLogin?: boolean;
  tenantId?: string;
}

export const OPERATOR_ACCOUNTS: OperatorUser[] = [
  {
    username: "dashboard",
    passcode: "dash123",
    role: "dashboard",
    name: "Dashboard Operator",
    allowedPaths: ["/", "/reports"],
  },
  {
    username: "entry",
    passcode: "entry123",
    role: "entry",
    name: "Entry Gate Operator",
    allowedPaths: ["/entry"],
  },
  {
    username: "billing",
    passcode: "billing123",
    role: "billing",
    name: "Billing Clerk",
    allowedPaths: ["/billing"],
  },
  {
    username: "loading",
    passcode: "loading123",
    role: "loading",
    name: "Loading Supervisor",
    allowedPaths: ["/loading"],
  },
  {
    username: "exit",
    passcode: "exit123",
    role: "exit",
    name: "Exit Security Guard",
    allowedPaths: ["/exit"],
  },
  {
    username: "admin",
    passcode: "admin123",
    role: "admin",
    name: "Terminal Admin",
    allowedPaths: ["/", "/reports", "/admin"],
  },
  {
    username: "superadmin",
    passcode: "super123",
    role: "superadmin",
    name: "Platform Owner",
    allowedPaths: ["/", "/entry", "/billing", "/loading", "/exit", "/reports", "/admin", "/superadmin"],
  },
];
