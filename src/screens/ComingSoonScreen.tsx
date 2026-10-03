import { CardNote, Panel, ScreenHeader } from '../components/ui';

/** Section pas encore portée sur desktop (elle arrive aux lots suivants). */
export function ComingSoonScreen({ title }: { title: string }) {
  return (
    <div className="screen">
      <ScreenHeader eyebrow="À venir" title={title} />
      <Panel className="panel-card--padded">
        <CardNote>Cette section arrive bientôt sur la version Mac. En attendant, elle reste disponible sur le mobile.</CardNote>
      </Panel>
    </div>
  );
}
