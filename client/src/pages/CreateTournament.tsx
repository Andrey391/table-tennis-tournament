import React from "react";
import { useNavigate } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";

export default function CreateTournament() {
  const navigate = useNavigate();
  const [form, setForm] = React.useState({ name: "", tablesCount: 4, minRating: "", maxRating: "" });
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const set = (key: string, val: any) => setForm({ ...form, [key]: val });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      name: form.name,
      tablesCount: form.tablesCount,
      minRating: form.minRating ? +form.minRating : undefined,
      maxRating: form.maxRating ? +form.maxRating : undefined,
    };
    try { const r = await apiService.tournaments.create(payload); navigate(`/tournament/${r.data.id}`); }
    catch (err: any) { setError(err.response?.data?.error || "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <Layout>
      <h1 className="text-2xl font-bold tracking-tight mb-4">New Tournament</h1>
      <form onSubmit={handleSubmit} className="space-y-4 bg-[#101f36] p-4 rounded-lg border border-[#1c3350]">
        {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20">{error}</div>}
        <div>
          <label className="block text-xs font-medium text-[#6b84a0] mb-1.5 uppercase tracking-wider">Name</label>
          <input type="text" placeholder="e.g. Friday Night Club" value={form.name} onChange={e => set("name", e.target.value)}
            className="w-full px-3 py-3 bg-[#0a1628] rounded border border-[#1c3350] focus:border-[#ccff00] focus:outline-none" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#6b84a0] mb-1.5 uppercase tracking-wider">Tables available</label>
          <input type="number" min={1} value={form.tablesCount} onChange={e => set("tablesCount", +e.target.value)}
            className="w-full px-3 py-3 bg-[#0a1628] rounded border border-[#1c3350] focus:border-[#ccff00] focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#6b84a0] mb-1.5 uppercase tracking-wider">Rating range (optional)</label>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Min" value={form.minRating} onChange={e => set("minRating", e.target.value)}
              className="w-full px-3 py-3 bg-[#0a1628] rounded border border-[#1c3350] focus:border-[#ccff00] focus:outline-none" />
            <input type="number" placeholder="Max" value={form.maxRating} onChange={e => set("maxRating", e.target.value)}
              className="w-full px-3 py-3 bg-[#0a1628] rounded border border-[#1c3350] focus:border-[#ccff00] focus:outline-none" />
          </div>
          <p className="text-xs text-[#4d6480] mt-1.5">Leave blank for no rating restriction. Players outside this range can't join.</p>
        </div>
        <p className="text-xs text-[#4d6480]">After creating, add participants and pair them up. Each match's point target (11 or 21) is set individually before it starts.</p>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={() => navigate("/")} className="flex-1 bg-[#1c3350] text-[#93a8c2] py-3 rounded text-sm font-medium">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 bg-[#ccff00] text-[#0a1628] py-3 rounded-lg text-sm font-bold disabled:opacity-50">
            {loading ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Layout>
  );
}
