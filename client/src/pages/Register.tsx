import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = React.useState({ email: "", password: "", firstName: "", lastName: "", club: "" });
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { setError(""); await register(form); navigate("/"); }
    catch (err: any) { setError(err.response?.data?.error || "Registration failed"); }
    finally { setLoading(false); }
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo size="lg" as="plain" />
          <p className="text-[#666680] text-sm mt-3">Create your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 bg-[#12121a] p-6 rounded-lg border border-[#1e1e2e]">
          {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#666680] mb-1.5 uppercase tracking-wider">First Name</label>
              <input type="text" value={form.firstName} onChange={set("firstName")}
                className="w-full px-3 py-2.5 bg-[#0a0a0f] rounded border border-[#1e1e2e] text-sm focus:border-[#ccff00] focus:outline-none" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#666680] mb-1.5 uppercase tracking-wider">Last Name</label>
              <input type="text" value={form.lastName} onChange={set("lastName")}
                className="w-full px-3 py-2.5 bg-[#0a0a0f] rounded border border-[#1e1e2e] text-sm focus:border-[#ccff00] focus:outline-none" required />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#666680] mb-1.5 uppercase tracking-wider">Email</label>
            <input type="email" value={form.email} onChange={set("email")}
              className="w-full px-3 py-2.5 bg-[#0a0a0f] rounded border border-[#1e1e2e] text-sm focus:border-[#ccff00] focus:outline-none" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#666680] mb-1.5 uppercase tracking-wider">Password</label>
            <input type="password" value={form.password} onChange={set("password")}
              className="w-full px-3 py-2.5 bg-[#0a0a0f] rounded border border-[#1e1e2e] text-sm focus:border-[#ccff00] focus:outline-none" required minLength={6} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#666680] mb-1.5 uppercase tracking-wider">Club</label>
            <input type="text" value={form.club} onChange={set("club")} placeholder="Optional"
              className="w-full px-3 py-2.5 bg-[#0a0a0f] rounded border border-[#1e1e2e] text-sm focus:border-[#ccff00] focus:outline-none" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-[#ccff00] text-[#0a0a0f] py-3 rounded-lg text-sm font-bold hover:bg-[#d8ff33] disabled:opacity-50 transition-colors">
            {loading ? "Creating..." : "Create Account"}
          </button>
          <p className="text-center text-sm text-[#666680]">
            Have account? <Link to="/login" className="text-[#ccff00] font-medium">Sign In</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
