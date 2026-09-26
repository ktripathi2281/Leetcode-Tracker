import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom doesn't implement scrolling.
window.scrollTo = vi.fn() as typeof window.scrollTo;

afterEach(() => cleanup());
