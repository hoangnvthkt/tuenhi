export function PurchasePrefillIntent({ warning }: { warning: string | null }) {
  if (!warning) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      {warning}
    </p>
  );
}
