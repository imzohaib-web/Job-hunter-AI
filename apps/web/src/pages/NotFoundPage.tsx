import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center px-4">
      <div className="relative mb-6">
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Compass className="h-12 w-12 animate-pulse" />
        </div>
        <span className="absolute -bottom-2 -right-2 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground border">
          404
        </span>
      </div>

      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Sorry, we couldn&apos;t find the page you&apos;re looking for. It may have been moved, deleted, or does not exist.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <Button asChild variant="default">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
