import { atNextOccurrence, nextOccurrence, occurrencesBetween } from './src/lib/keyDateRecurrence';

const eq = (a: unknown, b: unknown, m: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(ok ? 'ok ' : 'KO ', m, JSON.stringify(a));
};
eq(nextOccurrence({ date: '2026-01-31', recurrence: 'monthly', recurrence_day: 31 }, '2026-02-10'), '2026-02-28', 'fév clamp');
eq(nextOccurrence({ date: '2026-01-31', recurrence: 'monthly', recurrence_day: 31 }, '2026-03-01'), '2026-03-31', 'mars 31');
eq(nextOccurrence({ date: '2026-01-15', recurrence: 'quarterly', recurrence_day: 15 }, '2026-10-09'), '2026-10-15', 'trim');
eq(nextOccurrence({ date: '2026-01-15', recurrence: 'quarterly', recurrence_day: 15 }, '2026-10-16'), '2027-01-15', 'trim suiv');
eq(nextOccurrence({ date: '2026-10-20', recurrence: 'monthly', recurrence_day: 5 }, '2026-10-09'), '2026-11-05', 'jour < ancre');
eq(nextOccurrence({ date: '2024-02-29', recurrence: 'yearly', recurrence_day: null }, '2026-10-09'), '2027-02-28', 'bissextile');
eq(nextOccurrence({ date: '2024-02-29', recurrence: 'yearly', recurrence_day: null }, '2027-03-01'), '2028-02-29', '2028');
eq(nextOccurrence({ date: '2026-05-15', recurrence: null, recurrence_day: null }, '2026-10-09'), '2026-05-15', 'ponctuelle');
eq(nextOccurrence({ date: '2026-10-09', recurrence: 'monthly', recurrence_day: 9 }, '2026-10-09'), '2026-10-09', 'jour J');
eq(
  occurrencesBetween({ date: '2025-01-05', recurrence: 'monthly', recurrence_day: 5 }, '2026-09-28', '2026-11-08'),
  ['2026-10-05', '2026-11-05'],
  'calendrier'
);
eq(occurrencesBetween({ date: '2026-12-01', recurrence: 'monthly', recurrence_day: 1 }, '2026-10-01', '2026-10-31'), [], 'avant ancre');
eq(
  atNextOccurrence(
    [
      { date: '2026-12-01', recurrence: null, recurrence_day: null },
      { date: '2025-01-15', recurrence: 'monthly' as const, recurrence_day: 15 },
    ],
    '2026-10-09'
  ).map((r) => r.date),
  ['2026-10-15', '2026-12-01'],
  'tri'
);
