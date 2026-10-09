import { AlarmClock, CheckCheck, CircleX, Flag, Send, type LucideIcon } from 'lucide-react';

import { PIPELINE_STAGE_LABELS, PIPELINE_STAGES, type PipelineStage } from '../data/crm';
import type { ConfirmOptions } from './Dialog';

// Portage web de mobile-legacy/src/components/PipelineStageSheet.tsx : la
// feuille du bas devient une liste déroulante native.

/** Icône de chaque étape (colonnes du pipeline, fiche contact). */
export const STAGE_ICONS: Record<PipelineStage, LucideIcon> = {
  a_demarcher: Flag,
  deck_envoye: Send,
  a_relancer: AlarmClock,
  signe: CheckCheck,
  perdu: CircleX,
};

/** Sélecteur d'étape de prospection (remplace le glisser-déposer d'un kanban). */
export function StageSelect({
  value,
  onChange,
  label,
}: {
  value: PipelineStage;
  onChange: (stage: PipelineStage) => void;
  /** Libellé accessible (« Étape de Jean Dupont »). */
  label: string;
}) {
  return (
    <select
      className="stage-select"
      value={value}
      aria-label={label}
      title={label}
      onChange={(e) => onChange(e.target.value as PipelineStage)}
    >
      {PIPELINE_STAGES.map((s) => (
        <option key={s} value={s}>
          {PIPELINE_STAGE_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

/**
 * Après une signature : proposer de sortir le contact du pipeline. Il reste dans
 * la même table, simplement sans étape (DECISIONS.md §31).
 */
export function askMarkAsActiveClient(confirm: (o: ConfirmOptions) => void, name: string, onConfirm: () => void) {
  confirm({
    title: 'Marquer comme client actif ?',
    message: `${name || 'Ce contact'} sort du pipeline de prospection et reste dans tes contacts.`,
    confirmLabel: 'Client actif',
    cancelLabel: 'Plus tard',
    onConfirm,
  });
}
