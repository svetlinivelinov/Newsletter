/**
 * Run the newsletter send directly with Node.js — no server needed.
 * Usage: node run-newsletter.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env (strip BOM if present, handle \r\n line endings)
try {
  const env = readFileSync(join(__dirname, '.env'), 'utf8').replace(/^\uFEFF/, '');
  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key) process.env[key] = val;
  }
} catch (e) {
  console.error('.env not found:', e.message);
  process.exit(1);
}

console.log('  OPENAI_API_KEY loaded:', !!process.env.OPENAI_API_KEY);
console.log('  EMAIL_API_KEY loaded:', !!process.env.EMAIL_API_KEY);
console.log('  CRON_SECRET loaded:', !!process.env.CRON_SECRET);

console.log('\n  Running newsletter send directly...\n');

const { handler } = await import('./netlify/functions/send-newsletters-background.mjs');

const result = await handler({
  body: JSON.stringify({ next_run: new Date().toISOString() }), // pretend it's the scheduler so no auth needed
  headers: {},
});

console.log('\n  Done:', result.statusCode, result.body);
