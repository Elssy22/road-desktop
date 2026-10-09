import { CalendarPlus, GitBranch, Inbox, ListPlus, Mail, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CardNote, CategoryCard, ErrorBanner, ScreenHeader } from '../components/ui';
import {
  acceptSuggestion,
  listPendingSuggestions,
  rejectSuggestion,
  type MailSuggestionWithLinks,
} from '../data/mailSuggestions';
import { useRemoteQuery } from '../data/useRemoteQuery';
import { useWrite } from '../data/useWrite';
import { formatDueLabel, formatEditedLabel } from '../lib/dates';
import { useToday } from '../lib/useToday';

const EMPTY: MailSuggestionWithLinks[] = [];

/**
 * Suggestions tirées des mails par l'Edge Function `mail-suggestions`. Rien
 * n'est créé sans validation : une carte par mail, acceptée ou ignorée une à une.
 */
export function SuggestionsScreen() {
  const { data: suggestions, error: loadError, loading } = useRemoteQuery(listPendingSuggestions, EMPTY);
  const { run, error: writeError } = useWrite();
  // Suggestion en cours d'écriture : ses boutons sont désactivés (pas de double clic).
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (id: string, write: () => Promise<void>) => {
    setBusyId(id);
    await run(write);
    setBusyId(null);
  };

  return (
    <div className="screen">
      <ScreenHeader title="Suggestions" />
      <ErrorBanner message={loadError} />
      <ErrorBanner message={writeError} />
      <div className="stack">
        {suggestions.length === 0 && !loading && (
          <CategoryCard category="tasks" icon={Inbox} title="Suggestions">
            <CardNote>Aucune suggestion pour le moment.</CardNote>
            <CardNote>
              Les tâches et échéances repérées dans tes mails apparaîtront ici, à valider une par une.
            </CardNote>
          </CategoryCard>
        )}

        {suggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            busy={busyId === s.id}
            onAccept={() => void act(s.id, () => acceptSuggestion(s))}
            onReject={() => void act(s.id, () => rejectSuggestion(s))}
          />
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({
  suggestion: s,
  busy,
  onAccept,
  onReject,
}: {
  suggestion: MailSuggestionWithLinks;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const navigate = useNavigate();
  const today = useToday();
  const isTask = s.suggested_kind === 'task';

  return (
    <CategoryCard category={isTask ? 'tasks' : 'keyDates'} icon={Mail} title={s.email_subject || '(Sans objet)'}>
      <CardNote>
        {s.email_from || 'Expéditeur inconnu'} · {formatEditedLabel(s.email_date ?? s.created_at, today)}
      </CardNote>
      {s.email_snippet && <blockquote className="suggestion__snippet">{s.email_snippet}</blockquote>}

      <div className="suggestion__proposal">
        <span className="suggestion__kind">{isTask ? 'Tâche suggérée' : 'Échéance suggérée'}</span>
        <span className="suggestion__title">{s.suggested_title}</span>
        {s.suggested_due_date && (
          <span className="suggestion__date">{formatDueLabel(s.suggested_due_date, today)}</span>
        )}
      </div>

      {(s.contact_name || s.project_title) && (
        <div className="suggestion__links">
          {s.contact_name && (
            <button type="button" className="project-link" onClick={() => navigate(`/agency/contacts/${s.contact_id}`)}>
              <User size={14} />
              {s.contact_name}
            </button>
          )}
          {s.project_title && (
            <button type="button" className="project-link" onClick={() => navigate(`/agency/projects/${s.project_id}`)}>
              <GitBranch size={14} />
              {s.project_title}
            </button>
          )}
        </div>
      )}

      <div className="form-actions form-actions--start suggestion__actions">
        <button type="button" className="button button--primary" disabled={busy} onClick={onAccept}>
          {isTask ? <ListPlus size={16} /> : <CalendarPlus size={16} />}
          {isTask ? 'Créer la tâche' : 'Créer l’échéance'}
        </button>
        <button type="button" className="button button--ghost" disabled={busy} onClick={onReject}>
          Ignorer
        </button>
      </div>
    </CategoryCard>
  );
}
