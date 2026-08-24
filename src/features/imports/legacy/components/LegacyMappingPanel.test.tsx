import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LegacyMappingPanel } from './LegacyMappingPanel';
import { proposeLegacyResolutions } from '../model/legacy-mapping';

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
  it('keeps every rapid mapping confirmation in controlled state', async () => {
    function Harness() {
      const [value, setValue] = useState(
        proposeLegacyResolutions(labels, {
          staff: [],
          channel: [],
          customer: [],
          product: [],
        }),
      );
      return (
        <LegacyMappingPanel
          labels={labels}
          targets={{ staff: [], channel: [], customer: [], product: [] }}
          resolutions={value}
          invoiceCount={1}
          productCandidateCount={0}
          customerCandidateCount={0}
          openingSuggestionCount={0}
          onChange={setValue}
          onContinue={vi.fn()}
        />
      );
    }
    render(<Harness />);
    for (const select of screen.getAllByRole('combobox', { name: /^Ghép/ })) {
      await userEvent.selectOptions(select, 'SOURCE_LABEL_ONLY');
    }
    for (const checkbox of screen.getAllByRole('checkbox', {
      name: /^Xác nhận/,
    })) {
      await userEvent.click(checkbox);
    }
    expect(
      screen.getByRole('button', { name: 'Kiểm tra dữ liệu cũ' }),
    ).toBeEnabled();
  });

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
    const selectUpdate = onChange.mock.calls.at(-1)?.[0];
    const changed = selectUpdate(resolutions);
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
    const confirmUpdate = onChange.mock.calls.at(-1)?.[0];
    expect(confirmUpdate(changed).staff['Nhân viên Mẫu']).toEqual({
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
