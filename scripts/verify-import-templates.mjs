import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import * as XLSX from 'xlsx';
import { listTemplateContracts } from '../src/features/imports/template-contracts.ts';

const ROOT = process.cwd();
const TEMPLATE_DIR = join(ROOT, 'public', 'templates', 'import');
const REQUIRED_SHEETS = ['Hướng dẫn', 'Dữ liệu', '__tuenhi_meta'];

function populatedCells(sheet) {
  if (!sheet['!ref']) return [];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const cells = [];

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = sheet[address];
      if (cell) cells.push({ address, cell });
    }
  }

  return cells;
}

function assertNoExecutableContent(workbook, fileName) {
  assert.equal(workbook.vbaraw, undefined, `${fileName}: không được chứa VBA`);

  for (const sheetName of workbook.SheetNames) {
    for (const { address, cell } of populatedCells(
      workbook.Sheets[sheetName],
    )) {
      assert.equal(
        cell.f,
        undefined,
        `${fileName}: ${sheetName}!${address} không được chứa công thức`,
      );
    }
  }

  const filePaths = Object.keys(workbook.files ?? {});
  assert.equal(
    filePaths.some((path) => /externalLinks|vbaProject\.bin/i.test(path)),
    false,
    `${fileName}: không được chứa liên kết ngoài hoặc VBA`,
  );
}

function metadataFrom(sheet) {
  return Object.fromEntries(
    XLSX.utils
      .sheet_to_json(sheet, { header: 1, raw: false, blankrows: false })
      .filter((row) => row.length >= 2)
      .map(([key, value]) => [String(key), String(value)]),
  );
}

async function verifyContract(contract) {
  const path = join(TEMPLATE_DIR, contract.fileName);
  await access(path);

  const workbook = XLSX.read(await readFile(path), {
    type: 'buffer',
    bookFiles: true,
    bookVBA: true,
    cellFormula: true,
    cellNF: true,
    sheetStubs: true,
  });

  assert.deepEqual(
    workbook.SheetNames,
    REQUIRED_SHEETS,
    `${contract.fileName}: danh sách sheet không đúng hợp đồng`,
  );

  const metadataSheet = workbook.Workbook?.Sheets?.find(
    ({ name }) => name === '__tuenhi_meta',
  );
  assert.equal(
    metadataSheet?.Hidden,
    2,
    `${contract.fileName}: metadata phải veryHidden`,
  );

  assert.deepEqual(metadataFrom(workbook.Sheets.__tuenhi_meta), {
    template_type: contract.target,
    template_version: String(contract.version),
    generator_version: '1',
  });

  const dataSheet = workbook.Sheets['Dữ liệu'];
  const instructionSheet = workbook.Sheets['Hướng dẫn'];
  const [headers = []] = XLSX.utils.sheet_to_json(dataSheet, {
    header: 1,
    raw: false,
    blankrows: false,
  });
  assert.deepEqual(
    headers,
    contract.columns.map(({ header }) => header),
    `${contract.fileName}: thứ tự cột không đúng hợp đồng`,
  );
  const lastColumn = XLSX.utils.encode_col(contract.columns.length - 1);
  assert.equal(dataSheet['!autofilter']?.ref, `A1:${lastColumn}1`);

  contract.columns.forEach((column, index) => {
    const instructionRow = 11 + index;
    const limitCell = instructionSheet[`D${instructionRow}`];
    assert.equal(
      limitCell?.v,
      column.maxLength ? `Tối đa ${column.maxLength} ký tự` : '—',
      `${contract.fileName}: giới hạn phải hiển thị rõ ràng`,
    );

    if (column.textFormat) {
      assert.equal(
        instructionSheet[`E${instructionRow}`]?.z,
        '@',
        `${contract.fileName}: ví dụ ${column.header} phải ở dạng text`,
      );
    }

    if (!column.textFormat) return;
    const address = XLSX.utils.encode_cell({ r: 1, c: index });
    assert.equal(
      dataSheet[address]?.z,
      '@',
      `${contract.fileName}: ${column.header} phải được định dạng text`,
    );
  });

  assertNoExecutableContent(workbook, contract.fileName);
  process.stdout.write(`✓ ${contract.fileName}\n`);
}

for (const contract of listTemplateContracts()) {
  await verifyContract(contract);
}
