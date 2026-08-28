import { Component, type ReactNode } from 'react';
import { SafeErrorScreen } from './SafeErrorScreen';

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // Deliberately local-only: this phase does not send error telemetry.
  }

  render() {
    return this.state.failed ? <SafeErrorScreen /> : this.props.children;
  }
}
