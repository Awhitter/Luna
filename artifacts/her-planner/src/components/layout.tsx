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

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background max-w-md mx-auto relative shadow-2xl overflow-hidden">
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md border-t border-border/80 bg-card/90 pb-safe backdrop-blur-xl">
        <div className="flex items-center justify-around px-2 py-1.5">
          {navItems.map((item) => {
            const isActive = item.match(location);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex w-[4.5rem] flex-col items-center justify-center rounded-2xl py-2 transition-all duration-200 ease-out",
                  isActive
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn("mb-0.5 h-5 w-5 transition-transform duration-200", isActive && "scale-110")}
                  strokeWidth={isActive ? 2.4 : 1.9}
                />
                <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
