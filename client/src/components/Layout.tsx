import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/", label: "Home", icon: "⌂" },
  { to: "/players", label: "Players", icon: "☰" },
  { to: "/results", label: "Results", icon: "▦" },
  { to: "/rating", label: "Rating", icon: "★" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      <header className="bg-[#12121a] border-b border-[#1e1e2e] px-4 h-12 flex items-center justify-between sticky top-0 z-40">
        <Link to="/" className="text-sm font-bold tracking-tight text-white">
          TT <span className="text-[#3b82f6]">TOURNAMENT</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#666680] truncate max-w-[100px]">{user?.firstName}</span>
          <button onClick={logout} aria-label="Logout"
            className="w-8 h-8 flex items-center justify-center text-[#8888a0] hover:text-white border border-[#1e1e2e] rounded-full text-sm">
            &#x21B0;
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-3 py-4 pb-24">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#12121a] border-t border-[#1e1e2e] flex pb-[env(safe-area-inset-bottom)]">
        {NAV.map(n => {
          const active = location.pathname === n.to;
          return (
            <Link key={n.to} to={n.to}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                active ? "text-[#3b82f6]" : "text-[#666680]"
              }`}>
              <span className="text-lg leading-none">{n.icon}</span>
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
