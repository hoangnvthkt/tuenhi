import { X } from '@phosphor-icons/react';
import { Link } from 'react-router';
import { formatPosMoney } from '../model/format-money';
import './pos-drafts.css';

type DraftItem = {
  id: string;
  customerName: string | null;
  netTotal: string;
  createdByName: string;
  sortAt: string;
};

const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});

export function PosDraftsPanel({
  status,
  items,
  hasMore,
  currentSaleId,
  open,
  onRetry,
  onClose,
}: {
  status: 'loading' | 'error' | 'ready';
  items: DraftItem[];
  hasMore: boolean;
  currentSaleId?: string;
  open: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <>
      {open ? (
        <button
          type="button"
          className="pos-drafts-backdrop"
          aria-label="Đóng danh sách đơn tạm"
          onClick={onClose}
        />
      ) : null}
      <aside
        aria-label="Đơn tạm"
        className={`pos-drafts ${open ? 'pos-drafts-open' : ''}`}
      >
        <div className="pos-drafts-head">
          <h2>
            Đơn tạm
            {status === 'ready' ? (
              <span className="pos-drafts-count">
                {items.length}
                {hasMore ? '+' : ''}
              </span>
            ) : null}
          </h2>
          <button
            type="button"
            className="pos-drafts-close"
            aria-label="Đóng"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {status === 'loading' ? (
          <div role="status" aria-label="Đang tải đơn tạm">
            <div className="pos-drafts-skeleton" />
            <div className="pos-drafts-skeleton" />
          </div>
        ) : status === 'error' ? (
          <p role="alert" className="pos-drafts-note">
            Không tải được đơn tạm.{' '}
            <button type="button" onClick={onRetry}>
              Thử lại
            </button>
          </p>
        ) : !items.length ? (
          <p className="pos-drafts-note">Chưa có đơn tạm.</p>
        ) : (
          <ul className="pos-drafts-list">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/pos/${item.id}`}
                  onClick={onClose}
                  aria-current={item.id === currentSaleId ? 'page' : undefined}
                  className="pos-drafts-row"
                >
                  <span className="pos-drafts-name">
                    {item.customerName ?? 'Khách lẻ'}
                  </span>
                  <strong>{formatPosMoney(item.netTotal)}</strong>
                  <span className="pos-drafts-meta">
                    {item.createdByName} ·{' '}
                    {timeFormat.format(new Date(item.sortAt))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {hasMore ? (
          <Link to="/sales?status=DRAFT" className="pos-drafts-more">
            Xem tất cả
          </Link>
        ) : null}
      </aside>
    </>
  );
}
