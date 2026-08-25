import Link from 'next/link';

export function EmptyState({ title, description, href, action }: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <section className="empty-state">
      <span aria-hidden="true">A</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {href && action ? <Link className="secondary-button link-button" href={href}>{action}</Link> : null}
    </section>
  );
}
