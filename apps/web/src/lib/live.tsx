import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type LiveEvent = { type: string; [key: string]: unknown };
type Handler = (event: LiveEvent) => void;

interface Live {
  connected: boolean;
  subscribe: (handler: Handler) => () => void;
}

const LiveContext = createContext<Live | null>(null);

/** Opens one WebSocket per tab while signed in; reconnects with exponential backoff (1s → 30s). */
export function LiveProvider({ enabled, children, url }: { enabled: boolean; children: ReactNode; url?: string }) {
  const [connected, setConnected] = useState(false);
  const handlers = useRef(new Set<Handler>());

  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const open = () => {
      const target = url ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
      socket = new WebSocket(target);
      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      socket.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data as string) as LiveEvent;
          for (const h of handlers.current) h(event);
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (stopped) return;
        const delay = Math.min(30_000, 1000 * 2 ** attempt++);
        timer = setTimeout(open, delay);
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
      setConnected(false);
    };
  }, [enabled, url]);

  const value = useRef<Live>({
    connected: false,
    subscribe: (h) => {
      handlers.current.add(h);
      return () => handlers.current.delete(h);
    },
  });
  value.current = { ...value.current, connected };
  return <LiveContext value={value.current}>{children}</LiveContext>;
}

export function useLiveStatus() {
  return useContext(LiveContext)?.connected ?? false;
}

/** Calls `onEvent` for live events of the given types. The latest callback is always used. */
export function useLiveEvent(types: string[], onEvent: Handler) {
  const ctx = useContext(LiveContext);
  const cb = useRef(onEvent);
  cb.current = onEvent;
  const key = types.join(",");
  useEffect(() => {
    if (!ctx) return;
    const wanted = new Set(key.split(","));
    return ctx.subscribe((e) => {
      if (wanted.has(e.type)) cb.current(e);
    });
  }, [ctx, key]);
}
