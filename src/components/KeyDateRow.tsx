import { useNavigate } from 'react-router-dom';

import { CATEGORY_LABELS, type KeyDateWithContact } from '../data/keyDates';
import { formatDueLabel } from '../lib/dates';
import { alertLevel, countdownLabel, daysUntil, type AlertLevel } from '../lib/keyDateAlerts';
import { recurrenceLabel } from '../lib/keyDateRecurrence';
import { Badge, ListRow } from './ui';

/** Couleur de chaque palier d'alerte (lib/keyDateAlerts.ts), en variables CSS. */
const ALERT_COLORS: Record<AlertLevel, string> = {
  j7: 'var(--color-danger)',
  j30: 'var(--color-warning)',
  j90: 'var(--color-primary)',
};

/**
 * Ligne d'échéance (KeyDateRow de mobile-legacy/src/screens/agency/KeyDatesScreen.tsx),
 * aussi affichée par la Vue du jour et le calendrier. Le clic ouvre le formulaire.
 * Une série récurrente arrive déjà ramenée à l'occurrence à afficher (`date`).
 */
export function KeyDateRow({ keyDate, today }: { keyDate: KeyDateWithContact; today: string }) {
  const navigate = useNavigate();
  const days = daysUntil(keyDate.date, today);
  const level = alertLevel(days);
  const meta = [
    CATEGORY_LABELS[keyDate.category] ?? keyDate.category,
    formatDueLabel(keyDate.date, today),
    recurrenceLabel(keyDate),
    keyDate.contact_name,
  ].filter(Boolean);

  return (
    <ListRow
      title={keyDate.title || 'Sans titre'}
      subtitle={meta.join(' · ')}
      right={
        keyDate.recurrence || level ? (
          <span className="badge-group">
            {keyDate.recurrence && <Badge label="Récurrent" color="var(--color-text-muted)" />}
            {level && <Badge label={countdownLabel(days)} color={ALERT_COLORS[level]} />}
          </span>
        ) : null
      }
      onClick={() => navigate(`/agency/key-dates/${keyDate.id}`)}
    />
  );
}
