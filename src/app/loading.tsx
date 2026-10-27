export default function Loading() {
  return (
    <main className="content loading-page" aria-busy="true" aria-label="Loading HydroSite">
      <div className="loading-skeleton loading-title" />
      <div className="metrics-grid">{Array.from({ length: 4 }, (_, index) => <div className="loading-skeleton loading-metric" key={index} />)}</div>
      <div className="loading-skeleton loading-map" />
    </main>
  );
}
