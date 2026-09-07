/** A route that exists so navigation is complete, but whose view has not been built yet. */
export function PlaceholderView({ title, note }: { title: string; note: string }) {
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body">
        <h1 className="card-title text-base">{title}</h1>
        <p className="text-sm opacity-70">{note}</p>
      </div>
    </section>
  );
}
