import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useCallback, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Badge, CardNote, CategoryCard } from '../../components/ui';
import { listContacts } from '../../db/crmDb';
import { listGoals } from '../../db/goalsDb';
import { listKeyDates } from '../../db/keyDatesDb';
import { effectiveStatus, listMoneyItems } from '../../db/moneyDb';
import { listProjects } from '../../db/projectsDb';
import { listTenderOffers } from '../../db/tenderOffersDb';
import { needsFollowUp } from '../../lib/followUp';
import { daysUntil, TODAY_ALERT_DAYS } from '../../lib/keyDateAlerts';
import { useToday } from '../../lib/useToday';
import { isUrgent } from '../../lib/veille';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useTheme } from '../../theme/ThemeProvider';
import type { Tint } from '../../theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Summary = {
  contacts: number;
  followUps: number;
  prospects: number;
  activeProjects: number;
  openGoals: number;
  upcomingDates: number;
  soonDates: number;
  pendingMoney: number;
  lateMoney: number;
  newTenders: number;
  urgentTenders: number;
};
const EMPTY: Summary = {
  newTenders: 0,
  urgentTenders: 0,
  pendingMoney: 0,
  lateMoney: 0,
  contacts: 0,
  followUps: 0,
  prospects: 0,
  activeProjects: 0,
  openGoals: 0,
  upcomingDates: 0,
  soonDates: 0,
};

/**
 * Menu de l'onglet « Agence » : regroupe les outils métier (CRM, projets,
 * objectifs, échéancier) pour ne pas surcharger la barre d'onglets.
 */
export function AgencyScreen({ userId }: { userId: string }) {
  const today = useToday();
  const { colors, spacing, categories } = useTheme();

  const load = useCallback(
    async (db: SQLiteDatabase): Promise<Summary> => {
      const contacts = await listContacts(db, userId);
      const projects = await listProjects(db, userId);
      const goals = await listGoals(db, userId);
      const upcoming = (await listKeyDates(db, userId)).filter((k) => k.date >= today);
      const unpaid = (await listMoneyItems(db, userId))
        .map((m) => effectiveStatus(m, today))
        .filter((s) => s !== 'payé');
      const tenders = await listTenderOffers(db, userId);
      return {
        newTenders: tenders.filter((t) => t.status === 'nouveau').length,
        // Ignorés et candidatures envoyées exclus (isUrgent).
        urgentTenders: tenders.filter((t) => isUrgent(t, today)).length,
        pendingMoney: unpaid.length,
        lateMoney: unpaid.filter((s) => s === 'en_retard').length,
        upcomingDates: upcoming.length,
        soonDates: upcoming.filter((k) => daysUntil(k.date, today) <= TODAY_ALERT_DAYS).length,
        contacts: contacts.length,
        followUps: contacts.filter((c) => needsFollowUp(c, today)).length,
        // Signés et perdus exclus : ils attendent juste d'être sortis du pipeline.
        prospects: contacts.filter((c) => c.pipeline_stage && c.pipeline_stage !== 'signe' && c.pipeline_stage !== 'perdu').length,
        activeProjects: projects.filter((p) => p.status === 'actif').length,
        openGoals: goals.filter((g) => g.progress < 100).length,
      };
    },
    [userId, today]
  );
  const { data } = useLocalQuery(load, EMPTY);

  // Une carte par section, de la teinte de sa catégorie (DECISIONS.md §29).
  const sections: {
    href: Href;
    tint: Tint;
    icon: IconName;
    title: string;
    subtitle: string;
    alert?: string;
  }[] = [
    {
      href: '/agency/contacts',
      tint: categories.contacts,
      icon: 'people-outline',
      title: 'Contacts',
      subtitle:
        `${data.contacts} contact${data.contacts > 1 ? 's' : ''} · ` +
        (data.prospects > 0
          ? `${data.prospects} prospect${data.prospects > 1 ? 's' : ''} en cours`
          : 'clients et partenaires'),
      alert: data.followUps > 0 ? `${data.followUps} à relancer` : undefined,
    },
    {
      href: '/agency/veille',
      tint: categories.veille,
      icon: 'search-outline',
      title: 'Veille appels d’offres',
      subtitle:
        data.newTenders > 0
          ? `${data.newTenders} nouvel${data.newTenders > 1 ? 's' : ''} avis · BOAMP`
          : 'Marchés publics sport et communication · BOAMP',
      alert: data.urgentTenders > 0 ? `${data.urgentTenders} urgent${data.urgentTenders > 1 ? 's' : ''}` : undefined,
    },
    {
      href: '/agency/projects',
      tint: categories.projects,
      icon: 'git-branch-outline',
      title: 'Projets',
      subtitle: `${data.activeProjects} projet${data.activeProjects > 1 ? 's' : ''} actif${data.activeProjects > 1 ? 's' : ''} · étapes et tâches`,
    },
    {
      href: '/agency/goals',
      tint: categories.goals,
      icon: 'trophy-outline',
      title: 'Objectifs',
      subtitle: `${data.openGoals} objectif${data.openGoals > 1 ? 's' : ''} en cours`,
    },
    {
      href: '/agency/key-dates',
      tint: categories.keyDates,
      icon: 'hourglass-outline',
      title: 'Échéancier',
      subtitle: `${data.upcomingDates} échéance${data.upcomingDates > 1 ? 's' : ''} à venir · contrats clients`,
      alert: data.soonDates > 0 ? `${data.soonDates} sous ${TODAY_ALERT_DAYS} j` : undefined,
    },
    {
      href: '/agency/calendar',
      tint: categories.agenda,
      icon: 'calendar-number-outline',
      title: 'Calendrier',
      subtitle: 'Tâches, échéances et rappels par mois ou semaine',
    },
    {
      href: '/agency/money',
      tint: categories.finance,
      icon: 'cash-outline',
      title: 'Finances',
      subtitle: `${data.pendingMoney} ligne${data.pendingMoney > 1 ? 's' : ''} à encaisser · commissions, factures`,
      alert: data.lateMoney > 0 ? `${data.lateMoney} en retard` : undefined,
    },
    {
      href: '/agency/meeting-report',
      // Sans catégorie : pêche, il produit des tâches.
      tint: colors.tints.peach,
      icon: 'sparkles-outline',
      title: 'Compte-rendu de RDV',
      subtitle: 'Notes dictées → résumé et tâches (IA)',
    },
    {
      href: '/agency/vault',
      // Sans catégorie : menthe, comme la carte Sécurité des Réglages.
      tint: colors.tints.mint,
      icon: 'lock-closed-outline',
      title: 'Coffre',
      subtitle: 'Documents chiffrés · contrats, pièces',
    },
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      {sections.map((s) => (
        <Pressable
          key={s.title}
          onPress={() => router.push(s.href)}
          accessibilityRole="button"
          accessibilityLabel={s.alert ? `${s.title}, ${s.alert}` : s.title}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}
        >
          <CategoryCard
            tint={s.tint}
            icon={s.icon}
            title={s.title}
            action={
              <View style={[styles.row, { gap: spacing.sm }]}>
                {s.alert ? <Badge label={s.alert} color={colors.warning} /> : null}
                <Ionicons name="chevron-forward" size={18} color={s.tint.fg} />
              </View>
            }
          >
            <CardNote>{s.subtitle}</CardNote>
          </CategoryCard>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
