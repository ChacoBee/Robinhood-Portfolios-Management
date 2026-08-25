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
        <span aria-hidden="true">{hidden ? '◉' : '◌'}</span>
      </button>
      <span aria-live="polite" className="sr-only" role="status">
        Financial values {hidden ? 'hidden' : 'visible'}
      </span>
    </>
  );
}
