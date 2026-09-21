import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PollingProvider } from "./context/SocketContext";
import { LangProvider } from "./i18n";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import TournamentPage from "./pages/TournamentPage";
import CreateTournament from "./pages/CreateTournament";
import MatchPage from "./pages/MatchPage";
import PublicTournament from "./pages/PublicTournament";
import LiveScore from "./pages/LiveScore";
import PlayersPage from "./pages/PlayersPage";
import ResultsPage from "./pages/ResultsPage";
import RatingPage from "./pages/RatingPage";
import BookingsPage from "./pages/BookingsPage";
import ProfilePage from "./pages/ProfilePage";
import TournamentChatPage from "./pages/TournamentChatPage";
import GamesPage from "./pages/GamesPage";
import PlayerPage from "./pages/PlayerPage";
import Tour from "./components/Tour";

// Wraps the screens that write something. Everything else is readable by a guest:
// the app is useless to a newcomer if the first thing it asks for is an account,
// and every screen below either shows public data or already hides its actions
// behind a signed-in user.
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
          {/* Guest-readable: the feed, the rating, results, events and their matches. */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/rating" element={<RatingPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/tournament/:id" element={<TournamentPage />} />
          <Route path="/tournament/:id/match/:matchId" element={<MatchPage />} />

          {/* Signed in: anything that books, creates, joins or says something. */}
          <Route path="/bookings" element={<RequireAuth><BookingsPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/tournament/new" element={<RequireAuth><CreateTournament /></RequireAuth>} />
          <Route path="/tournament/:id/chat" element={<RequireAuth><TournamentChatPage /></RequireAuth>} />
          <Route path="/public/tournament/:id" element={<PublicTournament />} />
          <Route path="/live/:tournamentId" element={<LiveScore />} />
        </Routes>
        {/* Outside the routes so it follows a demo visitor from the roster to the
            scoring screen, which renders without Layout. */}
        <Tour />
      </PollingProvider>
    </BrowserRouter>
  );
}

export default function Root() {
  return <LangProvider><AuthProvider><App /></AuthProvider></LangProvider>;
}
