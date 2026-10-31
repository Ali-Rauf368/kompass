import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { AuthProvider } from "../lib/auth";
import { I18nProvider, type Lang } from "../lib/i18n";
import { ToastProvider } from "../lib/toast";

type Json = Record<string, unknown> | unknown[];
export type Route = { method?: string; path: string | RegExp; status?: number; body: Json | ((init: RequestInit) => Json) };

/** Replaces fetch with a tiny router: first matching route wins; records calls for assertions. */
export function mockFetch(routes: Route[]) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes.find((r) => (r.method ?? "GET") === method && (typeof r.path === "string" ? url.startsWith(`/api${r.path}`) : r.path.test(url)));
    const status = route ? (route.status ?? 200) : 404;
    const body = !route ? { error: `no mock for ${method} ${url}` } : typeof route.body === "function" ? route.body(init) : route.body;
    // jsdom has no Response; the api() helper only needs these members.
    return { ok: status < 400, status, statusText: String(status), json: async () => body } as Response;
  }) as typeof fetch;
  return calls;
}

export const ME = (roles: string[] = ["EMPLOYEE"], extra: Record<string, unknown> = {}) => ({
  method: "GET",
  path: "/auth/me",
  body: { user: { id: 1, username: "tim.hoffmann", displayName: "Tim Hoffmann", roles, employeeId: 6, ...extra } },
});

export function renderWithProviders(ui: ReactNode, { route = "/", lang = "en" as Lang } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <I18nProvider initial={lang}>
        <ToastProvider>
          <AuthProvider>{ui}</AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}
