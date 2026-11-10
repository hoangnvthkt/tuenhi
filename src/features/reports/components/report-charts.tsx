import { Link } from 'react-router';
import { donutSlices } from '../model/donut';
import type { RevenueReport, TopProducts } from '../api/report-schemas';
import {
  maxMoney,
  moneyShare,
  revenueBuckets,
  revenueFlow,
} from '../model/report-charts';
import { formatReportMoney, formatReportNumber } from '../model/report-ui';
import './report-charts.css';

function shortMoney(value: string) {
  const [integer = '0'] = value.replace('-', '').split('.');
  const sign = value.startsWith('-') ? '-' : '';
  const amount = BigInt(integer || '0');
  if (amount >= 1_000_000n) {
    const tenth = (amount % 1_000_000n) / 100_000n;
    return `${sign}${formatReportNumber((amount / 1_000_000n).toString(), 0)}${tenth ? `,${tenth}` : ''}tr`;
  }
  if (amount >= 1_000n) return `${sign}${(amount + 500n) / 1_000n}k`;
  return `${sign}${amount}`;
}

export function ReportKpis({
  items,
}: {
  items: { label: string; value: string; tone?: 'revenue' | 'profit' }[];
}) {
  return (
    <div className="rpt-kpis">
      {items.map((item) => (
        <div key={item.label} className="rpt-card">
          <p className="rpt-kpi-label">{item.label}</p>
          <p className={`rpt-kpi-value ${item.tone ? `rpt-${item.tone}` : ''}`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function RevenueByDayChart({
  daily,
  from,
  to,
  linkFor,
}: {
  daily: RevenueReport['daily'];
  from: string;
  to: string;
  linkFor: (from: string, to: string) => string;
}) {
  const buckets = revenueBuckets(daily, from, to);
  if (buckets.length < 2) return null;
  const max = maxMoney(buckets.map((bucket) => bucket.netRevenue));
  const monthly = buckets[0]!.from !== buckets[0]!.to;
  return (
    <section className="rpt-card" aria-label="Doanh thu theo ngày">
      <h2 className="rpt-title">
        {monthly ? 'Doanh thu theo tháng' : 'Doanh thu theo ngày'}
      </h2>
      <div className="rpt-bars">
        {buckets.map((bucket) => {
          const height = moneyShare(bucket.netRevenue, max);
          return (
            <Link
              key={bucket.key}
              to={linkFor(bucket.from, bucket.to)}
              className="rpt-bar"
              aria-label={`${bucket.label}: ${formatReportMoney(bucket.netRevenue)}`}
              title={`${bucket.label}: ${formatReportMoney(bucket.netRevenue)}`}
            >
              {height > 0 && buckets.length <= 14 ? (
                <span className="rpt-bar-value">
                  {shortMoney(bucket.netRevenue)}
                </span>
              ) : null}
              <span
                className="rpt-bar-fill"
                style={{ height: `${Math.max(height, 1)}%` }}
                data-empty={height === 0 || undefined}
              />
              <span className="rpt-bar-label">{bucket.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function RevenueFlowCard({
  summary,
  returnsLink,
}: {
  summary: RevenueReport['summary'];
  returnsLink: string;
}) {
  return (
    <section
      id="returns"
      className="rpt-card"
      aria-label="Tiền bán ra → Doanh thu"
    >
      <h2 className="rpt-title">Tiền bán ra → Doanh thu</h2>
      <div className="rpt-flow">
        {revenueFlow(summary).map((row) => {
          const deduction =
            row.key === 'discounts' ||
            row.key === 'returns' ||
            row.key === 'cancellations';
          const label =
            row.key === 'returns' ? (
              <Link to={returnsLink}>{row.label}</Link>
            ) : (
              row.label
            );
          return (
            <div key={row.key} className={`rpt-flow-row rpt-flow-${row.key}`}>
              <span className="rpt-flow-label">{label}</span>
              <span className="rpt-flow-track">
                <span
                  className="rpt-flow-fill"
                  style={{
                    marginLeft: `${row.offset}%`,
                    width: `${row.width}%`,
                  }}
                />
              </span>
              <strong className="rpt-flow-amount">
                {deduction && row.width > 0 ? '−' : ''}
                {formatReportMoney(row.amount)}
              </strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function TopProductsCard({
  status,
  data,
  linkFor,
}: {
  status: 'loading' | 'error' | 'ready';
  data?: TopProducts;
  linkFor: (productId: string) => string;
}) {
  const items = data?.items ?? [];
  const max = maxMoney(items.map((item) => item.netRevenue));
  const shares = data
    ? donutSlices([
        ...items.map((item) => item.netRevenue),
        data.otherNetRevenue,
      ])
    : [];
  return (
    <section className="rpt-card" aria-label="Bán chạy">
      <h2 className="rpt-title">Bán chạy</h2>
      {status === 'loading' ? (
        <div
          role="status"
          aria-label="Đang tải bán chạy"
          className="rpt-skeleton"
        />
      ) : status === 'error' ? (
        <p role="alert" className="rpt-muted">
          Không tải được số liệu.
        </p>
      ) : !items.length ? (
        <p className="rpt-muted">Chưa có sản phẩm bán ra trong kỳ.</p>
      ) : (
        <ol className="rpt-top">
          {items.map((item, index) => (
            <li key={item.productId}>
              <Link to={linkFor(item.productId)} className="rpt-top-row">
                <span className="rpt-top-name">
                  {index + 1}. {item.productName}
                </span>
                <span className="rpt-flow-track">
                  <span
                    className="rpt-flow-fill"
                    style={{ width: `${moneyShare(item.netRevenue, max)}%` }}
                  />
                </span>
                <strong className="rpt-flow-amount">
                  {formatReportMoney(item.netRevenue)}
                </strong>
                <span className="rpt-top-meta">
                  {formatReportNumber(item.quantity, 0)} {item.unitName}
                  {shares[index]?.percent ? ` · ${shares[index]!.percent}` : ''}
                </span>
              </Link>
            </li>
          ))}
          {data && data.otherProductCount > 0 ? (
            <li className="rpt-top-other">
              Khác ({formatReportNumber(String(data.otherProductCount), 0)} sản
              phẩm): {formatReportMoney(data.otherNetRevenue)}
            </li>
          ) : null}
        </ol>
      )}
    </section>
  );
}
