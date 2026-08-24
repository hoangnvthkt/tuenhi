import { normalizeImportHeader } from '../../model/header-normalization';
import type { LegacyResolution } from './legacy-q237-contract';
import { proposeLegacyChannelCode } from '../parser/legacy-q237-parser';

export type LegacyLabelKind = 'staff' | 'channel' | 'customer' | 'product';
export type LegacyLabels = Record<LegacyLabelKind, string[]>;
export type LegacyTargetOption = { id: string; label: string; code?: string };
export type LegacyTargets = Record<LegacyLabelKind, LegacyTargetOption[]>;
export type LegacyResolutions = Record<
  LegacyLabelKind,
  Record<string, LegacyResolution | null>
>;

function exactOption(
  kind: LegacyLabelKind,
  label: string,
  options: LegacyTargetOption[],
) {
  if (kind === 'channel') {
    const proposedCode = proposeLegacyChannelCode(label);
    if (proposedCode) {
      return options.find((option) => option.code === proposedCode) ?? null;
    }
  }
  const normalized = normalizeImportHeader(label);
  return (
    options.find(
      (option) =>
        normalizeImportHeader(option.code ?? '') === normalized ||
        normalizeImportHeader(option.label) === normalized,
    ) ?? null
  );
}

export function proposeLegacyResolutions(
  labels: LegacyLabels,
  targets: LegacyTargets,
): LegacyResolutions {
  return Object.fromEntries(
    (Object.keys(labels) as LegacyLabelKind[]).map((kind) => [
      kind,
      Object.fromEntries(
        labels[kind].map((label) => {
          const proposal = exactOption(kind, label, targets[kind]);
          return [
            label,
            proposal
              ? {
                  kind: 'TARGET' as const,
                  targetId: proposal.id,
                  confirmed: false,
                }
              : null,
          ];
        }),
      ),
    ]),
  ) as LegacyResolutions;
}

export function legacyResolutionsReady(
  labels: LegacyLabels,
  resolutions: LegacyResolutions,
) {
  return (Object.keys(labels) as LegacyLabelKind[]).every((kind) =>
    labels[kind].every((label) => resolutions[kind][label]?.confirmed === true),
  );
}
