import React from "react";
import { useNavigate } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";

export default function CreateTournament() {
  const navigate = useNavigate();
  const [form, setForm] = React.useState({ name: "", tablesCount: 4 });
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const set = (key: string, val: any) => setForm({ ...form, [key]: val });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { const r = await apiService.tournaments.create(form); navigate(`/tournament/${r.data.id}`); }
    catch (err: any) { setError(err.response?.data?.error || "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <Layout>
      <h1 className="text-lg font-bold mb-4">New Tournament</h1>
      <form onSubmit={handleSubmit} className="space-y-4 bg-[#12121a] p-4 rounded-lg border border-[#1e1e2e]">
        {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20">{error}</div>}
        <div>
          <label className="block text-xs font-medium text-[#666680] mb-1.5 uppercase tracking-wider">Name</label>
          <input type="text" placeholder="e.g. Friday Night Club" value={form.name} onChange={e => set("name", e.target.value)}
            className="w-full px-3 py-3 bg-[#0a0a0f] rounded border border-[#1e1e2e] focus:border-[#3b82f6] focus:outline-none" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#666680] mb-1.5 uppercase tracking-wider">Tables available</label>
          <input type="number" min={1} value={form.tablesCount} onChange={e => set("tablesCount", +e.target.value)}
            className="w-full px-3 py-3 bg-[#0a0a0f] rounded border border-[#1e1e2e] focus:border-[#3b82f6] focus:outline-none" />
        </div>
        <p className="text-xs text-[#555566]">After creating, add participants and pair them up. Each match's point target (11 or 21) is set individually before it starts.</p>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={() => navigate("/")} className="flex-1 bg-[#1e1e2e] text-[#8888a0] py-3 rounded text-sm font-medium">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 bg-[#3b82f6] text-white py-3 rounded text-sm font-medium disabled:opacity-50">
            {loading ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Layout>
  );
}
