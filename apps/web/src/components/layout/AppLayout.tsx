import {
  BarChart3,
  Briefcase,
  KanbanSquare,
  LayoutDashboard,
  UserRound,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { HealthBanner } from "@/components/HealthBanner";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/applications", label: "Applications", icon: KanbanSquare },
  { to: "/profile", label: "Profile", icon: UserRound },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <HealthBanner />
      <div className="flex flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r bg-white">
          <div className="border-b px-4 py-4">
            <p className="text-lg font-semibold tracking-tight text-primary">JobPilot</p>
            <p className="text-xs text-muted-foreground">AI job-hunt assistant</p>
          </div>
          <nav className="flex flex-col gap-1 p-2">
            {navItems.map(({ to, label, icon: Icon, ...rest }) => (
              <NavLink
                key={to}
                to={to}
                end={"end" in rest ? rest.end : false}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
