import { Navigate } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/session";
import { Button, Card } from "@/components/ui";
import { ListSkeleton } from "@/components/ui";

/**
 * Signed in but not attached to a tenant yet. Workspaces are
 * provisioned by the platform admin (no self-serve signup), so all we
 * can do here is tell the user to get in touch.
 */
export default function OnboardingPage() {
  const { loading, userId, tenant, refresh } = useSession();
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-sm px-4 pt-18">
        <ListSkeleton rows={2} />
      </div>
    );
  }
  if (!userId) return <Navigate to="/login" replace />;
  if (tenant) return <Navigate to="/" replace />;

  const signOut = async () => {
    await supabase.auth.signOut();
    await refresh();
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center p-4">
      <h1 className="mb-1 text-center text-2xl font-bold text-primary">
        {tc("appName")}
      </h1>
      <p className="mb-6 text-center text-sm text-muted">{t("title")}</p>
      <Card>
        <p className="text-sm">{t("subtitle")}</p>
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => void signOut()}
        >
          {t("signOut")}
        </Button>
      </Card>
    </main>
  );
}
