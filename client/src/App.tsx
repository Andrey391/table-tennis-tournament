import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import TournamentPage from "./pages/TournamentPage";
import MatchPage from "./pages/MatchPage";
import BracketPage from "./pages/BracketPage";
import PublicTournament from "./pages/PublicTournament";
import LiveScore from "./pages/LiveScore";

function App() {
  const { token } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" /> : <Login />} />
        <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/tournament/:id" element={<RequireAuth><TournamentPage /></RequireAuth>} />
        <Route path="/tournament/:id/match/:matchId" element={<RequireAuth><MatchPage /></RequireAuth>} />
        <Route path="/tournament/:id/bracket" element={<RequireAuth><BracketPage /></RequireAuth>} />
        <Route path="/public/tournament/:id" element={<PublicTournament />} />
        <Route path="/live/:tournamentId" element={<LiveScore />} />
      </Routes>
    </BrowserRouter>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" />;
}

export default App;
