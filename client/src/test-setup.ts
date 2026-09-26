import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom doesn't implement scrolling. Return a Promise like current browsers do, so an
// effect that accidentally returns scrollTo's result fails here too.
window.scrollTo = vi.fn(() => Promise.resolve()) as unknown as typeof window.scrollTo;

afterEach(() => cleanup());
