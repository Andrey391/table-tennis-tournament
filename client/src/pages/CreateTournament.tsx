import React from "react";
import { useNavigate } from "react-router-dom";
import { apiService } from "../services/api";

const TYPES = [{ value: "SINGLE", label: "Singles" }, { value: "DOUBLE", label: "Doubles" }, { value: "TEAM", label: "Team" }];
const SYSTEMS = [{ value: "ROUND_ROBIN", label: "Round Robin" }, { value: "OLYMPIC", label: "Olympic" }, { value: "DOUBLE_ELIMINATION", label: "Double Elimination" }, { value: "MIXED", label: "Mixed" }];
const FORMATS = [{ value: "BEST_OF_3", label: "Best of 3" }, { value: "BEST_OF_5", label: "Best of 5" }, { value: "BEST_OF_7", label: "Best of 7" }];

export default function CreateTournament() {
  const navigate = useNavigate();
  const [form, setForm] = React.useState({ name: "", type: "SINGLE", system: "ROUND_ROBIN", format: "BEST_OF_3", tablesCount: 4, maxGroups: 2, playersPerGroup: 8, playersOut: 2 });
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
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Create Tournament</h1>
        <form onSubmit={handleSubmit} className="space-y-4 bg-gray-800 p-6 rounded-lg border border-gray-700">
          {error && <div className="bg-red-900/50 text-red-200 p-3 rounded text-sm border border-red-700">{error}</div>}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input type="text" placeholder="Spring Open 2026" value={form.name} onChange={e => set("name", e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none" required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm text-gray-400 mb-1">Type</label>
              <select value={form.type} onChange={e => set("type", e.target.value)} className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600">
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select></div>
            <div><label className="block text-sm text-gray-400 mb-1">System</label>
              <select value={form.system} onChange={e => set("system", e.target.value)} className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600">
                {SYSTEMS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select></div>
            <div><label className="block text-sm text-gray-400 mb-1">Format</label>
              <select value={form.format} onChange={e => set("format", e.target.value)} className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600">
                {FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm text-gray-400 mb-1">Tables</label>
              <input type="number" min={1} value={form.tablesCount} onChange={e => set("tablesCount", +e.target.value)} className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600" /></div>
            <div><label className="block text-sm text-gray-400 mb-1">Groups</label>
              <input type="number" min={1} value={form.maxGroups} onChange={e => set("maxGroups", +e.target.value)} className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600" /></div>
            <div><label className="block text-sm text-gray-400 mb-1">Players/Group</label>
              <input type="number" min={2} value={form.playersPerGroup} onChange={e => set("playersPerGroup", +e.target.value)} className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600" /></div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate("/")} className="flex-1 bg-gray-600 py-2 rounded hover:bg-gray-500">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 bg-blue-600 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
