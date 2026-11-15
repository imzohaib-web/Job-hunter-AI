import { Bot } from "lucide-react";
import { NavLink } from "react-router-dom";
import { navItems } from "@/components/layout/navItems";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-card text-card-foreground">
      {/* Brand header */}
      <div className="flex h-16 items-center gap-3 border-b px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Bot className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-base font-bold tracking-tight text-foreground">
            JobPilot
          </span>
          <span className="text-[11px] font-medium text-muted-foreground -mt-0.5">
            AI Job-Hunt Assistant
          </span>
        </div>
      </div>

      {/* Main navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-transform group-hover:scale-105",
                      isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Footer subtle prompt */}
      <div className="border-t p-4">
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">AI Job Search Ready</p>
          <p className="text-[11px] leading-relaxed">
            Upload your resume to unlock tailored matches & research.
          </p>
        </div>
      </div>
    </aside>
  );
}
