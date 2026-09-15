import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = React.useState({ email: "", password: "", firstName: "", lastName: "", club: "" });
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { setError(""); await register({ ...form, role: "PLAYER" }); navigate("/"); }
    catch (err: any) { setError(err.response?.data?.error || "Registration failed"); }
    finally { setLoading(false); }
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-96 border border-gray-700">
        <h1 className="text-2xl font-bold mb-2 text-center">🏓 Table Tennis</h1>
        <p className="text-gray-400 text-center mb-6">Create account</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-900/50 text-red-200 p-3 rounded text-sm border border-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="First name" value={form.firstName} onChange={set("firstName")}
              className="px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none" required />
            <input type="text" placeholder="Last name" value={form.lastName} onChange={set("lastName")}
              className="px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none" required />
          </div>
          <input type="email" placeholder="Email" value={form.email} onChange={set("email")}
            className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none" required />
          <input type="password" placeholder="Password (min 6)" value={form.password} onChange={set("password")}
            className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none" required minLength={6} />
          <input type="text" placeholder="Club (optional)" value={form.club} onChange={set("club")}
            className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none" />
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Creating..." : "Register"}
          </button>
          <p className="text-center text-sm text-gray-400">
            Have account? <Link to="/login" className="text-blue-400 hover:text-blue-300">Sign In</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
