export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading portfolio" className="dashboard-main">
      <div className="loading-line skeleton" />
      <div className="loading-hero skeleton" />
      <div className="loading-grid"><div className="loading-panel skeleton" /><div className="loading-panel skeleton" /></div>
      <span className="sr-only">Loading portfolio data</span>
    </main>
  );
}
