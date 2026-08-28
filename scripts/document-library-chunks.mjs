export function documentLibraryChunkName(moduleId) {
  const normalized = moduleId.replaceAll('\\', '/');
  if (normalized.includes('/node_modules/xlsx/')) return 'xlsx';
  if (normalized.includes('/node_modules/exceljs/')) return 'exceljs';
  if (normalized.includes('/node_modules/pdfmake/')) return 'pdfmake';
  return undefined;
}
