import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Shown instead of the children once they have failed. */
  fallback: React.ReactNode;
  /** Told about the failure once, e.g. to say so in a toast and close what failed. */
  onError?: (error: unknown) => void;
  /** The children get another go when this changes (e.g. the page the visitor is on). */
  resetKey?: unknown;
}

/**
 * Catches an error thrown while its children render, including a part of the app that loads on
 * demand and could not be fetched (a network drop, or a tab still holding a build that has since been
 * replaced), and shows the fallback instead of letting React empty the whole page.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(error);
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
