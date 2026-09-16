import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";

const NAV = [
  { to: "/", label: "Home", d: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { to: "/players", label: "Players", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
  { to: "/results", label: "Results", d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  { to: "/rating", label: "Rating", d: "m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      <header className="bg-[#12121a] border-b border-[#1e1e2e] px-4 h-12 flex items-center justify-between sticky top-0 z-40">
        <Logo />
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
              className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-[#ccff00]" : "text-[#666680]"
              }`}>
              {active && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-[#ccff00]" />}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d={n.d} />
              </svg>
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
