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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
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
      {/* Soft full-bleed atmosphere — not a phone stub */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsla(345,42%,52%,0.07),_transparent_55%)]"
      />

      <nav
        className={cn(
          "fixed inset-x-0 z-50 border-border/80 bg-card/90 backdrop-blur-xl",
          "bottom-0 border-t pb-safe",
          "md:bottom-auto md:top-0 md:border-b md:border-t-0 md:pb-0",
        )}
      >
        <div className="mx-auto flex max-w-[42rem] items-center justify-around px-2 py-1.5 md:justify-start md:gap-1 md:px-4 md:py-2">
          {navItems.map((item) => {
            const isActive = item.match(location);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center rounded-2xl py-2 transition-all duration-200 ease-out md:flex-row md:gap-2 md:px-3 md:py-2",
                  "w-[4.5rem] md:w-auto",
                  isActive
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
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

      {/* Today: shell locked, thread scrolls. Other pages: main scrolls. */}
      <main
        className={cn(
          "relative z-[1] flex min-h-0 flex-1 flex-col",
          isToday ? "overflow-hidden" : "overflow-y-auto",
          "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]",
          "md:pb-0 md:pt-14",
        )}
      >
        {isToday ? children : <div className="mx-auto w-full max-w-[42rem]">{children}</div>}
      </main>
    </div>
  );
}
