import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { setError(""); await login(email, password); } catch (err: any) { setError(err.response?.data?.error || "Login failed"); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-96">
        <h1 className="text-2xl font-bold mb-6 text-center">Table Tennis Tournament</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-900 text-red-200 p-2 rounded text-sm">{error}</div>}
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500" required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500" required />
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Login</button>
          <Link to="/login" className="block text-center text-sm text-blue-400">Register</Link>
        </form>
      </div>
    </div>
  );
}
