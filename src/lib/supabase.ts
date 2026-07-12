import { createClient } from "@supabase/supabase-js";

/**
 * Single browser client for the whole SPA. Session persists in
 * localStorage (no SSR cookies — this app has no server).
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
