import axios from 'axios';

// Same-origin '/api' in development (proxied by Vite); set VITE_API_URL in production.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});
