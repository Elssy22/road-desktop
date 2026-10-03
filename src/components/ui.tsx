import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import type { Tint } from '../theme/tokens';

/** Bloc titré, utilisé pour structurer les écrans sans les surcharger. */
export function Section({
  title,
  right,
  children,
  style,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={[{ marginBottom: spacing.xl }, style]}>
      <View style={[styles.sectionHeader, { marginBottom: spacing.sm }]}>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: fontSize.caption,
            fontWeight: '600',
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function EmptyText({ children }: { children: ReactNode }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Text style={{ color: colors.textFaint, fontSize: fontSize.small, paddingVertical: spacing.md }}>
      {children}
    </Text>
  );
}

export function Field(props: TextInputProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textFaint}
      {...props}
      style={[
        {
          backgroundColor: colors.surface,
          color: colors.text,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          fontSize: fontSize.body,
        },
        props.style,
      ]}
    />
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const { colors, spacing, radius, fontSize, sunsetGradient, shadows } = useTheme();
  const primary = variant === 'primary';
  const fg = primary ? colors.onGradient : variant === 'danger' ? colors.danger : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        // Bouton principal : dégradé soleil couchant (§26), `primary` en repli dessous.
        backgroundColor: primary ? colors.primary : colors.surface,
        experimental_backgroundImage: primary ? sunsetGradient : undefined,
        boxShadow: primary && !disabled ? shadows.raised : undefined,
        borderColor: colors.border,
        borderWidth: primary ? 0 : StyleSheet.hairlineWidth,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
      })}
    >
      <Text style={{ color: fg, fontSize: fontSize.body, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Élément d'une FlatList présenté comme une Card continue (bordures et coins
 * arrondis seulement en haut du premier et en bas du dernier).
 */
export function GroupedItem({
  index,
  count,
  children,
}: {
  index: number;
  count: number;
  children: ReactNode;
}) {
  const { colors, radius } = useTheme();
  const first = index === 0;
  const last = index === count - 1;
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderLeftWidth: StyleSheet.hairlineWidth,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderTopWidth: first ? StyleSheet.hairlineWidth : 0,
        borderBottomWidth: last ? StyleSheet.hairlineWidth : 0,
        borderTopLeftRadius: first ? radius.md : 0,
        borderTopRightRadius: first ? radius.md : 0,
        borderBottomLeftRadius: last ? radius.md : 0,
        borderBottomRightRadius: last ? radius.md : 0,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

/** Pastille sélectionnable (filtres, choix d'une valeur parmi quelques-unes). */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        paddingVertical: spacing.xs + 2,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.primary : colors.surfaceMuted,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: fontSize.small }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  const { spacing } = useTheme();
  return <View style={[styles.chips, { gap: spacing.sm }]}>{children}</View>;
}

/** Petite étiquette colorée (« Relance », « J-7 »…). */
export function Badge({ label, color }: { label: string; color: string }) {
  const { spacing, radius, fontSize } = useTheme();
  return (
    <View
      style={{
        borderColor: color,
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 1,
      }}
    >
      <Text style={{ color, fontSize: fontSize.caption, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/** Ligne d'une liste dans une Card : titre, sous-titre, élément à droite. */
export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  onLongPress,
  isLast,
  chevron = !!onPress,
  muted,
}: {
  title: string;
  subtitle?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  isLast?: boolean;
  chevron?: boolean;
  muted?: boolean;
}) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      style={({ pressed }) => [
        styles.row,
        {
          paddingVertical: spacing.md,
          paddingLeft: spacing.lg,
          paddingRight: spacing.md,
          gap: spacing.md,
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
        },
      ]}
    >
      {left}
      <View style={styles.rowMain}>
        <Text
          numberOfLines={1}
          style={{
            color: muted ? colors.textFaint : colors.text,
            fontSize: fontSize.body,
            fontWeight: '500',
            textDecorationLine: muted ? 'line-through' : 'none',
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron && <Text style={{ color: colors.textFaint, fontSize: fontSize.heading }}>›</Text>}
    </Pressable>
  );
}

// --- Direction « cartes pastel » (DECISIONS.md §26-27) ----------------------
// Composants de la refonte, adoptés écran par écran : ceux du dessus restent
// inchangés tant que tous les écrans ne sont pas migrés.

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Pointillés de la ligne centrale du logo, qui s'amenuisent vers l'horizon. */
const ROAD_DASHES = [18, 10, 5];

/** Grand en-tête d'écran : surtitre couleur soleil, titre, ligne pointillée, action principale à droite. */
export function ScreenHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={{ marginBottom: spacing.xl }}>
      {eyebrow ? (
        <Text style={[typography.overline, { color: colors.accent, marginBottom: spacing.xs }]}>{eyebrow}</Text>
      ) : null}
      <Text accessibilityRole="header" style={[typography.display, { color: colors.text }]}>
        {title}
      </Text>
      <View style={[styles.sectionHeader, { marginTop: spacing.md, gap: spacing.md }]}>
        <View style={[styles.row, { gap: spacing.xs }]}>
          {ROAD_DASHES.map((w) => (
            <View key={w} style={[styles.dash, { width: w, backgroundColor: colors.accent }]} />
          ))}
        </View>
        {action}
      </View>
    </View>
  );
}

/** Carte blanche (calendrier, contenus sans catégorie) : coins de 20 px, ombre douce. */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, radius, shadows, scheme } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          boxShadow: shadows.card,
          // En sombre l'ombre ne se voit plus : un filet détache la carte du fond.
          borderWidth: scheme === 'dark' ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Carte d'une catégorie (Tâches, Agenda, Rappels…) : fond pastel de sa teinte,
 * pastille d'icône, titre, compteur et action en en-tête.
 */
export function CategoryCard({
  tint,
  icon,
  title,
  count,
  action,
  children,
}: {
  tint: Tint;
  icon: IconName;
  title: string;
  count?: number;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const { spacing, radius, shadows } = useTheme();
  return (
    <View
      style={{
        backgroundColor: tint.bg,
        borderColor: tint.border,
        borderWidth: 1,
        borderRadius: radius.card,
        boxShadow: shadows.card,
        padding: spacing.lg,
        marginBottom: spacing.lg,
      }}
    >
      <CardHeader tint={tint} icon={icon} title={title} count={count} action={action} />
      {children ? <View style={{ marginTop: spacing.md, gap: spacing.sm }}>{children}</View> : null}
    </View>
  );
}

/** En-tête d'une carte de catégorie : pastille d'icône, titre, compteur, action. */
function CardHeader({
  tint,
  icon,
  title,
  titleColor,
  count,
  action,
}: {
  tint: Tint;
  icon: IconName;
  title: string;
  titleColor?: string;
  count?: number;
  action?: ReactNode;
}) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={[styles.sectionHeader, { gap: spacing.sm }]}>
      <View style={[styles.row, styles.rowMain, { gap: spacing.md }]}>
        <View style={[styles.iconBadge, { backgroundColor: tint.iconBg }]}>
          <Ionicons name={icon} size={18} color={tint.fg} />
        </View>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[typography.cardTitle, styles.shrink, { color: titleColor ?? colors.text }]}
        >
          {title}
        </Text>
        {count ? (
          <View style={[styles.countPill, { backgroundColor: tint.iconBg, paddingHorizontal: spacing.sm }]}>
            <Text style={[typography.caption, { color: tint.fg, fontWeight: '700' }]}>{count}</Text>
          </View>
        ) : null}
      </View>
      {action}
    </View>
  );
}

// Variante de CategoryCard pour les listes longues (SectionList virtualisée) :
// l'en-tête, chaque ligne et le pied d'une section forment ensemble une carte.
// Pas d'ombre (elle marquerait les raccords entre morceaux), le filet suffit.

/** `renderSectionHeader` : haut de la carte, avec son en-tête. */
export function CardSectionHeader({
  tint,
  icon,
  title,
  titleColor,
  count,
  action,
}: {
  tint: Tint;
  icon: IconName;
  title: string;
  /** Ex. `danger` pour « En retard ». */
  titleColor?: string;
  count?: number;
  action?: ReactNode;
}) {
  const { spacing, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: tint.bg,
        borderColor: tint.border,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderTopLeftRadius: radius.card,
        borderTopRightRadius: radius.card,
        padding: spacing.lg,
        paddingBottom: spacing.md,
        marginTop: spacing.lg,
      }}
    >
      <CardHeader tint={tint} icon={icon} title={title} titleColor={titleColor} count={count} action={action} />
    </View>
  );
}

/** `renderItem` : une ligne, dans la liste blanche de la carte. */
export function CardSectionItem({
  tint,
  first,
  last,
  children,
}: {
  tint: Tint;
  first: boolean;
  last: boolean;
  children: ReactNode;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: tint.bg,
        borderColor: tint.border,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        paddingHorizontal: spacing.lg,
      }}
    >
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: first ? radius.lg : 0,
          borderTopRightRadius: first ? radius.lg : 0,
          borderBottomLeftRadius: last ? radius.lg : 0,
          borderBottomRightRadius: last ? radius.lg : 0,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** `renderSectionFooter` : bas de la carte (contenu facultatif, ex. « + N autres »). */
export function CardSectionFooter({ tint, children }: { tint: Tint; children?: ReactNode }) {
  const { spacing, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: tint.bg,
        borderColor: tint.border,
        borderWidth: 1,
        borderTopWidth: 0,
        borderBottomLeftRadius: radius.card,
        borderBottomRightRadius: radius.card,
        paddingHorizontal: spacing.lg,
        paddingTop: children ? spacing.sm : 0,
        paddingBottom: spacing.lg,
      }}
    >
      {children}
    </View>
  );
}

/** Liste blanche à l'intérieur d'une carte de catégorie (les lignes y restent lisibles). */
export function CardList({ children }: { children: ReactNode }) {
  const { colors, radius } = useTheme();
  return <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' }}>{children}</View>;
}

/** Texte d'état sur le fond pastel d'une carte (« Aucun rappel aujourd'hui. »). */
export function CardNote({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'danger' }) {
  const { colors, typography } = useTheme();
  return (
    <Text style={[typography.small, { color: tone === 'danger' ? colors.danger : colors.textMuted }]}>{children}</Text>
  );
}

/** Action principale d'un écran : pastille en dégradé soleil couchant, bien visible. */
export function GradientButton({
  label,
  icon,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { colors, spacing, radius, typography, sunsetGradient, shadows } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.row,
        {
          gap: spacing.xs,
          backgroundColor: colors.primary,
          experimental_backgroundImage: sunsetGradient,
          boxShadow: shadows.raised,
          borderRadius: radius.pill,
          paddingVertical: spacing.sm + 2,
          paddingLeft: icon ? spacing.md : spacing.lg,
          paddingRight: spacing.lg,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      {icon && <Ionicons name={icon} size={18} color={colors.onGradient} />}
      <Text style={[typography.bodyStrong, { color: colors.onGradient, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Action secondaire en pastille teintée (« + RDV », « Aujourd'hui ») : couleur
 * soleil par défaut, ou celle de la carte de catégorie qui la porte.
 */
export function TextAction({
  label,
  icon,
  onPress,
  disabled,
  accessibilityLabel,
  tint,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  tint?: Tint;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const bg = tint ? tint.iconBg : colors.accentSoft;
  const fg = tint ? tint.fg : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.row,
        {
          gap: 2,
          backgroundColor: bg,
          borderRadius: radius.pill,
          paddingVertical: spacing.xs + 2,
          paddingLeft: icon ? spacing.sm : spacing.md,
          paddingRight: spacing.md,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon && <Ionicons name={icon} size={16} color={fg} />}
      <Text style={[typography.small, { color: fg, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

/** Choix exclusif entre 2-3 valeurs (Mois / Semaine, Clair / Sombre). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  tint,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Posé sur une carte de catégorie : le rail prend sa teinte. */
  tint?: Tint;
}) {
  const { colors, spacing, radius, typography, shadows } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.row, { backgroundColor: tint ? tint.iconBg : colors.surfaceMuted, borderRadius: radius.pill, padding: 3 }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              paddingVertical: spacing.sm,
              borderRadius: radius.pill,
              backgroundColor: selected ? colors.surface : 'transparent',
              boxShadow: selected ? shadows.card : undefined,
              opacity: pressed && !selected ? 0.6 : 1,
            })}
          >
            <Text style={[typography.small, { color: selected ? colors.text : colors.textMuted, fontWeight: selected ? '700' : '500' }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shrink: { flexShrink: 1 },
  dash: { height: 4, borderRadius: 2 },
  iconBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  countPill: { borderRadius: 999, minWidth: 22, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1 },
});
