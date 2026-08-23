import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://phuduaampsjenkreufmz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Y6DY8s-Cph3gIbEMRqWNLg_fodyJPrj';

async function fetchSchema() {
  console.log('=== FETCHING OPENAPI SCHEMA FROM SUPABASE ===');
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const schema = await response.json() as any;
    console.log('Definitions found:', Object.keys(schema.definitions || {}));
    
    // Print fields for registrations and wallet_transactions
    if (schema.definitions) {
      for (const tableName of ['registrations', 'wallet_transactions', 'wallets', 'leaderboard', 'tournaments']) {
        if (schema.definitions[tableName]) {
          console.log(`\nTable "${tableName}" fields:`);
          const props = schema.definitions[tableName].properties || {};
          console.log(Object.keys(props));
        } else {
          console.log(`\nTable "${tableName}" NOT found in definitions.`);
        }
      }
    }
  } catch (err: any) {
    console.error('Error fetching OpenAPI schema:', err?.message || err);
  }
}

fetchSchema();
