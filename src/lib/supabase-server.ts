// src/lib/supabase-server.ts
import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Server-side Supabase client backed by the service role key.
 * Never imported from client components (guarded by 'server-only').
 * Returns null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not
 * configured, so local development and deployments without the DB keep
 * working (history/sharing gracefully degrade).
 */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Stable regex for the anonymous device ids we generate (UUID v4). */
export const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
