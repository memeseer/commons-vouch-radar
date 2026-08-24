import { commons, status, ok, fail } from './_shared.mjs';
export default {async fetch(){try{const [event,version]=await Promise.all([commons(''),commons('/leaderboard/version')]);return ok({event:{name:event.name,status:event.status,ends_at:event.ends_at},supply:event.rules?.supply||{},totals:version,collector:status()})}catch(error){return fail(error)}}};
