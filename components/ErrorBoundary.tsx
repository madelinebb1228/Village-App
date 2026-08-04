import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Sentry from '@sentry/react-native';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  eventId: string | null;
  resetKey: number;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, eventId: null, resetKey: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const eventId = Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
    });
    this.setState({ eventId });
  }

  handleRetry = () => {
    this.setState(prev => ({ hasError: false, eventId: null, resetKey: prev.resetKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.emoji}>😕</Text>
          <Text style={styles.title}>Oops! Something went wrong</Text>
          {this.props.fallbackMessage && (
            <Text style={styles.message}>{this.props.fallbackMessage}</Text>
          )}
          {this.state.eventId && (
            <Text style={styles.eventId}>Error ID: {this.state.eventId}</Text>
          )}
          <TouchableOpacity style={styles.button} onPress={this.handleRetry} activeOpacity={0.85}
            accessibilityRole="button" accessibilityLabel="Try Again">
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#FEFCF8',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emoji: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: '#3D3530', textAlign: 'center', marginBottom: 8 },
  message: { fontSize: 14, color: '#6B6259', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  eventId: { fontSize: 11, color: '#9B9086', textAlign: 'center', marginBottom: 24, fontFamily: 'monospace' },
  button: { backgroundColor: '#B8A9C9', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
