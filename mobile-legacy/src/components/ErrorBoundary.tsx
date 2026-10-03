import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

type Props = { title?: string; children: ReactNode };
type State = { error: Error | null; componentStack: string | null };

/**
 * Affiche l'erreur (message + stack) directement à l'écran au lieu d'un écran
 * blanc muet : indispensable quand les logs Metro distants ne remontent pas.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    return <ErrorScreen title={this.props.title} error={error} componentStack={componentStack} />;
  }
}

export function ErrorScreen({
  title = "L'application a planté",
  error,
  componentStack,
}: {
  title?: string;
  error: unknown;
  componentStack?: string | null;
}) {
  const err = error instanceof Error ? error : new Error(String(error));
  const cause = err.cause instanceof Error ? err.cause : null;
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{err.message}</Text>
      {cause ? <Text style={styles.message}>Cause : {cause.message}</Text> : null}
      <Text style={styles.label}>Stack</Text>
      <Text style={styles.mono}>{(cause ?? err).stack ?? '(aucune stack)'}</Text>
      {componentStack ? (
        <>
          <Text style={styles.label}>Composants</Text>
          <Text style={styles.mono}>{componentStack}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff5f5' },
  content: { padding: 16, paddingTop: 48 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#b00020', marginBottom: 8 },
  message: { fontSize: 15, color: '#222', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: 'bold', color: '#555', marginTop: 12 },
  mono: { fontFamily: 'monospace', fontSize: 11, color: '#333' },
});
