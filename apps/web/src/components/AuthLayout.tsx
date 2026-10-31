import { Activity, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import { DashboardIllustration } from "./Illustrations";
import { clsx } from "./ui";

/** Split layout shared by sign-in and sign-up: brand panel with illustration (desktop) and a form card. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_1.1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0b5f57] via-[#0d7a6f] to-[#14a08f] p-12 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute -end-32 -top-32 size-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -start-20 size-96 rounded-full bg-black/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-10 rounded-xl bg-white/15 p-1" />
          <div>
            <p className="text-lg font-semibold">Kompass</p>
            <p className="text-sm text-white/75">Rheinwerk Gruppe · Köln</p>
          </div>
        </div>
        <div className="relative">
          <DashboardIllustration className="mx-auto mb-8 w-full max-w-md" />
          <p className="max-w-md text-3xl leading-tight font-semibold tracking-tight xl:text-4xl">{t("auth.hero.title")}</p>
          <p className="mt-4 max-w-md text-white/80">{t("auth.hero.body")}</p>
          <ul className="mt-6 flex flex-wrap gap-2 text-sm">
            {([[Activity, "auth.hero.f1"], [Users, "auth.hero.f2"], [ShieldCheck, "auth.hero.f3"]] as const).map(([Icon, key]) => (
              <li key={key} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur"><Icon className="size-4" aria-hidden /> {t(key)}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/70">Rheinwerk Haustechnik · Solar · Elektro · Kundenservice</p>
      </div>
      <div className="flex flex-col justify-center bg-canvas px-4 py-10 sm:px-16">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-card sm:p-8">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <img src="/favicon.svg" alt="" className="size-9 rounded-lg" />
            <span><span className="block font-semibold leading-tight">Kompass</span><span className="block text-xs text-ink-3">Rheinwerk Gruppe</span></span>
          </div>
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
            </div>
            <div className="flex shrink-0 rounded-lg bg-sunken p-0.5 text-xs" role="group" aria-label={t("shell.language")}>
              {(["de", "en"] as const).map((l) => (
                <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={clsx("rounded-md px-2 py-1 font-semibold uppercase transition", lang === l ? "bg-panel shadow-sm" : "text-ink-3")}>{l}</button>
              ))}
            </div>
          </div>
          {children}
        </div>
        {footer && <div className="mx-auto mt-6 text-center text-sm text-ink-2">{footer}</div>}
      </div>
    </div>
  );
}
