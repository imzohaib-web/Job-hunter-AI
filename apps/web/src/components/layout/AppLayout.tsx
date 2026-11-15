import { Outlet } from "react-router-dom";
import { ErrorBoundary } from "@/components/feedback/ErrorBoundary";
import { Toaster } from "@/components/feedback/Toaster";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileNav } from "@/components/layout/MobileNav";

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <AppSidebar />

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden pb-16 md:pb-0">
        <AppHeader />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />

      {/* Global toasts */}
      <Toaster />
    </div>
  );
}
