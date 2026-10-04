// Jetons de design partagés par tous les écrans : une seule source de vérité
// pour les couleurs, espacements, rayons et tailles de texte.
// Direction « cartes pastel » (DECISIONS.md §26) : fond bleuté très pâle, une
// couleur pastel par catégorie (tâches, agenda, rappels…), et le soleil couchant
// du logo comme fil rouge des actions principales.
//
// Repris du mobile (mobile-legacy/src/theme/tokens.ts) ; seul le type TextStyle
// de React Native est remplacé par son équivalent minimal ci-dessous. Côté web,
// ces valeurs sont exposées en variables CSS par theme/cssVars.ts.

/** Sous-ensemble de TextStyle (React Native) utilisé par `typography`. */
type TextStyle = {
  fontSize?: number;
  lineHeight?: number;
  fontWeight?: '400' | '500' | '600' | '700' | '800';
  letterSpacing?: number;
  textTransform?: 'uppercase' | 'none';
};

/** Grille de 4 pt. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  /** Listes blanches à l'intérieur d'une carte de catégorie. */
  lg: 16,
  /** Cartes de catégorie : coins très arrondis. */
  card: 20,
  xl: 24,
  pill: 999,
} as const;

export const fontSize = {
  overline: 11,
  caption: 12,
  small: 14,
  body: 16,
  heading: 18,
  title: 28,
  display: 34,
} as const;

/**
 * Styles de texte complets (taille, interlignage, graisse, approche) : police
 * système, aucune police embarquée.
 */
export const typography = {
  /** Gros titre d'écran (date de la Vue du jour). */
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.6 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  /** Mois du calendrier. */
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  /** Titre d'une carte de catégorie (« Tâches du jour »). */
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.1 },
  subheading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  /** Surtitre en capitales espacées (« AUJOURD'HUI »). */
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
} as const satisfies Record<string, TextStyle>;

/** Une teinte pastel : fond de carte, filet, pastille d'icône, encre lisible dessus. */
export type Tint = {
  bg: string;
  border: string;
  iconBg: string;
  /** Icône, titre, points du calendrier : contraste AA sur `bg` et sur `surface`. */
  fg: string;
};

export type TintName = 'peach' | 'sky' | 'mint' | 'butter' | 'lavender' | 'rose';

/** Catégories fonctionnelles et leur teinte. */
export const CATEGORY_TINT = {
  tasks: 'peach',
  agenda: 'sky',
  reminders: 'mint',
  keyDates: 'butter',
  finance: 'lavender',
  priorities: 'rose',
  // Catégories secondaires (§28) : elles reprennent la teinte d'une catégorie
  // principale, choisie pour rester distincte de leurs voisines à l'écran
  // (recherche : tâches, notes, contacts, projets ; revue de la semaine :
  // tâches, projets, objectifs, échéances, bilan).
  notes: 'lavender',
  contacts: 'rose',
  projects: 'sky',
  goals: 'mint',
  // Veille des appels d'offres (§33) : lavande, celle des Finances (une
  // opportunité de chiffre d'affaires), distincte de ses voisines du menu
  // Agence (Contacts rose, Projets ciel).
  veille: 'lavender',
} as const satisfies Record<string, TintName>;

export type Category = keyof typeof CATEGORY_TINT;

export type Palette = {
  /** Fond des écrans : bleuté très pâle (jamais blanc pur). */
  background: string;
  /** Listes, champs, barre d'onglets. */
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Le soleil couchant : actions principales, onglet actif, sélection. */
  primary: string;
  onPrimary: string;
  /** Même famille que `primary` : aujourd'hui, surtitres, interrupteurs. */
  accent: string;
  onAccent: string;
  /** Fond teinté discret derrière un élément accentué. */
  accentSoft: string;
  /** Dégradé du bouton d'action principal (début → fin, 135°). */
  gradientStart: string;
  gradientEnd: string;
  /** Texte et icônes sur le dégradé (blanc dans les deux modes). */
  onGradient: string;
  danger: string;
  /** Texte d'un bouton sur `danger`. */
  onDanger: string;
  /** Échéances clés (= `tints.butter.fg`). */
  warning: string;
  /** Rappels (= `tints.mint.fg`). */
  success: string;
  /** Rendez-vous (= `tints.sky.fg`). */
  appointment: string;
  /** Voile derrière une boîte de dialogue. */
  overlay: string;
  tints: Record<TintName, Tint>;
};

export const lightPalette: Palette = {
  background: '#F3F6FB',
  surface: '#FFFFFF',
  surfaceMuted: '#E9EEF6',
  border: '#DDE4EE',
  text: '#1F2433',
  textMuted: '#5A6275',
  // Contrastes WCAG AA (≥ 4,5:1) vérifiés au lot correctif (DECISIONS.md §36) :
  // textFaint 4,6:1 sur le fond, accent 5:1 sur accentSoft, blanc ≥ 4,9:1 sur
  // tout le dégradé, warning 5,7:1 sur la teinte butter.
  textFaint: '#687083',
  primary: '#A8461A',
  onPrimary: '#FFFFFF',
  accent: '#A8461A',
  onAccent: '#FFFFFF',
  accentSoft: '#FDE8DA',
  gradientStart: '#B85224',
  gradientEnd: '#9E3A16',
  onGradient: '#FFFFFF',
  danger: '#C7372F',
  onDanger: '#FFFFFF',
  warning: '#7A5A00',
  success: '#2B7A4D',
  appointment: '#2F5E9E',
  overlay: 'rgba(17, 21, 29, 0.35)',
  tints: {
    peach: { bg: '#FFEBDD', border: '#FADBC6', iconBg: '#FFD6BC', fg: '#A84A1A' },
    sky: { bg: '#E3EEFD', border: '#D0E0F7', iconBg: '#C9DDFA', fg: '#2F5E9E' },
    mint: { bg: '#DEF4E7', border: '#C9EBD7', iconBg: '#BFE8D0', fg: '#2B7A4D' },
    butter: { bg: '#FDF1D2', border: '#F5E3B3', iconBg: '#F9E1A2', fg: '#7A5A00' },
    lavender: { bg: '#EEE8FC', border: '#E0D6F7', iconBg: '#DCD0F8', fg: '#6447B0' },
    rose: { bg: '#FDE6EE', border: '#F5D3DF', iconBg: '#F9CCDC', fg: '#A63B63' },
  },
};

export const darkPalette: Palette = {
  background: '#11151D',
  surface: '#1A1F2A',
  surfaceMuted: '#242A37',
  border: '#2E3544',
  text: '#EEF1F6',
  textMuted: '#A7AFBF',
  textFaint: '#737C8E',
  primary: '#F08A4F',
  onPrimary: '#24110A',
  accent: '#F08A4F',
  onAccent: '#24110A',
  accentSoft: '#3A2418',
  gradientStart: '#E07440',
  gradientEnd: '#B4461F',
  onGradient: '#FFFFFF',
  danger: '#F2766C',
  // Texte sombre sur le rouge clair du mode sombre (6,5:1 ; le blanc n'atteignait que 2,8:1).
  onDanger: '#2A0E0B',
  warning: '#E9C973',
  success: '#8FD6AE',
  appointment: '#9CC0F0',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tints: {
    peach: { bg: '#33261F', border: '#4A3529', iconBg: '#4D3528', fg: '#F4B48E' },
    sky: { bg: '#1D2838', border: '#2B3A50', iconBg: '#2A3A52', fg: '#9CC0F0' },
    mint: { bg: '#1B2E25', border: '#2A4436', iconBg: '#284536', fg: '#8FD6AE' },
    butter: { bg: '#312B1B', border: '#463D24', iconBg: '#4A4025', fg: '#E9C973' },
    lavender: { bg: '#27223A', border: '#3A3254', iconBg: '#3A3157', fg: '#C2B0F2' },
    rose: { bg: '#33202B', border: '#4A2C3D', iconBg: '#4D2D40', fg: '#F0A6C2' },
  },
};

export type ColorScheme = 'light' | 'dark';

/** Ombres douces (`boxShadow` natif de React Native) ; en sombre, ce sont les filets qui détachent. */
const lightShadows = {
  card: '0px 4px 16px rgba(31, 45, 80, 0.07)',
  raised: '0px 6px 16px rgba(168, 70, 26, 0.28)',
};
const darkShadows = {
  card: '0px 4px 16px rgba(0, 0, 0, 0.25)',
  raised: '0px 6px 16px rgba(0, 0, 0, 0.35)',
};

export type Theme = {
  scheme: ColorScheme;
  colors: Palette;
  /** Teinte de chaque catégorie fonctionnelle, déjà résolue pour le mode courant. */
  categories: Record<Category, Tint>;
  /** Dégradé du bouton d'action principal, prêt pour `experimental_backgroundImage`. */
  sunsetGradient: string;
  shadows: typeof lightShadows;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
  typography: typeof typography;
};

export const makeTheme = (scheme: ColorScheme): Theme => {
  const colors = scheme === 'dark' ? darkPalette : lightPalette;
  return {
    scheme,
    colors,
    categories: Object.fromEntries(
      Object.entries(CATEGORY_TINT).map(([c, t]) => [c, colors.tints[t]])
    ) as Record<Category, Tint>,
    sunsetGradient: `linear-gradient(135deg, ${colors.gradientStart}, ${colors.gradientEnd})`,
    shadows: scheme === 'dark' ? darkShadows : lightShadows,
    spacing,
    radius,
    fontSize,
    typography,
  };
};
