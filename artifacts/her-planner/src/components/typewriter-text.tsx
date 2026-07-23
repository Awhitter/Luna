import { useEffect, useState } from "react";

type Props = {
  text: string;
  /** When true, show full text immediately (live stream). */
  live?: boolean;
  cps?: number;
  className?: string;
};

/** Soft typewriter for finished assistant turns — skipped while streaming. */
export function TypewriterText({ text, live = false, cps = 48, className }: Props) {
  const [shown, setShown] = useState(live ? text : "");

  useEffect(() => {
    if (live) {
      setShown(text);
      return;
    }
    if (!text) {
      setShown("");
      return;
    }
    let i = 0;
    setShown("");
    const step = Math.max(1, Math.floor(cps / 20));
    const id = window.setInterval(() => {
      i = Math.min(text.length, i + step);
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, 1000 / cps);
    return () => window.clearInterval(id);
  }, [text, live, cps]);

  return <span className={className}>{shown}</span>;
}
