import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Button, TextField } from "../components/ui";
import { useAuth } from "../lib/auth";
import { usePageTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";

const DEMO = [
  ["anna.schmidt", "Admin · Management"],
  ["jonas.weber", "HR"],
  ["lea.fischer", "Sales"],
  ["murat.yilmaz", "Customer service"],
  ["sophie.becker", "Accounting"],
  ["tim.hoffmann", "Technician"],
] as const;

export function LoginPage() {
  const { t } = useI18n();
  usePageTitle(t("login.title"));
  const { user, login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? "/"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      footer={<>{t("login.noAccount")} <Link to="/signup" className="font-semibold text-accent hover:underline">{t("login.toSignup")}</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <TextField label={t("login.username")} name="username" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="firstname.lastname" />
        <TextField label={t("login.password")} name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
        <Button type="submit" variant="primary" busy={busy} icon={KeyRound} className="w-full py-3 sm:py-2.5">{t("login.submit")}</Button>
      </form>
      <div className="mt-8 border-t border-line pt-6">
        <p className="mb-3 text-xs font-semibold tracking-wide text-ink-3 uppercase">{t("login.demo")}</p>
        <div className="grid gap-2 min-[400px]:grid-cols-2">
          {DEMO.map(([u, role]) => (
            <button key={u} type="button" onClick={() => { setUsername(u); setPassword("kompass"); }} className="rounded-lg border border-line px-3 py-2 text-start text-xs transition hover:border-accent hover:bg-accent-soft">
              <span className="block font-medium">{u}</span>
              <span className="text-ink-3">{role}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
