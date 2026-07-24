"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  ClipboardCheck,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  PlusCircle,
  ReceiptText,
  Search,
  Settings,
  ShieldAlert,
  Ban,
  Menu,
  X,
  Sun,
  Moon,
  Key,
  Briefcase,
  SlidersHorizontal,
  FileDown,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { filterBySearch, useStore } from "@/lib/store";
import { fmtClock, fmtDate, pad, getLocalDateString } from "@/lib/format";
import { STATUS_LABELS, type Ticket, type TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Login } from "@/components/login";
import { Panel } from "@/components/panel";
import {
  LicenseInfoModal,
  ModuleCustomizationModal,
  GenerateReportsModal,
} from "@/components/profile-modals";
import pkg from "../package.json";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const PRIMARY: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/entry", label: "Entry Gate", icon: LogIn },
  { href: "/billing", label: "Billing Approval", icon: ReceiptText },
  { href: "/loading", label: "Loading Approval", icon: ClipboardCheck },
  { href: "/exit", label: "Exit Gate", icon: LogOut },
];

const SECONDARY: NavItem[] = [
  { href: "/admin", label: "Admin Console", icon: Settings },
  { href: "/superadmin", label: "Super-Admin Hub", icon: ShieldAlert },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/entry": "Entry Gate",
  "/billing": "Billing Approval",
  "/loading": "Loading Approval",
  "/exit": "Exit Gate",
  "/reports": "Reports",
  "/admin": "Admin Console",
  "/superadmin": "Super-Admin Hub",
};

const MODULE_ROUTES: Record<string, string> = {
  "/": "dashboard",
  "/entry": "entry",
  "/billing": "billing",
  "/loading": "loading",
  "/exit": "exit",
  "/reports": "reports",
};

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
        active
          ? "bg-blue-50 text-blue-700"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
      )}
    >
      <Icon size={18} className="shrink-0" />
      {item.label}
    </Link>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-9 w-9 rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 shrink-0" />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 outline-none hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100 transition-all duration-200 active:scale-95 cursor-pointer"
      aria-label="Toggle Theme"
    >
      {isDark ? (
        <Sun size={17} className="text-amber-500 transition-transform duration-300 hover:rotate-45" />
      ) : (
        <Moon size={17} className="text-blue-600 transition-transform duration-300 hover:-rotate-12" />
      )}
    </button>
  );
}

const ROLE_PRIMARY_PATHS: Record<string, string> = {
  "superadmin": "/superadmin",
  "Administrator": "/admin",
  "Admin": "/admin",
  "Gate Operator": "/entry",
  "Billing Agent": "/billing",
  "Loading Operator": "/loading",
  "Security Guard": "/exit",
};

// All stage tokens a ticket carries, formatted for display (G- gate, B- billing,
// L- loading). Billing-desk tickets have no gate serial (serial 0), so it's omitted.
function ticketTokens(t: Ticket): string[] {
  const out: string[] = [];
  if (t.serial > 0) out.push(t.manualGateToken || `G-${pad(t.serial)}`);
  if (t.billingSerial) out.push(t.manualBillingToken || `B-${pad(t.billingSerial)}`);
  if (t.loadingSerial) out.push(`L-${pad(t.loadingSerial)}`);
  return out;
}

// Where a search hit should jump to, based on its current lifecycle stage. Holds are
// managed on the Exit page; exited tickets live in Reports history.
const STATUS_ROUTE: Record<TicketStatus, string> = {
  awaiting_billing: "/billing",
  awaiting_loading: "/loading",
  awaiting_exit: "/exit",
  held: "/exit",
  exited: "/reports",
};

const STATUS_DOT: Record<TicketStatus, string> = {
  awaiting_billing: "bg-amber-500",
  awaiting_loading: "bg-blue-500",
  awaiting_exit: "bg-violet-500",
  held: "bg-rose-500",
  exited: "bg-slate-400",
};

export function AppShell({
  children,
  dbConfigured = false,
}: {
  children: React.ReactNode;
  dbConfigured?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  
  const ready = useStore((s) => s.ready);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const tickets = useStore((s) => s.tickets);
  const [searchFocused, setSearchFocused] = useState(false);
  const hydrate = useStore((s) => s.hydrate);
  const startPolling = useStore((s) => s.startPolling);
  const stopPolling = useStore((s) => s.stopPolling);
  const alerts = useStore((s) => s.alerts);
  const tenants = useStore((s) => s.tenants);
  const settings = useStore((s) => s.settings);

  const currentUser = useStore((s) => s.currentUser);
  const logout = useStore((s) => s.logout);
  const viewTenantId = useStore((s) => s.viewTenantId);
  const setViewTenant = useStore((s) => s.setViewTenant);

  const currentTenant = currentUser?.tenantId
    ? tenants.find(t => t.id === currentUser.tenantId)
    : null;

  // Superadmin "view a client's dashboard" (read-only) session, if any.
  const viewingTenant =
    viewTenantId && currentUser?.role === "superadmin"
      ? tenants.find((t) => t.id === viewTenantId) ?? null
      : null;

  // License gate: a tenant whose subscription is suspended/expired (by status or by
  // the expiry date having passed) is locked out of the whole portal — their data is
  // untouched in the database and access returns the moment the super-admin renews.
  // Super-admin (no tenantId) and the built-in demo accounts are never gated.
  // Compare against the tenant's business day (not the browser's tz) so the portal
  // locks/unlocks on the same day boundary the server uses everywhere else.
  const todayStr = getLocalDateString(new Date(), settings?.timezone);
  const licenseBlocked =
    !!currentTenant &&
    currentUser?.role !== "superadmin" &&
    (currentTenant.status !== "Active" || currentTenant.expiryDate < todayStr);

  const unacked = alerts.filter((a) => !a.acknowledged).length;

  // Global token lookup: match across BOE / vehicle / any stage token, all statuses.
  // Active vehicles first (still in the yard), then most-recent by entry time.
  const trimmedSearch = search.trim();
  const searchResults = trimmedSearch
    ? filterBySearch(tickets, search)
        .slice()
        .sort((a, b) => {
          const aActive = a.status !== "exited" ? 0 : 1;
          const bActive = b.status !== "exited" ? 0 : 1;
          if (aActive !== bActive) return aActive - bActive;
          return (b.entryTime || "").localeCompare(a.entryTime || "");
        })
    : [];
  const SEARCH_LIMIT = 8;
  const searchShown = searchResults.slice(0, SEARCH_LIMIT);

  function goToTicket(t: Ticket) {
    setSearchFocused(false);
    router.push(STATUS_ROUTE[t.status] ?? "/");
  }
  const [now, setNow] = useState<Date | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);

  useEffect(() => {
    hydrate().then(() => startPolling());
    return () => stopPolling();
  }, [hydrate, startPolling, stopPolling]);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setHasRedirected(false);
    }
  }, [currentUser]);

  // Automatic routing redirect to default allowed page if they hit root or an unauthorized page
  useEffect(() => {
    if (ready && currentUser) {
      // While a superadmin is viewing a client's dashboard (read-only), "/" IS the
      // intended destination — skip the auto-redirect that would otherwise bounce
      // them back to /superadmin.
      if (viewTenantId && currentUser.role === "superadmin") return;

      // Direct redirect on first load/login if hitting root /
      if (!hasRedirected && pathname === "/") {
        const primaryPath = ROLE_PRIMARY_PATHS[currentUser.role];
        if (primaryPath && currentUser.allowedPaths.includes(primaryPath)) {
          setHasRedirected(true);
          router.push(primaryPath);
          return;
        }
      }

      const isAllowed = pathname === "/" || currentUser.allowedPaths.includes(pathname);
      if (!isAllowed) {
        // If current path isn't allowed, push to first allowed route
        const defaultPath = currentUser.allowedPaths.find(p => p === "/") || currentUser.allowedPaths[0];
        if (defaultPath) {
          router.push(defaultPath);
        }
      }
    }
  }, [ready, currentUser, pathname, router, hasRedirected, viewTenantId]);

  const terminalName = settings?.terminalName || "";

  const title = TITLES[pathname] ?? "YARDFLOW";
  const subtitle = pathname === "/" 
    ? (terminalName ? `${terminalName} · Live Operations` : "Live Operations")
    : terminalName;

  // Render Login page if not authenticated
  if (ready && !currentUser) {
    return <Login />;
  }

  // License expired / suspended → lock the whole portal (data stays safe in the DB)
  if (ready && licenseBlocked && currentTenant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <Ban size={30} />
          </div>
          <h2 className="text-xl font-black tracking-tight text-slate-900">
            License {currentTenant.status === "Suspended" ? "Suspended" : "Expired"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            The subscription for <span className="font-bold text-slate-800">{currentTenant.name}</span> is
            no longer active, so access to the portal is paused.
          </p>
          <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-left text-xs">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="font-bold uppercase tracking-wider text-slate-400">Status</span>
              <span className="font-extrabold text-rose-600">{currentTenant.status}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="font-bold uppercase tracking-wider text-slate-400">Valid Until</span>
              <span className="font-extrabold text-slate-700">{currentTenant.expiryDate}</span>
            </div>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-slate-400">
            Your data is fully retained. To restore access and downloads, please contact your
            provider to renew the license.
          </p>
          <button
            onClick={() => logout()}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-900"
          >
            <LogOut size={16} /> Sign Out
          </button>
          <p className="mt-4 text-[10px] text-slate-400">Product by Cubiqlab Technologies</p>
        </div>
      </div>
    );
  }

  // Filter navigation links according to current user's permissions (Dashboard is always visible)
  const allowedPrimary = PRIMARY.filter((item) => {
    const isAllowedByRole = item.href === "/" || (currentUser?.allowedPaths.includes(item.href) ?? false);
    const requiredModule = MODULE_ROUTES[item.href];
    const isAllowedByTenant = !requiredModule || !currentTenant || !currentTenant.modules || currentTenant.modules.includes(requiredModule);
    return isAllowedByRole && isAllowedByTenant;
  });

  const allowedSecondary = SECONDARY.filter((item) => {
    const isAllowedByRole = currentUser?.allowedPaths.includes(item.href);
    const requiredModule = MODULE_ROUTES[item.href];
    const isAllowedByTenant = !requiredModule || !currentTenant || !currentTenant.modules || currentTenant.modules.includes(requiredModule);
    return isAllowedByRole && isAllowedByTenant;
  });

  const canCreateTicket = currentUser?.allowedPaths.includes("/entry");
  const isPathAllowed = pathname === "/" || (currentUser?.allowedPaths.includes(pathname) ?? false);
  
  const initials = currentUser?.name
    ? currentUser.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "OP";

  return (
    <div className="flex min-h-screen">
      {changePwOpen && (
        <ChangePasswordDialog onClose={() => setChangePwOpen(false)} />
      )}
      <LicenseInfoModal isOpen={licenseOpen} onClose={() => setLicenseOpen(false)} />
      <ModuleCustomizationModal isOpen={modulesOpen} onClose={() => setModulesOpen(false)} />
      <GenerateReportsModal isOpen={reportsOpen} onClose={() => setReportsOpen(false)} />
      {/* Desktop Sidebar (hidden on mobile/tablet) */}
      <aside className="hidden lg:flex sticky top-0 h-screen w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-6 pb-5 pt-6">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/yardflow-logo.png"
              alt="YARDFLOW logo"
              className="h-8 w-8 shrink-0 object-contain"
            />
            <h1 className="text-[19px] font-extrabold tracking-tight">
              YARDFLOW<span className="text-blue-600">™</span>
            </h1>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Yard Management System
          </p>
        </div>

        <nav className="flex flex-col gap-1 px-3">
          {allowedPrimary.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname === item.href}
            />
          ))}
        </nav>

        {canCreateTicket && (
          <div className="px-4 pt-5">
            <Link
              href="/entry"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-[11px] text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-600"
            >
              <PlusCircle size={16} /> Create Ticket
            </Link>
          </div>
        )}

        <div className="mt-auto p-3 pb-[22px]">
          <div className="mx-1 mb-2.5 h-px bg-slate-100" />
          <div className="flex flex-col gap-1">
            {allowedSecondary.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href}
              />
            ))}

            {/* Sign Out Button in Sidebar */}
            <button
              onClick={() => logout()}
              className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 text-left outline-none mt-1"
            >
              <LogOut size={18} className="shrink-0" />
              Sign Out
            </button>
          </div>
          <div className="mx-4 mt-[18px] flex items-center justify-between text-[10px] text-slate-400">
            <span>Product by Cubiqlab Technologies</span>
            <span className="font-semibold">v{pkg.version}</span>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Backdrop overlay */}
          <div
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
          />

          {/* Drawer Sidebar Panel */}
          <aside className="relative flex h-full w-[260px] flex-col bg-white p-5 shadow-xl animate-in slide-in-from-left duration-200">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
              aria-label="Close Menu"
            >
              <X size={18} />
            </button>

            <div className="pb-5 pt-1">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/yardflow-logo.png"
                  alt="YARDFLOW logo"
                  className="h-8 w-8 shrink-0 object-contain"
                />
                <h1 className="text-[19px] font-extrabold tracking-tight">
                  YARDFLOW<span className="text-blue-600">™</span>
                </h1>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Yard Management System
              </p>
            </div>

            <nav className="flex flex-col gap-1">
              {allowedPrimary.map((item) => (
                <div key={item.href} onClick={() => setMobileOpen(false)}>
                  <NavLink
                    item={item}
                    active={pathname === item.href}
                  />
                </div>
              ))}
            </nav>

            {canCreateTicket && (
              <div className="pt-4" onClick={() => setMobileOpen(false)}>
                <Link
                  href="/entry"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-[11px] text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-600"
                >
                  <PlusCircle size={16} /> Create Ticket
                </Link>
              </div>
            )}

            <div className="mt-auto">
              <div className="mb-2.5 h-px bg-slate-100" />
              <div className="flex flex-col gap-1">
                {allowedSecondary.map((item) => (
                  <div key={item.href} onClick={() => setMobileOpen(false)}>
                    <NavLink
                      item={item}
                      active={pathname === item.href}
                    />
                  </div>
                ))}

                <button
                  onClick={() => {
                    setMobileOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 text-left outline-none mt-1"
                >
                  <LogOut size={18} className="shrink-0" />
                  Sign Out
                </button>
              </div>
              <div className="mt-[18px] flex items-center justify-between text-[10px] text-slate-400">
                <span>Product by Cubiqlab Technologies</span>
                <span className="font-semibold">v{pkg.version}</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Container */}
      <div className="flex min-w-0 flex-1 flex-col bg-slate-50/50">
        <header className="sticky top-0 z-20 flex items-center gap-4 sm:gap-6 border-b border-slate-200 bg-slate-50/95 px-4 sm:px-8 py-3.5 sm:py-4 backdrop-blur">
          {/* Hamburger Menu Toggle (visible only on mobile/tablet) */}
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 lg:hidden hover:bg-slate-50 transition-colors"
            aria-label="Toggle Menu"
          >
            <Menu size={18} />
          </button>

          <div className="min-w-0 flex-1 sm:flex-initial">
            <h1 className="text-base sm:text-xl font-extrabold leading-tight truncate">{title}</h1>
            <p className="text-[10px] sm:text-xs text-slate-400 truncate">{subtitle}</p>
          </div>

          <div className="hidden md:flex flex-1 justify-center">
            <div className="relative w-full max-w-[420px]">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder="Search vehicle, BOE, or token no..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-[13px] outline-none focus:ring-[3px] focus:ring-blue-100"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}

              {/* Token search results dropdown */}
              {searchFocused && trimmedSearch.length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  {searchShown.length === 0 ? (
                    <div className="px-4 py-6 text-center text-[13px] text-slate-400">
                      No tokens match &ldquo;{trimmedSearch}&rdquo;
                    </div>
                  ) : (
                    <>
                      <div className="max-h-[360px] overflow-y-auto">
                        {searchShown.map((t) => {
                          const tokens = ticketTokens(t);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => goToTicket(t)}
                              className="flex w-full items-center gap-3 border-b border-slate-50 px-3.5 py-2.5 text-left last:border-b-0 hover:bg-slate-50"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[13px] font-extrabold text-slate-800">
                                    {t.vehicle || "—"}
                                  </span>
                                  {tokens.map((tok) => (
                                    <span
                                      key={tok}
                                      className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600"
                                    >
                                      {tok}
                                    </span>
                                  ))}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-slate-400">
                                  <span className="truncate">BOE: {t.boe || "—"}</span>
                                  {t.boeVisit ? (
                                    <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold text-slate-500">
                                      Trip {t.boeVisit}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[t.status])} />
                                <span className="text-[10px] font-semibold text-slate-500">
                                  {STATUS_LABELS[t.status]}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {searchResults.length > SEARCH_LIMIT && (
                        <div className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Showing {SEARCH_LIMIT} of {searchResults.length} — refine your search
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5 ml-auto sm:ml-0">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    className="relative text-slate-600 outline-none hover:text-slate-900"
                    aria-label="Notifications"
                  >
                    <Bell size={19} />
                    {unacked > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                        {unacked}
                      </span>
                    )}
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-72 p-3">
                <p className="mb-2 text-sm font-bold text-slate-800">
                  Notifications
                </p>
                <p className="text-xs text-slate-500">
                  {unacked > 0
                    ? `${unacked} unacknowledged security alert(s). Check the Dashboard alert panel.`
                    : "You're all caught up."}
                </p>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Date and Clock (hidden on mobile) */}
            <div className="hidden sm:block text-right text-xs leading-tight text-slate-500">
              <div>{now ? fmtDate(now) : " "}</div>
              <div className="font-mono">{now ? fmtClock(now) : " "}</div>
            </div>

            {/* Profile badge with Name and Role — click to open account menu */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    className="flex items-center gap-3 outline-none rounded-lg transition-colors hover:bg-slate-100/60 px-1.5 py-1 -mx-1"
                    aria-label="Account menu"
                  >
                    <div className="hidden sm:block text-right text-xs leading-none">
                      <div className="font-extrabold text-slate-800">{currentUser?.name}</div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                        {currentUser?.role}
                      </div>
                    </div>
                    <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white shrink-0">
                      {initials}
                    </div>
                    <ChevronDown size={15} className="text-slate-400 hidden sm:block" />
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-60 p-1.5">
                <div className="px-3 py-2 border-b border-slate-100 mb-1">
                  <div className="text-sm font-bold text-slate-800 truncate">{currentUser?.name}</div>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                    {currentUser?.role}
                  </div>
                </div>

                <button
                  onClick={() => setLicenseOpen(true)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 text-left outline-none"
                >
                  <Briefcase size={16} className="shrink-0 text-slate-400" />
                  License Information
                </button>
                <button
                  onClick={() => setModulesOpen(true)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 text-left outline-none"
                >
                  <SlidersHorizontal size={16} className="shrink-0 text-slate-400" />
                  Module Customization
                </button>
                <button
                  onClick={() => setReportsOpen(true)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 text-left outline-none"
                >
                  <FileDown size={16} className="shrink-0 text-slate-400" />
                  Generate Custom Reports
                </button>

                <div className="my-1 h-px bg-slate-100" />

                <button
                  onClick={() => setChangePwOpen(true)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 text-left outline-none"
                >
                  <Key size={16} className="shrink-0 text-slate-400" />
                  Change Password
                </button>
                <button
                  onClick={() => logout()}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 text-left outline-none"
                >
                  <LogOut size={16} className="shrink-0" />
                  Sign Out
                </button>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex flex-col gap-6 p-8">
          {/* Superadmin is viewing a client's dashboard read-only. Banner persists
              across pages until they exit the view. */}
          {viewingTenant && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] text-blue-900 shadow-sm print:hidden">
              <div className="flex items-center gap-2.5">
                <ShieldAlert size={18} className="shrink-0 text-blue-700" />
                <span>
                  Viewing <strong className="font-extrabold">{viewingTenant.name}</strong>
                  <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue-700">
                    Read only
                  </span>
                </span>
              </div>
              <button
                onClick={() => {
                  setViewTenant(null);
                  router.push("/superadmin");
                }}
                className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100"
              >
                <X size={14} /> Exit view
              </button>
            </div>
          )}
          {!ready ? (
            <div className="flex min-h-[60vh] items-center justify-center text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading yard
              operations…
            </div>
          ) : !isPathAllowed ? (
            // Fallback Security Panel if route is somehow accessed but disallowed
            <Panel className="p-16 text-center border-l-4 border-l-red-500">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
                <Ban size={28} />
              </div>
              <h3 className="text-lg font-black text-slate-800">Access Denied</h3>
              <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
                Your operator account is not authorized to view the {title} station. Please navigate to an authorized view or contact your administrator.
              </p>
              <div className="mt-6">
                <Link
                  href={currentUser?.allowedPaths[0] || "/"}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
                >
                  Return to Dashboard
                </Link>
              </div>
            </Panel>
          ) : (
            <>
              {/* Demo Mode Notice — only shown when no production database is
                  configured (DATABASE_URL unset). Once the DB is wired up this
                  banner disappears automatically. */}
              {!dbConfigured && (
                <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 border border-amber-200 text-[13px] leading-relaxed text-amber-800 shadow-sm print:hidden">
                  <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-700" />
                  <div>
                    <strong>Demo mode:</strong> no production database is connected, so operations are stored in a temporary local file that resets on restart. Set <code className="font-mono">DATABASE_URL</code> to a secured database before using this at a live gate.
                  </div>
                </div>
              )}
              {children}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// Self-service passcode change, available anytime from the sidebar
// first login). Verifies the current passcode client-side against currentUser,
// then reuses the same changePassword store action → /api/operators → DB.
function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const currentUser = useStore((s) => s.currentUser);
  const changePassword = useStore((s) => s.changePassword);
  const [current, setCurrent] = useState("");
  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [busy, setBusy] = useState(false);

  const isSuperadmin = currentUser?.role === "superadmin";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !passcode || !confirmPasscode) {
      toast.error("Please fill in all passcode fields.");
      return;
    }
    // Superadmin's passcode is fixed in this version and not changeable here.
    if (isSuperadmin) {
      toast.error("The Super-Admin passcode is fixed in this version and can't be changed here.");
      return;
    }
    // The current passcode is verified SERVER-SIDE now (the client no longer
    // holds it), so we just forward it below.
    if (passcode !== confirmPasscode) {
      toast.error("New passcode and confirm passcode do not match.");
      return;
    }
    if (passcode.length < 4) {
      toast.error("New passcode must be at least 4 characters long.");
      return;
    }
    if (passcode === current) {
      toast.error("New passcode must be different from the current one.");
      return;
    }

    setBusy(true);
    const ok = await changePassword(currentUser!.username, passcode, current);
    setBusy(false);
    if (ok) {
      toast.success("Passcode updated successfully.");
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] rounded-2xl border border-slate-200 bg-white p-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
          <Key size={22} />
        </div>
        <h2 className="text-center text-xl font-extrabold tracking-tight text-slate-900">
          Change Password
        </h2>
        <p className="mt-2 text-center text-xs text-slate-500 leading-relaxed">
          Update the passcode for <span className="font-bold text-slate-800">{currentUser?.name}</span>.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-[10px] font-black tracking-wider text-slate-500 uppercase">
              CURRENT PASSCODE
            </label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3 px-3.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
            />
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-black tracking-wider text-slate-500 uppercase">
              NEW PASSCODE
            </label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="e.g. 12345"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3 px-3.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
            />
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-black tracking-wider text-slate-500 uppercase">
              CONFIRM NEW PASSCODE
            </label>
            <input
              type="password"
              value={confirmPasscode}
              onChange={(e) => setConfirmPasscode(e.target.value)}
              placeholder="e.g. 12345"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3 px-3.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
            />
          </div>

          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 bg-white py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-500 transition-colors disabled:opacity-40"
            >
              {busy ? "Saving..." : "Update"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
