import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=fileURLToPath(new URL('./public/',import.meta.url));
const SNAPSHOT_FILE=fileURLToPath(new URL('./public/data/vouch-snapshot.json',import.meta.url));
const API='https://api.commonsmade.com/game/events/genesis';
const PORT=Number(process.env.PORT||3000);
const cache=new Map();
let snapshot=null;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};

function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))}
async function commons(path,ttl=15000){
  const hit=cache.get(path);if(hit&&hit.until>Date.now())return hit.data;
  const response=await fetch(API+path,{headers:{accept:'application/json','user-agent':'CommonsVouchRadar/1.0'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Commons API: '+response.status);
  const data=await response.json();cache.set(path,{data,until:Date.now()+ttl});return data;
}
async function loadSnapshot(){
  try{
    const data=JSON.parse(await readFile(SNAPSHOT_FILE,'utf8'));
    if(!snapshot||snapshot.generated_at!==data.generated_at){snapshot=data;console.log('Snapshot loaded: '+data.generated_at)}
  }catch{snapshot=null}
}
function snapshotStatus(){
  if(!snapshot||snapshot.targets_scanned<snapshot.target_limit||snapshot.failed_targets>0)return{state:'missing',scope:'top-20000',target_limit:20000,progress:0,completed_at:null};
  return{state:'complete',scope:'top-20000',target_limit:snapshot.target_limit,board_version:snapshot.board_version,total_targets:snapshot.targets_scanned,processed_targets:snapshot.targets_scanned,failed_targets:snapshot.failed_targets,progress:1,started_at:snapshot.scan_started_at,completed_at:snapshot.generated_at,duration_seconds:snapshot.duration_seconds};
}
function usageFor(handle,supply){
  if(!snapshot||snapshot.targets_scanned<snapshot.target_limit||snapshot.failed_targets>0)return{observed_used:0,remaining:null,remaining_at_most:null,observed:false,confidence:'unknown'};
  const used=snapshot.counts?.[String(handle||'').toLowerCase()]||0;
  return{observed_used:used,remaining:null,remaining_at_most:Math.max(0,supply-used),observed:used>0,confidence:'partial',scope:'top-20000',board_version:snapshot.board_version};
}
async function apiRoute(req,res,url){
  if(url.pathname==='/api/status'){
    const [event,version]=await Promise.all([commons('',60000),commons('/leaderboard/version',10000)]);
    return json(res,200,{event:{name:event.name,status:event.status,ends_at:event.ends_at},supply:event.rules?.supply||{},totals:version,collector:snapshotStatus()});
  }
  if(url.pathname==='/api/leaderboard'){
    const offset=Math.max(0,Number(url.searchParams.get('offset')||0)),limit=Math.min(100,Math.max(10,Number(url.searchParams.get('limit')||50)));
    const [event,board]=await Promise.all([commons('',60000),commons('/leaderboard?offset='+offset+'&limit='+limit,10000)]),supply=event.rules?.supply?.vouches??7;
    return json(res,200,{...board,collector:snapshotStatus(),entries:board.entries.map(entry=>({...entry,usage:usageFor(entry.x_handle,supply)}))});
  }
  if(url.pathname==='/api/search'){
    const q=String(url.searchParams.get('q')||'').trim().slice(0,80);if(!q)return json(res,200,{entries:[]});
    const [event,data]=await Promise.all([commons('',60000),commons('/leaderboard/search?q='+encodeURIComponent(q)+'&limit=40',8000)]),supply=event.rules?.supply?.vouches??7;
    return json(res,200,{...data,collector:snapshotStatus(),entries:(data.entries||[]).map(entry=>({...entry,usage:usageFor(entry.x_handle,supply)}))});
  }
  const match=url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if(match){
    const id=decodeURIComponent(match[1]),[event,ledger]=await Promise.all([commons('',60000),commons('/participants/'+encodeURIComponent(id)+'/ledger',15000)]),supply=event.rules?.supply?.vouches??7;
    return json(res,200,{...ledger,entries:ledger.entries.filter(item=>item.kind==='vouch'),usage:usageFor(ledger.x_handle,supply),collector:snapshotStatus()});
  }
  return json(res,404,{error:'Not found'});
}
async function staticRoute(req,res,url){
  const wanted=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)),safe=normalize(wanted).replace(/^(\.\.[/\\])+/,'');const path=join(ROOT,safe);
  if(!path.startsWith(ROOT))return json(res,403,{error:'Forbidden'});
  try{const body=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-cache'});res.end(body)}
  catch{const body=await readFile(join(ROOT,'index.html'));res.writeHead(200,{'content-type':mime['.html'],'cache-control':'no-cache'});res.end(body)}
}

await loadSnapshot();
setInterval(loadSnapshot,60000).unref();
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://'+(req.headers.host||'localhost'));try{if(url.pathname.startsWith('/api/'))await apiRoute(req,res,url);else await staticRoute(req,res,url)}catch(error){console.error(error);json(res,502,{error:'Commons is temporarily unavailable. Please try again.'})}});
server.listen(PORT,()=>console.log('Commons Vouch Radar: http://localhost:'+PORT));
