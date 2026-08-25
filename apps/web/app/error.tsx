'use client';

import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Aurum route failed', { name: error.name, digest: error.digest });
  }, [error]);
  return (
    <main className="dashboard-main">
      <section className="error-state" role="alert">
        <span className="source-badge is-error">Connected source unavailable</span>
        <h1>Portfolio data could not be loaded</h1>
        <p>Aurum did not substitute synthetic values. Check the app connection, then try the request again.</p>
        <button className="primary-button" onClick={reset} type="button">Try again</button>
      </section>
    </main>
  );
}
