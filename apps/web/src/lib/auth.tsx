import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Role, SessionUser } from "./types";

interface Auth {
  user: SessionUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (data: { username: string; displayName: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  /** True for admins or anyone holding one of the roles. */
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<{ user: SessionUser }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
    // Any 401 from a later request means the session expired.
    const onExpired = () => setUser(null);
    window.addEventListener("kompass:unauthorized", onExpired);
    return () => window.removeEventListener("kompass:unauthorized", onExpired);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api<{ user: SessionUser }>("/auth/login", { method: "POST", body: { username, password } });
    setUser(r.user);
  }, []);

  const signup = useCallback(async (data: { username: string; displayName: string; email: string; password: string }) => {
    const r = await api<{ user: SessionUser }>("/auth/signup", { method: "POST", body: data });
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, []);

  const can = useCallback((...roles: Role[]) => !!user && (user.roles.includes("ADMIN") || roles.some((r) => user.roles.includes(r))), [user]);

  const value = useMemo(() => ({ user, ready, login, signup, logout, can }), [user, ready, login, signup, logout, can]);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
