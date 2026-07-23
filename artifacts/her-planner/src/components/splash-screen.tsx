import { useEffect, useState } from "react";
import { Moon } from "lucide-react";

const SEEN_KEY = "luna-splash-seen";

/** Soft brand splash on first open of the session — short, not a gate. */
export function SplashScreen() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SEEN_KEY) === "1") return;
    setShow(true);
    const hide = window.setTimeout(() => {
      sessionStorage.setItem(SEEN_KEY, "1");
      setShow(false);
    }, 1400);
    return () => window.clearTimeout(hide);
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-[hsl(345_40%_96%)] animate-in fade-in duration-300"
      role="status"
      aria-label="Luna"
    >
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 animate-in zoom-in-95 duration-500">
        <Moon className="h-10 w-10 text-primary" strokeWidth={1.75} />
        <span className="absolute inset-0 rounded-full border border-primary/20 animate-pulse" />
      </div>
      <p className="mt-5 font-serif text-3xl tracking-tight text-foreground">Luna</p>
      <p className="mt-1 text-sm text-muted-foreground">Tu secretaria · tu amiga</p>
    </div>
  );
}
