import { Eye, EyeOff, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Button, clsx, TextField } from "../components/ui";
import { useAuth } from "../lib/auth";
import { usePageTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";

/** 0 = too short, 1 = weak, 2 = good, 3 = strong. Length plus character variety; a hint, not a policy. */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < 10) return 0;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length >= 14 && variety >= 3) return 3;
  return variety >= 2 ? 2 : 1;
}

const STRENGTH_COLOR = ["bg-red-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];

/** Suggest a username from the full name, e.g. "Max Müller" → "max.mueller". */
function suggestUsername(name: string) {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .trim().split(/\s+/).join(".")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 32);
}

export function SignupPage() {
  const { t } = useI18n();
  usePageTitle(t("signup.title"));
  const { user, signup } = useAuth();
  const [form, setForm] = useState({ displayName: "", email: "", username: "", password: "", confirm: "" });
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [show, setShow] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const strength = passwordStrength(form.password);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mismatch || strength === 0) return;
    setBusy(true);
    setError(null);
    try {
      await signup({ username: form.username, displayName: form.displayName, email: form.email, password: form.password });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t("signup.title")}
      subtitle={t("signup.subtitle")}
      footer={<>{t("signup.haveAccount")} <Link to="/login" className="font-semibold text-accent hover:underline">{t("signup.toLogin")}</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate={false}>
        <TextField
          label={t("signup.name")}
          name="displayName"
          autoComplete="name"
          required
          minLength={2}
          value={form.displayName}
          onChange={(e) => {
            const displayName = e.target.value;
            setForm((f) => ({ ...f, displayName, username: usernameTouched ? f.username : suggestUsername(displayName) }));
          }}
          placeholder="Max Muster"
        />
        <TextField label={t("signup.email")} name="email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} placeholder="max@example.com" />
        <TextField
          label={t("login.username")}
          name="username"
          autoComplete="username"
          required
          pattern="[a-z0-9][a-z0-9._\-]{2,31}"
          hint={t("signup.username.hint")}
          value={form.username}
          onChange={(e) => { setUsernameTouched(true); setForm((f) => ({ ...f, username: e.target.value.toLowerCase() })); }}
        />
        <div>
          <div className="relative">
            <TextField label={t("login.password")} name="password" type={show ? "text" : "password"} autoComplete="new-password" required minLength={10} value={form.password} onChange={set("password")} />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={t("signup.show")} aria-pressed={show} className="absolute end-1.5 top-[34px] rounded-md p-1.5 text-ink-3 hover:bg-sunken hover:text-ink">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {form.password && (
            <div className="mt-2" aria-live="polite">
              <div className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((i) => <span key={i} className={clsx("h-1.5 flex-1 rounded-full transition-colors", i < Math.max(strength, 1) ? STRENGTH_COLOR[strength] : "bg-sunken")} />)}
              </div>
              <p className="mt-1 text-xs text-ink-3">{t("signup.strength")}: <span className="font-medium text-ink-2">{t(`signup.strength.${strength}`)}</span></p>
            </div>
          )}
          {!form.password && <p className="mt-1 text-xs text-ink-3">{t("signup.password.hint")}</p>}
        </div>
        <TextField label={t("signup.confirm")} name="confirm" type={show ? "text" : "password"} autoComplete="new-password" required value={form.confirm} onChange={set("confirm")} error={mismatch ? t("signup.mismatch") : undefined} />
        <label className="flex items-start gap-2.5 text-sm text-ink-2">
          <input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 size-4 rounded accent-[var(--accent)]" />
          <span>{t("signup.terms")}</span>
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
        <Button type="submit" variant="primary" busy={busy} icon={UserPlus} disabled={mismatch || !accepted} className="w-full py-3 sm:py-2.5">{t("signup.submit")}</Button>
      </form>
    </AuthLayout>
  );
}
