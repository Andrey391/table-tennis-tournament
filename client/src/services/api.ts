import axios from "axios";

const api = axios.create({ baseURL: "/api", headers: { "Content-Type": "application/json" } });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const apiService = {
  auth: {
    login: (d: { email: string; password: string }) => api.post("/auth/login", d),
    register: (d: any) => api.post("/auth/register", d),
    me: () => api.get("/auth/me"),
  },
  players: {
    getAll: () => api.get("/players"),
    update: (id: string, d: any) => api.put(`/players/${id}`, d),
  },
  tournaments: {
    // `kind` picks rated tournaments ("TOURNAMENT") or unrated games ("GAME").
    getAll: (params?: { kind?: string; city?: string; clubId?: string; status?: string; from?: string; to?: string; q?: string }) => api.get("/tournaments", { params }),
    getMine: (params?: { kind?: string }) => api.get("/tournaments/mine", { params }),
    getById: (id: string) => api.get(`/tournaments/${id}`),
    create: (d: any) => api.post("/tournaments", d),
    update: (id: string, d: any) => api.put(`/tournaments/${id}`, d),
    addPlayers: (id: string, d: { userIds: string[] }) => api.post(`/tournaments/${id}/players`, d),
    removePlayer: (id: string, userId: string) => api.delete(`/tournaments/${id}/players/${userId}`),
    join: (id: string) => api.post(`/tournaments/${id}/join`),
    approvePlayer: (id: string, userId: string) => api.post(`/tournaments/${id}/players/${userId}/approve`),
    pair: (id: string) => api.post(`/tournaments/${id}/pair`),
    standings: (id: string) => api.get(`/tournaments/${id}/standings`),
    getChat: (id: string) => api.get(`/tournaments/${id}/chat`),
    sendChat: (id: string, d: { text: string }) => api.post(`/tournaments/${id}/chat`, d),
  },
  matches: {
    getByTournament: (id: string) => api.get(`/matches/tournament/${id}`),
    getById: (id: string) => api.get(`/matches/${id}`),
    updateSettings: (id: string, d: { pointsToWin?: number; tableNumber?: number }) => api.put(`/matches/${id}`, d),
    // Scoring acts on the match's current set; the response carries the whole match.
    start: (id: string) => api.post(`/matches/${id}/start`),
    score: (id: string, d: { side: 1 | 2 }) => api.post(`/matches/${id}/score`, d),
    undo: (id: string) => api.post(`/matches/${id}/undo`),
    recordLet: (id: string) => api.post(`/matches/${id}/let`),
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
    addTable: (id: string, d: { number: number; indoor?: boolean }) => api.post(`/clubs/${id}/tables`, d),
    removeTable: (id: string, tableId: string) => api.delete(`/clubs/${id}/tables/${tableId}`),
  },
  bookings: {
    getMine: () => api.get("/bookings/mine"),
    create: (d: { clubId: string; tableId?: string; date: string; startTime: string; durationHours: number; eventType: "GAME" | "TOURNAMENT"; eventTitle?: string; pointsToWin?: 11 | 21 }) => api.post("/bookings", d),
    remove: (id: string) => api.delete(`/bookings/${id}`),
  },
  subscriptions: {
    getMine: () => api.get("/subscriptions/mine"),
    subscribe: (clubId: string) => api.post("/subscriptions", { clubId }),
    unsubscribe: (clubId: string) => api.delete(`/subscriptions/${clubId}`),
  },
  profile: {
    stats: () => api.get("/profile/stats"),
  },
};

export default apiService;
