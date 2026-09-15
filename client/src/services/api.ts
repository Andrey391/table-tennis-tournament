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
    seed: (id: string) => api.post(`/tournaments/${id}/seed`),
    draw: (id: string) => api.post(`/tournaments/${id}/draw`),
    standings: (id: string) => api.get(`/tournaments/${id}/standings`),
  },
  matches: {
    getByTournament: (id: string) => api.get(`/matches/tournament/${id}`),
    getById: (id: string) => api.get(`/matches/${id}`),
    create: (d: any) => api.post("/matches", d),
    startGame: (id: string) => api.post(`/matches/${id}/start`),
    score: (id: string, d: { side: number }) => api.post(`/matches/${id}/score`, d),
    undo: (id: string) => api.post(`/matches/${id}/undo`),
    recordLet: (id: string) => api.post(`/matches/${id}/let`),
    end: (id: string) => api.post(`/matches/${id}/end`),
    assignJudge: (id: string, d: any) => api.put(`/matches/${id}/assign-judge`, d),
    schedule: (id: string, d: any) => api.put(`/matches/${id}/schedule`, d),
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
