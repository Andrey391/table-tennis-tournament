import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PollingProvider } from "./context/SocketContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import TournamentPage from "./pages/TournamentPage";
import CreateTournament from "./pages/CreateTournament";
import MatchPage from "./pages/MatchPage";
import BracketPage from "./pages/BracketPage";
import PublicTournament from "./pages/PublicTournament";
import LiveScore from "./pages/LiveScore";
import PlayersPage from "./pages/PlayersPage";
import ResultsPage from "./pages/ResultsPage";

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
          <Route path="/register" element={token ? <Navigate to="/" /> : <Register />} />
          <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/players" element={<RequireAuth><PlayersPage /></RequireAuth>} />
          <Route path="/results" element={<RequireAuth><ResultsPage /></RequireAuth>} />
          <Route path="/tournament/new" element={<RequireAuth><CreateTournament /></RequireAuth>} />
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
