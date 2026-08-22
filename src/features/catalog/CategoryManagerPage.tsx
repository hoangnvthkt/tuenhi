import { useOnlineStatus } from '../../app/use-online-status';
import { CategoryManager } from './CategoryManager';

export function CategoryManagerPage() {
  return <CategoryManager isOnline={useOnlineStatus()} />;
}
