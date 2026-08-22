import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NumericField } from './NumericField';

function QuantityHarness({ required = true }: { required?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <>
      <NumericField
        label="Số lượng"
        value={value}
        onChange={setValue}
        kind="quantity"
        precision={18}
        required={required}
      />
      <output aria-label="Giá trị canonical">{value}</output>
    </>
  );
}

describe('NumericField', () => {
  it('uses a text input with decimal keyboard hint and a visible label', () => {
    render(<QuantityHarness />);

    const input = screen.getByLabelText('Số lượng');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'decimal');
  });

  it('keeps the previous value and shows Vietnamese copy for invalid paste', async () => {
    const user = userEvent.setup();
    render(<QuantityHarness />);
    const input = screen.getByLabelText('Số lượng');

    await user.type(input, '12.5');
    await user.click(input);
    await user.paste(' kg');

    expect(screen.getByLabelText('Giá trị canonical')).toHaveTextContent(
      '12.5',
    );
    expect(
      screen.getByText('Chỉ nhập chữ số và dấu chấm cho phần thập phân.'),
    ).toBeInTheDocument();
  });

  it('allows a trailing period while editing and rejects it on blur', async () => {
    const user = userEvent.setup();
    render(<QuantityHarness />);
    const input = screen.getByLabelText('Số lượng');

    await user.type(input, '12.');
    expect(screen.getByLabelText('Giá trị canonical')).toHaveTextContent('12.');
    await user.tab();

    expect(
      screen.getByText('Chỉ nhập chữ số và dấu chấm cho phần thập phân.'),
    ).toBeInTheDocument();
  });

  it('does not convert an empty optional field to zero', async () => {
    const user = userEvent.setup();
    render(<QuantityHarness required={false} />);

    await user.click(screen.getByLabelText('Số lượng'));
    await user.tab();

    expect(screen.getByLabelText('Giá trị canonical')).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
