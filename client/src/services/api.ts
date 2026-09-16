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
    getAll: () => api.get("/tournaments"),
    getById: (id: string) => api.get(`/tournaments/${id}`),
    create: (d: any) => api.post("/tournaments", d),
    update: (id: string, d: any) => api.put(`/tournaments/${id}`, d),
    addPlayers: (id: string, d: { userIds: string[] }) => api.post(`/tournaments/${id}/players`, d),
    removePlayer: (id: string, userId: string) => api.delete(`/tournaments/${id}/players/${userId}`),
    join: (id: string) => api.post(`/tournaments/${id}/join`),
    approvePlayer: (id: string, userId: string) => api.post(`/tournaments/${id}/players/${userId}/approve`),
    pair: (id: string) => api.post(`/tournaments/${id}/pair`),
    standings: (id: string) => api.get(`/tournaments/${id}/standings`),
  },
  matches: {
    getByTournament: (id: string) => api.get(`/matches/tournament/${id}`),
    getById: (id: string) => api.get(`/matches/${id}`),
    updateSettings: (id: string, d: { pointsToWin?: number; tableNumber?: number }) => api.put(`/matches/${id}`, d),
    start: (id: string) => api.post(`/matches/${id}/start`),
    score: (id: string, d: { side: 1 | 2 }) => api.post(`/matches/${id}/score`, d),
    undo: (id: string) => api.post(`/matches/${id}/undo`),
    recordLet: (id: string) => api.post(`/matches/${id}/let`),
    end: (id: string) => api.post(`/matches/${id}/end`),
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
};

export default apiService;
