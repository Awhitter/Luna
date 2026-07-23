import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  phrases: string[];
  intervalMs?: number;
  className?: string;
  onClick?: () => void;
};

/** One-line rotating prompt under the greeting — clickable. */
export function RollingLine({ phrases, intervalMs = 4200, className, onClick }: Props) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (phrases.length < 2) return;
    const id = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % phrases.length);
        setVisible(true);
      }, 220);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [phrases, intervalMs]);

  if (!phrases.length) return null;
  const text = phrases[index % phrases.length];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mt-1.5 max-w-full text-left text-sm text-muted-foreground transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
        onClick && "hover:text-foreground",
        className,
      )}
    >
      <span className="line-clamp-2">{text}</span>
    </button>
  );
}
