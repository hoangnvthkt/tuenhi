import { useRouteError } from 'react-router';
import { SafeErrorScreen } from './SafeErrorScreen';

export function RouterErrorPage() {
  // Consume the router error without rendering or transmitting its contents.
  useRouteError();
  return <SafeErrorScreen title="Không thể tải trang này" />;
}
