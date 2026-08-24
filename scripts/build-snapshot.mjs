import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const API='https://api.commonsmade.com/game/events/genesis';
const TARGET_LIMIT=20000;
const CONCURRENCY=16;
const output=resolve(process.argv[2]||'public/data/vouch-snapshot.json');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function request(path,attempts=5){
  let lastError;
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      const response=await fetch(`${API}${path}`,{headers:{accept:'application/json','user-agent':'CommonsVouchSnapshotAction/1.0'},signal:AbortSignal.timeout(30000)});
      if(response.ok)return response.json();
      lastError=new Error(`Commons API ${response.status}: ${path}`);
      if(![429,500,502,503,504].includes(response.status))throw lastError;
      await sleep(Number(response.headers.get('retry-after')||0)*1000||700*2**attempt);
    }catch(error){lastError=error;if(attempt<attempts-1)await sleep(Math.min(10000,700*2**attempt))}
  }
  throw lastError;
}

async function targets(boardVersion){
  const offsets=[];for(let offset=0;offset<TARGET_LIMIT;offset+=500)offsets.push(offset);
  const result=[];
  for(let cursor=0;cursor<offsets.length;cursor+=8){
    const batch=offsets.slice(cursor,cursor+8);
    const pages=await Promise.all(batch.map(offset=>request(`/leaderboard?offset=${offset}&limit=500&board_version=${boardVersion}`)));
    for(const page of pages)for(const entry of page.entries||[]){
      if(entry.user_id)result.push(`u:${entry.user_id}`);
      else if(entry.x_handle)result.push(`t:${entry.x_handle}`);
    }
    console.log(`Indexed ${Math.min(cursor+batch.length,offsets.length)}/${offsets.length} leaderboard pages`);
  }
  return [...new Set(result)].slice(0,TARGET_LIMIT);
}

async function ledger(target,boardVersion){
  const split=target.indexOf(':'),kind=target.slice(0,split),value=target.slice(split+1);
  const path=kind==='u'?`/participants/${encodeURIComponent(value)}/ledger`:`/targets/${encodeURIComponent(value)}/ledger`;
  return request(`${path}?board_version=${boardVersion}`);
}

const startedAt=new Date();
const version=await request('/leaderboard/version');
const list=await targets(version.board_version);
const counts=new Map(),failed=[];

for(let cursor=0;cursor<list.length;cursor+=CONCURRENCY){
  const batch=list.slice(cursor,cursor+CONCURRENCY);
  const results=await Promise.all(batch.map(async target=>{try{return{target,data:await ledger(target,version.board_version)}}catch(error){return{target,error:error.message}}}));
  for(const result of results){
    if(result.error){failed.push(result.target);continue}
    for(const entry of result.data.entries||[]){
      if(entry.kind!=='vouch'||!entry.author_handle)continue;
      const key=entry.author_handle.toLowerCase();
      counts.set(key,(counts.get(key)||0)+1);
    }
  }
  if(cursor%400===0)console.log(`Scanned ${Math.min(cursor+batch.length,list.length)}/${list.length}; failed ${failed.length}`);
  await sleep(40);
}

const snapshot={
  generated_at:new Date().toISOString(),
  scan_started_at:startedAt.toISOString(),
  board_version:version.board_version,
  target_limit:TARGET_LIMIT,
  targets_scanned:list.length,
  failed_targets:failed.length,
  duration_seconds:Math.round((Date.now()-startedAt.getTime())/1000),
  counts:Object.fromEntries(counts)
};
await mkdir(dirname(output),{recursive:true});
const temp=`${output}.tmp`;
await writeFile(temp,JSON.stringify(snapshot));
await rename(temp,output);
console.log(`Snapshot written: ${output}; authors ${counts.size}; failed ${failed.length}`);
