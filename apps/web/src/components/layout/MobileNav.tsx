import { NavLink } from "react-router-dom";
import { navItems } from "@/components/layout/navItems";
import { cn } from "@/lib/utils";

export function MobileNav() {
  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t bg-card/95 backdrop-blur px-2 shadow-lg"
    >
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              isActive
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className={cn(
                  "h-5 w-5 transition-transform",
                  isActive ? "text-primary scale-110" : "text-muted-foreground",
                )}
              />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
