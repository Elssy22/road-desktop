import {
  CalendarDays,
  ChevronRight,
  GitBranch,
  Hourglass,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Badge, CardNote, CategoryCard, ErrorBanner, ScreenHeader } from '../../components/ui';
import { listContacts, type ContactWithLast } from '../../data/crm';
import { listGoals, type GoalWithProject } from '../../data/goals';
import { listKeyDates, type KeyDateWithContact } from '../../data/keyDates';
import { effectiveStatus, listMoneyItems, type MoneyItemWithLinks } from '../../data/money';
import { listProjects, type ProjectWithProgress } from '../../data/projects';
import { listTenderOffers, type TenderOffer } from '../../data/tenderOffers';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { needsFollowUp } from '../../lib/followUp';
import { PROSPECT_RETENTION_YEARS } from '../../lib/crmRetention';
import { daysUntil, TODAY_ALERT_DAYS } from '../../lib/keyDateAlerts';
import { formatMoney } from '../../lib/money';
import { useToday } from '../../lib/useToday';
import { isUrgent } from '../../lib/veille';
import type { Category } from '../../theme/tokens';

type Data = {
  contacts: ContactWithLast[];
  projects: ProjectWithProgress[];
  goals: GoalWithProject[];
  keyDates: KeyDateWithContact[];
  money: MoneyItemWithLinks[];
  tenders: TenderOffer[];
};
const EMPTY: Data = { contacts: [], projects: [], goals: [], keyDates: [], money: [], tenders: [] };

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Accueil de la section Agence : portage web de
 * mobile-legacy/src/screens/agency/AgencyScreen.tsx. Une carte par outil, de la
 * teinte de sa catégorie (DECISIONS.md §29), avec un résumé et une alerte.
 */
export function AgencyScreen({ userId }: { userId: string }) {
  const today = useToday();
  const load = useCallback(async (): Promise<Data> => {
    const [contacts, projects, { goals }, keyDates, money, tenders] = await Promise.all([
      listContacts(),
      listProjects(),
      listGoals(userId),
      listKeyDates(),
      listMoneyItems(),
      listTenderOffers(),
    ]);
    return { contacts, projects, goals, keyDates, money, tenders };
  }, [userId]);
  const { data, error } = useRemoteQuery(load, EMPTY);

  const summary = useMemo(() => {
    const { contacts, projects, goals, keyDates, money, tenders } = data;
    const unpaid = money.map((m) => effectiveStatus(m, today)).filter((s) => s !== 'payé');
    // Signés et perdus exclus : ils attendent juste d'être sortis du pipeline.
    const open = contacts.filter(
      (c) => c.pipeline_stage && c.pipeline_stage !== 'signe' && c.pipeline_stage !== 'perdu'
    );
    const potential = Math.round(open.reduce((sum, c) => sum + (c.pipeline_amount ?? 0), 0) * 100) / 100;
    const upcoming = keyDates.filter((k) => k.date >= today);
    return {
      contacts: contacts.length,
      followUps: contacts.filter((c) => needsFollowUp(c, today)).length,
      prospects: open.length,
      potential,
      lateFollowups: open.filter((c) => c.next_followup_date && c.next_followup_date < today).length,
      activeProjects: projects.filter((p) => p.status === 'actif').length,
      openGoals: goals.filter((g) => g.progress < 100).length,
      upcomingDates: upcoming.length,
      soonDates: upcoming.filter((k) => daysUntil(k.date, today) <= TODAY_ALERT_DAYS).length,
      pendingMoney: unpaid.length,
      lateMoney: unpaid.filter((s) => s === 'en_retard').length,
      newTenders: tenders.filter((t) => t.status === 'nouveau').length,
      // Ignorés et candidatures envoyées exclus (isUrgent).
      urgentTenders: tenders.filter((t) => isUrgent(t, today)).length,
    };
  }, [data, today]);

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
      alert:
        summary.lateFollowups > 0
          ? `${summary.lateFollowups} relance${summary.lateFollowups > 1 ? 's' : ''} en retard`
          : undefined,
    },
    {
      to: '/agency/veille',
      category: 'veille',
      icon: Search,
      title: 'Veille appels d’offres',
      subtitle:
        summary.newTenders > 0
          ? `${summary.newTenders} nouvel${summary.newTenders > 1 ? 's' : ''} avis · BOAMP`
          : 'Marchés publics sport et communication · BOAMP',
      alert:
        summary.urgentTenders > 0
          ? `${summary.urgentTenders} urgent${summary.urgentTenders > 1 ? 's' : ''}`
          : undefined,
    },
    {
      to: '/agency/projects',
      category: 'projects',
      icon: GitBranch,
      title: 'Projets',
      subtitle: `${summary.activeProjects} projet${summary.activeProjects > 1 ? 's' : ''} actif${summary.activeProjects > 1 ? 's' : ''} · étapes et tâches`,
    },
    {
      to: '/agency/goals',
      category: 'goals',
      icon: Trophy,
      title: 'Objectifs',
      subtitle: `${plural(summary.openGoals, 'objectif')} en cours`,
    },
    {
      to: '/agency/key-dates',
      category: 'keyDates',
      icon: Hourglass,
      title: 'Échéancier',
      subtitle: `${plural(summary.upcomingDates, 'échéance')} à venir · contrats clients`,
      alert: summary.soonDates > 0 ? `${summary.soonDates} sous ${TODAY_ALERT_DAYS} j` : undefined,
    },
    {
      to: '/agency/money',
      category: 'finance',
      icon: Wallet,
      title: 'Finances',
      subtitle: `${summary.pendingMoney} ligne${summary.pendingMoney > 1 ? 's' : ''} à encaisser · commissions, factures, Qonto`,
      alert: summary.lateMoney > 0 ? `${summary.lateMoney} en retard` : undefined,
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
      // Sans catégorie : menthe, comme la carte Sécurité des Réglages du mobile.
      to: '/agency/vault',
      category: 'reminders',
      icon: Lock,
      title: 'Coffre',
      subtitle: 'Documents chiffrés · contrats, pièces',
    },
    {
      to: '/calendar',
      category: 'agenda',
      icon: CalendarDays,
      title: 'Calendrier',
      subtitle: 'Tâches, échéances et rappels par mois ou semaine',
    },
    {
      // Aussi accessible depuis Réglages > Données personnelles, comme sur le mobile.
      to: '/agency/prospect-purge',
      category: 'reminders',
      icon: ShieldCheck,
      title: 'Purge RGPD',
      subtitle: `Prospects inactifs depuis ${PROSPECT_RETENTION_YEARS} ans`,
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
    </div>
  );
}
