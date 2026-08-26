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
  it('uses a text input with integer keyboard hint and a visible label', () => {
    render(<QuantityHarness />);

    const input = screen.getByLabelText('Số lượng');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  it('keeps the previous value and shows Vietnamese copy for invalid paste', async () => {
    const user = userEvent.setup();
    render(<QuantityHarness />);
    const input = screen.getByLabelText('Số lượng');

    await user.type(input, '12');
    await user.click(input);
    await user.paste('.5');

    expect(screen.getByLabelText('Giá trị canonical')).toHaveTextContent('12');
    expect(
      screen.getByText('Số lượng chỉ được là số nguyên.'),
    ).toBeInTheDocument();
  });

  it('rejects a trailing period while editing', async () => {
    const user = userEvent.setup();
    render(<QuantityHarness />);
    const input = screen.getByLabelText('Số lượng');

    await user.type(input, '12.');
    expect(screen.getByLabelText('Giá trị canonical')).toHaveTextContent('12');

    expect(
      screen.getByText('Số lượng chỉ được là số nguyên.'),
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
