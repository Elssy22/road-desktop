import { View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/** Barre de progression 0–100, verte une fois atteinte. */
export function ProgressBar({ value }: { value: number }) {
  const { colors, radius } = useTheme();
  const pct = Math.min(100, Math.max(0, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}
    >
      <View
        style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: radius.pill,
          backgroundColor: pct >= 100 ? colors.success : colors.primary,
        }}
      />
    </View>
  );
}
