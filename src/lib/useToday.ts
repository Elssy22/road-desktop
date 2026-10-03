import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { todayKey, type DateKey } from './dates';

/** Date du jour, mise à jour à minuit et au retour au premier plan. */
export function useToday(): DateKey {
  const [today, setToday] = useState(todayKey);

  useEffect(() => {
    const update = () => setToday(todayKey());
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(update, nextMidnight.getTime() - now.getTime() + 1000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') update();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [today]);

  return today;
}
