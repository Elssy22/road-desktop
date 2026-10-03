import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';

import { SyncIndicator } from '../../../components/SyncIndicator';
import { useTheme } from '../../../theme/ThemeProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  };
}

export default function TabsLayout() {
  const { colors, spacing } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerRight: () => <SyncIndicator />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Aujourd'hui",
          // L'écran porte son propre grand titre (la date) : en-tête nu, fondu dans le fond.
          headerTitle: '',
          headerStyle: { backgroundColor: colors.background },
          tabBarIcon: tabIcon('sunny-outline'),
          headerRight: () => (
            <View style={[styles.headerRight, { gap: spacing.lg }]}>
              {/* Le calendrier vit dans la Stack de l'Agence (à côté de l'échéancier). */}
              <Pressable
                onPress={() => router.push('/agency/calendar', { withAnchor: true })}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Calendrier"
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <Ionicons name="calendar-outline" size={22} color={colors.primary} />
              </Pressable>
              <Pressable
                onPress={() => router.push('/search')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Rechercher"
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <Ionicons name="search" size={22} color={colors.primary} />
              </Pressable>
              <SyncIndicator />
            </View>
          ),
        }}
      />
      <Tabs.Screen name="tasks" options={{ title: 'Tâches', tabBarIcon: tabIcon('checkbox-outline') }} />
      <Tabs.Screen name="notes" options={{ title: 'Notes', tabBarIcon: tabIcon('document-text-outline') }} />
      {/* CRM, projets, objectifs, échéancier : un seul onglet, Stack interne (agency/_layout). */}
      <Tabs.Screen
        name="agency"
        options={{ title: 'Agence', headerShown: false, tabBarIcon: tabIcon('briefcase-outline') }}
      />
      <Tabs.Screen name="settings" options={{ title: 'Réglages', tabBarIcon: tabIcon('settings-outline') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center' },
});
