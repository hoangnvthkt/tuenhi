import type { ProductBundle } from '@/features/catalog';
import './pos-drafts.css';

export function PosBundlePicker({
  status,
  bundles,
  warning,
  onPick,
  onRetry,
}: {
  status: 'loading' | 'error' | 'ready';
  bundles: ProductBundle[];
  warning: string | null;
  onPick: (bundle: ProductBundle) => void;
  onRetry: () => void;
}) {
  if (status === 'error')
    return (
      <p role="alert" className="pos-bundles-note">
        Không tải được gói hàng.{' '}
        <button type="button" onClick={onRetry}>
          Thử lại
        </button>
      </p>
    );
  if (status === 'loading')
    return (
      <div
        role="status"
        aria-label="Đang tải gói hàng"
        className="pos-bundles-skeleton"
      />
    );
  if (!bundles.length) return null;
  return (
    <>
      <div className="pos-bundles" role="group" aria-label="Gói hàng">
        {bundles.map((bundle) => (
          <button key={bundle.id} type="button" onClick={() => onPick(bundle)}>
            {bundle.name}
            <span>{bundle.lines.length}</span>
          </button>
        ))}
      </div>
      {warning ? (
        <p role="status" className="pos-bundles-note">
          {warning}
        </p>
      ) : null}
    </>
  );
}
