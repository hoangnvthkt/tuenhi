import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PosDraftStatus } from './PosDraftStatus';
it('distinguishes device storage, server save, dirty and failed saves', () => {
  const props = {
    draftId: null as string | null,
    updatedAt: null as string | null,
    dirty: true,
    saving: false,
    saveFailed: false,
    localSaved: true,
    canEdit: true,
  };
  const view = render(<PosDraftStatus {...props} />);
  expect(screen.getByRole('status')).toHaveTextContent('Chỉ lưu trên máy này');
  view.rerender(
    <PosDraftStatus
      {...props}
      draftId="12345678-abcd"
      updatedAt="2026-10-04T08:00:00Z"
      dirty={false}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Đã lưu lên hệ thống');
  view.rerender(<PosDraftStatus {...props} draftId="12345678-abcd" />);
  expect(screen.getByRole('status')).toHaveTextContent('Có thay đổi chưa lưu');
  view.rerender(<PosDraftStatus {...props} saveFailed />);
  expect(screen.getByRole('status')).toHaveTextContent('Lưu chưa thành công');
  view.rerender(<PosDraftStatus {...props} saving />);
  expect(screen.getByRole('status')).toHaveTextContent('Đang lưu');
  view.rerender(<PosDraftStatus {...props} localSaved={false} />);
  expect(screen.getByRole('status')).not.toHaveTextContent(
    'Chỉ lưu trên máy này',
  );
  view.rerender(<PosDraftStatus {...props} canEdit={false} />);
  expect(screen.getByRole('status')).toHaveTextContent('Đang xem');
});
