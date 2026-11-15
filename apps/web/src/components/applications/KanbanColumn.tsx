import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  BookmarkCheck,
  Clock,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ApplicationColumnStatus, ApplicationDetailItem } from "@/hooks/useApi";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
  status: ApplicationColumnStatus;
  title: string;
  apps: ApplicationDetailItem[];
  onCardClick: (app: ApplicationDetailItem) => void;
}

const statusConfig: Record<
  ApplicationColumnStatus,
  {
    icon: React.ComponentType<{ className?: string }>;
    accentClass: string;
    badgeVariant: "default" | "secondary" | "success" | "destructive" | "outline";
    borderClass: string;
    bgHeaderClass: string;
  }
> = {
  saved: {
    icon: BookmarkCheck,
    accentClass: "text-blue-500",
    badgeVariant: "secondary",
    borderClass: "border-blue-200 dark:border-blue-900/40",
    bgHeaderClass: "bg-blue-50/50 dark:bg-blue-950/20",
  },
  applied: {
    icon: Clock,
    accentClass: "text-amber-500",
    badgeVariant: "secondary",
    borderClass: "border-amber-200 dark:border-amber-900/40",
    bgHeaderClass: "bg-amber-50/50 dark:bg-amber-950/20",
  },
  interview: {
    icon: Sparkles,
    accentClass: "text-purple-500",
    badgeVariant: "default",
    borderClass: "border-purple-200 dark:border-purple-900/40",
    bgHeaderClass: "bg-purple-50/50 dark:bg-purple-950/20",
  },
  offer: {
    icon: Trophy,
    accentClass: "text-emerald-500",
    badgeVariant: "success",
    borderClass: "border-emerald-200 dark:border-emerald-900/40",
    bgHeaderClass: "bg-emerald-50/50 dark:bg-emerald-950/20",
  },
  rejected: {
    icon: XCircle,
    accentClass: "text-rose-500",
    badgeVariant: "outline",
    borderClass: "border-rose-200 dark:border-rose-900/40",
    bgHeaderClass: "bg-rose-50/50 dark:bg-rose-950/20",
  },
};

export function KanbanColumn({ status, title, apps, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: {
      type: "Column",
      status,
    },
  });

  const config = statusConfig[status];
  const Icon = config.icon;
  const appIds = apps.map((a) => a._id);

  return (
    <div
      ref={setNodeRef}
      data-testid={`kanban-column-${status}`}
      className={`flex flex-col rounded-xl border bg-card/60 backdrop-blur-sm transition-colors min-h-[480px] max-h-[calc(100vh-14rem)] ${
        config.borderClass
      } ${isOver ? "ring-2 ring-primary ring-offset-2 bg-primary/5" : ""}`}
    >
      {/* Column Header */}
      <div
        className={`flex items-center justify-between rounded-t-xl px-4 py-3 border-b ${config.bgHeaderClass}`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.accentClass}`} />
          <h3 className="font-semibold text-sm tracking-tight text-foreground">{title}</h3>
        </div>
        <Badge variant={config.badgeVariant} className="text-xs px-2 py-0.5 font-bold">
          {apps.length}
        </Badge>
      </div>

      {/* Cards Scrollable Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <SortableContext items={appIds} strategy={verticalListSortingStrategy}>
          {apps.map((app) => (
            <KanbanCard key={app._id} app={app} onClick={onCardClick} />
          ))}
        </SortableContext>

        {apps.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 rounded-lg border border-dashed border-muted-foreground/20 text-center p-4">
            <p className="text-xs text-muted-foreground">No applications in {title.toLowerCase()}</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Drag a card here to update status</p>
          </div>
        )}
      </div>
    </div>
  );
}
