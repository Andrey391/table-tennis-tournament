import { createContext, useContext, useState, useEffect } from "react";
import { apiService } from "../services/api";

interface User { id: string; email: string; role: string; firstName: string; lastName: string; rating: number; club?: string; }

interface AuthContextType { token: string | null; user: User | null; login: (email: string, password: string) => Promise<void>; register: (data: any) => Promise<void>; logout: () => void; }

const AuthContext = createContext<AuthContextType>({ token: null, user: null, login: async () => {}, register: async () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (token) {
      apiService.auth.me().then(r => setUser(r.data)).catch(() => { setToken(null); localStorage.removeItem("token"); });
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const { data } = await apiService.auth.login({ email, password });
    setToken(data.token); localStorage.setItem("token", data.token); setUser(data.user);
  };

  const register = async (data: any) => {
    const { data: d } = await apiService.auth.register(data);
    setToken(d.token); localStorage.setItem("token", d.token); setUser(d.user);
  };

  const logout = () => { setToken(null); localStorage.removeItem("token"); setUser(null); };

  return <AuthContext.Provider value={{ token, user, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
