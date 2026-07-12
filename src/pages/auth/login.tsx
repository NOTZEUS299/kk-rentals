import { useState, type FormEvent } from "react";
import { useTranslations } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { Button, Card, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (error) setError("invalidCredentials");
    // success: SessionProvider refresh flips the AuthLayout guard
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center p-4">
      <h1 className="mb-1 text-center text-2xl font-bold text-primary">
        {tc("appName")}
      </h1>
      <p className="mb-6 text-center text-sm text-muted">{t("loginTitle")}</p>
      <Card>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div>
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-red-600">{t(error)}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? tc("loading") : t("signIn")}
          </Button>
        </form>
      </Card>
    </main>
  );
}
