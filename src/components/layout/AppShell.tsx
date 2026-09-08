"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, RefreshCw, Tag, GitCompare,
  ShoppingCart, BarChart2, Settings, LogOut, Bell,
  ChevronRight, Menu, X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types";
import NotificationBell from "@/components/layout/NotificationBell";
import clsx from "clsx";

// Nav items and which roles can see them
const NAV = [
  { href: "/dashboard",    label: "Dashboard",     icon: LayoutDashboard, roles: ["admin","manager","planner","area_lead","viewer"] },
  { href: "/replenishment",label: "Replenishment", icon: RefreshCw,       roles: ["admin","manager","planner"] },
  { href: "/abc-review",   label: "ABC Review",    icon: Tag,             roles: ["admin","manager","area_lead"] },
  { href: "/cross-plant",  label: "Cross-Plant",   icon: GitCompare,      roles: ["admin","manager"] },
  { href: "/requisitions", label: "Requisitions",  icon: ShoppingCart,    roles: ["admin","manager","planner"] },
  { href: "/reports",      label: "Reports",       icon: BarChart2,       roles: ["admin","manager","viewer"] },
  { href: "/admin",        label: "Admin",         icon: Settings,        roles: ["admin"] },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin:     "IT / Platform Admin",
  manager:   "Inv. Manager",
  planner:   "Requisitor / Planner",
  area_lead: "Area Lead",
  viewer:    "Viewer",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname           = usePathname();
  const { authUser, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = authUser?.effectiveRole ?? "viewer";

  const visibleNav = NAV.filter(n => n.roles.includes(role));

  const SidebarContent = () => (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <div className="w-8 h-8 rounded-full bg-lear-red flex items-center justify-center flex-shrink-0">
          <span className="text-white font-black text-sm">L</span>
        </div>
        <div>
          <div className="text-white font-bold text-sm leading-tight">Inventory Cockpit</div>
          <div className="text-white/40 text-xs leading-tight">Lear Corporation</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-white/30 text-xs uppercase tracking-widest font-semibold px-2 mb-2">
          Navigation
        </p>
        {NAV.map(item => {
          const allowed = item.roles.includes(role);
          const active  = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon    = item.icon;

          if (!allowed) return (
            <div key={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded text-sm text-white/25 cursor-not-allowed select-none">
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </div>
          );

          return (
            <Link key={item.href} href={item.href}
              onClick={() => setMobileOpen(false)}
              className={clsx(
                "flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors",
                active
                  ? "bg-lear-red text-white font-semibold"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
              {active && <ChevronRight className="w-3 h-3 ml-auto" />}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-7 h-7 rounded-full bg-lear-red flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {authUser?.profile.full_name?.charAt(0) ?? "?"}
          </div>
          <div className="min-w-0">
            <div className="text-white text-xs font-semibold truncate">
              {authUser?.profile.full_name ?? authUser?.email}
            </div>
            <div className="text-white/40 text-xs truncate">
              {ROLE_LABELS[role]}
            </div>
          </div>
        </div>
        <button onClick={signOut}
          className="flex items-center gap-2 text-white/50 hover:text-white text-xs transition-colors w-full">
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-col bg-lear-black flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex flex-col w-56 h-full bg-lear-black">
            <button onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 text-white/50 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-lear-gray-200 flex items-center px-5 py-3 gap-4 flex-shrink-0">
          <button onClick={() => setMobileOpen(true)} className="md:hidden text-lear-gray-600">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <NotificationBell />
          {authUser?.profile.demo_active_role && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1
                             bg-amber-50 border border-amber-200 rounded text-xs font-semibold text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Demo Role: {ROLE_LABELS[authUser.effectiveRole]}
            </span>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
