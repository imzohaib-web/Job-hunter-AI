import { LogOut, User as UserIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUserQuery, useLogoutMutation } from "@/hooks/useApi";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "@/stores/toastStore";

export function UserMenu() {
  const navigate = useNavigate();
  const storeUser = useAuthStore((s) => s.user);
  const { data: userProfile } = useCurrentUserQuery();
  const logoutMutation = useLogoutMutation();

  const user = userProfile ?? storeUser;

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      toast.success("You have been signed out", "Goodbye");
      navigate("/login", { replace: true });
    } catch {
      // Even if network error, clear client session and navigate
      useAuthStore.getState().clearAuth();
      navigate("/login", { replace: true });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-9 rounded-full px-2 gap-2 hover:bg-muted"
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline-block text-xs font-medium max-w-[120px] truncate">
            {user?.name ?? "Account"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-semibold leading-none truncate">
              {user?.name ?? "User"}
            </p>
            <p className="text-xs leading-none text-muted-foreground truncate">
              {user?.email ?? ""}
            </p>
            {user?.quota && (
              <p className="text-[11px] text-muted-foreground mt-1 pt-1 border-t">
                AI quota: {user.quota.dailyAiRequests} / {user.quota.dailyLimit}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/profile")}>
          <UserIcon className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => void handleLogout()}
          disabled={logoutMutation.isPending}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{logoutMutation.isPending ? "Logging out…" : "Log out"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
