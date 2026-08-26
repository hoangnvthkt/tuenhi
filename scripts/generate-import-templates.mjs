import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import ExcelJS from 'exceljs';
import { listTemplateContracts } from '../src/features/imports/model/template-contracts.ts';

const OUTPUT_DIR = join(process.cwd(), 'public', 'templates', 'import');
const FIXED_TIMESTAMP = new Date('2026-08-22T00:00:00.000Z');
const HEADER_FILL = '0F766E';
const HEADER_TEXT = 'FFFFFF';
const SUBTLE_FILL = 'E6FFFB';
const BORDER_COLOR = 'CBD5E1';
const MAX_DATA_ROW = 5001;

const typeLabels = {
  text: 'Văn bản',
  boolean: 'Có/Không',
  quantity: 'Số, tối đa 3 số lẻ',
  money: 'Số, tối đa 2 số lẻ',
  phone: 'Số điện thoại',
  email: 'Email',
};

function excelColumnName(index) {
  let value = index;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function styleHeader(row) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
    };
  });
}

function addInstructions(workbook, contract) {
  const sheet = workbook.addWorksheet('Hướng dẫn', {
    views: [{ showGridLines: false }],
  });

  sheet.mergeCells('A1:E1');
  sheet.getCell('A1').value = `Mẫu nhập ${contract.displayName}`;
  sheet.getCell('A1').font = {
    bold: true,
    size: 18,
    color: { argb: HEADER_FILL },
  };
  sheet.getCell('A1').alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 34;

  const rules = [
    'Chỉ dùng tệp .xlsx và không thêm, xóa hoặc đổi tên các sheet.',
    'Không nhập công thức, liên kết ngoài, macro hoặc ô gộp trong sheet Dữ liệu.',
    'Số chỉ gồm chữ số ASCII và dấu chấm cho phần thập phân; không dùng dấu phân cách hàng nghìn.',
    'SKU, mã vạch, mã đối tác và số điện thoại phải được giữ ở dạng văn bản.',
    'Xóa dòng ví dụ nếu bạn sao chép dữ liệu từ nguồn khác; hệ thống kiểm tra lại trước khi nhập.',
  ];

  rules.forEach((rule, index) => {
    const row = 3 + index;
    sheet.mergeCells(row, 1, row, 5);
    sheet.getCell(row, 1).value = `• ${rule}`;
    sheet.getCell(row, 1).alignment = { wrapText: true, vertical: 'top' };
    sheet.getRow(row).height = 28;
  });

  const tableStart = 10;
  sheet.getRow(tableStart).values = [
    'Tên cột',
    'Bắt buộc',
    'Kiểu dữ liệu',
    'Giới hạn',
    'Ví dụ',
  ];
  styleHeader(sheet.getRow(tableStart));

  contract.columns.forEach((column, index) => {
    const row = sheet.getRow(tableStart + 1 + index);
    row.values = [
      column.header,
      column.required ? 'Có' : 'Không',
      typeLabels[column.type],
      column.maxLength ? `Tối đa ${column.maxLength} ký tự` : '—',
      column.example,
    ];
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = 26;
    if (index % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: SUBTLE_FILL },
        };
      });
    }
    if (column.textFormat) {
      row.getCell(5).numFmt = '@';
    }
  });

  sheet.columns = [
    { width: 28 },
    { width: 13 },
    { width: 24 },
    { width: 24 },
    { width: 32 },
  ];
  sheet.views = [{ state: 'frozen', ySplit: tableStart, showGridLines: false }];
}

function validationFor(column) {
  if (column.type === 'boolean') {
    return {
      type: 'list',
      allowBlank: !column.required,
      formulae: ['"Có,Không"'],
      showErrorMessage: true,
      errorTitle: 'Giá trị chưa hợp lệ',
      error: 'Chỉ nhập Có hoặc Không.',
    };
  }

  if (column.field === 'customerType') {
    return {
      type: 'list',
      allowBlank: true,
      formulae: ['"Cá nhân,Doanh nghiệp"'],
      showErrorMessage: true,
      errorTitle: 'Giá trị chưa hợp lệ',
      error: 'Chỉ nhập Cá nhân hoặc Doanh nghiệp.',
    };
  }

  if (column.type === 'quantity' || column.type === 'money') {
    return {
      type: 'decimal',
      operator: 'between',
      allowBlank: !column.required,
      formulae: [0, 999999999999999.999],
      showErrorMessage: true,
      errorTitle: 'Số chưa hợp lệ',
      error: 'Chỉ nhập số không âm; hệ thống sẽ kiểm tra định dạng chính xác.',
    };
  }

  if (column.maxLength) {
    return {
      type: 'textLength',
      operator: 'lessThanOrEqual',
      allowBlank: !column.required,
      formulae: [column.maxLength],
      showErrorMessage: true,
      errorTitle: 'Nội dung quá dài',
      error: `Tối đa ${column.maxLength} ký tự.`,
    };
  }

  return undefined;
}

function addDataSheet(workbook, contract) {
  const sheet = workbook.addWorksheet('Dữ liệu', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });

  sheet.getRow(1).values = contract.columns.map(({ header }) => header);
  styleHeader(sheet.getRow(1));
  const lastColumn = excelColumnName(contract.columns.length);
  sheet.autoFilter = `A1:${lastColumn}1`;

  contract.columns.forEach((column, index) => {
    const columnNumber = index + 1;
    const worksheetColumn = sheet.getColumn(columnNumber);
    worksheetColumn.width = Math.min(
      42,
      Math.max(16, column.header.length + 4, column.example.length + 4),
    );

    if (column.textFormat) {
      worksheetColumn.numFmt = '@';
      sheet.getCell(2, columnNumber).numFmt = '@';
    }

    const validation = validationFor(column);
    if (validation) {
      sheet.dataValidations.add(
        `${excelColumnName(columnNumber)}2:${excelColumnName(columnNumber)}${MAX_DATA_ROW}`,
        validation,
      );
    }
  });
}

function addMetadata(workbook, contract) {
  const sheet = workbook.addWorksheet('__tuenhi_meta', {
    state: 'veryHidden',
  });
  sheet.addRows([
    ['template_type', contract.target],
    ['template_version', contract.version],
    ['generator_version', 1],
  ]);
  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 24;
}

async function generateTemplate(contract) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tuệ Nhi POS';
  workbook.lastModifiedBy = 'Tuệ Nhi POS';
  workbook.created = FIXED_TIMESTAMP;
  workbook.modified = FIXED_TIMESTAMP;
  workbook.calcProperties.fullCalcOnLoad = false;

  addInstructions(workbook, contract);
  addDataSheet(workbook, contract);
  addMetadata(workbook, contract);

  const outputPath = join(OUTPUT_DIR, contract.fileName);
  await workbook.xlsx.writeFile(outputPath);
  process.stdout.write(`✓ ${contract.fileName}\n`);
}

await mkdir(OUTPUT_DIR, { recursive: true });
for (const contract of listTemplateContracts()) {
  await generateTemplate(contract);
}
