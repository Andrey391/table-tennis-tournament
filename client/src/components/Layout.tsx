import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";
import Avatar from "./Avatar";

const NAV = [
  { to: "/", label: "Home", d: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { to: "/bookings", label: "Play", d: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M12 14v4M10 16h4" },
  { to: "/rating", label: "Rating", d: "m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" },
  { to: "/results", label: "Results", d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  { to: "/profile", label: "Profile", d: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#0a1628] text-white flex flex-col">
      <header className="bg-[#101f36] border-b border-[#1c3350] px-4 h-12 flex items-center justify-between sticky top-0 z-40">
        <Logo />
        <div className="flex items-center gap-2">
          <Link to="/profile" className="flex items-center gap-2">
            <Avatar firstName={user?.firstName} lastName={user?.lastName} rating={user?.rating} size="sm" />
          </Link>
          <button onClick={logout} aria-label="Logout"
            className="w-8 h-8 flex items-center justify-center text-[#93a8c2] hover:text-white border border-[#1c3350] rounded-full text-sm">
            &#x21B0;
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-3 py-4 pb-24">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#101f36] border-t border-[#1c3350] flex pb-[env(safe-area-inset-bottom)]">
        {NAV.map(n => {
          const active = location.pathname === n.to;
          return (
            <Link key={n.to} to={n.to}
              className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-[#ccff00]" : "text-[#6b84a0]"
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
