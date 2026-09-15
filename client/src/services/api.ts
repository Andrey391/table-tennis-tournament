import axios from "axios";

const apiClient = axios.create({ baseURL: "/api", headers: { "Content-Type": "application/json" } });

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const api = {
  auth: {
    login: (d: { email: string; password: string }) => apiClient.post("/auth/login", d),
    register: (d: any) => apiClient.post("/auth/register", d),
    me: () => apiClient.get("/auth/me"),
  },
  tournaments: {
    getAll: () => apiClient.get("/tournaments"),
    getById: (id: string) => apiClient.get(`/tournaments/${id}`),
    create: (d: any) => apiClient.post("/tournaments", d),
    update: (id: string, d: any) => apiClient.put(`/tournaments/${id}`, d),
    draw: (id: string) => apiClient.post(`/tournaments/${id}/draw`),
    standings: (id: string) => apiClient.get(`/tournaments/${id}/standings`),
    addPlayers: (id: string, d: { userIds: string[] }) => apiClient.post(`/tournaments/${id}/players`, d),
  },
  matches: {
    getByTournament: (id: string) => apiClient.get(`/matches/tournament/${id}`),
    getById: (id: string) => apiClient.get(`/matches/${id}`),
    create: (d: any) => apiClient.post("/matches", d),
    updateScore: (id: string, d: any) => apiClient.put(`/matches/${id}/score`, d),
    recordLet: (id: string) => apiClient.post(`/matches/${id}/let`),
    end: (id: string) => apiClient.post(`/matches/${id}/end`),
  },
};

export default api;
