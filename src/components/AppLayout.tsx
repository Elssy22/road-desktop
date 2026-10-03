import { Briefcase, CalendarDays, ListChecks, LogOut, NotebookPen, Settings, Sun, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { useSession } from '../auth/SessionProvider';
import { supabase } from '../lib/supabase';

/** Sections principales, dans l'ordre des onglets du mobile. */
export const SECTIONS: { path: string; label: string; icon: LucideIcon }[] = [
  { path: '/today', label: "Aujourd'hui", icon: Sun },
  { path: '/tasks', label: 'Tâches', icon: ListChecks },
  { path: '/calendar', label: 'Calendrier', icon: CalendarDays },
  { path: '/agency', label: 'Agence', icon: Briefcase },
  { path: '/notes', label: 'Notes', icon: NotebookPen },
  { path: '/settings', label: 'Réglages', icon: Settings },
];

/** Coquille desktop : barre latérale fixe à gauche, écran courant à droite. */
export function AppLayout() {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
  };

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Navigation principale">
        <p className="sidebar__brand eyebrow">Road</p>
        <ul className="sidebar__list">
          {SECTIONS.map(({ path, label, icon: Icon }) => (
            <li key={path}>
              <NavLink to={path} className={({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link')}>
                <Icon size={18} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar__footer">
          <p className="sidebar__email" title={session?.user.email}>
            {session?.user.email}
          </p>
          <button type="button" className="nav-link" disabled={busy} onClick={() => void signOut()}>
            <LogOut size={18} />
            Se déconnecter
          </button>
        </div>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
