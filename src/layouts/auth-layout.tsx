import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "@/session";
import { ListSkeleton } from "@/components/ui";

/** Login shell: bounce signed-in users into the app. */
export function AuthLayout() {
  const { loading, userId, tenant } = useSession();

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-sm px-4 pt-18">
        <ListSkeleton rows={2} />
      </div>
    );
  }
  if (userId) return <Navigate to={tenant ? "/" : "/onboarding"} replace />;

  return <Outlet />;
}
