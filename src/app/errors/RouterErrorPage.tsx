import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import { recoverAssetLoadOnce } from '../bootstrap/fresh-reload';
import { SafeErrorScreen } from './SafeErrorScreen';

export function RouterErrorPage() {
  // Consume the router error without rendering or transmitting its contents.
  const error = useRouteError();
  // A page file missing after a deployment reloads once from the network.
  useEffect(() => {
    recoverAssetLoadOnce(error);
  }, [error]);
  return <SafeErrorScreen title="Không thể tải trang này" />;
}
