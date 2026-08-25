'use client';

import { useScreenPrivacy } from '../../lib/privacy/privacy-context';

export function ScreenPrivacyToggle() {
  const { hidden, toggle } = useScreenPrivacy();

  return (
    <>
      <button
        aria-label={hidden ? 'Show financial values' : 'Hide financial values'}
        aria-pressed={hidden}
        className="icon-button privacy-toggle"
        onClick={toggle}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          {hidden ? (
            <path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.3A10.8 10.8 0 0 1 12 4c5.4 0 9 5.3 9 5.3a13.4 13.4 0 0 1-2.2 2.8M6.2 6.2A14.8 14.8 0 0 0 3 9.3S6.6 14.7 12 14.7c.7 0 1.4-.1 2-.3" />
          ) : (
            <><path d="M3 12s3.6-5.3 9-5.3 9 5.3 9 5.3-3.6 5.3-9 5.3S3 12 3 12Z" /><circle cx="12" cy="12" r="2.5" /></>
          )}
        </svg>
      </button>
      <span aria-live="polite" className="sr-only" role="status">
        Financial values {hidden ? 'hidden' : 'visible'}
      </span>
    </>
  );
}
