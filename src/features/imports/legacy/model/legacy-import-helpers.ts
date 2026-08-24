import { createCatalogApi } from '@/features/catalog';
import { createDirectoryApi } from '@/features/directories';
import { createSettingsApi } from '@/features/settings';
import type { LegacyStagedRow } from '@/features/legacy-sales';
import { createStaffApi } from '@/features/staff';
import type { LegacyTargets } from './legacy-mapping';
import type { LegacyParseResult } from '../parser/legacy-q237-parser';

export async function loadLegacyMappingTargets(): Promise<LegacyTargets> {
  const staffApi = createStaffApi();
  const directoryApi = createDirectoryApi();
  const settingsApi = createSettingsApi();
  const catalogApi = createCatalogApi();
  const [staff, customers, channels, products] = await Promise.all([
    staffApi.list(),
    directoryApi.listCustomers({ limit: 100 }),
    settingsApi.listSalesChannels(true),
    catalogApi.list({ includeInactive: true, limit: 100 }),
  ]);
  return {
    staff: staff.items.map((item) => ({
      id: item.id,
      label: item.displayName,
    })),
    channel: channels.map((item) => ({
      id: item.id,
      label: item.name,
      code: item.code,
    })),
    customer: customers.items.map((item) => ({
      id: item.id,
      label: item.name,
      ...(item.code ? { code: item.code } : {}),
    })),
    product: products.items.map((item) => ({
      id: item.id,
      label: item.name,
      code: item.sku,
    })),
  };
}

export function buildLegacyStagedRows(
  parsed: LegacyParseResult,
): LegacyStagedRow[] {
  const rows: LegacyStagedRow[] = [];
  for (const [groupIndex, sale] of parsed.sales.entries()) {
    for (const line of sale.lines) {
      rows.push({
        rowNumber: rows.length + 2,
        values: {
          sourceGroupIndex: groupIndex + 1,
          sourceSaleNumber: sale.sourceSaleNumber,
          sourceRowStart: sale.sourceRowStart,
          sourceRowNumber: line.sourceRowNumber,
          lineNumber: line.lineNumber,
          soldOn: sale.soldOn,
          staffLabel: sale.staffLabel,
          channelLabel: sale.channelLabel,
          customerLabel: sale.customerLabel,
          customerPhone: sale.customerPhone,
          paymentLabel: sale.paymentLabel,
          paymentMethod: sale.proposedPaymentMethod,
          statusLabel: sale.statusLabel,
          note: sale.note,
          productCode: line.productCode,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitPriceProvenance: line.unitPriceProvenance,
          lineDiscount: line.lineDiscount,
          lineTotal: line.lineTotal,
          lineTotalProvenance: line.lineTotalProvenance,
          warningCodes: line.warningCodes,
          ...(rows.length === 0
            ? { openingSuggestions: parsed.openingSuggestions }
            : {}),
        },
      });
    }
  }
  return rows;
}
