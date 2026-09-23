import axios from "axios";

const api = axios.create({ baseURL: "/api", headers: { "Content-Type": "application/json" } });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // A player who keeps their name private is masked for guests; the server words
  // the placeholder in the language the app is shown in.
  try { config.headers["X-Lang"] = localStorage.getItem("lang") || "ru"; } catch { /* storage blocked */ }
  return config;
});

export const apiService = {
  auth: {
    login: (d: { email: string; password: string }) => api.post("/auth/login", d),
    register: (d: any) => api.post("/auth/register", d),
    me: () => api.get("/auth/me"),
    // Starts a throwaway account with a club night already on its roster, and
    // turns that account into a real one once the visitor decides to keep it.
    demo: () => api.post("/auth/demo"),
    // Redeems a demo invitation link: takes the open seat in that event as a guest.
    joinDemo: (tournamentId: string) => api.post("/auth/demo/join", { tournamentId }),
    // Forgot password: mail a 6-digit code, then trade it for a new password.
    forgot: (email: string) => api.post("/auth/forgot", { email }),
    reset: (d: { email: string; code: string; newPassword: string }) => api.post("/auth/reset", d),
    claim: (d: { email: string; password: string; firstName: string; lastName: string; city?: string; acceptTerms: boolean; publicProfile: boolean }) => api.post("/auth/claim", d),
    // Deletes (anonymises) the caller's own account; asks for the password again.
    deleteAccount: (password: string) => api.delete("/auth/me", { data: { password } }),
  },
  players: {
    getAll: () => api.get("/players"),
    // A player's public profile plus the matches behind their rating.
    getById: (id: string) => api.get(`/players/${id}`),
    // That player's matches on one calendar day — played ones with their real
    // start/end, upcoming ones pinned to their event's start time.
    schedule: (id: string, date: string) => api.get(`/players/${id}/schedule`, { params: { date } }),
    // The owner's own profile; a new password needs the current one alongside it.
    update: (id: string, d: {
      firstName?: string; lastName?: string; email?: string;
      city?: string | null; phone?: string | null; dateOfBirth?: string | null;
      publicProfile?: boolean;
      currentPassword?: string; newPassword?: string;
    }) => api.put(`/players/${id}`, d),
  },
  tournaments: {
    // `kind` picks rated tournaments ("TOURNAMENT") or unrated games ("GAME").
    // Response is always `{ items, nextCursor }`; pass the previous `nextCursor`
    // back as `cursor` for the next page (a club-night-scale feed rarely needs one).
    getAll: (params?: { kind?: string; city?: string; clubId?: string; status?: string; from?: string; to?: string; q?: string; limit?: number; cursor?: string }) => api.get("/tournaments", { params }),
    getMine: (params?: { kind?: string; status?: string }) => api.get("/tournaments/mine", { params }),
    getById: (id: string) => api.get(`/tournaments/${id}`),
    create: (d: any) => api.post("/tournaments", d),
    update: (id: string, d: any) => api.put(`/tournaments/${id}`, d),
    // Deletes the event and its matches. A booking that created it keeps existing.
    // Refused (400) for a COMPLETED tournament — archive it instead.
    remove: (id: string) => api.delete(`/tournaments/${id}`),
    // Puts a completed tournament away (out of the general feed, still visible on
    // its own page and under "mine") without touching any of its data.
    archive: (id: string) => api.post(`/tournaments/${id}/archive`),
    unarchive: (id: string) => api.post(`/tournaments/${id}/unarchive`),
    addPlayers: (id: string, d: { userIds: string[] }) => api.post(`/tournaments/${id}/players`, d),
    removePlayer: (id: string, userId: string) => api.delete(`/tournaments/${id}/players/${userId}`),
    join: (id: string) => api.post(`/tournaments/${id}/join`),
    approvePlayer: (id: string, userId: string) => api.post(`/tournaments/${id}/players/${userId}/approve`),
    pair: (id: string) => api.post(`/tournaments/${id}/pair`),
    // Round-1 order set by the manager: approved players, top seed first (DRAFT only).
    setSeeding: (id: string, d: { userIds: string[] }) => api.put(`/tournaments/${id}/seeding`, d),
    // A friendly game already played, written down in one step (unrated, private).
    quickGame: (d: { opponentId: string; setsWon1: number; setsWon2: number; clubId?: string; name?: string }) => api.post("/tournaments/quick-game", d),
    standings: (id: string, tiebreak?: "buchholz" | "sonnebornberger") => api.get(`/tournaments/${id}/standings`, { params: tiebreak ? { tiebreak } : undefined }),
    // Wipes round 1 of the caller's own demo event (sets, tally, rating) back to
    // freshly-paired once the guided tour that scored it is done.
    resetDemoRound1: (id: string) => api.post(`/tournaments/${id}/demo-reset-round1`),
    // `after` (the last message's createdAt) returns only newer messages.
    getChat: (id: string, after?: string) => api.get(`/tournaments/${id}/chat`, { params: after ? { after } : undefined }),
    sendChat: (id: string, d: { text: string }) => api.post(`/tournaments/${id}/chat`, d),
  },
  matches: {
    getByTournament: (id: string) => api.get(`/matches/tournament/${id}`),
    getById: (id: string) => api.get(`/matches/${id}`),
    // The caller's unfinished matches in live events (home-screen "your match").
    mine: () => api.get("/matches/mine"),
    updateSettings: (id: string, d: { tableNumber?: number; setsToWin?: number }) => api.put(`/matches/${id}`, d),
    // Scoring records one whole set for a side; the response carries the whole match.
    start: (id: string) => api.post(`/matches/${id}/start`),
    score: (id: string, d: { side: 1 | 2; score1?: number; score2?: number }) => api.post(`/matches/${id}/score`, d),
    undo: (id: string) => api.post(`/matches/${id}/undo`),
    end: (id: string) => api.post(`/matches/${id}/end`),
    forfeit: (id: string, d: { loserSide: 1 | 2 }) => api.post(`/matches/${id}/forfeit`, d),
  },
  live: {
    get: (tournamentId: string) => api.get(`/live/${tournamentId}`),
  },
  public: {
    tournament: (id: string) => api.get(`/public/tournament/${id}`),
    standings: (id: string) => api.get(`/public/tournament/${id}/standings`),
  },
  rating: {
    getAll: () => api.get("/rating"),
  },
  clubs: {
    getAll: (params?: { city?: string; q?: string }) => api.get("/clubs", { params }),
    cities: () => api.get("/clubs/cities"),
    getById: (id: string) => api.get(`/clubs/${id}`),
    availability: (id: string, date: string) => api.get(`/clubs/${id}/availability`, { params: { date } }),
    create: (d: { name: string; city: string; address?: string; phone?: string }) => api.post("/clubs", d),
    update: (id: string, d: any) => api.put(`/clubs/${id}`, d),
    addTable: (id: string, d: { number: number; indoor?: boolean; pricePerHour?: number }) => api.post(`/clubs/${id}/tables`, d),
    updateTable: (id: string, tableId: string, d: { number?: number; indoor?: boolean; pricePerHour?: number | null }) =>
      api.put(`/clubs/${id}/tables/${tableId}`, d),
    removeTable: (id: string, tableId: string) => api.delete(`/clubs/${id}/tables/${tableId}`),
  },
  bookings: {
    getMine: () => api.get("/bookings/mine"),
    create: (d: {
      clubId: string; tableId?: string; date: string; startTime: string; durationHours: number;
      eventStartTime?: string; eventEndTime?: string;
      eventType: "GAME" | "TOURNAMENT"; eventTitle?: string; description?: string; setsToWin?: number;
      tablesCount?: number; isPublic?: boolean; access?: "OPEN" | "CLOSED"; maxPlayers?: number; minRating?: number; maxRating?: number; ratingWeight?: number;
    }) => api.post("/bookings", d),
    remove: (id: string) => api.delete(`/bookings/${id}`),
    pay: (id: string) => api.post(`/bookings/${id}/pay`),
    // { enabled, test }: whether online payment exists at all, and whether it is a mock.
    paymentConfig: () => api.get("/bookings/payments"),
  },
  subscriptions: {
    getMine: () => api.get("/subscriptions/mine"),
    subscribe: (clubId: string) => api.post("/subscriptions", { clubId }),
    unsubscribe: (clubId: string) => api.delete(`/subscriptions/${clubId}`),
  },
  profile: {
    stats: () => api.get("/profile/stats"),
  },
  // The caller's inbox. `unread` is what the header bell polls; `markRead` with
  // no ids marks everything read.
  notifications: {
    list: () => api.get("/notifications"),
    unread: () => api.get("/notifications/unread"),
    markRead: (ids?: string[]) => api.post("/notifications/read", ids ? { ids } : {}),
  },
  // Results feed with podiums, per-player statistics, head-to-head and leaderboards.
  stats: {
    results: (params?: { kind?: string; city?: string; clubId?: string; userId?: string; q?: string }) => api.get("/results", { params }),
    player: (id: string) => api.get(`/players/${id}/stats`),
    headToHead: (id: string, otherId: string) => api.get(`/players/${id}/h2h/${otherId}`),
    leaders: (params: { metric: "rating" | "wins" | "played"; period: "month" | "year" | "all"; city?: string }) => api.get("/leaders", { params }),
  },
};

export default apiService;
