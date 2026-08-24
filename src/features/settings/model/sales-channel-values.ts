import type { SalesChannelItem } from '../api/settings-api';
import type { SalesChannelFormValues } from './settings-validation';

export function salesChannelValues(
  item: SalesChannelItem,
): SalesChannelFormValues {
  return {
    code: item.code,
    name: item.name,
    sortOrder: String(item.sortOrder),
    isActive: item.isActive,
  };
}
