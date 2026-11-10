import type { LotRow, TrackingMode } from '../api/lots-api';

export const trackingLabel: Record<TrackingMode, string> = {
  NONE: 'Không',
  EXPIRY: 'Chỉ HSD',
  LOT: 'Theo lô',
};

/** `2027-09-30` → `30/09/2027`. */
export const formatDate = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
};

export type EditableLot = {
  lotNumber: string;
  expiryDate: string;
  quantity: string;
};
export const emptyLot = (): EditableLot => ({
  lotNumber: '',
  expiryDate: '',
  quantity: '',
});

export const sumQuantities = (rows: EditableLot[]) =>
  rows.reduce(
    (sum, row) =>
      sum + (/^\d+$/.test(row.quantity) ? BigInt(row.quantity) : 0n),
    0n,
  );

/** Rows ready to send, or null when one is incomplete for the mode. */
export function toLotRows(
  rows: EditableLot[],
  mode: TrackingMode,
): LotRow[] | null {
  const filled = rows.filter(
    (row) => row.lotNumber.trim() || row.expiryDate || row.quantity,
  );
  const valid = filled.every(
    (row) =>
      /^\d{4}-\d{2}-\d{2}$/.test(row.expiryDate) &&
      /^[1-9]\d*$/.test(row.quantity) &&
      (mode !== 'LOT' || row.lotNumber.trim()),
  );
  return valid
    ? filled.map((row) => ({
        lotNumber: row.lotNumber.trim() || null,
        expiryDate: row.expiryDate,
        quantity: row.quantity,
      }))
    : null;
}

export const fromLotRows = (rows: LotRow[]): EditableLot[] =>
  rows.map((row) => ({
    lotNumber: row.lotNumber ?? '',
    expiryDate: row.expiryDate,
    quantity: row.quantity,
  }));
