import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iapvzhetbytxafseyffx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcHZ6aGV0Ynl0eGFmc2V5ZmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTI2ODUsImV4cCI6MjA4ODk4ODY4NX0.Y8XN8Z7Y-ZDk84kAOkJbI-IzpLd83MUhzLkVQNLbseM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testView() {
  console.log('Testando view users_secure...');
  const { data, error } = await supabase.from('users_secure').select('*').limit(1);
  console.log('Result:', { data, error });
}

testView();
