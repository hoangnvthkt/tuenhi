import type ExcelJS from 'exceljs';
import type {
  ClientImportError,
  ValidatedClientRow,
} from '../model/client-validation';
import type { ImportTarget } from '../model/contracts';
import { getTemplateContract } from '../model/template-contracts';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type ErrorWorkbookInput = {
  target: ImportTarget;
  version: number;
  rows: ValidatedClientRow[];
  errors: ClientImportError[];
};

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' },
  };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 28;
}

export async function buildErrorWorkbook({
  target,
  version,
  rows,
  errors,
}: ErrorWorkbookInput): Promise<Blob> {
  const contract = getTemplateContract(target, version);
  const { default: ExcelJSRuntime } = await import('exceljs');
  const workbook = new ExcelJSRuntime.Workbook();
  workbook.creator = 'Tuệ Nhi POS';
  workbook.created = new Date(0);
  workbook.modified = new Date(0);
  workbook.calcProperties.fullCalcOnLoad = false;

  const dataSheet = workbook.addWorksheet('Dữ liệu lỗi', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const extraHeaders = ['Trạng thái', 'Lỗi', 'Mã lỗi'];
  const headers = [
    ...contract.columns.map((column) => column.header),
    ...extraHeaders,
  ];
  dataSheet.addRow(headers);
  styleHeader(dataSheet.getRow(1));
  dataSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  const errorsByRow = new Map<number, ClientImportError[]>();
  for (const error of errors) {
    errorsByRow.set(error.rowNumber, [
      ...(errorsByRow.get(error.rowNumber) ?? []),
      error,
    ]);
  }

  for (const row of rows) {
    const rowErrors = errorsByRow.get(row.rowNumber) ?? [];
    if (rowErrors.length === 0) continue;
    dataSheet.addRow([
      ...contract.columns.map((column) => row.values[column.field] ?? ''),
      'Có lỗi',
      rowErrors.map((error) => error.message).join('\n'),
      rowErrors.map((error) => error.code).join('\n'),
    ]);
  }

  for (const [index, column] of contract.columns.entries()) {
    const worksheetColumn = dataSheet.getColumn(index + 1);
    worksheetColumn.width = Math.min(
      38,
      Math.max(14, column.header.length + 4),
    );
    if (column.textFormat) worksheetColumn.numFmt = '@';
  }
  dataSheet.getColumn(headers.length - 2).width = 14;
  dataSheet.getColumn(headers.length - 1).width = 44;
  dataSheet.getColumn(headers.length).width = 28;
  dataSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: 'top', wrapText: true };
  });

  const summarySheet = workbook.addWorksheet('Tổng hợp lỗi', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  summarySheet.addRow(['Mã lỗi', 'Số lượng']);
  styleHeader(summarySheet.getRow(1));
  const counts = new Map<string, number>();
  for (const error of errors) {
    counts.set(error.code, (counts.get(error.code) ?? 0) + 1);
  }
  for (const [code, count] of [...counts.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    summarySheet.addRow([code, count]);
  }
  summarySheet.getColumn(1).width = 34;
  summarySheet.getColumn(2).width = 14;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buffer)], { type: XLSX_MIME });
}

export function downloadErrorWorkbook(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
