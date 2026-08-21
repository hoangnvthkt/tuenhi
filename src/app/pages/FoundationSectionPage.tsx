type FoundationSectionPageProps = {
  title: string;
  description: string;
};

export function FoundationSectionPage({
  title,
  description,
}: FoundationSectionPageProps) {
  return (
    <section aria-labelledby="section-title">
      <h1 id="section-title" className="text-2xl font-semibold text-slate-950">
        {title}
      </h1>
      <p className="mt-3 max-w-prose text-slate-600">{description}</p>
    </section>
  );
}
