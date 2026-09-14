import {writeFileSync, existsSync} from 'node:fs';
const [slug, databaseId, email, domain, audience]=process.argv.slice(2);
if(!/^[a-z][a-z0-9-]{2,35}$/.test(slug??'') || !/^[a-f0-9-]{36}$/i.test(databaseId??'') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email??'') || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain??'') || !/^[a-f0-9]{64}$/.test(audience??'')) {
 console.error('Usage: node scripts/create-team-config.mjs <slug> <D1 UUID> <admin email> <Access team domain> <Access AUD>'); process.exit(1);
}
const name=`crm-${slug}`, file=`wrangler.${slug}.json`;
if(existsSync(file))throw Error('Config already exists; refusing to overwrite');
const queues=['line-events','campaigns'];
const config={name,main:'src/index.ts',compatibility_date:'2026-09-11',compatibility_flags:['nodejs_compat'],workers_dev:true,preview_urls:false,assets:{directory:'./public',binding:'ASSETS',run_worker_first:true,html_handling:'none'},d1_databases:[{binding:'DB',database_name:name,database_id:databaseId,migrations_dir:'migrations'}],vars:{ENVIRONMENT:'production',LINE_DELIVERY_MODE:'disabled',PUBLIC_BASE_URL:'',OPENAI_MODEL:'gpt-5.6-luna',ADMIN_EMAIL:email,ACCESS_TEAM_DOMAIN:domain,ACCESS_AUD:audience},queues:{producers:queues.map((q,i)=>({binding:i?'CAMPAIGN_EVENTS':'LINE_EVENTS',queue:`${name}-${q}`})),consumers:queues.map(q=>({queue:`${name}-${q}`,max_batch_size:1,max_batch_timeout:1,max_retries:5,dead_letter_queue:`${name}-${q}-dead`,max_concurrency:1,retry_delay:5}))},triggers:{crons:['*/5 * * * *']},observability:{enabled:true}};
writeFileSync(file,JSON.stringify(config,null,2)+'\n');
console.log(`Created ${file}. Provision its database and four queues, configure Access and secrets, set PUBLIC_BASE_URL, then deploy with --config ${file}. Enable live LINE delivery only after team settings and qualification checks are ready.`);
