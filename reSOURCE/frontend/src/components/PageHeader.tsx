interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

/** Consistent page title block used by every non-home page. */
export default function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="max-w-2xl">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">{eyebrow}</p>
      ) : null}
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">{title}</h1>
      {description ? (
        <p className="mt-4 text-sm leading-relaxed text-stone-600 sm:text-base">{description}</p>
      ) : null}
    </header>
  );
}
