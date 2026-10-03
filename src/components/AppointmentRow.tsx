import { FileText, MapPin, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { formatTimeRange, type AppointmentWithContact } from '../data/appointments';

/**
 * Ligne d'un rendez-vous : barre de couleur « agenda », horaire, titre, lieu et
 * contact. Pas de case à cocher (un RDV n'est pas « fait », il est passé : il
 * est alors grisé). Clic : fiche du RDV. `showDebrief` ajoute, une fois le RDV
 * passé, un raccourci vers le compte-rendu. Portage web de
 * mobile-legacy/src/components/AppointmentRow.tsx.
 */
export function AppointmentRow({ appointment, showDebrief }: { appointment: AppointmentWithContact; showDebrief?: boolean }) {
  const navigate = useNavigate();
  const past = new Date(appointment.end_at ?? appointment.start_at) < new Date();
  const details = [appointment.location, appointment.contact_name].filter(Boolean).join(' · ');
  const DetailIcon = appointment.location ? MapPin : User;

  return (
    <li className={past ? 'row appointment appointment--past' : 'row appointment'}>
      <span className="appointment__bar" aria-hidden />
      <button
        type="button"
        className="row__main row__button"
        onClick={() => navigate(`/appointments/${appointment.id}`)}
        title="Ouvrir le rendez-vous"
      >
        <span className="appointment__time">{formatTimeRange(appointment)}</span>
        <span className="row__title">{appointment.title || 'Rendez-vous'}</span>
        {details.length > 0 && (
          <span className="row__meta">
            <span className="row__meta-item">
              <DetailIcon size={12} />
              {details}
            </span>
          </span>
        )}
      </button>
      {showDebrief && past && (
        <button
          type="button"
          className="icon-button icon-button--primary"
          onClick={() =>
            navigate(
              appointment.contact_id ? `/agency/meeting-report?contact=${appointment.contact_id}` : '/agency/meeting-report'
            )
          }
          aria-label={`Compte-rendu du RDV ${appointment.title}`}
          title="Faire le compte-rendu"
        >
          <FileText size={20} />
        </button>
      )}
    </li>
  );
}
