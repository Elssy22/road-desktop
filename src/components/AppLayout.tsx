import {
  Briefcase,
  CalendarDays,
  ListChecks,
  LogOut,
  NotebookPen,
  Settings,
  Sun,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { matchPath, NavLink, Outlet, useLocation } from 'react-router-dom';

import { useSession } from '../auth/SessionProvider';
import { supabase } from '../lib/supabase';

type Section = {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Sous-menu, toujours déplié sous sa section. */
  children?: { path: string; label: string; icon: LucideIcon }[];
};

/** Sections principales, dans l'ordre des onglets du mobile. */
export const SECTIONS: Section[] = [
  { path: '/today', label: "Aujourd'hui", icon: Sun },
  { path: '/tasks', label: 'Tâches', icon: ListChecks },
  { path: '/calendar', label: 'Calendrier', icon: CalendarDays },
  {
    path: '/agency',
    label: 'Agence',
    icon: Briefcase,
    children: [
      { path: '/agency/contacts', label: 'Contacts', icon: Users },
      { path: '/agency/pipeline', label: 'Pipeline', icon: TrendingUp },
    ],
  },
  { path: '/notes', label: 'Notes', icon: NotebookPen },
  { path: '/settings', label: 'Réglages', icon: Settings },
];

const linkClass = (active: boolean, sub = false) =>
  ['nav-link', sub && 'nav-link--sub', active && 'nav-link--active'].filter(Boolean).join(' ');

/** Coquille desktop : barre latérale fixe à gauche, écran courant à droite. */
export function AppLayout() {
  const { session } = useSession();
  const { pathname } = useLocation();
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
          {SECTIONS.map(({ path, label, icon: Icon, children }) => {
            // Une seule entrée en surbrillance : le sous-menu qui correspond, sinon la section.
            const childActive = children?.some((c) => matchPath({ path: c.path, end: false }, pathname)) ?? false;
            return (
              <li key={path}>
                <NavLink
                  to={path}
                  end={!!children}
                  className={({ isActive }) =>
                    linkClass(children ? !childActive && !!matchPath({ path, end: false }, pathname) : isActive)
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
                {children && (
                  <ul className="sidebar__list sidebar__sublist">
                    {children.map(({ path: subPath, label: subLabel, icon: SubIcon }) => (
                      <li key={subPath}>
                        <NavLink to={subPath} className={({ isActive }) => linkClass(isActive, true)}>
                          <SubIcon size={16} />
                          {subLabel}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
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
