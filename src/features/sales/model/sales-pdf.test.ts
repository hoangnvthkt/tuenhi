// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { buildDraftPdf, buildInvoicePdf, createSalesPdf } from './sales-pdf';
import { invoiceFixture } from '../testing/invoice-fixture';
import { draftPrintFixture } from '../testing/draft-print-fixture';

const fontRequests: string[] = [];
beforeEach(() => {
  fontRequests.length = 0;
  vi.stubGlobal('location', { href: 'https://tuenhi.test/' });
  vi.stubGlobal('fetch', async (url: string) => {
    fontRequests.push(url);
    const pathname = new URL(url).pathname;
    if (
      !['/fonts/Roboto-Regular.ttf', '/fonts/Roboto-Medium.ttf'].includes(
        pathname,
      )
    )
      throw new Error('Unexpected font request');
    const buffer = await readFile(
      new URL(`../../../../public${pathname}`, import.meta.url),
    );
    return new Response(new Uint8Array(buffer).buffer, { status: 200 });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('sales PDF', () => {
  it('loads only the two bundled same-origin fonts for a fresh document', async () => {
    vi.resetModules();
    const { createSalesPdf: freshPdf } = await import('./sales-pdf');
    const pdf = await freshPdf({
      content: [{ text: 'Tuệ Nhi' }, { text: 'Sữa hộp', bold: true }],
    });
    await pdf.getBuffer();
    expect(new Set(fontRequests)).toEqual(
      new Set([
        'https://tuenhi.test/fonts/Roboto-Regular.ttf',
        'https://tuenhi.test/fonts/Roboto-Medium.ttf',
      ]),
    );
  });

  it('generates the official invoice with Vietnamese text and embedded fonts', async () => {
    const pdf = await createSalesPdf(buildInvoicePdf(invoiceFixture));
    const binary = (await pdf.getBuffer()).toString('latin1');
    expect(binary.startsWith('%PDF-')).toBe(true);
    expect(binary).toContain('/FontFile2');
  });

  it('generates a multipage Vietnamese provisional receipt with embedded fonts', async () => {
    const document = {
      ...draftPrintFixture,
      lines: Array.from({ length: 120 }, (_, index) => ({
        ...draftPrintFixture.lines[0]!,
        id: String(index),
        productName: `Sữa hộp dưỡng chất — Nguyễn Thị Ánh ${index}`,
      })),
    };
    const definition = buildDraftPdf(document);
    expect(JSON.stringify(definition.content)).toContain(
      'PHIẾU TẠM TÍNH — CHƯA THANH TOÁN',
    );
    const pdf = await createSalesPdf(definition);
    const buffer = await pdf.getBuffer();
    const binary = buffer.toString('latin1');
    expect(binary.startsWith('%PDF-')).toBe(true);
    expect(binary).toContain('/FontFile2');
    expect((binary.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});
