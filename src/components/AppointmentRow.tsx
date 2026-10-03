import { MapPin, User } from 'lucide-react';

import { formatTimeRange, type AppointmentWithContact } from '../data/appointments';

/**
 * Ligne d'un rendez-vous : barre de couleur « agenda », horaire, titre, lieu et
 * contact. Pas de case à cocher (un RDV n'est pas « fait », il est passé : il
 * est alors grisé). Portage web de mobile-legacy/src/components/AppointmentRow.tsx ;
 * la fiche du RDV et le compte-rendu arriveront avec leurs écrans.
 */
export function AppointmentRow({ appointment }: { appointment: AppointmentWithContact }) {
  const past = new Date(appointment.end_at ?? appointment.start_at) < new Date();
  const details = [appointment.location, appointment.contact_name].filter(Boolean).join(' · ');
  const DetailIcon = appointment.location ? MapPin : User;

  return (
    <li className={past ? 'row appointment appointment--past' : 'row appointment'}>
      <span className="appointment__bar" aria-hidden />
      <div className="row__main">
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
      </div>
    </li>
  );
}
