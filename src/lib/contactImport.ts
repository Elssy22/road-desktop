import { readSheet } from 'read-excel-file/browser';

import type { Contact, ContactSegment, PipelineStage } from '../data/crm';
import type { Fields } from '../data/base';
import { normalizeForSearch } from './search';

// Import de contacts depuis un fichier CSV / XLSX, entièrement côté client :
// le fichier est lu dans le Webview, mappé vers `contacts`, puis inséré par
// l'écran d'import après aperçu et confirmation de l'utilisateur.

/** Tableau brut : première ligne = en-têtes. */
export type Table = string[][];

export const ACCEPTED_EXTENSIONS = '.csv,.xlsx';

/** Lit un fichier .csv ou .xlsx en tableau de chaînes (cellules rognées). */
export async function readTable(file: File): Promise<Table> {
  const ext = file.name.toLowerCase().split('.').pop();
  let rows: Table;
  if (ext === 'xlsx') {
    // parseNumber identité : un téléphone saisi en nombre garde son zéro initial.
    const sheet = await readSheet<string>(file, 1, { parseNumber: (s) => s });
    rows = sheet.map((row) => row.map(cellToString));
  } else if (ext === 'csv') {
    rows = parseCsv(decodeText(await file.arrayBuffer()));
  } else {
    throw new Error('Format non pris en charge : choisis un fichier .csv ou .xlsx.');
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

function cellToString(cell: unknown): string {
  if (cell == null) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell);
}

/** UTF-8 (BOM compris) ; à défaut Windows-1252, l'encodage des CSV d'Excel en français. */
export function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/**
 * CSV RFC 4180 : champs entre guillemets (avec "" et retours à la ligne),
 * séparateur « ; » (Excel français) ou « , » deviné sur la ligne d'en-têtes.
 */
export function parseCsv(text: string): Table {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const sep = [';', '\t'].reduce((best, c) => (count(firstLine, c) > count(firstLine, best) ? c : best), ',');
  const rows: Table = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const count = (s: string, ch: string) => s.split(ch).length - 1;

// --- Mapping vers `contacts` ---------------------------------------------------

/** Clé de comparaison des en-têtes : casse, accents, espaces et ponctuation ignorés. */
const headerKey = (h: string) => normalizeForSearch(h).replace(/[^a-z0-9]+/g, ' ').trim();

type Field =
  | 'name'
  | 'type'
  | 'level'
  | 'contact'
  | 'mail'
  | 'phone'
  | 'status'
  | 'location'
  | 'address'
  | 'website'
  | 'instagram'
  | 'specificity'
  | 'group'
  | 'affiliation';

/** En-têtes reconnus (clé normalisée → champ), variantes courantes comprises. */
const HEADERS: Record<string, Field> = {
  nom: 'name',
  type: 'type',
  niveau: 'level',
  'contact nom role': 'contact',
  contact: 'contact',
  'mail ou page de contact': 'mail',
  mail: 'mail',
  email: 'mail',
  'e mail': 'mail',
  telephone: 'phone',
  tel: 'phone',
  statut: 'status',
  'localisation dept': 'location',
  localisation: 'location',
  adresse: 'address',
  'site officiel': 'website',
  site: 'website',
  instagram: 'instagram',
  'specificite particularite historique': 'specificity',
  groupe: 'group',
  'n affiliation': 'affiliation',
};

/** Libellés des champs regroupés dans les notes, dans l'ordre d'écriture. */
const NOTE_FIELDS: [Field, string][] = [
  ['location', 'Localisation'],
  ['address', 'Adresse'],
  ['website', 'Site officiel'],
  ['instagram', 'Instagram'],
  ['specificity', 'Particularité'],
  ['group', 'Groupe'],
  ['affiliation', 'N° affiliation'],
];

const STATUSES: Record<string, PipelineStage> = {
  'a contacter': 'a_demarcher',
  'brouillon pret': 'a_demarcher',
  envoye: 'deck_envoye',
  'reponse recue': 'a_relancer',
};

export type ImportedContact = Fields<Contact>;

export type MappedTable = {
  contacts: ImportedContact[];
  /** Lignes sans « Nom », écartées. */
  skippedNoName: number;
  /** En-têtes inconnus : leurs valeurs vont dans les notes. */
  extra: string[];
};

const EMAIL = /[^\s@;,<>()]+@[^\s@;,<>()]+\.[^\s@;,<>()]+/g;

/** Lignes parcourues pour trouver les en-têtes (titre éventuel au-dessus du tableau). */
const HEADER_SEARCH_ROWS = 10;

/** Mappe un tableau (ligne d'en-têtes contenant « Nom ») vers des fiches `contacts`. */
export function mapTable(table: Table): MappedTable {
  const start = table.slice(0, HEADER_SEARCH_ROWS).findIndex((r) => r.some((c) => HEADERS[headerKey(c)] === 'name'));
  if (start < 0) {
    throw new Error('Colonne « Nom » introuvable dans les premières lignes du fichier.');
  }
  const [headers, ...lines] = table.slice(start);
  const fields = headers.map((h) => HEADERS[headerKey(h)] ?? null);
  const extra = headers.filter((h, i) => !fields[i] && h !== '');

  const contacts: ImportedContact[] = [];
  let skippedNoName = 0;
  for (const line of lines) {
    const get = (f: Field) => {
      const i = fields.indexOf(f);
      return i >= 0 ? (line[i] ?? '').trim() : '';
    };
    const name = get('name');
    if (!name) {
      skippedNoName++;
      continue;
    }
    const others = headers
      .map((h, i) => (!fields[i] && h && line[i] ? `${h} : ${line[i]}` : null))
      .filter((l): l is string => l !== null);
    contacts.push(mapLine(get, others));
  }
  return { contacts, skippedNoName, extra };
}

function mapLine(get: (f: Field) => string, others: string[]): ImportedContact {
  const type = get('type');
  const level = get('level');
  const notes: string[] = [];

  const kind = headerKey(type);
  if (kind === 'district') notes.push(level || type);
  else if (type || level) notes.push([type, level].filter(Boolean).join(' — '));

  const contact = get('contact');
  if (contact) notes.push(`Contact : ${contact}`);

  // Une vraie adresse va dans `email` (les suivantes en notes) ; une URL de page de contact en notes.
  const mail = get('mail');
  const emails = mail.match(EMAIL) ?? [];
  if (emails.length > 1) notes.push(`Autres mails : ${emails.slice(1).join(', ')}`);
  const page = mail.replace(EMAIL, ' ').replace(/^[\s,;/]+|[\s,;/]+$/g, '');
  if (page) notes.push(`Page de contact : ${page}`);

  for (const [f, label] of NOTE_FIELDS) {
    const v = get(f);
    if (v) notes.push(`${label} : ${v}`);
  }
  const status = get('status');
  if (status) notes.push(`Statut d’origine : ${status}`);
  notes.push(...others);

  return {
    name: get('name'),
    role: type,
    club: null,
    phone: fixPhone(get('phone')) || null,
    email: emails[0] ?? null,
    notes: notes.length > 0 ? notes.join('\n') : null,
    segment: segmentFor(kind, level),
    pipeline_stage: STATUSES[headerKey(status)] ?? 'a_demarcher',
    pipeline_amount: null,
    next_followup_date: null,
    // Pas de date de changement d'étape : l'étape vient du fichier, elle n'a pas
    // changé dans Road. Sans elle, la séquence de relances du mobile ne démarre
    // pas pour un « Deck envoyé » importé (DECISIONS.md §36, B1).
    stage_changed_at: null,
  };
}

/** Numéro français saisi en nombre dans Excel (« 612345678 ») : zéro initial rétabli. */
const fixPhone = (phone: string) => (/^[1-9]\d{8}$/.test(phone) ? `0${phone}` : phone);

/** District → district ; club de Ligue / National → club pro ; autre club → club amateur. */
function segmentFor(kind: string, level: string): ContactSegment | null {
  if (kind === 'district') return 'district';
  if (kind !== 'club') return null;
  // « National » couvre aussi « Nationale 2 » ; « Régional » ne contient pas \bnational.
  return /\b(ligue|national)/.test(headerKey(level)) ? 'club_pro' : 'club_amateur';
}

/** Clé de dédoublonnage par nom : casse, accents et espaces multiples ignorés. */
export const nameKey = (name: string) => normalizeForSearch(name).replace(/\s+/g, ' ').trim();
