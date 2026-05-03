import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useGetProfile } from "@workspace/api-client-react";
import { 
  Sun, 
  CalendarDays, 
  Calendar, 
  Moon, 
  Settings 
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: profile, isLoading } = useGetProfile();

  // If loading, show skeleton
  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
    </div>;
  }

  // If no profile and not on settings page, redirect/show settings
  if (!profile && location !== "/settings") {
    // Return children directly if we're forcing a redirect via a hook elsewhere,
    // but typically we can just render the layout. Actually, if there's no profile,
    // it's better to let the components handle the redirect so we don't break wouter's Switch.
  }

  const navItems = [
    { href: "/", label: "Today", icon: Sun },
    { href: "/week", label: "Week", icon: CalendarDays },
    { href: "/month", label: "Month", icon: Calendar },
    { href: "/cycle", label: "Cycle", icon: Moon },
    { href: "/settings", label: "Profile", icon: Settings },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background max-w-md mx-auto relative shadow-2xl overflow-hidden">
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-xl border-t border-border z-50 max-w-md mx-auto">
        <div className="flex items-center justify-around p-2 pb-safe">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-200",
                  isActive 
                    ? "text-primary bg-primary/10" 
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className={cn("w-6 h-6 mb-1", isActive && "fill-primary/20")} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
