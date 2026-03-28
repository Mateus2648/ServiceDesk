import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL and Anon Key are required. Please check your .env file.");
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Auth Helpers
export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

// Types for Supabase (matching our schema)
export type Tables = {
  profiles: {
    id: string;
    full_name: string;
    email: string;
    role: 'USER' | 'TECH' | 'ADMIN' | 'PENDING';
    secretariat: string;
  };
  tickets: {
    id: string;
    title: string;
    description: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'FINISHED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    category: string;
    created_by: string;
    assigned_to: string | null;
    secretariat: string;
    created_at: string;
    updated_at: string;
    ai_suggestion: string;
  };
  interactions: {
    id: string;
    ticket_id: string;
    user_id: string;
    content: string;
    is_internal: boolean;
    created_at: string;
  };
  audit_logs: {
    id: string;
    ticket_id: string | null;
    user_id: string;
    action: string;
    previous_state: any;
    new_state: any;
    created_at: string;
  };
};
