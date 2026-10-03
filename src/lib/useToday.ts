import { useEffect, useState } from 'react';

import { todayKey, type DateKey } from './dates';

/** Date du jour, mise à jour à minuit et au retour sur la fenêtre (repris du mobile). */
export function useToday(): DateKey {
  const [today, setToday] = useState(todayKey);

  useEffect(() => {
    const update = () => setToday(todayKey());
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(update, nextMidnight.getTime() - now.getTime() + 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') update();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', update);
    };
  }, [today]);

  return today;
}
