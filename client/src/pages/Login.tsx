import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { setError(""); await login(email, password); navigate("/"); }
    catch (err: any) { setError(err.response?.data?.error || "Login failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">TT <span className="text-[#3b82f6]">TOURNAMENT</span></h1>
          <p className="text-[#666680] text-sm mt-2">Sign in to your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 bg-[#12121a] p-6 rounded-lg border border-[#1e1e2e]">
          {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-[#666680] mb-1.5 uppercase tracking-wider">Email</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0a0a0f] rounded border border-[#1e1e2e] text-sm focus:border-[#3b82f6] focus:outline-none transition-colors" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#666680] mb-1.5 uppercase tracking-wider">Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0a0a0f] rounded border border-[#1e1e2e] text-sm focus:border-[#3b82f6] focus:outline-none transition-colors" required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-[#3b82f6] text-white py-2.5 rounded text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50 transition-colors">
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <p className="text-center text-sm text-[#666680]">
            No account? <Link to="/register" className="text-[#3b82f6] hover:text-[#60a5fa]">Register</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
