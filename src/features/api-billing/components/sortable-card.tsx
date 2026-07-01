import { type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

const HANDLE_ATTR = "data-reorder-handle";

// Inline modifier — pin horizontal axis so cards only slide vertically.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

export function SortableList<T extends { id: string }>({
  items,
  disabled,
  onReorder,
  renderItem,
  renderOverlay,
  activeId,
  onActiveIdChange,
}: {
  items: T[];
  disabled?: boolean;
  onReorder: (orderedIds: string[]) => void;
  renderItem: (item: T) => ReactNode;
  renderOverlay?: (item: T) => ReactNode;
  activeId: string | null;
  onActiveIdChange: (id: string | null) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const ids = items.map((item) => item.id);
  const activeItem = activeId ? items.find((it) => it.id === activeId) ?? null : null;

  const handleDragStart = (event: DragStartEvent) => {
    onActiveIdChange(String(event.active.id));
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    onActiveIdChange(null);
    if (!over || active.id === over.id) return;
    const fromIndex = ids.indexOf(String(active.id));
    const toIndex = ids.indexOf(String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;
    const next = ids.slice();
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, String(active.id));
    onReorder(next);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => onActiveIdChange(null)}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        <div className="space-y-2">{items.map((item) => renderItem(item))}</div>
      </SortableContext>
      <DragOverlay>
        {activeItem && renderOverlay
          ? renderOverlay(activeItem)
          : activeItem
            ? renderItem(activeItem)
            : null}
      </DragOverlay>
    </DndContext>
  );
}

export function useSortableCard(id: string, disabled?: boolean) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return {
    setNodeRef,
    style,
    handleProps: { ...attributes, ...listeners, [HANDLE_ATTR]: "" as const },
    isDragging,
  };
}

export function DragHandle({
  className,
  disabled,
  label,
  handleProps,
}: {
  className?: string;
  disabled?: boolean;
  label: string;
  handleProps: ReturnType<typeof useSortableCard>["handleProps"];
}) {
  return (
    <span
      {...handleProps}
      role="button"
      aria-label={label}
      title={label}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      className={cn(
        "inline-flex cursor-grab items-center justify-center text-muted-foreground/30 transition hover:text-muted-foreground active:cursor-grabbing",
        disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground/30",
        className
      )}
      onClick={(event) => {
        // Prevent the parent card's onClick from firing when interacting with the handle.
        event.stopPropagation();
      }}
    >
      <GripVertical size={12} />
    </span>
  );
}
