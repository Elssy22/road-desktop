import { useEffect, useRef, useState } from 'react';

import { isVaultUnlocked, lockVault, onVaultLocked } from './vault';

/**
 * État verrouillé / déverrouillé du coffre pour un écran (liste et fiche
 * document). `onLocked` efface ce qui était affiché en clair, que le
 * verrouillage vienne du bouton, de l'inactivité ou de la fenêtre masquée.
 */
export function useVaultLock(userId: string, onLocked: () => void) {
  const [unlocked, setUnlocked] = useState(() => isVaultUnlocked(userId));
  const onLockedRef = useRef(onLocked);
  onLockedRef.current = onLocked;

  useEffect(
    () =>
      onVaultLocked(() => {
        if (isVaultUnlocked(userId)) return;
        setUnlocked(false);
        onLockedRef.current();
      }),
    [userId]
  );

  return { unlocked, markUnlocked: () => setUnlocked(true), lock: () => lockVault(userId) };
}
