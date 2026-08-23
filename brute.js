const SUPABASE_URL = 'https://phuduaampsjenkreufmz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Y6DY8s-Cph3gIbEMRqWNLg_fodyJPrj';

const users = ['p_user_id', 'user_id', 'userId', 'uid', 'p_uid', 'uuid'];
const amounts = ['p_amount', 'amount', 'amt', 'p_amt', 'numeric'];
const texts = ['p_description', 'description', 'p_note', 'note', 'p_admin_note', 'admin_note', 'p_notes', 'notes', 'text', 'reason', 'p_reason'];

async function run() {
  for (let u of users) {
    for (let a of amounts) {
      for (let t of texts) {
        const body = {};
        body[u] = '00000000-0000-0000-0000-000000000000';
        body[a] = 10;
        body[t] = 'test';
        
        const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/admin_adjust_winning', {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.code !== 'PGRST202') {
          console.log(`FOUND: ${u}, ${a}, ${t}`);
          console.log(data);
          return;
        }
      }
    }
  }
  console.log("Not found among combinations.");
}
run();
