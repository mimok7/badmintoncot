const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('c:\\SHT-DATA\\badmintoncot\\.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[key] = value.trim();
  }
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);

async function testColumns() {
  try {
    const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
    if (error) {
      console.error('Error fetching settings:', error.message);
    } else {
      console.log('Settings data record keys:', Object.keys(data));
      console.log('Full settings record:', data);
    }
  } catch (e) {
    console.error(e);
  }
}

testColumns();
