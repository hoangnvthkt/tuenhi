import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LegacyMappingPanel } from './LegacyMappingPanel';
import { proposeLegacyResolutions } from './legacy-mapping';

const labels = {
  staff: ['Nhân viên Mẫu'],
  channel: ['Online'],
  customer: ['Khách Mẫu'],
  product: ['SP-GIA-001'],
};
const targets = {
  staff: [
    { id: '10000000-0000-4000-8000-000000000001', label: 'Nhân viên Mẫu' },
  ],
  channel: [
    {
      id: '10000000-0000-4000-8000-000000000002',
      label: 'Bán trực tuyến',
      code: 'ONLINE',
    },
  ],
  customer: [
    { id: '10000000-0000-4000-8000-000000000003', label: 'Khách Mẫu' },
  ],
  product: [
    {
      id: '10000000-0000-4000-8000-000000000004',
      label: 'Sản phẩm Mẫu',
      code: 'SP-GIA-001',
    },
  ],
};

describe('LegacyMappingPanel', () => {
  it('proposes controlled/exact targets but requires owner confirmation', () => {
    const resolutions = proposeLegacyResolutions(labels, targets);
    expect(resolutions.channel.Online).toEqual({
      kind: 'TARGET',
      targetId: targets.channel[0]?.id,
      confirmed: false,
    });
    expect(resolutions.product['SP-GIA-001']).toEqual({
      kind: 'TARGET',
      targetId: targets.product[0]?.id,
      confirmed: false,
    });
  });

  it('blocks until source-label-only mappings are explicitly confirmed', async () => {
    const onChange = vi.fn();
    const onContinue = vi.fn();
    const resolutions = proposeLegacyResolutions(labels, {
      staff: [],
      channel: [],
      customer: [],
      product: [],
    });
    const { rerender } = render(
      <LegacyMappingPanel
        labels={labels}
        targets={{ staff: [], channel: [], customer: [], product: [] }}
        resolutions={resolutions}
        invoiceCount={1}
        productCandidateCount={2}
        customerCandidateCount={1}
        openingSuggestionCount={2}
        onChange={onChange}
        onContinue={onContinue}
      />,
    );
    expect(screen.getByText('Chỉ để tra cứu')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Kiểm tra dữ liệu cũ' }),
    ).toBeDisabled();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Ghép nhân viên Nhân viên Mẫu' }),
      'SOURCE_LABEL_ONLY',
    );
    const changed = onChange.mock.calls.at(-1)?.[0];
    rerender(
      <LegacyMappingPanel
        labels={labels}
        targets={{ staff: [], channel: [], customer: [], product: [] }}
        resolutions={changed}
        invoiceCount={1}
        productCandidateCount={2}
        customerCandidateCount={1}
        openingSuggestionCount={2}
        onChange={onChange}
        onContinue={onContinue}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Kiểm tra dữ liệu cũ' }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'Xác nhận chỉ giữ nhãn Nhân viên Mẫu',
      }),
    );
    expect(onChange.mock.calls.at(-1)?.[0].staff['Nhân viên Mẫu']).toEqual({
      kind: 'SOURCE_LABEL_ONLY',
      confirmed: true,
    });
  });

  it('shows separate archive, catalog candidate and deferred opening counts', () => {
    render(
      <LegacyMappingPanel
        labels={{ staff: [], channel: [], customer: [], product: [] }}
        targets={targets}
        resolutions={{ staff: {}, channel: {}, customer: {}, product: {} }}
        invoiceCount={4}
        productCandidateCount={3}
        customerCandidateCount={2}
        openingSuggestionCount={3}
        onChange={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByText('4 hóa đơn lưu trữ')).toBeInTheDocument();
    expect(screen.getByText('5 ứng viên danh mục')).toBeInTheDocument();
    expect(
      screen.getByText('3 gợi ý mở sổ, chưa được ghi'),
    ).toBeInTheDocument();
  });
});
