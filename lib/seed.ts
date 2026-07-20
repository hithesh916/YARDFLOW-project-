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
    tenants: [],
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
