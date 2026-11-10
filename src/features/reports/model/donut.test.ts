import { describe, expect, it } from 'vitest';
import {
  centsToDecimal,
  DONUT_CIRCUMFERENCE,
  donutSlices,
  sumDecimals,
  toCents,
} from './donut';

describe('decimal helpers', () => {
  it('round-trips canonical money without floats', () => {
    expect(toCents('144000.00')).toBe(14400000n);
    expect(toCents('0.5')).toBe(50n);
    expect(toCents('-55000')).toBe(-5500000n);
    expect(centsToDecimal(14400050n)).toBe('144000.50');
    expect(centsToDecimal(-5n)).toBe('-0.05');
    expect(sumDecimals(['144000.00', '30000', '223000.00'])).toBe('397000');
    expect(sumDecimals(['0.1', '0.2'])).toBe('0.30');
  });
});

describe('donutSlices', () => {
  it('rounds shares to whole percent from the real total', () => {
    const slices = donutSlices(['144000.00', '30000.00', '223000.00']);
    expect(slices.map((slice) => slice.percent)).toEqual(['36%', '8%', '56%']);
    const first = Number(slices[0]!.dashArray.split(' ')[0]);
    expect(Number(slices[1]!.dashOffset)).toBeCloseTo(-(first + 2), 2);
  });

  it('keeps a tiny share visible and labels it under one percent', () => {
    const slices = donutSlices(['2', '0', '1', '1099']);
    const [ok, , negative, out] = slices;
    expect(ok!.percent).toBe('<1%');
    expect(Number(negative!.dashArray.split(' ')[0])).toBe(3);
    expect(out!.percent).toBe('100%');
    // Arcs plus gaps fill the ring exactly; none overlaps the next.
    const drawn = slices
      .filter((slice) => slice.visible)
      .reduce((sum, slice) => sum + Number(slice.dashArray.split(' ')[0]), 0);
    expect(drawn + 3 * 2).toBeCloseTo(DONUT_CIRCUMFERENCE, 1);
    expect(Number(out!.dashOffset)).toBeCloseTo(-(3 + 2 + 3 + 2), 2);
  });

  it('draws nothing for zero or negative values', () => {
    expect(donutSlices(['0', '0']).every((slice) => !slice.visible)).toBe(true);
    const [refund, sale] = donutSlices(['-5000', '20000']);
    expect(refund!.visible).toBe(false);
    expect(sale!.percent).toBe('100%');
    // A single slice closes the ring with no gap.
    expect(Number(sale!.dashArray.split(' ')[0])).toBeCloseTo(
      DONUT_CIRCUMFERENCE,
      1,
    );
  });
});
