import { createClient } from '@supabase/supabase-js';
import { config } from './config';

// Service-role client: bypasses RLS. Only ever used on the server.
export const db = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
