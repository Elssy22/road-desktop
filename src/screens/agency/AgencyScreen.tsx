import {
  CalendarDays,
  ChevronRight,
  Clock,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Badge, CardNote, CategoryCard, ErrorBanner, Panel, ScreenHeader } from '../../components/ui';
import { listContacts, type ContactWithLast } from '../../data/crm';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { needsFollowUp } from '../../lib/followUp';
import { formatMoney } from '../../lib/money';
import { useToday } from '../../lib/useToday';
import type { Category } from '../../theme/tokens';

const EMPTY: ContactWithLast[] = [];

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Sections du menu Agence du mobile qui arrivent aux lots suivants du portage. */
const COMING_SOON = [
  'Projets · Objectifs · Échéancier (lot 3)',
  'Finances · Qonto · Coffre · Veille appels d’offres (lot 4)',
];

/**
 * Accueil de la section Agence : portage web de
 * mobile-legacy/src/screens/agency/AgencyScreen.tsx. Une carte par outil, de la
 * teinte de sa catégorie (DECISIONS.md §29), avec un résumé et une alerte.
 */
export function AgencyScreen() {
  const today = useToday();
  const { data: contacts, error } = useRemoteQuery(listContacts, EMPTY);

  const summary = useMemo(() => {
    // Signés et perdus exclus : ils attendent juste d'être sortis du pipeline.
    const open = contacts.filter((c) => c.pipeline_stage && c.pipeline_stage !== 'signe' && c.pipeline_stage !== 'perdu');
    const potential = Math.round(open.reduce((sum, c) => sum + (c.pipeline_amount ?? 0), 0) * 100) / 100;
    return {
      contacts: contacts.length,
      followUps: contacts.filter((c) => needsFollowUp(c, today)).length,
      prospects: open.length,
      potential,
      lateFollowups: open.filter((c) => c.next_followup_date && c.next_followup_date < today).length,
    };
  }, [contacts, today]);

  const sections: {
    to: string;
    category: Category;
    icon: LucideIcon;
    title: string;
    subtitle: string;
    alert?: string;
  }[] = [
    {
      to: '/agency/contacts',
      category: 'contacts',
      icon: Users,
      title: 'Contacts',
      subtitle: `${plural(summary.contacts, 'contact')} · clients, partenaires et prospects`,
      alert: summary.followUps > 0 ? `${summary.followUps} à relancer` : undefined,
    },
    {
      to: '/agency/pipeline',
      category: 'contacts',
      icon: TrendingUp,
      title: 'Pipeline',
      subtitle:
        summary.prospects > 0
          ? `${plural(summary.prospects, 'prospect')} en cours` +
            (summary.potential > 0 ? ` · ${formatMoney(summary.potential, 'EUR')} potentiels` : '')
          : 'Prospection : à démarcher, deck envoyé, à relancer…',
      alert: summary.lateFollowups > 0 ? `${summary.lateFollowups} relance${summary.lateFollowups > 1 ? 's' : ''} en retard` : undefined,
    },
    {
      // Sans catégorie : pêche, il produit des tâches.
      to: '/agency/meeting-report',
      category: 'tasks',
      icon: Sparkles,
      title: 'Compte-rendu de RDV',
      subtitle: 'Notes → résumé et tâches (IA)',
    },
    {
      to: '/calendar',
      category: 'agenda',
      icon: CalendarDays,
      title: 'Calendrier',
      subtitle: 'Tâches, échéances et rappels par mois ou semaine',
    },
    {
      // Réglages > Données personnelles sur le mobile ; ici tant que les Réglages ne sont pas portés.
      to: '/agency/prospect-purge',
      category: 'reminders',
      icon: ShieldCheck,
      title: 'Purge RGPD',
      subtitle: 'Prospects inactifs depuis 3 ans',
    },
  ];

  return (
    <div className="screen screen--wide">
      <ScreenHeader eyebrow="Outils métier" title="Agence" />
      <ErrorBanner message={error} />
      <div className="card-grid">
        {sections.map((s) => (
          <Link key={s.to} to={s.to} className="card-link" aria-label={s.alert ? `${s.title}, ${s.alert}` : s.title}>
            <CategoryCard
              category={s.category}
              icon={s.icon}
              title={s.title}
              action={
                <span className="header-actions">
                  {s.alert ? <Badge label={s.alert} color="var(--color-warning)" /> : null}
                  <ChevronRight size={18} className="tint-icon" />
                </span>
              }
            >
              <CardNote>{s.subtitle}</CardNote>
            </CategoryCard>
          </Link>
        ))}
      </div>
      <Panel className="panel-card--padded coming-soon">
        <p className="coming-soon__title">
          <Clock size={16} />
          Bientôt sur Mac
        </p>
        {COMING_SOON.map((line) => (
          <CardNote key={line}>{line}</CardNote>
        ))}
        <CardNote>En attendant, ces sections restent disponibles sur le mobile.</CardNote>
      </Panel>
    </div>
  );
}
