import { Component, type ErrorInfo, type ReactNode } from 'react';

import { ErrorBanner } from './ui';

type State = { error: Error | null };

/**
 * Filet de sécurité autour de l'écran courant : une exception d'affichage
 * n'efface plus toute la fenêtre (écran blanc). La barre latérale reste
 * utilisable ; changer d'écran (clé = route) ou « Réessayer » repart de zéro.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Écran interrompu par une erreur', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="screen">
        <div className="stack">
          <ErrorBanner message={`Cet écran a rencontré une erreur inattendue : ${error.message}`} />
          <div className="form-actions form-actions--start">
            <button type="button" className="button button--primary" onClick={() => this.setState({ error: null })}>
              Réessayer
            </button>
            <button type="button" className="button button--ghost" onClick={() => window.location.reload()}>
              Recharger l’app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
