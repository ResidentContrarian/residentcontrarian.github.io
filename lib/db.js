// lib/db.js
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export const sql = neon(process.env.DATABASE_URL);

/**
 * Small helper to parse CSV query params into an array of non-empty, trimmed strings.
 */
export function parseCSV(value) {
  if (!value) return [];
  return value
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}
