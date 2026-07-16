import type { Ledger } from "./types";

export const BAYS = ["Bay 01", "Bay 02", "Bay 03", "Bay 04", "Bay 05"];
export const AGENTS = [
  "Global Logistics",
  "Swift Freight",
  "National Hauling",
  "Coastal Cargo",
  "Apex Transport",
];
export const CARGO = [
  "Heavy Machinery",
  "Palletized Goods",
  "Bulk Grain",
  "Steel Coils",
  "Containerized Freight",
];

export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function buildSeed(): Ledger {
  return {
    tickets: [],
    alerts: [],
    counters: { serial: 0, billingSerial: 0, loadingSerial: 0, boe: 1000 },
    settings: {
      terminalName: "",
      maxActiveBays: 20,
      timezone: "Asia/Kolkata",
    },
    tenants: [
      {
        id: "ten-1",
        name: "Apex Terminal Group",
        domain: "apex-terminals.com",
        licenseKey: "YF-APEX-9983-2026",
        plan: "Enterprise Plan",
        status: "Active",
        onboardedDate: "2026-03-15",
        expiryDate: "2027-03-15",
        seats: 15,
      },
      {
        id: "ten-2",
        name: "Vertex Logistics",
        domain: "vertex-logistics.com",
        licenseKey: "YF-VERT-4412-2026",
        plan: "Professional Plan",
        status: "Active",
        onboardedDate: "2026-05-10",
        expiryDate: "2026-11-10",
        seats: 8,
      },
      {
        id: "ten-3",
        name: "Nexus Cargo Hub",
        domain: "nexus-cargo.com",
        licenseKey: "YF-NEXU-1102-2026",
        plan: "Basic Plan",
        status: "Expired",
        onboardedDate: "2025-06-01",
        expiryDate: "2026-06-01",
        seats: 3,
      },
    ],
    operators: [
      {
        id: "op-1",
        name: "Admin",
        username: "admin",
        passcode: "admin123",
        role: "Administrator",
        isFirstLogin: true,
      },
      {
        id: "op-2",
        name: "Gate Operator",
        username: "entry",
        passcode: "entry123",
        role: "Gate Operator",
      },
      {
        id: "op-3",
        name: "Loading Operator",
        username: "loading",
        passcode: "loading123",
        role: "Loading Operator",
      },
      {
        id: "op-4",
        name: "Billing Operator",
        username: "billing",
        passcode: "billing123",
        role: "Billing Agent",
      },
      {
        id: "op-5",
        name: "Exit Operator",
        username: "exit",
        passcode: "exit123",
        role: "Security Guard",
      },
    ],
    permissions: [
      {
        role: "Administrator",
        allowedPaths: ["/", "/entry", "/billing", "/loading", "/exit", "/reports", "/admin"],
      },
      {
        role: "Gate Operator",
        allowedPaths: ["/", "/entry"],
      },
      {
        role: "Loading Operator",
        allowedPaths: ["/", "/loading"],
      },
      {
        role: "Billing Agent",
        allowedPaths: ["/", "/billing"],
      },
      {
        role: "Security Guard",
        allowedPaths: ["/", "/exit"],
      },
    ],
  };
}
