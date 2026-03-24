import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iapvzhetbytxafseyffx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcHZ6aGV0Ynl0eGFmc2V5ZmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTI2ODUsImV4cCI6MjA4ODk4ODY4NX0.Y8XN8Z7Y-ZDk84kAOkJbI-IzpLd83MUhzLkVQNLbseM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testConnection() {
  console.log("Testing connection...");
  try {
    const url = SUPABASE_URL.replace(/\/$/, '');
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    console.log("REST Response:", res.status, res.statusText);
    
    // Test if 'profiles' table exists
    const { data, error } = await supabase.from('profiles').select('*').limit(1);
    console.log("Profiles table check:", error ? error.message : "Exists!");
    
    // Test if 'companies' table exists
    const { data: cData, error: cError } = await supabase.from('companies').select('*').limit(1);
    console.log("Companies table check:", cError ? cError.message : "Exists!");

  } catch (err) {
    console.error("Connection Failed:", err);
  }
}

testConnection();
