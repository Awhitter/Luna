import { cn } from "@/lib/utils";

type Props = {
  sleepHours?: number | null;
  energyLevel?: number | null;
  moodLabel?: string | null;
  phaseLabel?: string | null;
  checkinLabel: string;
  onClick: () => void;
  className?: string;
};

/** Single fused status control — replaces the three chip row. */
export function StatusPill({
  sleepHours,
  energyLevel,
  moodLabel,
  phaseLabel,
  checkinLabel,
  onClick,
  className,
}: Props) {
  const parts: string[] = [];
  if (sleepHours != null) parts.push(`${sleepHours}h`);
  if (energyLevel != null) parts.push(`${energyLevel}/5`);
  if (moodLabel) parts.push(moodLabel);
  if (phaseLabel) parts.push(phaseLabel);

  const hasAny = parts.length > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex max-w-[min(100%,14rem)] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors duration-200",
        hasAny
          ? "border-primary/30 bg-primary/12 text-primary hover:bg-primary/18"
          : "border-border bg-secondary text-muted-foreground hover:border-primary/30 hover:text-foreground",
        className,
      )}
    >
      <span className="truncate">{hasAny ? parts.join(" · ") : checkinLabel}</span>
    </button>
  );
}
