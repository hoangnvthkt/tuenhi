import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { DONUT_RADIUS, donutSlices } from '../model/donut';

export type DonutPart = {
  key: string;
  label: string;
  /** Canonical decimal string used for the share. */
  value: string;
  /** Formatted number shown in the legend. */
  display: string;
  color: string;
  to: string;
  icon?: ReactNode;
};

export function DonutCard({
  title,
  centerLabel,
  centerValue,
  parts,
  status,
  emptyText,
}: {
  title: string;
  centerLabel: string;
  centerValue: string;
  parts: DonutPart[];
  status: 'loading' | 'error' | 'ready';
  emptyText: string;
}) {
  const navigate = useNavigate();
  const slices = donutSlices(parts.map((part) => part.value));
  const empty = status === 'ready' && slices.every((slice) => !slice.visible);
  return (
    <article
      aria-label={title}
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      {status === 'loading' ? (
        <div
          role="status"
          aria-label={`Đang tải ${title.toLowerCase()}`}
          className="mx-auto size-44 animate-pulse rounded-full border-[22px] border-slate-200"
        />
      ) : status === 'error' ? (
        <p role="alert" className="text-sm text-red-800">
          Không tải được số liệu.
        </p>
      ) : (
        <>
          <svg
            viewBox="0 0 160 160"
            className="mx-auto size-44"
            aria-hidden="true"
          >
            {empty ? (
              <circle
                cx="80"
                cy="80"
                r={DONUT_RADIUS}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="22"
              />
            ) : null}
            {parts.map((part, index) => {
              const slice = slices[index]!;
              return slice.visible ? (
                <circle
                  key={part.key}
                  data-slice={part.key}
                  cx="80"
                  cy="80"
                  r={DONUT_RADIUS}
                  fill="none"
                  stroke={part.color}
                  strokeWidth="22"
                  strokeDasharray={slice.dashArray}
                  strokeDashoffset={slice.dashOffset}
                  transform="rotate(-90 80 80)"
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  onClick={() => void navigate(part.to)}
                >
                  <title>{`${part.label}: ${part.display} (${slice.percent})`}</title>
                </circle>
              ) : null;
            })}
            <text
              x="80"
              y="74"
              textAnchor="middle"
              fontSize="10"
              fill="#475569"
            >
              {centerLabel}
            </text>
            <text
              x="80"
              y="92"
              textAnchor="middle"
              fontSize={centerValue.length > 11 ? 12 : 15}
              fontWeight="700"
              fill="#0f172a"
            >
              {centerValue}
            </text>
          </svg>
          {empty ? (
            <p className="text-center text-sm text-slate-600">{emptyText}</p>
          ) : null}
          <ul className="flex flex-col">
            {parts.map((part, index) => (
              <li key={part.key} className="border-t border-slate-100">
                <Link
                  to={part.to}
                  aria-label={`${part.label}: ${part.display}${slices[index]!.percent ? ` (${slices[index]!.percent})` : ''}`}
                  className="flex min-h-11 items-center gap-3 rounded px-1 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700"
                >
                  {part.icon ?? (
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded"
                      style={{ background: part.color }}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                    {part.label}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-slate-950">
                    {part.display}
                  </span>
                  <span className="w-11 text-right text-xs tabular-nums text-slate-600">
                    {slices[index]!.percent}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
