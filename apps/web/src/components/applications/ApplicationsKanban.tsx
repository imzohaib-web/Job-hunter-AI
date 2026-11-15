import { useEffect, useState } from "react";
import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/stores/toastStore";
import {
  type ApplicationColumnStatus,
  type ApplicationDetailItem,
  type GroupedApplicationsData,
  useApplicationsQuery,
  useUpdateApplicationMutation,
} from "@/hooks/useApi";
import { ApplicationDetailDrawer } from "./ApplicationDetailDrawer";
import { KanbanCard } from "./KanbanCard";
import { KanbanColumn } from "./KanbanColumn";

const COLUMNS: Array<{ status: ApplicationColumnStatus; title: string }> = [
  { status: "saved", title: "Saved" },
  { status: "applied", title: "Applied" },
  { status: "interview", title: "Interview" },
  { status: "offer", title: "Offer" },
  { status: "rejected", title: "Rejected" },
];

interface ApplicationsKanbanProps {
  initialData?: GroupedApplicationsData;
  onStatusChangeOverride?: (
    appId: string,
    newStatus: ApplicationColumnStatus,
  ) => Promise<unknown>;
}

export function ApplicationsKanban({
  initialData,
  onStatusChangeOverride,
}: ApplicationsKanbanProps = {}) {
  const { data, isLoading, isError, refetch } = useApplicationsQuery();
  const updateMutation = useUpdateApplicationMutation();

  const [columns, setColumns] = useState<GroupedApplicationsData>({
    saved: [],
    applied: [],
    interview: [],
    offer: [],
    rejected: [],
  });

  const [activeCard, setActiveCard] = useState<ApplicationDetailItem | null>(null);
  const [selectedApp, setSelectedApp] = useState<ApplicationDetailItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sync columns with query or initial data
  useEffect(() => {
    if (initialData) {
      setColumns(initialData);
    } else if (data?.grouped) {
      setColumns(data.grouped);
    }
  }, [data?.grouped, initialData]);

  // Keep selectedApp updated when columns change
  useEffect(() => {
    if (selectedApp) {
      const allApps = [
        ...columns.saved,
        ...columns.applied,
        ...columns.interview,
        ...columns.offer,
        ...columns.rejected,
      ];
      const found = allApps.find((a) => a._id === selectedApp._id);
      if (found) {
        setSelectedApp(found);
      }
    }
  }, [columns, selectedApp]);

  // Configure sensors for drag interactions
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleCardClick = (app: ApplicationDetailItem) => {
    setSelectedApp(app);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const cardData = active.data.current?.app as ApplicationDetailItem | undefined;
    if (cardData) {
      setActiveCard(cardData);
    } else {
      // Find card in current state
      const allApps = [
        ...columns.saved,
        ...columns.applied,
        ...columns.interview,
        ...columns.offer,
        ...columns.rejected,
      ];
      const found = allApps.find((a) => a._id === active.id);
      if (found) setActiveCard(found);
    }
  };

  /**
   * Optimistically moves card to target column and rolls back if the backend mutation fails.
   */
  const handleMoveCard = async (
    cardId: string,
    targetStatus: ApplicationColumnStatus,
  ) => {
    // 1. Identify source column
    let sourceStatus: ApplicationColumnStatus | null = null;
    let targetCard: ApplicationDetailItem | null = null;

    for (const col of COLUMNS) {
      const found = columns[col.status].find((a) => a._id === cardId);
      if (found) {
        sourceStatus = col.status;
        targetCard = found;
        break;
      }
    }

    if (!sourceStatus || !targetCard || sourceStatus === targetStatus) {
      return;
    }

    // 2. Snapshot current state for rollback
    const previousState: GroupedApplicationsData = {
      saved: [...columns.saved],
      applied: [...columns.applied],
      interview: [...columns.interview],
      offer: [...columns.offer],
      rejected: [...columns.rejected],
    };

    // 3. Optimistic update
    const updatedCard: ApplicationDetailItem = {
      ...targetCard,
      status: targetStatus,
      updatedAt: new Date().toISOString(),
      appliedAt:
        targetStatus === "applied" && !targetCard.appliedAt
          ? new Date().toISOString()
          : targetCard.appliedAt,
      statusHistory: [
        ...(targetCard.statusHistory || []),
        {
          status: targetStatus,
          changedAt: new Date().toISOString(),
          note: `Moved to ${targetStatus}`,
        },
      ],
    };

    setColumns((prev) => ({
      ...prev,
      [sourceStatus!]: prev[sourceStatus!].filter((a) => a._id !== cardId),
      [targetStatus]: [updatedCard, ...prev[targetStatus]],
    }));

    if (selectedApp && selectedApp._id === cardId) {
      setSelectedApp(updatedCard);
    }

    // 4. Call server endpoint
    try {
      if (onStatusChangeOverride) {
        await onStatusChangeOverride(cardId, targetStatus);
      } else {
        await updateMutation.mutateAsync({
          id: cardId,
          status: targetStatus,
        });
      }
      toast.success(`Application moved to ${targetStatus}`);
    } catch {
      // 5. Rollback on error
      setColumns(previousState);
      if (selectedApp && selectedApp._id === cardId) {
        setSelectedApp(targetCard);
      }
      toast.error(`Failed to move application to ${targetStatus}. Rolling back.`);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const cardId = String(active.id);
    let targetStatus: ApplicationColumnStatus | null = null;

    // Target could be a column or another card
    if (COLUMNS.some((c) => c.status === over.id)) {
      targetStatus = over.id as ApplicationColumnStatus;
    } else {
      // Over another card, find that card's column
      for (const col of COLUMNS) {
        if (columns[col.status].some((a) => a._id === over.id)) {
          targetStatus = col.status;
          break;
        }
      }
    }

    if (targetStatus) {
      void handleMoveCard(cardId, targetStatus);
    }
  };

  if (isLoading && !initialData) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Loading applications pipeline...</p>
        </div>
      </div>
    );
  }

  if (isError && !initialData) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div>
          <h3 className="font-semibold text-foreground">Failed to load applications</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Unable to fetch your application tracking board.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="applications-kanban">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Kanban Board Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column.status}
              status={column.status}
              title={column.title}
              apps={columns[column.status]}
              onCardClick={handleCardClick}
            />
          ))}
        </div>

        {/* Drag Overlay */}
        <DragOverlay dropAnimation={null}>
          {activeCard ? (
            <KanbanCard app={activeCard} onClick={() => {}} isOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Detail Drawer */}
      <ApplicationDetailDrawer
        app={selectedApp}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        onStatusChange={(id, newStatus) => void handleMoveCard(id, newStatus)}
      />
    </div>
  );
}
