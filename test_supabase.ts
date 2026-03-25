import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://iapvzhetbytxafseyffx.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcHZ6aGV0Ynl0eGFmc2V5ZmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTI2ODUsImV4cCI6MjA4ODk4ODY4NX0.Y8XN8Z7Y-ZDk84kAOkJbI-IzpLd83MUhzLkVQNLbseM');

async function test() {
  const { data, error } = await supabase.from('cobradores').select('id').limit(0);
  console.log('Data:', data);
  console.log('Error:', error);
}

test();
