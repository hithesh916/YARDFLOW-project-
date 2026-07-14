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
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import { fmtClock, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Login } from "@/components/login";
import { Panel } from "@/components/panel";

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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  
  const ready = useStore((s) => s.ready);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const hydrate = useStore((s) => s.hydrate);
  const startPolling = useStore((s) => s.startPolling);
  const stopPolling = useStore((s) => s.stopPolling);
  const alerts = useStore((s) => s.alerts);
  
  const currentUser = useStore((s) => s.currentUser);
  const logout = useStore((s) => s.logout);

  const unacked = alerts.filter((a) => !a.acknowledged).length;
  const [now, setNow] = useState<Date | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    hydrate().then(() => startPolling());
    return () => stopPolling();
  }, [hydrate, startPolling, stopPolling]);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Automatic routing redirect to default allowed page if they hit root or an unauthorized page
  useEffect(() => {
    if (ready && currentUser) {
      const isAllowed = pathname === "/" || currentUser.allowedPaths.includes(pathname);
      if (!isAllowed) {
        // If current path isn't allowed, push to first allowed route
        const defaultPath = currentUser.allowedPaths.find(p => p === "/") || currentUser.allowedPaths[0];
        if (defaultPath) {
          router.push(defaultPath);
        }
      }
    }
  }, [ready, currentUser, pathname, router]);

  const settings = useStore((s) => s.settings);
  const terminalName = settings?.terminalName || "Terminal A-1";

  const title = TITLES[pathname] ?? "YARDFLOW";
  const subtitle = pathname === "/" 
    ? `${terminalName} · Live Operations` 
    : terminalName;

  // Render Login page if not authenticated
  if (ready && !currentUser) {
    return <Login />;
  }

  // Filter navigation links according to current user's permissions (Dashboard is always visible)
  const allowedPrimary = PRIMARY.filter((item) =>
    item.href === "/" || (currentUser?.allowedPaths.includes(item.href) ?? false),
  );
  const allowedSecondary = SECONDARY.filter((item) =>
    currentUser?.allowedPaths.includes(item.href),
  );

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
      {/* Desktop Sidebar (hidden on mobile/tablet) */}
      <aside className="hidden lg:flex sticky top-0 h-screen w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-6 pb-5 pt-6">
          <h1 className="text-[19px] font-extrabold tracking-tight">
            YARDFLOW<span className="text-blue-600">™</span>
          </h1>
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
          <p className="mx-4 mt-[18px] text-[10px] text-slate-300">
            Product by Cubiqlab Technologies
          </p>
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
              <h1 className="text-[19px] font-extrabold tracking-tight">
                YARDFLOW<span className="text-blue-600">™</span>
              </h1>
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
              <p className="mt-[18px] text-[10px] text-slate-300">
                Product by Cubiqlab Technologies
              </p>
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
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vehicle, BOE, or serial..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:ring-[3px] focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5 ml-auto sm:ml-0">
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

            {/* Profile badge with Name and Role */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right text-xs leading-none">
                <div className="font-extrabold text-slate-800">{currentUser?.name}</div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                  {currentUser?.role}
                </div>
              </div>
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white shrink-0">
                {initials}
              </div>
            </div>
          </div>
        </header>

        <main className="flex flex-col gap-6 p-8">
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
              {/* Demo Mode Notice */}
              <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 border border-amber-200 text-[13px] leading-relaxed text-amber-800 shadow-sm print:hidden">
                <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-700" />
                <div>
                  <strong>Demo mode:</strong> operations are saved in a local file database on this server. Connect the secured production database and API layer before using this at a live gate.
                </div>
              </div>
              {children}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
