import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PollingProvider } from "./context/SocketContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import TournamentPage from "./pages/TournamentPage";
import MatchPage from "./pages/MatchPage";
import BracketPage from "./pages/BracketPage";
import PublicTournament from "./pages/PublicTournament";
import LiveScore from "./pages/LiveScore";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" />;
}

function App() {
  const { token } = useAuth();
  return (
    <BrowserRouter>
      <PollingProvider>
        <Routes>
          <Route path="/login" element={token ? <Navigate to="/" /> : <Login />} />
          <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/tournament/:id" element={<RequireAuth><TournamentPage /></RequireAuth>} />
          <Route path="/tournament/:id/match/:matchId" element={<RequireAuth><MatchPage /></RequireAuth>} />
          <Route path="/tournament/:id/bracket" element={<RequireAuth><BracketPage /></RequireAuth>} />
          <Route path="/public/tournament/:id" element={<PublicTournament />} />
          <Route path="/live/:tournamentId" element={<LiveScore />} />
        </Routes>
      </PollingProvider>
    </BrowserRouter>
  );
}

export default function Root() {
  return <AuthProvider><App /></AuthProvider>;
}
