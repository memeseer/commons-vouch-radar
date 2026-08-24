const $=s=>document.querySelector(s),rows=$('#rows'),loading=$('#loading'),stats=$('#stats'),pageLabel=$('#page-label'),prev=$('#prev'),next=$('#next'),searchForm=$('#search-form'),searchInput=$('#search-input'),rowTemplate=$('#row-template'),drawer=$('#drawer'),drawerContent=$('#drawer-content'),backdrop=$('#backdrop');
const state={offset:0,limit:50,total:0,query:'',supply:7},number=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
async function get(url){const r=await fetch(url),d=await r.json();if(!r.ok)throw Error(d.error||'Failed to load data');return d}
function avatar(handle='?'){const l=encodeURIComponent(handle.slice(0,1).toUpperCase());return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23b9f4ce'/%3E%3Ctext x='40' y='51' text-anchor='middle' font-family='sans-serif' font-size='32' fill='%2317211c'%3E${l}%3C/text%3E%3C/svg%3E`}
function renderRows(entries){
  rows.innerHTML='';
  for(const user of entries){
    const node=rowTemplate.content.cloneNode(true),tr=node.querySelector('tr'),img=node.querySelector('img');
    node.querySelector('.rank').textContent=`#${user.rank||'—'}`;
    img.src=user.avatar_url||avatar(user.x_handle||user.display);img.onerror=()=>{img.src=avatar(user.x_handle||user.display)};
    node.querySelector('.person strong').textContent=user.display||user.x_handle||'Unnamed';
    node.querySelector('.person span').textContent=user.x_handle?`@${user.x_handle}`:'No X account';
    node.querySelector('.points').textContent=number.format(user.total_points||0);
    const left=user.usage?.remaining_at_most;
    node.querySelector('.remaining b').textContent=left==null?'pending':`≤ ${left}`;
    node.querySelector('.remaining b').classList.toggle('unknown',left==null);
    node.querySelector('.remaining i').style.setProperty('--fill',left==null?'0%':`${Math.min(100,left/state.supply*100)}%`);
    tr.addEventListener('click',()=>openUser(user));rows.append(node);
  }
}
async function loadStatus(){
  const d=await get('/api/status');state.supply=d.supply?.vouches??7;
  stats.children[0].querySelector('strong').textContent=number.format(d.totals.total_participants);
  stats.children[1].querySelector('strong').textContent=number.format(d.totals.total_entries);
  stats.children[2].querySelector('strong').textContent=state.supply;
  const c=d.collector||{},percent=Math.min(100,Math.max(0,Math.floor((c.progress||0)*100)));
  $('#collector-percent').textContent=`${percent}%`;$('#collector-fill').style.width=`${percent}%`;
  const mins=c.completed_at?Math.max(0,Math.floor((Date.now()-new Date(c.completed_at).getTime())/60000)):null;
  const age=mins==null?'':mins===0?'just now':mins===1?'1 minute ago':`${mins} minutes ago`;
  const labels={missing:'Waiting for the first snapshot',complete:`Updated ${age}`};
  $('#collector-label').textContent=labels[c.state]||'Loading snapshot…';
}
async function loadBoard(){
  loading.classList.remove('hidden');
  try{
    const endpoint=state.query?`/api/search?q=${encodeURIComponent(state.query)}`:`/api/leaderboard?offset=${state.offset}&limit=${state.limit}`;
    const d=await get(endpoint);state.total=d.total_entries||d.entries?.length||0;renderRows(d.entries||[]);
    const page=Math.floor(state.offset/state.limit)+1,pages=Math.max(1,Math.ceil(state.total/state.limit));
    pageLabel.textContent=state.query?`${d.entries?.length||0} found`:`${page} / ${pages}`;
    prev.disabled=Boolean(state.query)||state.offset===0;next.disabled=Boolean(state.query)||state.offset+state.limit>=state.total;
  }catch(e){rows.innerHTML=`<tr><td colspan="5" class="empty">${esc(e.message)}</td></tr>`}finally{loading.classList.add('hidden')}
}
function openDrawer(){drawer.classList.add('open');backdrop.classList.add('open');drawer.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}
function closeDrawer(){drawer.classList.remove('open');backdrop.classList.remove('open');drawer.setAttribute('aria-hidden','true');document.body.style.overflow=''}
async function openUser(user){
  openDrawer();drawerContent.innerHTML='<div class="drawer-loading">Loading vouches…</div>';
  try{
    const d=await get(`/api/users/${encodeURIComponent(user.user_id)}`),v=d.entries||[];
    const left=d.usage?.remaining_at_most;
    drawerContent.innerHTML=`<div class="profile-head"><img src="${esc(user.avatar_url||avatar(user.x_handle||user.display))}" alt=""><h2>${esc(user.display||user.x_handle||'Unnamed')}</h2>${user.x_handle?`<a href="https://x.com/${encodeURIComponent(user.x_handle)}" target="_blank" rel="noreferrer">@${esc(user.x_handle)} ↗</a>`:''}</div>
    <div class="profile-metrics"><div><b>#${user.rank||'—'}</b><span>Rank</span></div><div><b>${left==null?'Pending':`≤ ${left}`}</b><span>Estimated left</span></div></div>
    <div class="vouchers-title"><h3>Vouched by</h3><span>${number.format(v.length)}</span></div>
    <div class="voucher-list">${v.length?v.map(item=>`<a class="voucher" href="${esc(item.tweet_url||'#')}" target="_blank" rel="noreferrer"><img src="${esc(item.author_avatar_url||avatar(item.author_handle))}" alt=""><div><strong>@${esc(item.author_handle||'unknown')}</strong><small>${new Date(item.tweet_created_at).toLocaleString('en-US',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</small></div><b>+${number.format(item.points||0)}</b></a>`).join(''):'<div class="empty">No vouches yet.</div>'}</div>`;
  }catch(e){drawerContent.innerHTML=`<div class="drawer-loading">${esc(e.message)}</div>`}
}
let timer;
searchForm.addEventListener('submit',e=>{e.preventDefault();state.query=searchInput.value.trim().replace(/^@/,'');state.offset=0;loadBoard()});
searchInput.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.query=searchInput.value.trim().replace(/^@/,'');state.offset=0;loadBoard()},350)});
document.addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement!==searchInput){e.preventDefault();searchInput.focus()}if(e.key==='Escape')closeDrawer()});
prev.addEventListener('click',()=>{state.offset=Math.max(0,state.offset-state.limit);loadBoard()});
next.addEventListener('click',()=>{state.offset+=state.limit;loadBoard()});
$('#drawer-close').addEventListener('click',closeDrawer);backdrop.addEventListener('click',closeDrawer);
Promise.all([loadStatus(),loadBoard()]).catch(console.error);setInterval(loadStatus,5000);setInterval(loadBoard,20000);
