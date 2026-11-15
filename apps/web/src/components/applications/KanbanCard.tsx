import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Building2, Calendar, GripVertical, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ApplicationDetailItem } from "@/hooks/useApi";

interface KanbanCardProps {
  app: ApplicationDetailItem;
  onClick: (app: ApplicationDetailItem) => void;
  isOverlay?: boolean;
}

export function KanbanCard({ app, onClick, isOverlay = false }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: app._id,
    data: {
      type: "Application",
      app,
    },
    disabled: isOverlay,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const job = typeof app.jobId === "object" && app.jobId !== null ? app.jobId : null;
  const match = typeof app.matchId === "object" && app.matchId !== null ? app.matchId : null;

  const company = job?.company ?? "Unknown Company";
  const title = job?.title ?? "Position";
  const score = match?.score ?? null;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "Recently";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "Recently";
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return "Recently";
    }
  };

  const getScoreVariant = (val: number): "success" | "secondary" | "default" => {
    if (val >= 80) return "success";
    if (val >= 60) return "secondary";
    return "default";
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-primary/50 hover:shadow-md cursor-pointer ${
        isOverlay ? "rotate-2 shadow-xl ring-2 ring-primary/40 cursor-grabbing bg-background" : ""
      }`}
      onClick={() => onClick(app)}
      data-testid={`kanban-card-${app._id}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(app);
        }
      }}
      aria-label={`${title} at ${company}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            <span className="truncate">{company}</span>
          </p>
          <h4 className="mt-1 font-semibold text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">
            {title}
          </h4>
        </div>

        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 p-1 text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing rounded hover:bg-muted/60 transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label="Drag application card"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-xs text-muted-foreground">
        {/* Match score badge */}
        {score !== null ? (
          <Badge
            variant={getScoreVariant(score)}
            className="gap-1 text-[11px] font-medium px-2 py-0.5"
          >
            <Sparkles className="h-3 w-3" />
            {score}% Match
          </Badge>
        ) : (
          <span className="text-[11px] text-muted-foreground/70">No match score</span>
        )}

        {/* Last updated */}
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Calendar className="h-3 w-3 text-muted-foreground/70" />
          {formatDate(app.updatedAt || app.createdAt)}
        </span>
      </div>
    </div>
  );
}
