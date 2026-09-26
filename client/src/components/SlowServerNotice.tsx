import { useEffect, useState } from 'react';

const DELAY_MS = 3_000;

/**
 * Shown while something is still loading after a few seconds. On a free hosting plan the
 * server sleeps when idle, and the first request after that can take about a minute.
 */
export default function SlowServerNotice() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!slow) return null;
  return (
    <p className="slow-notice" role="status">
      Waking up the server. After a quiet spell this can take up to a minute.
    </p>
  );
}
