// Server-only. Never import this from a "use client" component - the
// service role key bypasses Row Level Security and must stay on the server.
import { createClient } from '@supabase/supabase-js';

let cachedClient = null;

export function supabaseAdmin() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }

  // Next.js 14 caches fetch() responses on the server. Without this, a report
  // or Excel download can be built from an older copy of the database rows
  // while another page shows the newer ones. Never cache database reads.
  cachedClient = createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (input, init = {}) => fetch(input, { ...init, cache: 'no-store' }) },
  });
  return cachedClient;
}
