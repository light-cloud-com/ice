import { useEffect, useState } from 'react';
import axiosInstance from '../api/axios-instance';

interface SystemStats {
  ram: number; // MB
  cpu: number; // %
}

export function useSystemStats(intervalMs = 10000): SystemStats | null {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    let active = true;

    async function fetch() {
      try {
        const res = await axiosInstance.get('/system/stats');
        if (active) setStats(res.data);
      } catch {
        // silently ignore — stats are best-effort
      }
    }

    fetch();
    const id = setInterval(fetch, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return stats;
}
