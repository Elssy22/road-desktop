import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Alert } from 'react-native';

import { PIPELINE_STAGE_LABELS, PIPELINE_STAGES, type PipelineStage } from '../db/crmDb';
import { useTheme } from '../theme/ThemeProvider';
import { Sheet, SheetOption } from './Sheet';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Icône de chaque étape (colonnes du pipeline, fiche contact, sélecteur). */
export const STAGE_ICONS: Record<PipelineStage, IconName> = {
  a_demarcher: 'flag-outline',
  deck_envoye: 'paper-plane-outline',
  a_relancer: 'alarm-outline',
  signe: 'checkmark-done-outline',
  perdu: 'close-circle-outline',
};

/** Sélecteur d'étape : remplace le glisser-déposer d'un kanban sur mobile. */
export function PipelineStageSheet({
  visible,
  value,
  onSelect,
  onClose,
  title = 'Étape de prospection',
}: {
  visible: boolean;
  value: PipelineStage | null;
  onSelect: (stage: PipelineStage) => void;
  onClose: () => void;
  title?: string;
}) {
  const { colors, categories } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {PIPELINE_STAGES.map((s) => (
        <SheetOption
          key={s}
          label={PIPELINE_STAGE_LABELS[s]}
          selected={value === s}
          icon={<Ionicons name={STAGE_ICONS[s]} size={20} color={value === s ? colors.primary : categories.contacts.fg} />}
          onPress={() => onSelect(s)}
        />
      ))}
    </Sheet>
  );
}

/**
 * Après une signature : proposer de sortir le contact du pipeline. Il reste dans
 * la même table, simplement sans étape (pas de copie vers une table « clients »).
 */
export function askMarkAsActiveClient(name: string, onConfirm: () => void) {
  Alert.alert(
    'Marquer comme client actif ?',
    `${name || 'Ce contact'} sort du pipeline de prospection et reste dans tes contacts.`,
    [
      { text: 'Plus tard', style: 'cancel' },
      { text: 'Client actif', onPress: onConfirm },
    ]
  );
}
