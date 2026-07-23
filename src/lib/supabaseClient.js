import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bptdnmwgcnkmdeefscmh.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_5i1MPZ2CekUqCiAlUsBKBA_esn305Bq';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
