import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iapvzhetbytxafseyffx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcHZ6aGV0Ynl0eGFmc2V5ZmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTI2ODUsImV4cCI6MjA4ODk4ODY4NX0.Y8XN8Z7Y-ZDk84kAOkJbI-IzpLd83MUhzLkVQNLbseM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser() {
  console.log('Testando acessar users_secure diretamente...');
  const { data, error } = await supabase
    .from('users_secure')
    .select('*')
    .eq('company_id', 'eeabd7ee-005d-440c-a9fa-5164acfbdc4e');
  console.log('Result:', JSON.stringify({ data, error }, null, 2));
}

checkUser();
