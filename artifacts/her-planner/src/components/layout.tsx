import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useGetProfile } from "@workspace/api-client-react";
import { Sun, CalendarDays, Moon, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { isLoading } = useGetProfile();
  const { t, lang } = useLanguage();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const calendarLabel =
    lang === "es" ? "Agenda" : lang === "pt" ? "Agenda" : "Calendar";

  const navItems = [
    { href: "/", label: t.nav.today, icon: Sun, match: (p: string) => p === "/" },
    {
      href: "/calendar",
      label: calendarLabel,
      icon: CalendarDays,
      match: (p: string) => p === "/calendar" || p === "/week" || p === "/month",
    },
    { href: "/cycle", label: t.nav.cycle, icon: Moon, match: (p: string) => p === "/cycle" },
    { href: "/settings", label: t.nav.profile, icon: Settings, match: (p: string) => p === "/settings" },
  ];

  const isToday = location === "/";

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-background">
      {/* Atmosphere outside the stage */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,hsla(345,55%,48%,0.18),transparent_55%),radial-gradient(80%_50%_at_100%_100%,hsla(20,40%,55%,0.08),transparent_50%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <nav
        className={cn(
          "fixed inset-x-0 z-50 border-border/70 bg-card/92 backdrop-blur-xl",
          "bottom-0 border-t pb-safe",
          "md:bottom-auto md:top-0 md:border-b md:border-t-0 md:bg-background/80 md:pb-0",
        )}
      >
        <div className="mx-auto flex max-w-[44rem] items-center justify-around px-2 py-1.5 md:justify-center md:gap-1 md:px-4 md:py-2.5">
          {navItems.map((item) => {
            const isActive = item.match(location);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex w-[4.5rem] flex-col items-center justify-center rounded-2xl py-2 transition-all duration-200 ease-out md:w-auto md:flex-row md:gap-2 md:px-3.5 md:py-2",
                  isActive
                    ? "bg-primary/14 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-accent/80 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn("mb-0.5 h-5 w-5 transition-transform duration-200 md:mb-0", isActive && "scale-110")}
                  strokeWidth={isActive ? 2.4 : 1.9}
                />
                <span className="text-[10px] font-medium tracking-tight md:text-xs">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <main
        className={cn(
          "relative z-[1] flex min-h-0 flex-1 flex-col",
          "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]",
          "md:pb-4 md:pt-[4.25rem]",
          isToday ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        {/* Framed stage — clear boundary on every viewport */}
        <div
          className={cn(
            "luna-stage mx-auto flex min-h-0 w-full max-w-[44rem] flex-1 flex-col",
            "border-x border-border/80 bg-card shadow-[0_0_0_1px_hsla(345,30%,40%,0.04),0_20px_50px_-24px_hsla(345,40%,20%,0.28)]",
            "md:my-0 md:max-h-[calc(100dvh-5.5rem)] md:rounded-3xl md:border",
            !isToday && "overflow-y-auto",
            isToday && "overflow-hidden",
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
