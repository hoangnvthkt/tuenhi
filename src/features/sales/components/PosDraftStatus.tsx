export function PosDraftStatus({
  draftId,
  updatedAt,
  dirty,
  saving,
  saveFailed,
  localSaved,
  canEdit,
}: {
  draftId: string | null;
  updatedAt: string | null;
  dirty: boolean;
  saving: boolean;
  saveFailed: boolean;
  localSaved: boolean;
  canEdit: boolean;
}) {
  const label = !canEdit
    ? 'Đang xem · giỏ do tab khác chỉnh sửa'
    : saving
      ? 'Đang lưu…'
      : saveFailed
        ? 'Lưu chưa thành công'
        : draftId
          ? dirty
            ? 'Có thay đổi chưa lưu'
            : 'Đã lưu lên hệ thống'
          : localSaved
            ? 'Chỉ lưu trên máy này'
            : 'Chưa lưu';
  return (
    <div
      role="status"
      className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700"
    >
      <span className="font-medium">{label}</span>
      {draftId ? (
        <span> · Nháp {draftId.slice(0, 8).toUpperCase()}</span>
      ) : null}
      {updatedAt && Number.isFinite(Date.parse(updatedAt)) ? (
        <span>
          {' '}
          · Lưu hệ thống lúc{' '}
          <time dateTime={updatedAt}>
            {new Intl.DateTimeFormat('vi-VN', {
              dateStyle: 'short',
              timeStyle: 'short',
            }).format(new Date(updatedAt))}
          </time>
        </span>
      ) : null}
    </div>
  );
}
