import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API='https://api.commonsmade.com/game/events/genesis';
let snapshot=null;
try{snapshot=JSON.parse(readFileSync(join(process.cwd(),'public/data/vouch-snapshot.json'),'utf8'))}catch{}

export async function commons(path){
  const response=await fetch(API+path,{headers:{accept:'application/json','user-agent':'CommonsVouchRadar/1.0'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Commons API: '+response.status);
  return response.json();
}
export function status(){
  if(!snapshot||snapshot.targets_scanned<snapshot.target_limit||snapshot.failed_targets>0)return{state:'missing',scope:'top-20000',target_limit:20000,progress:0,completed_at:null};
  return{state:'complete',scope:'top-20000',target_limit:snapshot.target_limit,board_version:snapshot.board_version,total_targets:snapshot.targets_scanned,processed_targets:snapshot.targets_scanned,failed_targets:snapshot.failed_targets,progress:1,started_at:snapshot.scan_started_at,completed_at:snapshot.generated_at,duration_seconds:snapshot.duration_seconds};
}
export function usage(handle,supply){
  if(!snapshot||snapshot.targets_scanned<snapshot.target_limit||snapshot.failed_targets>0)return{observed_used:0,remaining:null,remaining_at_most:null,observed:false,confidence:'unknown'};
  const used=snapshot.counts?.[String(handle||'').toLowerCase()]||0;
  return{observed_used:used,remaining:null,remaining_at_most:Math.max(0,supply-used),observed:used>0,confidence:'partial',scope:'top-20000',board_version:snapshot.board_version};
}
export function ok(data){return Response.json(data,{headers:{'cache-control':'no-store'}})}
export function fail(error){console.error(error);return Response.json({error:'Commons is temporarily unavailable. Please try again.'},{status:502,headers:{'cache-control':'no-store'}})}
