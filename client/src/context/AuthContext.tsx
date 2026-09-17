import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiService } from "../services/api";

interface User { id: string; email: string; role: string; firstName: string; lastName: string; rating: number; club?: string | null; city?: string | null; phone?: string | null; dateOfBirth?: string | null; }

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
}

const AuthContext = createContext<AuthContextType>({
  token: null, user: null, login: async () => {}, register: async () => {}, logout: () => {},
  refreshUser: async () => {}, setUser: () => {},
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

  const logout = () => { setToken(null); localStorage.removeItem("token"); setUser(null); };

  return (
    <AuthContext.Provider value={{ token, user, login, register, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
