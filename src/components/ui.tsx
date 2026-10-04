import type { LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { CATEGORY_TINT, type Category } from '../theme/tokens';

// Équivalents web des composants de mobile-legacy/src/components/ui.tsx
// (direction « cartes pastel », DECISIONS.md §26-27). Le style vit dans
// styles.css ; la teinte d'une catégorie passe par les variables --tint-*.

/** Variables CSS de la teinte d'une catégorie, lues par .card, .text-action, .count-pill… */
export function tintVars(category: Category): CSSProperties {
  const t = CATEGORY_TINT[category];
  return {
    '--tint-bg': `var(--tint-${t}-bg)`,
    '--tint-border': `var(--tint-${t}-border)`,
    '--tint-icon-bg': `var(--tint-${t}-icon-bg)`,
    '--tint-fg': `var(--tint-${t}-fg)`,
  } as CSSProperties;
}

/** Pointillés de la ligne centrale du logo, qui s'amenuisent vers l'horizon. */
const ROAD_DASHES = [18, 10, 5];

/** Grand en-tête d'écran : surtitre couleur soleil, titre, ligne pointillée, action principale à droite. */
export function ScreenHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <header className="screen-header">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 className="screen-header__title">{title}</h1>
      <div className="screen-header__bar">
        <div className="road-dashes" aria-hidden>
          {ROAD_DASHES.map((w) => (
            <span key={w} style={{ width: w }} />
          ))}
        </div>
        {action}
      </div>
    </header>
  );
}

/** Carte blanche (calendrier, contenus sans catégorie). */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `panel-card ${className}` : 'panel-card'}>{children}</div>;
}

/** En-tête d'une carte de catégorie : pastille d'icône, titre, compteur, action. */
function CardHeader({
  icon: Icon,
  title,
  danger,
  count,
  action,
}: {
  icon: LucideIcon;
  title: string;
  danger?: boolean;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="card__header">
      <div className="card__heading">
        <span className="card__icon">
          <Icon size={18} />
        </span>
        <h2 className={danger ? 'card__title card__title--danger' : 'card__title'}>{title}</h2>
        {count ? <span className="count-pill">{count}</span> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Carte d'une catégorie (Tâches, Agenda, Rappels…) : fond pastel de sa teinte,
 * pastille d'icône, titre, compteur et action en en-tête.
 */
export function CategoryCard({
  category,
  icon,
  title,
  danger,
  count,
  action,
  children,
}: {
  category: Category;
  icon: LucideIcon;
  title: string;
  /** Titre en rouge (« En retard »). */
  danger?: boolean;
  count?: number;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="card" style={tintVars(category)}>
      <CardHeader icon={icon} title={title} danger={danger} count={count} action={action} />
      {children ? <div className="card__body">{children}</div> : null}
    </section>
  );
}

/** Liste blanche à l'intérieur d'une carte de catégorie. */
export function CardList({ children }: { children: ReactNode }) {
  return <ul className="card-list">{children}</ul>;
}

/** Texte d'état sur le fond pastel d'une carte (« Aucun rappel aujourd'hui. »). */
export function CardNote({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'danger' }) {
  return <p className={tone === 'danger' ? 'card-note card-note--danger' : 'card-note'}>{children}</p>;
}

/** Action principale d'un écran : pastille en dégradé soleil couchant. */
export function GradientButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button type="button" className="gradient-button" onClick={onClick}>
      {Icon && <Icon size={18} />}
      {label}
    </button>
  );
}

/**
 * Action secondaire en pastille teintée (« Aujourd'hui ») : couleur soleil par
 * défaut, ou celle de la carte de catégorie qui la porte.
 */
export function TextAction({
  label,
  icon: Icon,
  onClick,
  disabled,
  title,
  category,
}: {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  category?: Category;
}) {
  return (
    <button
      type="button"
      className={category ? 'text-action text-action--tinted' : 'text-action'}
      style={category ? tintVars(category) : undefined}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {Icon && <Icon size={16} />}
      {label}
    </button>
  );
}

/** Choix exclusif entre 2-3 valeurs (Mois / Semaine). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'segmented__option segmented__option--selected' : 'segmented__option'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="badge" style={{ color, borderColor: color }}>
      {label}
    </span>
  );
}

/**
 * Ligne d'une liste dans une carte : titre, sous-titre, élément à droite.
 * Avec `onClick`, le titre et le sous-titre deviennent un bouton (ouvrir la fiche…).
 */
export function ListRow({
  title,
  subtitle,
  left,
  right,
  onClick,
  muted,
}: {
  title: string;
  subtitle?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  /** Titre grisé et barré (prospect perdu). */
  muted?: boolean;
}) {
  const text = (
    <>
      <span className={muted ? 'row__title row__title--done' : 'row__title row__title--strong'}>{title}</span>
      {subtitle ? <span className="row__subtitle">{subtitle}</span> : null}
    </>
  );
  return (
    <li className="row">
      {left}
      {onClick ? (
        <button type="button" className="row__main row__button" onClick={onClick}>
          {text}
        </button>
      ) : (
        <div className="row__main">{text}</div>
      )}
      {right}
    </li>
  );
}

/** Pastille sélectionnable (rôle, segment, type d'interaction). */
export function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={selected ? 'chip chip--selected' : 'chip'}
      aria-pressed={selected}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="chip-row">{children}</div>;
}

/**
 * Champ de formulaire : libellé au-dessus, contenu libre, message d'erreur
 * facultatif. `htmlFor` relie le libellé à son champ ; sans lui (groupe de
 * pastilles), le libellé n'est qu'un texte, pour ne pas cliquer la première pastille.
 */
export function FormField({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="form-field">
      {htmlFor ? (
        <label className="form-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="form-field__label">{label}</span>
      )}
      {children}
      {error ? <span className="form-field__error">{error}</span> : null}
    </div>
  );
}

/** Barre de progression 0–100, verte une fois atteinte (ProgressBar du mobile). */
export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
    >
      <div
        className={pct >= 100 ? 'progress__fill progress__fill--done' : 'progress__fill'}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Erreur de lecture / d'écriture Supabase, affichée en tête d'écran. */
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="error-banner" role="alert">
      {message}
    </p>
  );
}
