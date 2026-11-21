import { Component, type ReactNode } from 'react';
import { recoverAssetLoadOnce } from '../bootstrap/fresh-reload';
import { SafeErrorScreen } from './SafeErrorScreen';

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Deliberately local-only: this phase does not send error telemetry.
    // A file missing after a deployment reloads once from the network.
    recoverAssetLoadOnce(error);
  }

  render() {
    return this.state.failed ? <SafeErrorScreen /> : this.props.children;
  }
}
