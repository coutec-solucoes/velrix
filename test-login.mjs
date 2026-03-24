import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iapvzhetbytxafseyffx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcHZ6aGV0Ynl0eGFmc2V5ZmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTI2ODUsImV4cCI6MjA4ODk4ODY4NX0.Y8XN8Z7Y-ZDk84kAOkJbI-IzpLd83MUhzLkVQNLbseM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Invoking authenticate-collaborator...');
  const { data, error } = await supabase.functions.invoke('authenticate-collaborator', {
    body: {
      companyCode: '123456789', // fake
      username: 'mirian',
      password: 'password'
    }
  });

  console.log('Result Data:', data);
  console.log('Result Error:', error);
  if (error && error.context) {
    try {
      const text = await error.context.text();
      console.log('Error Context:', text);
    } catch(e) { /* ignore */ }
  }
}

test();
