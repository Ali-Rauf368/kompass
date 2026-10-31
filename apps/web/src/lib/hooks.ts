import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/** Loads `path` (re-runs when it changes). Keeps showing old data while reloading to avoid flicker. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (path === null) return;
    const ctrl = new AbortController();
    setLoading(true);
    api<T>(path, { signal: ctrl.signal })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload, setData };
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Kompass`;
  }, [title]);
}

/** Re-renders every `ms` so relative times ("due in 5 min") stay current. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  const ref = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => {
    ref.current = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(ref.current);
  }, [ms]);
  return now;
}
