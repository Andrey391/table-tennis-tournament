import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useCallback } from "react";
import { apiService } from "../services/api";
import { useT } from "../i18n";
import { useAuth } from "../context/AuthContext";

export default function TournamentChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useT();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try { const r = await apiService.tournaments.getChat(id); setMessages(r.data); }
    catch (e: any) { setError(e.response?.data?.error || t("common.failed")); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 3000); return () => clearInterval(i); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !text.trim()) return;
    try { await apiService.tournaments.sendChat(id, { text: text.trim() }); setText(""); load(); }
    catch (e: any) { setError(e.response?.data?.error || t("common.failed")); }
  };

  return (
    <div className="min-h-screen bg-[#0a1628] flex flex-col">
      <header className="bg-[#101f36] border-b border-[#1c3350] px-4 h-12 flex items-center gap-3 sticky top-0">
        <button onClick={() => navigate(`/tournament/${id}`)} className="text-[#93a8c2] text-sm">&larr;</button>
        <h1 className="text-sm font-semibold">{t("chat.title")}</h1>
      </header>

      {error && <div className="bg-red-500/10 text-red-400 p-3 text-sm border-b border-red-500/20">{error}</div>}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-center py-12 text-sm text-[#6b84a0]">{t("chat.empty")}</p>
        ) : messages.map(m => {
          const mine = m.userId === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 ${mine ? "bg-[#ccff00] text-[#0a1628]" : "bg-[#101f36] border border-[#1c3350] text-white"}`}>
                {!mine && <p className="text-[11px] font-semibold opacity-70 mb-0.5">{m.user?.firstName} {m.user?.lastName}</p>}
                <p className="text-sm break-words">{m.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="p-3 border-t border-[#1c3350] flex gap-2 pb-[env(safe-area-inset-bottom)]">
        <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder={t("chat.placeholder")}
          className="flex-1 px-3 py-2.5 bg-[#101f36] rounded-lg border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none" />
        <button type="submit" className="px-4 py-2.5 bg-[#ccff00] text-[#0a1628] rounded-lg text-sm font-bold">{t("chat.send")}</button>
      </form>
    </div>
  );
}
