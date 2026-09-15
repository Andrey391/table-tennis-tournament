import { createContext, useContext, useEffect, useState, useCallback } from "react";

interface PollingContextType {
  poll: (url: string, interval: number) => { data: any; refetch: () => void };
}

const PollingContext = createContext<PollingContextType>({ poll: () => ({ data: null, refetch: () => {} }) });

export function PollingProvider({ children }: { children: React.ReactNode }) {
  const poll = useCallback((url: string, interval: number) => {
    const [data, setData] = useState(null);
    const [trigger, setTrigger] = useState(0);

    useEffect(() => {
      const fetchData = async () => {
        try {
          const token = localStorage.getItem("token");
          const headers: Record<string, string> = {};
          if (token) headers["Authorization"] = `Bearer ${token}`;
          const res = await fetch(url, { headers });
          if (res.ok) { const json = await res.json(); setData(json); }
        } catch (e) { console.error("Poll error:", e); }
      };
      fetchData();
      const id = setInterval(fetchData, interval);
      return () => clearInterval(id);
    }, [url, interval, trigger]);

    const refetch = useCallback(() => setTrigger(t => t + 1), []);
    return { data, refetch };
  }, []);

  return <PollingContext.Provider value={{ poll }}>{children}</PollingContext.Provider>;
}

export function usePolling() { return useContext(PollingContext); }

export function usePoll(url: string, interval: number = 3000) {
  const { poll } = usePolling();
  return poll(url, interval);
}
