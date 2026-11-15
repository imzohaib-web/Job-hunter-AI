import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled render error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <Card className="w-full max-w-md border-destructive/30 shadow-lg">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <div className="rounded-full bg-destructive/10 p-2.5 text-destructive">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl">Something went wrong</CardTitle>
                <p className="text-xs text-muted-foreground">
                  An unexpected error occurred in the application.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md bg-muted/60 p-3 font-mono text-xs text-muted-foreground overflow-auto max-h-36">
                {this.state.error?.message || "Unknown error"}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Reload page
              </Button>
              <Button size="sm" onClick={this.handleReset}>
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
