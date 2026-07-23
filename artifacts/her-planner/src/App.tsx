import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { InstallCoach } from "@/components/install-coach";
import { LanguageProvider } from "@/i18n/context";

import TodayPage from "@/pages/today";
import CalendarPage from "@/pages/calendar";
import WeekPage from "@/pages/week";
import MonthPage from "@/pages/month";
import CyclePage from "@/pages/cycle";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";
import { SplashScreen } from "@/components/splash-screen";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={TodayPage} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/week">{() => <WeekPage />}</Route>
        <Route path="/month">{() => <MonthPage />}</Route>
        <Route path="/cycle" component={CyclePage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
          <InstallCoach />
          <SplashScreen />
        </TooltipProvider>
      </QueryClientProvider>
    </LanguageProvider>
  );
}

export default App;
