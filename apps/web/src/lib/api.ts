export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(query: Query = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Fetch wrapper: session cookie, CSRF header on writes, JSON errors → ApiError. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    signal: init.signal,
    headers: {
      Accept: "application/json",
      ...(method !== "GET" ? { "X-Kompass-Client": "web" } : {}),
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const first = Array.isArray(data.details) ? data.details[0] : undefined;
    const msg = first?.message ? `${data.error}: ${first.path ? `${first.path} – ` : ""}${first.message}` : (data.error ?? res.statusText);
    if (res.status === 401 && path !== "/auth/login" && path !== "/auth/me") window.dispatchEvent(new Event("kompass:unauthorized"));
    throw new ApiError(res.status, msg, data.details);
  }
  return data as T;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}
