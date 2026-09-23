import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiService } from "../services/api";
import { forgetDemo } from "../lib/tour";

interface User { id: string; email: string; role: string; firstName: string; lastName: string; rating: number; city?: string | null; phone?: string | null; dateOfBirth?: string | null; isDemo?: boolean; demoExpiresAt?: string | null; }

interface AuthContextType {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
  // The session user is fetched once per page load, so anything that moves while
  // the app is open — the rating above all, which Elo shifts after every settled
  // match — goes stale on screen until someone reloads. Screens that show it call
  // this; `setUser` is for a screen that has just been handed a fresh copy.
  refreshUser: () => Promise<void>;
  setUser: (u: User) => void;
  // Signs the visitor in as a throwaway account that already owns a club night,
  // and returns that event's id so the caller can go straight to it. Claiming it
  // keeps the same account, so nothing the visitor did is lost.
  startDemo: () => Promise<string>;
  // Takes the open seat in someone else's demo event through their invitation
  // link, as a guest of its own; resolves to the match to open, if one is paired.
  joinDemo: (tournamentId: string) => Promise<{ tournamentId: string; matchId: string | null }>;
  claimDemo: (data: any) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  token: null, user: null, login: async () => {}, register: async () => {}, logout: () => {},
  refreshUser: async () => {}, setUser: () => {},
  startDemo: async () => "", joinDemo: async () => ({ tournamentId: "", matchId: null }), claimDemo: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [user, setUser] = useState<User | null>(null);

  const refreshUser = useCallback(async () => {
    if (!localStorage.getItem("token")) return;
    try {
      const r = await apiService.auth.me();
      // Belt and braces: an older deployment may still answer 200 with a null
      // body for a token whose account is gone.
      if (r.data?.id) setUser(r.data);
      else { setToken(null); localStorage.removeItem("token"); }
    } catch {
      setToken(null); localStorage.removeItem("token");
    }
  }, []);

  useEffect(() => { if (token) refreshUser(); }, [token, refreshUser]);

  // A phone spends most of an evening with the app in the background. Re-reading
  // the session on the way back keeps the rating in the header from being whatever
  // it was when the tab was first opened.
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") refreshUser(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const { data } = await apiService.auth.login({ email, password });
    setToken(data.token); localStorage.setItem("token", data.token); setUser(data.user);
  };

  const register = async (data: any) => {
    const { data: d } = await apiService.auth.register(data);
    setToken(d.token); localStorage.setItem("token", d.token); setUser(d.user);
  };

  const startDemo = async () => {
    const { data } = await apiService.auth.demo();
    setToken(data.token); localStorage.setItem("token", data.token); setUser(data.user);
    return data.tournamentId as string;
  };

  const joinDemo = async (tournamentId: string) => {
    const { data } = await apiService.auth.joinDemo(tournamentId);
    setToken(data.token); localStorage.setItem("token", data.token); setUser(data.user);
    return { tournamentId: data.tournamentId as string, matchId: (data.matchId ?? null) as string | null };
  };

  const claimDemo = async (data: any) => {
    const { data: d } = await apiService.auth.claim(data);
    setUser(d.user);
  };

  // The way back into a demo is per device, so it goes when the account does —
  // otherwise the next visitor on this phone is offered someone else's evening.
  const logout = () => { setToken(null); localStorage.removeItem("token"); setUser(null); forgetDemo(); };

  return (
    <AuthContext.Provider value={{ token, user, login, register, logout, refreshUser, setUser, startDemo, joinDemo, claimDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
