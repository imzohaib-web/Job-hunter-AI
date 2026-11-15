import {
  BarChart3,
  Briefcase,
  KanbanSquare,
  LayoutDashboard,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const navItems: readonly NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/applications", label: "Applications", icon: KanbanSquare },
  { to: "/profile", label: "Profile", icon: UserRound },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;
