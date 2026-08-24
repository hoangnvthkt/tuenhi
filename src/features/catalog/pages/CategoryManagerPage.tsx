import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { CategoryManager } from '../components/CategoryManager';

export function CategoryManagerPage() {
  return <CategoryManager isOnline={useOnlineStatus()} />;
}
