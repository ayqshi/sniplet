/* sniplit — app shell, player, views (v2) */
(function(){
'use strict';
const{Store,IDB,API,Radio,Pod,YT,groupVersions,profile,vault,hookRank,collaborators,VIRAL_SEED,cachedIds,artistKey,baseTitle}=SData;
const{Engine,YTSource}=SAudio;const{I,P}=SIcons;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=s=>{s=Math.max(0,Math.floor(s||0));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=String(s%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${x}`:`${m}:${x}`};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ago=t=>{const d=(Date.now()-t)/1000;return d<90?'just now':d<3600?Math.round(d/60)+'m ago':d<86400?Math.round(d/3600)+'h ago':Math.round(d/86400)+'d ago'};
const FREE_CACHE_LIMIT=150;
const pl=(n,w)=>n+' '+w+(n===1?'':'s');
const today=()=>new Date().toISOString().slice(0,10);
if(!Store.stats.first){Store.stats.first=Date.now();Store.save('stats')}

/* ---------- quiet inline feedback (no toasts) ---------- */
function note(msg){const n=$('#sheet.on .sheet-note')||$('#np.on .np-note');if(n){n.textContent=msg;n.classList.add('on');clearTimeout(n._t);n._t=setTimeout(()=>n.classList.remove('on'),3200)}}
function flash(el,html,ms=900){if(!el)return;const o=el.innerHTML;el.innerHTML=html;el.classList.add('flash');setTimeout(()=>{el.innerHTML=o;el.classList.remove('flash')},ms)}

/* ---------- globals ---------- */
const eng=new Engine();
const Q={list:[],i:-1,loop:Store.settings.loop||'off',shuffle:!!Store.settings.shuffle,ctx:'',ab:null};
let cur=null,ytActive=null,adLock=false,curSrc=null;

/* ---------- layout ---------- */
const isStandalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
const Layout={mode:'desktop'};
function applyLayout(){const s=Store.settings,b=document.body,w=innerWidth;let lay=s.layout;
  if(new URLSearchParams(location.search).get('tv'))lay='tv';
  if(lay==='auto'){const tvUA=/smart-?tv|tizen|web0s|webos|aft[a-z]|crkey|bravia|googletv|android tv|hbbtv|roku/i.test(navigator.userAgent);lay=tvUA?'tv':w<=820?'mobile':'desktop'}
  for(const[k,v]of[['mob','mobile'],['desk','desktop'],['tv','tv']])b.classList.toggle(k,lay===v);
  b.classList.toggle('standalone',!!isStandalone);
  b.classList.toggle('light',s.theme==='light'||(s.theme==='system'&&matchMedia('(prefers-color-scheme: light)').matches));
  {const bg=getComputedStyle(b).getPropertyValue('--bg').trim()||'#060606',fg=getComputedStyle(b).getPropertyValue('--fg').trim()||'#f4f4f4';$$('meta[name=theme-color]').forEach(m=>m.content=bg);const D=window.sniplitDesktop;if(D){b.classList.add('electron',D.platform==='darwin'?'mac':'pc');D.setTheme&&D.setTheme({bg,fg})}}
  b.classList.toggle('mono',!!s.mono);b.classList.toggle('reduce',!!s.reduceMotion);b.classList.toggle('compact',!!s.compact);
  const light=b.classList.contains('light');const acc=s.accent==='#ffffff'&&light?'#0b0b0b':s.accent;
  document.documentElement.style.setProperty('--acc',acc);document.documentElement.style.setProperty('--accfg',['#ffffff','#7ee0b4','#f5c451','#a3a3ff'].includes(s.accent)&&!light?'#000':'#fff');
  Layout.mode=lay}
addEventListener('resize',()=>{const m=Layout.mode;applyLayout();if(m!==Layout.mode){renderShell();route()}});

/* ---------- shell ---------- */
const TABS=[['home','Home','home'],['search','Search','search'],['friends','Friends','friends'],['library','Library','library']];
function avatar(name,id,size=32,ring){const h=[...String(id||name||'x')].reduce((a,c)=>a*31+c.charCodeAt(0)>>>0,7);const g=30+h%50,g2=120+(h>>4)%100;
  return`<span class="av ${ring?'ring':''}" style="width:${size}px;height:${size}px;font-size:${size*.42}px;background:linear-gradient(140deg,rgb(${g2},${g2},${g2}),rgb(${g},${g},${g}))">${esc((name||'?').trim()[0]||'?').toUpperCase()}</span>`}
function renderShell(){const me=SSocial.me;const reqs=Object.keys(me.inReq).length;
  $('#side').innerHTML=`<a class="logo" href="#home">${I('logo')}sniplit</a>${TABS.map(([k,l,i])=>`<a class="nav" href="#${k}" data-nav="${k}">${I(i)}<span>${l}</span>${k==='friends'&&reqs?`<em class="dot">${reqs}</em>`:''}</a>`).join('')}
    <div class="side-sep"></div><div class="side-head"><span>Your library</span><button class="icon-btn sm" data-act="create" aria-label="Create">${I('plus')}</button></div>
    <div class="side-list">${sideList()}</div>
    <a class="me-row" href="#preferences">${avatar(me.name||'You',me.id,30)}<span class="grow ell">${esc(me.name||'You')}</span>${Store.premium?`<span class="crown">${I('crown')}</span>`:''}${I('gear')}</a>`;
  $('#topbar').innerHTML=`<a class="logo" href="#home">${I('logo')}sniplit</a><div class="row" style="gap:2px"><button class="icon-btn" data-act="create" aria-label="Create">${I('plus')}</button><a class="icon-btn" href="#preferences" aria-label="Profile & settings">${avatar(me.name||'You',me.id,28)}</a></div>`;
  $('#tabs').innerHTML=TABS.map(([k,l,i])=>`<button data-go="${k}" data-nav="${k}">${I(i)}<span>${l}</span>${k==='friends'&&reqs?'<em class="dot"></em>':''}</button>`).join('');
  markNav();renderMini()}
function sideList(){const items=[{id:'liked',name:'Liked Songs',sub:pl(Object.keys(Store.likes).length,'song'),art:null,icon:'heartF',href:'#liked'},...Store.playlists.map(p=>({name:p.name,sub:pl(p.tracks.length,'song')+(p.from?' · from '+p.from:''),art:p.tracks[0]?.art,href:'#playlist-'+p.id})),{name:'Downloads',sub:cachedIds.size+' offline',icon:'downloaded',href:'#library-downloads'},{name:'On this device',sub:Store.imports.length+' files',icon:'folder',href:'#library-local'}];
  return items.map(x=>`<a class="side-item" href="${x.href}">${x.art?`<img src="${esc(x.art)}" alt="">`:`<span class="ph">${I(x.icon||'music')}</span>`}<span class="grow"><b class="ell">${esc(x.name)}</b><small class="ell">${esc(x.sub)}</small></span></a>`).join('')}
function markNav(){const r=(location.hash||'#home').slice(1).split('-')[0];$$('[data-nav]').forEach(e=>e.classList.toggle('on',e.dataset.nav===r))}

/* ---------- router ---------- */
const V={};let routeToken=0;
async function route(){
  const h=decodeURIComponent((location.hash||'#home').slice(1))||'home';
  if(h.startsWith('t-')){const id=h.slice(2).replace(/^it/,'it:');history.replaceState(null,'','#home');const t=await API.lookupTrack(id.startsWith('it:')?id:'it:'+id);if(t){playList([t],0,'Shared with you');openNP()}return route()}
  if(h.startsWith('add-')){history.replaceState(null,'','#friends');V.friends.pending=h.slice(4);return route()}
  const[name,...rest]=h.split('-');const arg=rest.join('-');const fn=V[name]||V.home;const tok=++routeToken;
  const view=$('#view');view.innerHTML='';view.className='fade-in';$('#main').scrollTop=0;markNav();
  try{await fn(view,arg,tok)}catch(e){if(window.SNIPLIT_DEBUG)console.error(e);if(tok===routeToken)view.innerHTML=emptyState('Couldn’t load this','Check your connection and try again.','refresh')}
}
addEventListener('hashchange',route);
const go=h=>{if(location.hash==='#'+h)route();else location.hash=h};
const live=tok=>tok===routeToken;
function emptyState(t,s,icon='music',action=''){return`<div class="empty"><span class="empty-i">${I(icon)}</span><b>${t}</b><p>${s}</p>${action}</div>`}

/* ---------- render helpers ---------- */
const TR=new Map(),LISTS={};const reg=t=>{TR.set(t.id,t);return t.id};
const thumb=(u,n=300)=>!u||!/mzstatic\.com|dzcdn\.net/.test(u)?u:u.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)/,`/${n}x${n}bb.jpg`).replace(/\/(\d{3,4})x\1-000000-80-0-0\.jpg$/,`/${n<=120?120:n<=250?250:500}x${n<=120?120:n<=250?250:500}-000000-80-0-0.jpg`);
let tileN=0;function tileHTML(t,{round=false,sub}={}){reg(t);const eager=tileN++<8;return`<div class="tile ${round?'round':''}" data-play="${esc(t.id)}" tabindex="0"><div class="art"><img ${eager?'fetchpriority="high"':'loading="lazy"'} decoding="async" src="${esc(thumb(t.art)||SData.placeholderArt(t.title))}" alt="" onload="this.classList.add('ld')" onerror="this.src='${SData.placeholderArt(t.title||'x').replace(/'/g,'%27')}'">${cachedIds.has(t.id)?`<span class="cached">${I('downloaded')}</span>`:''}${t.kind?'':`<span class="play">${I('play')}</span>`}</div><div class="t ell">${esc(t.title)}</div><div class="s ell">${esc(sub??t.artist)}</div></div>`}
function shelf(title,items,{see,round,sub}={}){if(!items||!items.length)return'';return`<section class="sec"><div class="sec-h"><h2>${esc(title)}</h2>${see?`<a class="see" href="#${see}">Show all</a>`:''}</div><div class="shelf">${items.map(t=>tileHTML(t,{round,sub:sub&&sub(t)})).join('')}</div></section>`}
function trackRows(list,{numbers=true,ctx='',showAlbum=false}={}){const ids=list.map(reg);const key='L'+Math.random().toString(36).slice(2,8);LISTS[key]={ids,ctx};
  return`<div class="tl" data-list="${key}">${list.map((t,i)=>`<div class="tr ${cur&&cur.id===t.id?'on':''}" data-idx="${i}" tabindex="0"><div class="n">${numbers?i+1:''}</div><img loading="lazy" decoding="async" src="${esc(thumb(t.art,120)||SData.placeholderArt(t.title))}" alt="" onload="this.classList.add('ld')"><div class="grow"><div class="tt ell">${esc(t.title)}</div><div class="ta ell">${t.explicit?'<span class="badge e">E</span>':''}${cachedIds.has(t.id)?`<span class="dl-i">${I('downloaded')}</span>`:''}${esc(t.artist)}${showAlbum&&t.album?' · '+esc(t.album):''}${t.versions&&t.versions.length>1?` <span class="vers" data-vers="${esc(t.id)}">${t.versions.length} versions</span>`:''}</div></div><div class="d">${t.durationMs?fmt(t.durationMs/1000):''}</div><button class="icon-btn" data-more="${esc(t.id)}" aria-label="More">${I('more')}</button></div>`).join('')}</div>`}
function skeleton(n=6,kind='tile'){if(kind==='rows')return`<div class="tl">${Array(n).fill('<div class="tr"><div></div><div class="sk" style="width:46px;height:46px;border-radius:8px"></div><div><div class="sk" style="height:12px;width:55%;border-radius:6px"></div><div class="sk" style="height:10px;width:35%;border-radius:6px;margin-top:8px"></div></div></div>').join('')}</div>`;
  return`<div class="shelf">${Array(n).fill('<div class="tile"><div class="art sk"></div><div class="sk" style="height:12px;width:78%;border-radius:6px;margin-top:10px"></div><div class="sk" style="height:10px;width:52%;border-radius:6px;margin-top:7px"></div></div>').join('')}</div>`}
const greet=()=>{const h=new Date().getHours();return h<5?'Good night':h<12?'Good morning':h<18?'Good afternoon':'Good evening'};

/* ---------- click delegation ---------- */
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-play],[data-idx],[data-more],[data-vers],[data-go]');if(!t)return;
  if(t.dataset.vers){e.stopPropagation();return versionsSheet(TR.get(t.dataset.vers))}
  if(t.dataset.more){e.stopPropagation();return trackMenu(TR.get(t.dataset.more))}
  if(t.dataset.play){const tr=TR.get(t.dataset.play);if(!tr)return;
    if(tr.kind==='podcast')return go('podcast-'+tr.pid);if(tr.kind==='mix')return openMix(tr,t);if(tr.kind==='artist')return go('artist-'+tr.artistId);
    if(tr.kind==='artistq'){const a=(await API.search(tr.title,{entity:'musicArtist',limit:1}))[0];return a?go('artist-'+a.artistId):(V.search.last=tr.title,go('search'))}
    if(tr.kind==='album')return go('album-'+tr.albumId);if(tr.kind==='iashow')return go('show-'+tr.ident);if(tr.kind==='playlist')return go('playlist-'+tr.plId);if(tr.kind==='xpl')return go('xpl-'+tr.xsrc+'~'+encodeURIComponent(tr.xid));
    const sh=t.closest('.shelf');const sib=sh?$$('[data-play]',sh).map(x=>TR.get(x.dataset.play)).filter(x=>x&&!x.kind):[tr];return playList(sib,Math.max(0,sib.indexOf(tr)),'')}
  if(t.dataset.idx!=null){const L=LISTS[t.closest('[data-list]').dataset.list];return playList(L.ids.map(id=>TR.get(id)),+t.dataset.idx,L.ctx)}
  if(t.dataset.go)return go(t.dataset.go);
});

/* ---------- player ---------- */
async function playList(list,i=0,ctx=''){Q.list=list.filter(Boolean);Q.i=i;Q.ctx=ctx;saveQueue();await loadCurrent()}
function saveQueue(pos){const st=Math.max(0,Q.i-100);Store.queueState={list:Q.list.slice(st,st+200).map(t=>({...t,versions:undefined})),i:Q.i-st,ctx:Q.ctx,pos:pos||0,id:cur&&cur.id};Store.save('queueState')}
let posSaved=0;function savePos(){if(!cur||!Store.queueState||cur.src==='radio')return;Store.queueState.pos=eng.time||0;Store.queueState.id=cur.id;Store.save('queueState');posSaved=performance.now()}
addEventListener('pagehide',()=>{savePos();Store.save('stats','history')});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){savePos();Store.save('stats')}});
let loadTok=0;
async function loadCurrent(autoplay=true,at=0){const t=Q.list[Q.i];if(!t)return;cur=t;const tok=++loadTok;adLock=false;curSrc=null;Lyr.reset();renderMini();renderNP();markRows();
  try{const src=await resolveSource(t);if(tok!==loadTok)return;if(src.url&&!src.live){const ok=await canPlay(src.url);if(tok!==loadTok)return;if(!ok){if(t.previewOnly)throw new Error('nopreview');throw new Error('dead')}}
    if(src.yt){await eng.load({yt:src.yt});ytActive=src.yt;placeYT();await src.yt.init(autoplay)}else{ytActive=null;placeYT();await eng.load(src,{autoplay,at})}
    curSrc=src;if(src.fx)eng.setFx(src.fx);mediaSession();Lyr.load(t);renderNP();socialPush()}
  catch(e){if(tok!==loadTok)return;
    if(!t.previewOnly&&e.message!=='nopreview'){Q.list[Q.i]={...t,previewOnly:true,ytBad:true};return loadCurrent(autoplay,at)}
    autoSkips++;if(autoSkips>2||Q.list.length<2){autoSkips=0;note('This song can’t be played right now');renderPlayState();return}
    note('Can’t play this one — trying the next');setTimeout(()=>next(false,true),900)}}
let autoSkips=0;eng.on('state',()=>{if(eng.playing)autoSkips=0});
const FILE=location.protocol==='file:';
const dzFresh=new Map();// Deezer preview links expire after a few hours: always ask for a current one
async function freshPreview(t){if(t.dzId){const k=t.dzId;const c=dzFresh.get(k);if(c&&Date.now()-c.at<18e5)return c.u;const x=await SSrc.Deezer.track(t.dzId);if(x&&x.preview){dzFresh.set(k,{u:x.preview,at:Date.now()});return x.preview}}
  if(t.preview)return t.preview;
  // no preview of its own (e.g. an independent release): find the same song in the catalog
  try{const r=(await API.search(`${t.artist} ${baseTitle(t.title)}`,{limit:5})).find(x=>x.preview&&artistKey(x.artist)===artistKey(t.artist)&&baseTitle(x.title)===baseTitle(t.title));return r?r.preview:null}catch(e){return null}}
async function resolveSource(t){
  if(t.src==='local'){const f=await IDB.get('files',t.id);if(!f)throw new Error('missing');return{blob:f.blob,kind:'local',full:true}}
  const c=await IDB.get('audio',t.id);if(c&&c.blob)return{blob:c.blob,kind:'cached',full:!!c.full,fx:c.fx,lyrics:c.lyrics};
  if(t.src==='radio')return{url:t.stream,live:true,kind:'radio'};
  if(t.src==='podcast')return{url:t.stream,kind:'podcast',full:true};
  if(t.src==='youtube'||t.useYT)return ytSource(t.ytId||t.useYT,t);
  if(t.src==='archive')return{url:t.stream,kind:'archive',full:true};
  if(t.src==='audius'){const u=await SSrc.Audius.streamUrl(t.auId).catch(()=>null);if(u)return{url:u,kind:'full',full:true}}
  // full song through YouTube's player first. Candidates: the official uploads song.link knows about, then video search.
  // If YouTube refuses one (some uploads can't be embedded) the next is tried, and only then the preview.
  if(!t.previewOnly&&!t.ytBad&&Store.settings.fullFirst!==false&&navigator.onLine){
    if(!t.ytCands){let c=await Promise.race([SSrc.youtubeFor(t),new Promise(r=>setTimeout(()=>r([]),3500))]).catch(()=>[]);
      try{const s=await Promise.race([YT.sourcesFor(t),new Promise(r=>setTimeout(()=>r([]),c.length?1500:4000))]);const order=['Audio','Official video','Lyric video','Video','Visualizer'];
        s.sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind)).forEach(x=>{if(!c.includes(x.ytId)&&x.kind!=='Live'&&x.kind!=='Edit')c.push(x.ytId)});t.ytStillIds=s.filter(x=>x.kind==='Audio').map(x=>x.ytId)}catch(e){}
      t.ytCands=c.slice(0,5)}
    const id=t.ytCands.find(x=>!(t.ytTried||[]).includes(x));if(id){t.ytPick=id;t.ytStill=(t.ytStillIds||[]).includes(id)||t.ytCands.indexOf(id)<2;return ytSource(id,t)}}
  const pv=await freshPreview(t);if(!pv)throw new Error('nopreview');
  const blob=await fetchBlob(pv);return blob?{blob,kind:'preview'}:{url:pv,kind:'preview'}}
function canPlay(url){return new Promise(r=>{const a=new Audio();let done=false;const f=v=>{if(!done){done=true;a.src='';r(v)}};a.preload='metadata';a.onloadedmetadata=()=>f(true);a.onerror=()=>f(false);setTimeout(()=>f(true),5000);a.src=url})}
async function fetchBlob(url){try{const r=await fetch(url,{mode:'cors'});if(!r.ok)return null;return await r.blob()}catch(e){return null}}
function ytSource(id,t){const host=document.createElement('div');host.className='yt-host';
  const yt=new YTSource(host,id,{expectedDuration:(t.durationMs||0)/1000,onEvent:(ev,d)=>{if(ev==='error'&&cur&&cur.id===t.id){const tried=[...(cur.ytTried||[]),id];const more=(cur.ytCands||[]).some(x=>!tried.includes(x))&&!cur.useYT;Q.list[Q.i]={...cur,ytTried:tried,ytBad:!more,useYT:null};loadCurrent(true);return}if(ev==='ended')onEnded();if(ev==='state'){renderPlayState();mediaSessionState();androidState()}if(ev==='ad'){adLock=d;renderAd()}if(ev==='time')onTime()}});yt.hostEl=host;return{yt,kind:'youtube',full:true}}
/* YouTube stays visible: over the artwork in Now Playing, otherwise in the mini player's artwork slot. Never moved in the DOM.
   The frame is cover-fitted and slightly enlarged so letterbox bars and player chrome fall outside the visible area. */
function fitYT(park,W,H){const host=ytActive&&ytActive.hostEl;if(!host)return;const still=cur&&cur.ytStill;const k=still?1.02:1.2;let w,h;if(W/H>16/9){w=W;h=W*9/16}else{h=H;w=H*16/9}
  host.style.setProperty('--yw',w*k+'px');host.style.setProperty('--yh',h*k+'px');park.classList.toggle('ad',!!adLock)}
function placeYT(){const park=$('#yt-park');
  if(!ytActive){park.style.cssText='position:fixed;left:-9999px;top:0;width:10px;height:10px';$('.np-art')?.classList.remove('video');$('#mini .mi img')?.classList.remove('vid');return}
  if(ytActive.hostEl.parentNode!==park){park.innerHTML='';park.appendChild(ytActive.hostEl)}
  const art=$('#np.on .np-art');const r=art&&art.getBoundingClientRect();const mi=$('#mini:not(.hide) .mi img');const mr=mi&&mi.getBoundingClientRect();
  let box=null,rad=18,z=65;
  if(r&&r.width>40&&getComputedStyle(art).display!=='none'){art.classList.add('video');box=r}
  else if(mr&&mr.width>20&&!$('#np.on')){box=mr;rad=8;z=26;mi.classList.add('vid')}
  if(!box){park.style.cssText='position:fixed;left:-9999px;top:0;width:200px;height:200px';return}
  Object.assign(park.style,{position:'fixed',left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px',borderRadius:rad+'px',overflow:'hidden',zIndex:z,boxShadow:'none'});park.className='yt-park';fitYT(park,box.width,box.height)}
setInterval(()=>{if(ytActive)placeYT()},300);
function renderAd(){$$('.adlock').forEach(e=>e.classList.toggle('on',adLock));$$('[data-lock]').forEach(b=>b.disabled=adLock)}
function next(manual=true,skipErr){if(adLock)return;if(!Q.list.length)return;if(Q.shuffle)Q.i=Math.floor(Math.random()*Q.list.length);else if(Q.i<Q.list.length-1)Q.i++;else if(Q.loop==='forever'){endless();return}else if(Q.loop==='all'||manual)Q.i=0;else return;saveQueue();loadCurrent()}
async function endless(){const seed=Q.list[Q.i]||cur;try{const[pop,genre]=await Promise.all([API.popular(seed.artist.split(/,|&/)[0]),API.genreTop(seed.genre||'Pop',40)]);const have=new Set(Q.list.map(t=>baseTitle(t.title)));const add=groupVersions(shuffleMix([...pop.slice(0,10),...hookRank(genre,profile()).slice(0,20)])).filter(t=>!have.has(baseTitle(t.title))).slice(0,15);Q.list.push(...(add.length?add:Q.list.slice(0,10)));Q.i++;saveQueue();loadCurrent()}catch(e){Q.i=0;loadCurrent()}}
function prev(){if(adLock)return;if(eng.time>3){eng.seek(Q.ab?Q.ab[0]:0);return}Q.i=(Q.i-1+Q.list.length)%Q.list.length;saveQueue();loadCurrent()}
function onEnded(){logListen(true);if(studioOpen||Q.loop==='one'){eng.seek(Q.ab?Q.ab[0]:0);eng.play();return}next(false)}
eng.on('ended',onEnded);eng.on('state',()=>{renderPlayState();mediaSessionState();wake();socialPush();androidState()});
function androidState(){const A=window.sniplitAndroid;if(A&&A.playing)try{A.playing(!!eng.playing,cur?cur.title:'sniplit',cur?cur.artist:'')}catch(e){}}
// Android back button: close what's open first
window.sniplitBack=()=>{if($('#story.on')){closeStory();return true}if($('#sheet.on')){closeSheet();return true}if($('#np.on')){closeNP();return true}if(location.hash&&location.hash!=='#home'){history.back();return true}return false};eng.on('time',onTime);eng.on('meta',()=>renderNP(true));

/* listening time + history */
let lastWall=0,sessionMs=0,logged=false;
function onTime(){const now=performance.now();if(eng.playing&&lastWall){const d=Math.min(1500,now-lastWall);sessionMs+=d;Store.stats.ms+=d;const day=today();Store.stats.days[day]=(Store.stats.days[day]||0)+d;Store.stats.hours[new Date().getHours()]+=d}lastWall=eng.playing?now:0;
  if(Q.ab&&eng.time>=Q.ab[1])eng.seek(Q.ab[0]);if(!logged&&sessionMs>Math.min(20000,(eng.duration||30)*500))logListen(false);
  if(Math.random()<.05)Store.save('stats');if(performance.now()-posSaved>5000)savePos();renderProgress();Lyr.tick();viz.tick()}
setInterval(()=>{if(eng.playing&&eng.kind!=='yt')onTime()},500);
function logListen(full){if(!cur||cur.src==='radio')return;if(logged&&!full)return;const last=Store.history[Store.history.length-1];
  if(logged&&last&&last.track.id===cur.id){last.full=last.full||full;last.ms=sessionMs}else Store.history.push({track:{...cur,versions:undefined},at:Date.now(),ms:sessionMs,full});
  logged=true;if(Store.history.length>5000)Store.history.splice(0,Store.history.length-5000);Store.save('history','stats');if(full){logged=false;sessionMs=0}}
const _load=eng.load.bind(eng);eng.load=async(...a)=>{logged=false;sessionMs=0;return _load(...a)};

/* media session + wake lock */
function mediaSession(){if(!('mediaSession'in navigator)||!cur)return;const art=cur.art&&!cur.art.startsWith('data:')?cur.art:'icons/icon-512.png';
  navigator.mediaSession.metadata=new MediaMetadata({title:cur.title,artist:cur.artist,album:cur.album||'sniplit',artwork:[96,256,512].map(s=>({src:art.replace(/\/\d+x\d+bb/,`/${s}x${s}bb`),sizes:`${s}x${s}`,type:'image/jpeg'}))});
  const h={play:()=>eng.play(),pause:()=>eng.pause(),previoustrack:prev,nexttrack:()=>next(),seekto:d=>eng.seek(d.seekTime),seekbackward:d=>eng.seek(eng.time-(d.seekOffset||10)),seekforward:d=>eng.seek(eng.time+(d.seekOffset||10)),stop:()=>eng.pause()};
  for(const[k,f]of Object.entries(h))try{navigator.mediaSession.setActionHandler(k,f)}catch(e){}}
function mediaSessionState(){if(!('mediaSession'in navigator))return;navigator.mediaSession.playbackState=eng.playing?'playing':'paused';try{if(eng.duration&&isFinite(eng.duration))navigator.mediaSession.setPositionState({duration:eng.duration,position:Math.min(eng.time,eng.duration),playbackRate:eng.fx.rate})}catch(e){}}
let wakeLock=null;async function wake(){try{if(Store.settings.keepAwake&&eng.playing&&'wakeLock'in navigator&&!wakeLock&&document.visibilityState==='visible'){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>wakeLock=null)}else if((!eng.playing||!Store.settings.keepAwake)&&wakeLock){wakeLock.release();wakeLock=null}}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')wake();
  if(document.visibilityState==='hidden'&&eng.el===eng.fxEl&&/iP(hone|ad|od)/.test(navigator.userAgent)&&eng.playing&&!Store.settings.fxBackground){const saved={...eng.fx};eng.forceGraph=false;Object.assign(eng.fx,{...Engine.DEFAULT_FX,volume:saved.volume,rate:saved.rate});eng.route(true).then(()=>{Object.assign(eng.fx,saved);eng._pendingFx=true})}
  if(document.visibilityState==='visible'&&eng._pendingFx){eng._pendingFx=false;eng.setFx({})}});

/* ---------- mini player ---------- */
function renderMini(){const m=$('#mini');if(!cur){m.classList.add('hide');return}m.classList.remove('hide');
  m.innerHTML=`<div class="prog"><i></i></div><div class="mi" data-act="np"><img src="${esc(cur.art||SData.placeholderArt(cur.title))}" alt=""><div class="grow"><div class="ell mt">${esc(cur.title)}</div><div class="ell mut small">${esc(cur.artist)}</div></div></div>
  <div class="ctr"><button class="icon-btn hide-m" data-act="shuffle" aria-label="Shuffle">${I('shuffle')}</button><button class="icon-btn hide-m" data-act="prev" data-lock aria-label="Previous">${I('prev')}</button><button class="pp" data-act="toggle" aria-label="Play or pause">${I(eng.playing?'pause':'play')}</button><button class="icon-btn" data-act="next" data-lock aria-label="Next">${I('next')}</button><button class="icon-btn hide-m" data-act="loop" aria-label="Repeat">${I('repeat')}</button></div>
  <div class="rt"><button class="icon-btn" data-act="lyrics" aria-label="Lyrics">${I('lyrics')}</button><button class="icon-btn" data-act="queue" aria-label="Queue">${I('queue')}</button><button class="icon-btn" data-act="cast" aria-label="Devices">${I('cast')}</button><span class="vol-wrap">${I('volume')}<input class="vol" type="range" min="0" max="1" step="0.01" value="${eng.fx.volume}" data-act="vol" aria-label="Volume"></span></div>`;
  renderPlayState();renderLoopBtns();bindMiniSwipe()}
function renderPlayState(){$$('[data-act=toggle]').forEach(b=>{b.innerHTML=I(eng.playing?'pause':'play')});$('#np')?.classList.toggle('playing',eng.playing)}
function renderLoopBtns(){$$('[data-act=loop]').forEach(b=>{b.classList.toggle('on',Q.loop!=='off');b.dataset.mode=Q.loop;b.setAttribute('aria-label',{off:'Repeat off',all:'Repeat all',one:'Repeat one',forever:'Endless'}[Q.loop])});$$('[data-act=shuffle]').forEach(b=>b.classList.toggle('on',Q.shuffle))}
function renderProgress(){const d=eng.duration,t=eng.time,p=d?t/d*100:0;$$('#mini .prog i').forEach(e=>e.style.width=p+'%');
  const s=$('#np .seek');if(s&&!seeking){$('i',s).style.width=p+'%';$('b',s).style.left=p+'%';const bu=$('u',s);if(bu)bu.style.width=(d?eng.buffered/d*100:0)+'%';$('#np .t0').textContent=fmt(t);$('#np .t1').textContent=cur&&cur.src==='radio'?'LIVE':'-'+fmt(Math.max(0,d-t))}}
document.addEventListener('input',e=>{if(e.target.dataset.act==='vol'){eng.setFx({volume:+e.target.value});keepFx()}});
let fxT;function keepFx(){clearTimeout(fxT);fxT=setTimeout(async()=>{Store.settings.fx={...eng.fx,eq:[...eng.fx.eq]};Store.save('settings');
  // downloaded songs remember their own studio settings
  if(cur&&cachedIds.has(cur.id)){const c=await IDB.get('audio',cur.id);if(c){c.fx={...eng.fx,eq:[...eng.fx.eq]};IDB.put('audio',cur.id,c)}}},400)}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b||b.disabled)return;const a=b.dataset.act;
  const A={np:openNP,toggle:()=>{if(eng.kind==='none'&&cur){const st=Store.queueState;return loadCurrent(true,st&&st.id===cur.id?st.pos||0:0)}eng.toggle()},next:()=>next(),prev,shuffle:()=>{Q.shuffle=!Q.shuffle;Store.settings.shuffle=Q.shuffle;Store.save('settings');renderLoopBtns()},
    loop:()=>{const o=['off','all','one','forever'];Q.loop=o[(o.indexOf(Q.loop)+1)%4];Store.settings.loop=Q.loop;Store.save('settings');renderLoopBtns();note({off:'Repeat off',all:'Repeating this list',one:'Repeating this song',forever:'Endless — keeps going with similar songs'}[Q.loop])},
    lyrics:()=>{openNP();setPane('lyrics')},queue:()=>{openNP();setPane('queue')},studio:editorSheet,cast:castSheet,share:()=>shareSheet(cur),dl:()=>cacheTrack(cur,b),export:()=>exportSheet(cur),closeNP,versions:()=>versionsSheet(cur),like:()=>toggleLike(cur,b),more:()=>trackMenu(cur),artist:()=>{closeNP();go('artist-'+cur.artistId)},create:createSheet};
  if(A[a]){e.preventDefault();A[a]()}});

/* ---------- now playing ---------- */
let npPane=Layout.mode==='mobile'?null:'lyrics';
function openNP(){if(!cur)return;const np=$('#np');np.style.transform='';np.classList.add('on');renderNP();placeYT();if(Layout.mode==='mobile')history.pushState({np:1},'')}
function closeNP(){const np=$('#np');np.classList.remove('on','ly-open');np.style.transform='';placeYT();viz.stop()}
addEventListener('popstate',()=>{if($('#sheet').classList.contains('on'))closeSheet();else if($('#story').classList.contains('on'))closeStory();else if($('#np').classList.contains('on'))closeNP()});
function renderNP(soft){const np=$('#np');if(!cur){np.innerHTML='';return}if(soft&&$('.np-art',np)){renderProgress();return}
  const liked=!!Store.likes[cur.id],cached=cachedIds.has(cur.id);const srcLabel=curSrc?({full:'Full song',archive:'Live recording',preview:'Preview',cached:'Offline',local:'On this device',youtube:'YouTube',radio:'Live',podcast:'Episode'}[curSrc.kind]||''):'';
  np.innerHTML=`<div class="bgblur" style="background-image:url(&quot;${esc(cur.art||'')}&quot;)"></div><div class="grab"></div>
  <div class="np-top"><button class="icon-btn" data-act="closeNP" aria-label="Close">${I('chevDown')}</button><div class="ctx"><span>${esc(Q.ctx||'Now playing')}</span><b class="ell">${esc(cur.album||'')}</b></div><button class="icon-btn" data-act="more" aria-label="More">${I('more')}</button></div>
  <div class="np-body"><div class="np-left">
    <div class="np-art ${ytActive?'video':''}" id="npart"><img src="${esc(cur.art||SData.placeholderArt(cur.title))}" alt=""><canvas class="viz"></canvas><div class="yt"></div><div class="adlock ${adLock?'on':''}">Ad · controls locked</div></div>
    <div class="np-meta"><div class="grow"><div class="t ell">${esc(cur.title)}</div><div class="a ell" data-act="artist">${esc(cur.artist)}</div></div><button class="icon-btn like ${liked?'on':''}" data-act="like" aria-label="Like">${I(liked?'heartF':'heart')}</button></div>
    <div class="src-row">${srcLabel?`<span class="tag">${srcLabel}</span>`:''}${cur.versions&&cur.versions.length>1?`<button class="tag btn" data-act="versions">${I('versions')}${cur.versions.length} versions</button>`:`<button class="tag btn" data-act="versions">${I('versions')}Sources</button>`}${curSrc&&curSrc.kind==='preview'?`<button class="tag btn" data-full>Play full song</button>`:''}</div>
    <div><div class="seek" data-seek><div class="bar"><u></u><i></i><b></b></div></div><div class="times"><span class="t0">0:00</span><span class="t1">0:00</span></div></div>
    <div class="ctrls"><button class="icon-btn" data-act="shuffle" aria-label="Shuffle">${I('shuffle')}</button><button class="icon-btn lg" data-act="prev" data-lock aria-label="Previous">${I('prev')}</button><button class="big" data-act="toggle" aria-label="Play or pause">${I(eng.playing?'pause':'play')}</button><button class="icon-btn lg" data-act="next" data-lock aria-label="Next">${I('next')}</button><button class="icon-btn" data-act="loop" aria-label="Repeat">${I('repeat')}</button></div>
    <div class="np-actions"><button class="icon-btn" data-pane="lyrics" aria-label="Lyrics">${I('lyrics')}</button><button class="icon-btn" data-act="studio" aria-label="Studio">${I('studio')}</button><button class="icon-btn" data-act="cast" aria-label="Devices">${I('cast')}</button><button class="icon-btn ${cached?'on':''}" data-act="dl" aria-label="Download">${I(cached?'downloaded':'download')}</button><button class="icon-btn" data-act="share" aria-label="Share">${I('share')}</button><button class="icon-btn" data-pane="queue" aria-label="Queue">${I('queue')}</button></div>
    <div class="np-note"></div>
  </div>
  <div class="np-right"><div class="np-tabs seg-u"><button data-pane="lyrics">Lyrics</button><button data-pane="queue">Up next</button><button data-pane="video">Video</button><button data-pane="about">Details</button><button class="mob-only" data-pane="close" aria-label="Close panel">${I('close')}</button></div><div class="np-pane" id="pane"></div></div></div>`;
  renderLoopBtns();renderPlayState();if(npPane)setPane(npPane,true);renderProgress();placeYT();bindNPGestures();if(viz.on)viz.start()}
function setPane(p,quiet){const np=$('#np');if(p==='close'){np.classList.remove('ly-open');npPane=null;return}npPane=p;$$('#np [data-pane]').forEach(b=>b.classList.toggle('on',b.dataset.pane===p));const pane=$('#pane');if(!pane)return;
  if(Layout.mode==='mobile'&&!quiet)np.classList.add('ly-open');
  if(p==='lyrics')Lyr.mount(pane);
  else if(p==='queue'){pane.style.overflow='auto';pane.innerHTML=`<div class="row" style="justify-content:space-between;margin:4px 0 8px"><span class="mut small">${Q.list.length} songs · ${esc(Q.ctx||'Queue')}</span><button class="tag btn" data-cachepl>${I('download')}Download all</button></div>`+trackRows(Q.list,{ctx:Q.ctx})}
  else if(p==='video'){pane.style.overflow='auto';pane.innerHTML=`<div class="card"><h3>Watch</h3><p class="mut small">Pick a video for this song — it plays in place of the artwork.</p><div id="srcs">${skeleton(3,'rows')}</div><div class="row" style="margin-top:10px"><input id="ytpaste" placeholder="Or paste a YouTube link"><button class="pill sm" id="ytgo">Play</button></div></div>`;
    YT.sourcesFor(cur).then(s=>{const el=$('#srcs');if(!el)return;el.innerHTML=s.length?s.map(v=>`<div class="opt" data-ytsrc="${esc(v.ytId)}"><img src="${esc(v.art)}" style="width:96px;height:54px;object-fit:cover;border-radius:8px"><div class="grow"><b class="ell" style="display:block">${esc(v.kind)}</b><small class="ell">${esc(v.title)} · ${fmt(v.durationMs/1000)}</small></div></div>`).join(''):'<p class="mut small">No videos found.</p>'}).catch(e=>{const el=$('#srcs');if(el)el.innerHTML=`<p class="mut small">${esc(e.message)}</p>`})}
  else if(p==='about'){pane.style.overflow='auto';const v=cur.versions||[cur];pane.innerHTML=`<div class="card"><h3>${esc(cur.title)}</h3><p class="mut small">${esc(cur.artist)} · ${esc(cur.album||'')} · ${esc((cur.release||'').slice(0,4))} · ${esc(cur.genre||'')}</p>
    <div class="set-row"><div>Your rating</div><div class="row" style="gap:0">${[1,2,3,4,5].map(n=>`<button class="icon-btn" data-rate="${n}" style="width:32px;height:32px;color:${(Store.ratings[cur.id]||0)>=n?'var(--fg)':'var(--mut2)'}">${I((Store.ratings[cur.id]||0)>=n?'starF':'star')}</button>`).join('')}</div></div>
    <div class="set-row"><div>Versions<small>${v.map(x=>(x.vtags||SData.versionTags(x)).join(' · ')).join('  |  ')}</small></div></div>${cur.url?`<div class="set-row"><div>Full release<small>Apple Music</small></div><a class="pill sm ghost" href="${esc(cur.url)}" target="_blank" rel="noopener">Open</a></div>`:''}
    <div id="xinfo"></div><div class="set-row"><div>Studio export</div><button class="pill sm ghost" data-act="export">${I('export')}Export audio</button></div></div>`;
    const t=cur;Promise.all([SSrc.MB.recording(t),SSrc.Links.of(t)]).then(([mb,ln])=>{const el=$('#xinfo');if(!el||cur!==t)return;let h='';
      if(mb){h+=`<div class="set-row"><div>First released<small>${esc(mb.first||'—')}${mb.release?' · '+esc(mb.release):''}</small></div>${mb.releaseId?`<img src="${SSrc.MB.cover(mb.releaseId)}" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover" onerror="this.remove()">`:''}</div>`;if(mb.isrc)h+=`<div class="set-row"><div>ISRC<small>${esc(mb.isrc)} · on ${pl(mb.releases,'release')}</small></div></div>`}
      if(ln&&ln.links.length)h+=`<div class="set-row" style="display:block"><div>Also on</div><div class="links">${ln.links.map(l=>`<a class="tag btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join('')}</div></div>`;el.innerHTML=h})}}
document.addEventListener('click',async e=>{const p=e.target.closest('[data-pane]');if(p){setPane(p.dataset.pane);return}
  const r=e.target.closest('[data-rate]');if(r&&cur){Store.ratings[cur.id]=+r.dataset.rate;if(+r.dataset.rate>=4&&!Store.likes[cur.id])toggleLike(cur);Store.save('ratings');setPane('about');return}
  const up=e.target.closest('[data-usepreview]');if(up&&cur){closeSheet();Q.list[Q.i]={...cur,previewOnly:true,useYT:null};loadCurrent().then(()=>setTimeout(editorSheet,600));return}
  const y=e.target.closest('[data-ytsrc]');if(y&&cur&&!e.target.closest('#sheet')){Q.list[Q.i]={...cur,useYT:y.dataset.ytsrc};loadCurrent();return}
  if(e.target.closest('#ytgo')){const id=YT.parseId($('#ytpaste').value);if(!id){$('#ytpaste').classList.add('bad');return}Q.list[Q.i]={...cur,useYT:id};loadCurrent();return}
  if(e.target.closest('[data-full]')&&cur){Q.list[Q.i]={...cur,forceFull:true};loadCurrent();return}
  if(e.target.closest('[data-cachepl]'))cacheMany(Q.list,'Queue')});
/* seek */
let seeking=false;
document.addEventListener('pointerdown',e=>{const s=e.target.closest('[data-seek]');if(!s||adLock)return;e.stopPropagation();seeking=true;s.setPointerCapture(e.pointerId);const bar=$('.bar',s);
  const upd=ev=>{const r=bar.getBoundingClientRect();const p=Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width));$('i',bar).style.width=p*100+'%';$('b',bar).style.left=p*100+'%';$('#np .t0').textContent=fmt(p*eng.duration);return p};upd(e);
  const mv=ev=>upd(ev);const up=ev=>{eng.seek(upd(ev)*eng.duration);seeking=false;s.removeEventListener('pointermove',mv);s.removeEventListener('pointerup',up)};s.addEventListener('pointermove',mv);s.addEventListener('pointerup',up)},true);

/* ---------- gestures (mobile): swipe down to close, swipe art/mini for next/prev ---------- */
function drag(el,{onStart,onMove,onEnd,axis='y',threshold=8}){let sx,sy,st,active=false,locked=null;
  el.addEventListener('pointerdown',e=>{if(e.button>0||e.target.closest('input,[data-seek],.ly,.np-pane,button.no-drag'))return;sx=e.clientX;sy=e.clientY;st=performance.now();active=true;locked=null},{passive:true});
  el.addEventListener('pointermove',e=>{if(!active)return;const dx=e.clientX-sx,dy=e.clientY-sy;if(!locked){if(Math.hypot(dx,dy)<threshold)return;locked=Math.abs(dx)>Math.abs(dy)?'x':'y';if(locked!==axis&&axis!=='both'){active=false;return}onStart&&onStart();try{el.setPointerCapture(e.pointerId)}catch(x){}}
    onMove&&onMove(dx,dy,locked)},{passive:true});
  const end=e=>{if(!active)return;active=false;if(!locked)return;const dx=e.clientX-sx,dy=e.clientY-sy,v=(locked==='x'?dx:dy)/Math.max(1,performance.now()-st);el._dragged=true;setTimeout(()=>el._dragged=false,50);onEnd&&onEnd(dx,dy,v,locked)};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end)}
function bindNPGestures(){const np=$('#np');if(np._g)return;np._g=1;
  drag(np,{axis:'y',onStart:()=>{np.style.transition='none'},onMove:(dx,dy)=>{if(dy>0)np.style.transform=`translateY(${dy}px)`},onEnd:(dx,dy,v)=>{np.style.transition='';if(dy>140||v>.6){if(history.state&&history.state.np)history.back();else closeNP()}else np.style.transform=''}});
  document.addEventListener('pointerdown',e=>{const art=e.target.closest('#npart');if(!art||art._b)return;art._b=1;
    drag(art,{axis:'x',onMove:(dx)=>{art.style.transform=`translateX(${dx*.6}px) rotate(${dx*.02}deg)`},onEnd:(dx,dy,v)=>{art.style.transform='';if(dx<-80||v<-.5)next();else if(dx>80||v>.5)prev()}});
    art.addEventListener('click',()=>{if(!art._dragged&&!ytActive)viz.toggle()})},true)}
function bindMiniSwipe(){const m=$('#mini');if(m._g)return;m._g=1;const mi=()=>$('.mi',m);
  drag(m,{axis:'both',onMove:(dx,dy,l)=>{if(l==='x'&&mi())mi().style.transform=`translateX(${dx}px)`;if(l==='y'&&dy<0)m.style.transform=`translateY(${dy*.3}px)`},
    onEnd:(dx,dy,v,l)=>{if(mi())mi().style.transform='';m.style.transform='';if(l==='x'){if(dx<-70)next();else if(dx>70)prev()}if(l==='y'&&dy<-40)openNP()}});
  m.addEventListener('click',e=>{if(m._dragged)e.stopPropagation()},true)}
/* keyboard / TV remote */
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;
  if(e.code==='Space'){e.preventDefault();eng.toggle()}else if(e.key==='MediaTrackNext')next();else if(e.key==='MediaTrackPrevious')prev();else if(e.key==='MediaPlayPause')eng.toggle();
  else if(e.key==='Escape'||e.key==='GoBack'){if($('#sheet').classList.contains('on'))closeSheet();else if($('#story').classList.contains('on'))closeStory();else if($('#np').classList.contains('on'))closeNP()}
  else if(Layout.mode==='tv'&&e.key.startsWith('Arrow')){e.preventDefault();spatial(e.key)}
  else if(e.key==='Enter'&&document.activeElement&&document.activeElement!==document.body)document.activeElement.click()});
function spatial(dir){const els=$$('a,button,[tabindex="0"],input').filter(x=>{const r=x.getBoundingClientRect();return r.width&&r.height&&r.bottom>0&&r.top<innerHeight*1.5&&getComputedStyle(x).visibility!=='hidden'});
  const a=els.includes(document.activeElement)?document.activeElement:null;if(!a){els[0]?.focus();return}const ar=a.getBoundingClientRect(),ac=[ar.left+ar.width/2,ar.top+ar.height/2];let best=null,bd=1e9;
  for(const x of els){if(x===a)continue;const r=x.getBoundingClientRect(),dx=r.left+r.width/2-ac[0],dy=r.top+r.height/2-ac[1];const ok=dir==='ArrowRight'?dx>4:dir==='ArrowLeft'?dx<-4:dir==='ArrowDown'?dy>4:dy<-4;if(!ok)continue;const d=(dir==='ArrowLeft'||dir==='ArrowRight')?Math.abs(dx)+Math.abs(dy)*3:Math.abs(dy)+Math.abs(dx)*2.5;if(d<bd){bd=d;best=x}}
  if(best){best.focus();best.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'})}}
function markRows(){$$('.tl').forEach(l=>{const L=LISTS[l.dataset.list];if(!L)return;$$('.tr',l).forEach((r,i)=>r.classList.toggle('on',cur&&L.ids[i]===cur.id))})}

/* ---------- likes / follows / playlists ---------- */
function toggleLike(t,btn){if(!t)return;if(Store.likes[t.id])delete Store.likes[t.id];else Store.likes[t.id]={...t,versions:undefined,likedAt:Date.now()};Store.save('likes');
  if(cur&&t.id===cur.id){$$('#np [data-act=like]').forEach(b=>{b.classList.toggle('on',!!Store.likes[t.id]);b.innerHTML=I(Store.likes[t.id]?'heartF':'heart');b.classList.add('pop');setTimeout(()=>b.classList.remove('pop'),400)})}refreshSide()}
function toggleFollow(a){if(Store.follows[a.id])delete Store.follows[a.id];else Store.follows[a.id]={...a,at:Date.now()};Store.save('follows')}
function newPlaylist(name,tracks=[]){const p={id:'pl'+Date.now().toString(36),name:name||'New playlist',tracks:tracks.map(t=>({...t,versions:undefined})),created:Date.now()};Store.playlists.push(p);Store.save('playlists');refreshSide();socialPush(true);return p}
function refreshSide(){const s=$('.side-list');if(s)s.innerHTML=sideList()}

/* ---------- sheets (bottom sheets on mobile, dialogs elsewhere) ---------- */
function openSheet(html,{wide}={}){studioOpen=false;const s=$('#sheet');s.onclick=null;s.oninput=null;s.innerHTML='<div class="grab"></div>'+html+'<div class="sheet-note"></div>';s.classList.toggle('wide',!!wide);s.style.transform='';s.classList.add('on');$('#scrim').classList.add('on');if(Layout.mode==='mobile')history.pushState({sheet:1},'');
  if(!s._g){s._g=1;drag(s,{axis:'y',onStart:()=>{if(s.scrollTop>0)return;s.style.transition='none'},onMove:(dx,dy)=>{if(Layout.mode==='mobile'&&s.scrollTop<=0&&dy>0)s.style.transform=`translateY(${dy}px)`},onEnd:(dx,dy,v)=>{s.style.transition='';if(Layout.mode==='mobile'&&s.scrollTop<=0&&(dy>120||v>.6)){if(history.state&&history.state.sheet)history.back();else closeSheet()}else s.style.transform=''}})}
  return s}
let studioOpen=false;function closeSheet(){studioOpen=false;const s=$('#sheet');s.classList.remove('on');s.style.transform='';$('#scrim').classList.remove('on')}
$('#scrim').addEventListener('click',()=>{if(history.state&&history.state.sheet)history.back();else closeSheet()});
document.addEventListener('click',e=>{if(e.target.closest('[data-close]')){if(history.state&&history.state.sheet)history.back();else closeSheet()}});
const sheetH=t=>`<div class="sheet-h"><h2>${t}</h2><button class="icon-btn" data-close aria-label="Close">${I('close')}</button></div>`;
const opt=(icon,label,act,sub='')=>`<div class="opt" data-m="${act}">${I(icon)}<div class="grow">${label}${sub?`<small>${sub}</small>`:''}</div></div>`;

function createSheet(){const s=openSheet(`${sheetH('Create')}${opt('list','New playlist','pl','Start empty and add from any ⋯ menu')}${opt('music','Add audio files','files','MP3, M4A, FLAC, WAV, AIFF, OGG…')}${opt('folder','Add a folder','folder','Every audio file inside, sub-folders included')}${opt('import','Bring your library','import','From Spotify, Apple Music, YouTube, Deezer, Last.fm or a list')}${opt('export','Export your library','export','Playlists, ratings, history & preferences')}
  <input type="file" multiple accept="audio/*,.flac,.m4a,.aiff,.opus" hidden id="cf"><input type="file" webkitdirectory directory multiple hidden id="cd"><div class="progress" id="cpw" style="display:none;margin-top:12px"><i id="cp"></i></div>`);
  s.onclick=e=>{const m=e.target.closest('[data-m]');if(!m)return;const a=m.dataset.m;if(a==='pl'){const p=newPlaylist('My playlist #'+(Store.playlists.length+1));closeSheet();go('playlist-'+p.id)}if(a==='files')$('#cf').click();if(a==='folder')$('#cd').click();if(a==='import'){closeSheet();go('import')}if(a==='export'){closeSheet();go('export')}};
  const run=async files=>{$('#cpw').style.display='block';const a=await SImport.importFiles(files,p=>{const el=$('#cp');if(el)el.style.width=p*100+'%'});refreshSide();closeSheet();if(a.length){playList(a,0,'On this device');go('library-local')}else note('No audio files found')};
  $('#cf').onchange=e=>run(e.target.files);$('#cd').onchange=e=>run(e.target.files)}
function trackMenu(t){if(!t)return;reg(t);const liked=!!Store.likes[t.id];
  const s=openSheet(`<div class="row" style="margin:0 0 12px"><img src="${esc(t.art||SData.placeholderArt(t.title))}" style="width:52px;height:52px;border-radius:10px;object-fit:cover"><div class="grow"><b class="ell" style="display:block">${esc(t.title)}</b><span class="mut small">${esc(t.artist)}</span></div><button class="icon-btn" data-close>${I('close')}</button></div>
  ${opt('queue','Play next','next')}${opt(liked?'heartF':'heart',liked?'Remove from Liked Songs':'Add to Liked Songs','like')}${opt('plus','Add to playlist','pl')}${opt('versions','Versions & sources','vers')}${opt(cachedIds.has(t.id)?'downloaded':'download',cachedIds.has(t.id)?'Remove download':'Download','dl')}${opt('export','Export audio','exp')}${opt('share','Share','share')}${t.artistId?opt('user','Go to artist','artist'):''}${opt('radio','Start a station from this','radio')}`);
  s.onclick=async e=>{const m=e.target.closest('[data-m]');if(!m)return;const a=m.dataset.m;
    if(a==='next'){Q.list.splice(Q.i+1,0,t);saveQueue();flash(m,`${I('check')}<div class="grow">Playing next</div>`);setTimeout(closeSheet,500);return}
    if(a==='like'){toggleLike(t);flash(m,`${I('check')}<div class="grow">Done</div>`);setTimeout(closeSheet,400);return}
    if(a==='dl'){if(cachedIds.has(t.id)){await IDB.del('audio',t.id);cachedIds.delete(t.id);closeSheet()}else{flash(m,`${I('download')}<div class="grow">Downloading…</div>`,4000);const ok=await cacheTrack(t);m.innerHTML=ok?`${I('check')}<div class="grow">Downloaded</div>`:`${I('close')}<div class="grow">Can’t download this source</div>`;setTimeout(closeSheet,700)}return}
    closeSheet();if(a==='pl')addToPlaylistSheet([t]);if(a==='vers')versionsSheet(t);if(a==='exp')exportSheet(t);if(a==='share')shareSheet(t);if(a==='artist')go('artist-'+t.artistId);if(a==='radio')songRadio(t)}}
function addToPlaylistSheet(tracks){const s=openSheet(`${sheetH('Add to playlist')}${opt('plus','New playlist','new')}${Store.playlists.map(p=>`<div class="opt" data-pl="${p.id}"><img src="${esc(p.tracks[0]?.art||SData.placeholderArt(p.name))}" class="opt-art"><div class="grow">${esc(p.name)}<small>${p.tracks.length} songs</small></div></div>`).join('')}`);
  s.onclick=e=>{const n=e.target.closest('[data-m=new]'),p=e.target.closest('[data-pl]');if(n){newPlaylist('My playlist #'+(Store.playlists.length+1),tracks);flash(n,`${I('check')}<div class="grow">Created</div>`);setTimeout(closeSheet,450)}
    if(p){const pl=Store.playlists.find(x=>x.id===p.dataset.pl);tracks.forEach(t=>{if(!pl.tracks.some(x=>x.id===t.id))pl.tracks.push({...t,versions:undefined})});Store.save('playlists');refreshSide();socialPush(true);flash(p,`${I('check')}<div class="grow">Added to ${esc(pl.name)}</div>`);setTimeout(closeSheet,450)}}}
async function versionsSheet(t){if(!t)return;const vs=t.versions&&t.versions.length?t.versions:[t];vs.forEach(reg);
  const s=openSheet(`${sheetH('Versions & sources')}${vs.map(v=>`<div class="opt" data-pv="${esc(v.id)}"><img src="${esc(v.art)}" class="opt-art"><div class="grow"><b class="ell" style="display:block">${esc(v.title)}</b><small>${esc(v.album||'')} ${(v.vtags||SData.versionTags(v)).map(x=>`<span class="badge">${x}</span>`).join(' ')}</small></div><span class="mut small">${v.durationMs?fmt(v.durationMs/1000):''}</span></div>`).join('')}
  <h3 style="margin:18px 0 6px">Video</h3><div id="vsrc" class="mut small">${skeleton(2,'rows')}</div>`);
  s.onclick=e=>{const v=e.target.closest('[data-pv]'),y=e.target.closest('[data-ytsrc]');if(v){const tr={...TR.get(v.dataset.pv),versions:vs};closeSheet();if(cur&&baseTitle(cur.title)===baseTitle(tr.title)){Q.list[Q.i]=tr;loadCurrent(true,eng.time)}else playList([tr],0)}
    if(y){closeSheet();const tr={...t,useYT:y.dataset.ytsrc};if(cur&&cur.id===t.id){Q.list[Q.i]=tr;loadCurrent()}else playList([tr],0)}};
  {try{const src=await YT.sourcesFor(t);const el=$('#vsrc');if(el)el.innerHTML=src.length?src.map(v=>`<div class="opt" data-ytsrc="${esc(v.ytId)}"><img src="${esc(v.art)}" style="width:80px;height:45px;border-radius:6px;object-fit:cover"><div class="grow"><b style="color:var(--fg)">${esc(v.kind)}</b><small class="ell">${esc(v.title)} · ${fmt(v.durationMs/1000)}</small></div></div>`).join(''):'No videos found.'}catch(e){const el=$('#vsrc');if(el)el.textContent=e.message}}}

/* ---------- offline downloads ---------- */
/* Downloads: the whole song whenever the source provides the audio file (independent releases, live archives, podcasts,
   your own files) — stored as an uncompressed WAV together with metadata, artwork, lyrics and your studio settings.
   Songs that stream through YouTube's player can't be saved; their 30-second preview is kept instead. */
async function fullFileFor(t){if(cur&&t.id===cur.id&&eng.blob&&curSrc&&curSrc.full)return eng.blob;
  if(t.src==='audius'){const u=await SSrc.Audius.streamUrl(t.auId);return u?fetchBlob(u):null}
  if(t.src==='archive'||t.src==='podcast')return fetchBlob(t.stream);return null}
async function toWav(blob){try{const AC=window.OfflineAudioContext||window.webkitOfflineAudioContext;const buf=await new AC(2,44100,44100).decodeAudioData(await blob.arrayBuffer());return{wav:SFile.encodeWAV(buf,16),dur:buf.duration}}catch(e){return null}}
async function cacheTrack(t,btn){if(!t)return false;if(cachedIds.has(t.id))return true;if(t.src==='local')return true;
  if(!Store.premium&&cachedIds.size>=FREE_CACHE_LIMIT){note(`Free downloads hold ${FREE_CACHE_LIMIT} songs — Premium is unlimited`);return false}
  if(btn)btn.classList.add('busy');let full=false,src=null;
  try{src=await fullFileFor(t);full=!!src;if(!src&&t.preview)src=await fetchBlob(t.preview);
    if(!src){note(t.src==='youtube'?'Videos stream only — they can’t be saved offline':'This source can’t be saved offline');return false}
    const w=await toWav(src);const blob=w?w.wav:src;
    const[lyr,artBlob]=await Promise.all([SLyrics.fetchLyrics(t).catch(()=>null),t.art&&!t.art.startsWith('data:')?fetchBlob(t.art):null]);
    await IDB.put('audio',t.id,{blob,meta:{...t,versions:undefined},full,format:w?'wav':'original',duration:w?w.dur:0,lyrics:lyr?{...lyr,candidates:undefined}:null,art:artBlob||null,fx:null,at:Date.now(),size:blob.size});
    cachedIds.add(t.id);if(!full&&(t.src!=='youtube'))note(cur&&cur.id===t.id&&eng.kind==='yt'?'The full song streams through YouTube — the 30-second preview was saved':'Saved');
    if(cur&&cur.id===t.id){$$('#np [data-act=dl]').forEach(b=>{b.classList.add('on');b.innerHTML=I('downloaded')})}refreshSide();return true}
  finally{if(btn)btn.classList.remove('busy')}}
async function cacheMany(list,label){openSheet(`${sheetH('Downloading')}<p class="mut small">${esc(label||'')}</p><div class="progress"><i id="cp"></i></div><p class="mut small" id="cpt">Starting…</p>`);let ok=0,i=0;
  for(const t of list){if(!$('#sheet').classList.contains('on'))break;if(await cacheTrack(t))ok++;i++;const p=$('#cp');if(p)p.style.width=i/list.length*100+'%';const pt=$('#cpt');if(pt)pt.textContent=`${i} of ${list.length} · ${ok} saved`;await sleep(40)}
  const pt=$('#cpt');if(pt)pt.textContent=`${ok} of ${list.length} songs ready offline`}

/* ---------- share ---------- */
function shareURL(t){const base=location.origin.startsWith('http')?location.origin+location.pathname:'https://sniplit.app/index.html';return base+'#t-'+String(t.id).replace('it:','it')}
async function shareSheet(t){if(!t)return;const url=shareURL(t);const lines=(Lyr.data&&Lyr.track&&Lyr.track.id===t.id?Lyr.data.lines:[]).filter(l=>!l.instr);
  const s=openSheet(`${sheetH('Share')}<div class="row"><input readonly value="${esc(url)}" id="shu"><button class="icon-btn" data-sh="copy" aria-label="Copy link">${I('copy')}</button></div>
  <div class="share-row">${[['share','Share','native'],['link','Copy link','copy'],['send','Send to a friend','friend']].map(([i,l,k])=>`<button data-sh="${k}"><span>${I(i)}</span>${l}</button>`).join('')}</div>
  ${lines.length?`<h3>Lyrics card</h3><p class="mut small">Tap lines to include.</p><div id="shl" style="max-height:200px;overflow:auto;margin:8px 0">${lines.map((l,i)=>`<div class="opt" data-li="${i}" style="padding:8px"><span class="radio"></span><div class="grow">${esc(l.text)}</div></div>`).join('')}</div><div class="row"><button class="pill" data-sh="card">Create card</button><button class="pill ghost" data-sh="ltext">Copy lyrics</button></div><canvas id="lcard" width="1080" height="1350" style="width:100%;border-radius:14px;margin-top:12px;display:none"></canvas>`:''}`);
  const sel=new Set();
  s.onclick=async e=>{const li=e.target.closest('[data-li]');if(li){const i=+li.dataset.li;sel.has(i)?sel.delete(i):sel.add(i);$('.radio',li).classList.toggle('on',sel.has(i));return}
    const b=e.target.closest('[data-sh]');if(!b)return;const k=b.dataset.sh;const text=`${t.title} — ${t.artist}`;const chosen=[...sel].sort((a,b)=>a-b).map(i=>lines[i].text);
    const copy=async v=>{try{await navigator.clipboard.writeText(v);flash(b,`<span>${I('check')}</span>Copied`)}catch(x){$('#shu').select()}};
    if(k==='copy')copy(url);if(k==='native'){if(navigator.share)navigator.share({title:t.title,text,url}).catch(()=>{});else copy(url)}
    if(k==='friend'){closeSheet();sendToFriendSheet(t)}
    if(k==='ltext')copy((chosen.length?chosen:lines.map(l=>l.text)).join('\n')+`\n\n— ${t.title}, ${t.artist}\n${url}`);
    if(k==='card'){const c=$('#lcard');c.style.display='block';await drawLyricCard(c,t,chosen.length?chosen:lines.slice(0,4).map(l=>l.text));c.toBlob(b=>{const f=new File([b],SFile.safeName(t.title)+'-lyrics.png',{type:'image/png'});if(navigator.canShare&&navigator.canShare({files:[f]}))navigator.share({files:[f],title:t.title,url}).catch(()=>{});else SFile.download(b,f.name)},'image/png')}}}
function sendToFriendSheet(t){const fr=Object.values(SSocial.me.friends);const s=openSheet(`${sheetH('Send to a friend')}${fr.length?fr.map(f=>`<div class="opt" data-fr="${f.id}">${avatar(f.name,f.id,36)}<div class="grow">${esc(f.name)}<small>${SSocial.isLive(f.id)?'Online':'Gets it next time they open sniplit'}</small></div>${I('send')}</div>`).join(''):emptyState('No friends yet','Add friends from the Friends tab to send them songs.','friends')}`);
  s.onclick=e=>{const f=e.target.closest('[data-fr]');if(!f)return;SSocial.sendTrack&&SSocial.sendTrack(f.dataset.fr,t);flash(f,`${I('check')}<div class="grow">Sent</div>`)}}
async function drawLyricCard(c,t,lines){const x=c.getContext('2d');x.fillStyle='#0a0a0a';x.fillRect(0,0,c.width,c.height);
  try{const img=await loadImg(t.art);x.filter='blur(40px) grayscale(1) brightness(.45)';x.drawImage(img,-100,-100,c.width+200,c.height+200);x.filter='none';x.drawImage(img,80,80,180,180)}catch(e){}
  x.fillStyle='#fff';x.font='700 40px Inter,Arial';x.fillText(t.title.slice(0,32),290,150);x.fillStyle='#bbb';x.font='500 32px Inter,Arial';x.fillText(t.artist.slice(0,36),290,200);
  x.fillStyle='#fff';x.font='800 64px Inter,Arial';let y=420;for(const l of lines){for(const w of wrap(x,l,920)){x.fillText(w,80,y);y+=80}y+=24;if(y>1180)break}x.font='700 34px Inter,Arial';x.fillText('▷ sniplit',80,1270)}
function wrap(x,s,w){const out=[];let line='';for(const word of s.split(' ')){const t=line?line+' '+word:word;if(x.measureText(t).width>w&&line){out.push(line);line=word}else line=t}if(line)out.push(line);return out}
function loadImg(src){return new Promise((r,j)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>r(i);i.onerror=j;i.src=src})}

/* ---------- devices / cast ---------- */
function castSheet(){const hasRP=!!(eng.raw.remote&&eng.raw.remote.prompt),hasAP=!!window.WebKitPlaybackTargetAvailabilityEvent,hasPres=!!window.PresentationRequest;
  const s=openSheet(`${sheetH('Devices')}${opt('phone','This device','this','Playing here')}${hasAP?opt('airplay','AirPlay','airplay','Apple TV, HomePod & AirPlay speakers'):''}${hasRP?opt('cast','Cast','remote','Chromecast & nearby speakers'):''}${hasPres?opt('tv','Show on a screen','present','Opens sniplit’s TV view on that display'):''}${opt('tv','TV layout here','tvmode','Big-screen view with remote navigation')}${opt('bluetooth','Bluetooth','bt','Choose in your device’s audio output menu')}`);
  s.onclick=async e=>{const o=e.target.closest('[data-m]');if(!o)return;const c=o.dataset.m;
    if(eng.kind==='yt'&&(c==='airplay'||c==='remote')){note('Use the cast button inside the video for YouTube sources');return}
    if(c==='airplay'){try{eng.el.webkitShowPlaybackTargetPicker()}catch(x){note('AirPlay isn’t available here')}}
    if(c==='remote'){try{await eng.raw.remote.prompt()}catch(x){note(x.name==='NotFoundError'?'No devices found nearby':'Casting isn’t available here')}}
    if(c==='present'){try{const req=new PresentationRequest([location.pathname+'?tv=1#home']);const conn=await req.start();conn.onconnect=()=>conn.send(JSON.stringify({cmd:'load',track:{...cur,versions:undefined},t:eng.time}));closeSheet()}catch(x){note('No screens found')}}
    if(c==='tvmode'){Store.settings.layout='tv';Store.save('settings');applyLayout();renderShell();closeSheet();route()}
    if(c==='bt')note('Open Control Center (iPhone) or your system sound menu to pick a Bluetooth device');if(c==='this')closeSheet()}}
if(navigator.presentation&&navigator.presentation.receiver){navigator.presentation.receiver.connectionList.then(l=>{const h=c=>c.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.cmd==='load'){playList([m.track],0,'Casting');setTimeout(()=>eng.seek(m.t||0),800);openNP()}};l.connections.forEach(h);l.onconnectionavailable=ev=>h(ev.connection)})}

/* ---------- studio ---------- */
const PRESETS={'Flat':{},'Bass boost':{bass:14,eq:[6,5,3,1,0,0,0,0,0,0]},'Slowed + reverb':{rate:.82,pitch:-3,reverb:.45},'Sped up':{rate:1.25,pitch:3},'Nightcore':{rate:1.3,pitch:4,eq:[0,0,0,0,0,1,2,3,3,2]},'8D':{spin:true,reverb:.2},'Vocal boost':{eq:[-2,-2,-1,0,2,4,4,2,0,-1]},'Karaoke':{vocal:'karaoke'},'Acapella':{vocal:'vocals'},'Late night':{eq:[3,2,1,0,-1,-2,-2,-1,0,1],reverb:.15,bass:4}};
let edTab='speed';
/* loop: one tidy dropdown instead of a row of buttons */
function loopLabel(){return Q.ab?`This part · ${fmt(Q.ab[0])}–${fmt(Q.ab[1])}`:Q.loop==='one'?'Repeat this song':'Off'}
function loopDD(){const o=(k,l,d)=>`<button role="menuitemradio" data-loopopt="${k}" aria-checked="${(k==='off'&&!Q.ab&&Q.loop!=='one')||(k==='song'&&!Q.ab&&Q.loop==='one')||(k==='custom'&&Q.ab)?'true':'false'}"><b>${l}</b>${d?`<small>${d}</small>`:''}</button>`;
  return`<div class="dd" id="loopdd"><button class="dd-btn" aria-haspopup="menu" aria-expanded="false">${I('repeat')}<span>Loop</span><b class="grow ell">${loopLabel()}</b>${I('chevDown')}</button>
  <div class="dd-menu" role="menu">${o('off','Off')}${o('song','Repeat this song','Plays again and again')}${o('p10','This part · 10 s','From a few seconds back')}${o('p20','This part · 20 s')}${o('custom','Choose start and end','Fine-tune below')}</div>
  ${Q.ab?`<div class="ab-edit"><div><span>Start</span><button class="icon-btn" data-abn="0,-1" aria-label="Start earlier">−</button><b>${fmt(Q.ab[0])}</b><button class="icon-btn" data-abn="0,1" aria-label="Start later">+</button><button class="tag btn" data-abnow="0">Now</button></div><div><span>End</span><button class="icon-btn" data-abn="1,-1" aria-label="End earlier">−</button><b>${fmt(Q.ab[1])}</b><button class="icon-btn" data-abn="1,1" aria-label="End later">+</button><button class="tag btn" data-abnow="1">Now</button></div></div>`:''}</div>`}
document.addEventListener('click',e=>{const dd=e.target.closest('#loopdd');const btn=e.target.closest('#loopdd .dd-btn');$$('.dd.open').forEach(x=>{if(x!==dd)x.classList.remove('open')});
  if(btn){dd.classList.toggle('open');btn.setAttribute('aria-expanded',dd.classList.contains('open'));return}
  const o=e.target.closest('[data-loopopt]');if(o){const k=o.dataset.loopopt,t=eng.time,d=eng.duration||30;
    if(k==='off'){Q.ab=null;if(Q.loop==='one')Q.loop='off'}else if(k==='song'){Q.ab=null;Q.loop='one'}else if(k==='p10')Q.ab=[Math.max(0,t-3),Math.min(d,t+7)];else if(k==='p20')Q.ab=[Math.max(0,t-5),Math.min(d,t+15)];else if(k==='custom')Q.ab=Q.ab||[Math.max(0,t-5),Math.min(d,t+10)];
    Store.settings.loop=Q.loop;Store.save('settings');renderLoopBtns();refreshLoopDD();return}
  const n=e.target.closest('[data-abn]');if(n&&Q.ab){const[i,dir]=n.dataset.abn.split(',').map(Number);Q.ab[i]=Math.max(0,Math.min(eng.duration||Q.ab[1]+1,Q.ab[i]+dir*.5));if(Q.ab[0]>=Q.ab[1]-.5)Q.ab[i===0?0:1]=i===0?Q.ab[1]-.5:Q.ab[0]+.5;refreshLoopDD(true);return}
  const nw=e.target.closest('[data-abnow]');if(nw&&Q.ab){Q.ab[+nw.dataset.abnow]=eng.time;if(Q.ab[0]>Q.ab[1])Q.ab.reverse();refreshLoopDD(true)}});
function refreshLoopDD(keepOpen){const el=$('#loopdd');if(!el)return;const open=keepOpen&&el.classList.contains('open');el.outerHTML=loopDD();if(open)$('#loopdd').classList.add('open');typeof drawWave==='function'&&drawWave()}
function editorSheet(){if(!cur)return;setTimeout(()=>studioOpen=true,0);const f=eng.fx;const cap=eng.kind==='yt'?'yt':eng.fxCapable?'ok':'no';
  const s=openSheet(`${sheetH('Studio')}${cap!=='ok'?`<p class="hint">${cap==='yt'?'The full song plays through YouTube, which allows speed and volume only.'+(cur.preview?' <button class="pill sm ghost" data-usepreview style="margin-top:8px">Edit the 30-second preview instead</button>':''):'Download this song to unlock pitch, EQ, bass and vocal tools.'}</p>`:''}
  <div class="seg" id="edt">${[['speed','Speed'],['pitch','Pitch'],['eq','EQ'],['bass','Bass'],['vocals','Vocals'],['fx','Space'],['presets','Presets']].map(([k,l])=>`<button data-ed="${k}" class="${edTab===k?'on':''}">${l}</button>`).join('')}</div>
  <div class="wave"><canvas id="wv"></canvas></div>
  ${loopDD()}
  <div id="edp"></div>
  <div class="row" style="margin-top:12px"><button class="pill ghost" data-reset>Reset</button><div class="grow"></div><button class="pill dim" data-exp>${I('export')} Export</button></div>`,{wide:Layout.mode!=='mobile'});
  const pane=()=>{const p=$('#edp');const sl=(k,l,min,max,st,v,u='')=>`<div class="sl"><label>${l}</label><input type="range" min="${min}" max="${max}" step="${st}" value="${v}" data-fx="${k}"><output>${v}${u}</output></div>`;
    $$('#edt button').forEach(b=>b.classList.toggle('on',b.dataset.ed===edTab));
    if(edTab==='speed')p.innerHTML=sl('rate','Speed',.25,4,.01,f.rate,'×')+'<div class="chips">'+[.5,.75,.85,1,1.15,1.25,1.5,2].map(r=>`<button class="chip ${f.rate==r?'on':''}" data-setfx='{"rate":${r}}'>${r}×</button>`).join('')+'</div>';
    if(edTab==='pitch')p.innerHTML=sl('pitch','Pitch',-12,12,.5,f.pitch,' st')+'<p class="mut small">Semitones — independent of speed.</p>';
    if(edTab==='eq')p.innerHTML=`<div class="eq">${Engine.EQ_FREQ.map((hz,i)=>`<div><input type="range" min="-15" max="15" step=".5" value="${f.eq[i]}" data-eq="${i}" aria-label="${hz} Hz"><span>${hz>=1000?hz/1000+'k':hz}</span></div>`).join('')}</div>`;
    if(edTab==='bass')p.innerHTML=sl('bass','Bass',-30,40,.5,f.bass,' dB')+'<p class="mut small">−30 dB to +40 dB, with a limiter to keep it clean.</p>';
    if(edTab==='vocals')p.innerHTML=`<div class="seg">${[['normal','Full mix'],['karaoke','No vocals'],['vocals','Vocals only']].map(([k,l])=>`<button class="${f.vocal===k?'on':''}" data-setfx='{"vocal":"${k}"}'>${l}</button>`).join('')}</div><div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="pill sm dim" data-stem="karaoke">${I('download')} Instrumental</button><button class="pill sm dim" data-stem="vocals">${I('download')} Vocals</button><button class="pill sm ${Store.premium?'':'ghost'}" data-stem="pack">${I('versions')} Both stems${Store.premium?'':' · Premium'}</button></div>`;
    if(edTab==='fx')p.innerHTML=sl('reverb','Reverb',0,1,.01,f.reverb)+`<div class="set-row"><div>8D<small>Slowly circles around your head</small></div><button class="toggle ${f.spin?'on':''}" data-setfx='{"spin":${!f.spin}}' aria-label="8D"></button></div>`;
    if(edTab==='presets')p.innerHTML=`<div class="chips wrap">${Object.keys(PRESETS).map(k=>`<button class="chip" data-preset="${k}">${k}</button>`).join('')}</div>`};pane();drawWave();
  const apply=async patch=>{const r=await eng.setFx(patch);keepFx();if(r==='nocors')note('Download this song to unlock the studio');else if(r==='yt'&&(patch.pitch!=null||patch.eq||patch.bass!=null||patch.vocal))note('Video sources support speed and volume only')};
  s.oninput=e=>{const x=e.target;if(x.dataset.fx){const v=+x.value;x.nextElementSibling.textContent=v+(x.dataset.fx==='rate'?'×':x.dataset.fx==='pitch'?' st':x.dataset.fx==='bass'?' dB':'');apply({[x.dataset.fx]:v})}if(x.dataset.eq!=null){const eq=[...f.eq];eq[+x.dataset.eq]=+x.value;apply({eq})}};
  s.onclick=async e=>{const b=e.target;const ed=b.closest('[data-ed]');if(ed){edTab=ed.dataset.ed;pane();return}
    const sf=b.closest('[data-setfx]');if(sf){await apply(JSON.parse(sf.dataset.setfx));pane();return}
    const pr=b.closest('[data-preset]');if(pr){await eng.resetFx();await apply({...Engine.DEFAULT_FX,volume:f.volume,...structuredClone(PRESETS[pr.dataset.preset])});$$('[data-preset]').forEach(x=>x.classList.toggle('on',x===pr));return}
    if(b.closest('[data-reset]')){await eng.resetFx();pane()}
    if(b.closest('[data-lf]')){Q.loop=Q.loop==='one'?'off':'one';b.closest('[data-lf]').classList.toggle('on',Q.loop==='one');renderLoopBtns()}
    const ab=b.closest('[data-ab]');if(ab){if(ab.dataset.ab==='clear')Q.ab=null;else{const t=eng.time,d=eng.duration||30;Q.ab=[Math.max(0,t-5),Math.min(d,t+10)]}editorSheet();return}
    if(b.closest('[data-exp]')){closeSheet();exportSheet(cur)}
    const st=b.closest('[data-stem]');if(st)exportStem(st.dataset.stem,st)};
  waveDrag()}
let waveCache=null;
async function drawWave(){const c=$('#wv');if(!c)return;const dpr=devicePixelRatio||1;c.width=c.clientWidth*dpr;c.height=c.clientHeight*dpr;const x=c.getContext('2d');const W=c.width,H=c.height;
  let peaks=null;if(eng.blob){if(waveCache&&waveCache.id===cur.id)peaks=waveCache.p;else{try{const b=await eng.decode();const d=b.getChannelData(0),n=300,step=Math.floor(d.length/n);peaks=[];for(let i=0;i<n;i++){let m=0;for(let j=i*step;j<(i+1)*step;j+=16)m=Math.max(m,Math.abs(d[j]));peaks.push(m)}waveCache={id:cur.id,p:peaks}}catch(e){}}}
  if(!peaks){x.clearRect(0,0,W,H);return}
  const fg=getComputedStyle(document.body).color;x.clearRect(0,0,W,H);const bw=W/peaks.length,d=eng.duration||30;
  peaks.forEach((p,i)=>{const t=i/peaks.length*d;const inR=!Q.ab||(t>=Q.ab[0]&&t<=Q.ab[1]);x.fillStyle=fg;x.globalAlpha=inR?.85:.22;const h=Math.max(2,p*H*.9);x.fillRect(i*bw,(H-h)/2,Math.max(1,bw-dpr),h)});x.globalAlpha=1;
  if(Q.ab)for(const t of Q.ab){const px=t/d*W;x.fillStyle=fg;x.fillRect(px-1.5*dpr,0,3*dpr,H);x.beginPath();x.arc(px,6*dpr,5*dpr,0,7);x.fill();x.beginPath();x.arc(px,H-6*dpr,5*dpr,0,7);x.fill()}
  x.globalAlpha=.5;x.fillRect(eng.time/d*W,0,dpr,H);x.globalAlpha=1}
function waveDrag(){const c=$('#wv');if(!c)return;let dr=-1;c.onpointerdown=e=>{e.stopPropagation();const r=c.getBoundingClientRect(),d=eng.duration||30,t=(e.clientX-r.left)/r.width*d;if(Q.ab){const i=Math.abs(t-Q.ab[0])<Math.abs(t-Q.ab[1])?0:1;if(Math.abs(t-Q.ab[i])<d*.06){dr=i;c.setPointerCapture(e.pointerId);return}}eng.seek(t);drawWave()};
  c.onpointermove=e=>{if(dr<0)return;const r=c.getBoundingClientRect(),d=eng.duration||30;Q.ab[dr]=Math.max(0,Math.min(d,(e.clientX-r.left)/r.width*d));if(Q.ab[0]>Q.ab[1]-.5)Q.ab[dr]=dr?Q.ab[0]+.5:Q.ab[1]-.5;drawWave()};c.onpointerup=()=>dr=-1}
setInterval(()=>{if($('#sheet.on #wv'))drawWave()},250);

/* ---------- export ---------- */
function exportSheet(t){if(!t)return;const comp=Engine.compressedFormats();const pro=Store.premium;
  const F=[['wav16','WAV · 16-bit','Plays anywhere',false],['wav24','WAV · 24-bit','Studio quality',!pro],['wav32','WAV · 32-bit float','Maximum headroom',!pro],['aiff','AIFF','Logic, GarageBand, Final Cut',false],['pcm','Raw PCM','For DAWs & tools',false],...comp.map(([m,l,ext])=>['rec:'+m+'|'+ext,l,'Compressed',false])];
  const s=openSheet(`${sheetH('Export')}<p class="mut small" style="margin-top:-8px">${esc(t.title)} — ${esc(t.artist)}</p>
  <div class="set-row"><div>Include studio changes<small>Speed, pitch, EQ, bass, vocals, space</small></div><button class="toggle on" id="xfx" aria-label="Include studio changes"></button></div>
  <div class="set-row"><div>Loop section only<small>${Q.ab?fmt(Q.ab[0])+'–'+fmt(Q.ab[1]):'Set A–B in the studio'}</small></div><button class="toggle" id="xab" ${Q.ab?'':'disabled'} aria-label="Loop section only"></button></div>
  ${F.map(([k,l,d,lock],i)=>`<div class="opt" data-fmt="${k}"><span class="radio ${i===0?'on':''}"></span><div class="grow">${l}${lock?' <span class="badge">Premium</span>':''}<small>${d}</small></div></div>`).join('')}
  <div class="opt" data-fmt="meta"><span class="radio"></span><div class="grow">Lyrics & artwork<small>Synced .lrc, cover art and tags</small></div></div>
  <div class="progress" style="margin:12px 0 4px;display:none" id="xpw"><i id="xp"></i></div><button class="pill wide" id="xago">${I('export')} Export</button><p class="tiny mut" style="margin-top:10px">For personal use. Catalog previews belong to their rights holders.</p>`);
  let sel=F[0][0];
  s.onclick=async e=>{const o=e.target.closest('[data-fmt]');if(o){$$('[data-fmt] .radio',s).forEach(r=>r.classList.remove('on'));$('.radio',o).classList.add('on');sel=o.dataset.fmt;return}
    const tg=e.target.closest('.toggle');if(tg&&!tg.disabled){tg.classList.toggle('on');return}
    if(e.target.closest('#xago')){const lock=F.find(x=>x[0]===sel);if(lock&&lock[3]){note('24- and 32-bit exports are part of Premium');return}
      $('#xpw').style.display='block';const prog=p=>{const el=$('#xp');if(el)el.style.width=p*100+'%'};try{await doExport(t,sel,$('#xfx').classList.contains('on'),$('#xab').classList.contains('on'),prog);flash($('#xago'),`${I('check')} Saved`,1400)}catch(err){note(err.message)}}}}
async function getBufferFor(t){if(cur&&t.id===cur.id&&eng.blob)return eng.decode();let blob=null;const c=await IDB.get('audio',t.id);if(c)blob=c.blob;else if(t.src==='local')blob=(await IDB.get('files',t.id))?.blob;else if(t.preview)blob=await fetchBlob(t.preview);
  if(!blob)throw new Error(t.src==='youtube'?'Video audio can’t be exported':'This source can’t be exported');return new OfflineAudioContext(2,44100,44100).decodeAudioData(await blob.arrayBuffer())}
async function doExport(t,sel,withFx,onlyAB,prog,fxOverride){prog(.05);const name=SFile.safeName(`${t.artist} - ${t.title}`);
  if(sel==='meta'){const lr=await SLyrics.fetchLyrics(t).catch(()=>null);const files=[{name:name+'.json',data:JSON.stringify({...t,versions:undefined},null,2)}];
    if(lr&&lr.lines.length)files.push({name:name+'.lrc',data:`[ti:${t.title}]\n[ar:${t.artist}]\n[al:${t.album||''}]\n`+lr.lines.map(l=>`[${String(Math.floor(l.t/60)).padStart(2,'0')}:${(l.t%60).toFixed(2).padStart(5,'0')}]${l.text}`).join('\n')});
    if(t.art&&!t.art.startsWith('data:')){const b=await fetchBlob(t.art.replace(/\/\d+x\d+bb/,'/1200x1200bb'));if(b)files.push({name:name+'.jpg',data:b})}
    SFile.download(await SFile.makeZip(files),name+'.zip');prog(1);return}
  let buf=await getBufferFor(t);prog(.3);const fx=fxOverride||(withFx?eng.fx:Engine.DEFAULT_FX);const range=onlyAB&&Q.ab?{start:Q.ab[0],end:Q.ab[1]}:{};
  if(!Engine.isNeutral(fx)||range.start!=null)buf=await Engine.render(buf,{...fx,volume:Math.min(1.2,fx.volume||1)},range);prog(.6);let blob,ext;
  if(sel.startsWith('wav')){blob=SFile.encodeWAV(buf,+sel.slice(3));ext='wav'}else if(sel==='aiff'){blob=SFile.encodeAIFF(buf);ext='aiff'}else if(sel==='pcm'){blob=SFile.encodePCM(buf);ext=`s16le-${buf.sampleRate}hz-${buf.numberOfChannels}ch.pcm`}
  else{const[m,e]=sel.slice(4).split('|');blob=await Engine.recordCompressed(buf,m,p=>prog(.6+p*.4));ext=e}
  prog(1);SFile.download(blob,`${name}${fx.vocal!=='normal'?' ('+(fx.vocal==='karaoke'?'instrumental':'vocals')+')':''}.${ext}`);return blob}
async function exportStem(kind,btn){if(!cur)return;btn&&btn.classList.add('busy');try{if(kind==='pack'){if(!Store.premium){note('Exporting both stems together is part of Premium');return}const name=SFile.safeName(`${cur.artist} - ${cur.title}`);const b=await getBufferFor(cur);const parts=[];for(const v of['karaoke','vocals']){const r=await Engine.render(b,{...eng.fx,vocal:v});parts.push({name:`${name} - ${v==='karaoke'?'instrumental':'vocals'}.wav`,data:SFile.encodeWAV(r,24)})}SFile.download(await SFile.makeZip(parts),name+' (stems).zip')}
  else await doExport(cur,'wav16',true,false,()=>{},{...eng.fx,vocal:kind})}catch(e){note(e.message)}finally{btn&&btn.classList.remove('busy')}}

/* ---------- lyrics ---------- */
const Lyr={track:null,data:null,offset:0,align:null,el:null,y:0,ty:0,userUntil:0,raf:0,active:-1,snaps:{},
  reset(){this.track=null;this.data=null;this.align=null;this.snaps={};this.active=-1;this.nextCheck=0;if(this.el)this.render()},
  precise(){const s=Store.settings;if(s.preciseSync!=null)return s.preciseSync;const c=navigator.connection;return!(c&&(c.saveData||/2g/.test(c.effectiveType||'')))},
  // speech-to-text check of the audio window that's about to play; corrects drift, never fights a manual sync
  async verify(t,from){if(!this.precise()||this.busy||!this.data||!this.data.synced||this.align&&this.align.method==='you')return;this.busy=true;
    try{const buf=await eng.decode();if(!buf||this.track!==t)return;const words=await SLyrics.transcribe(buf,Math.max(0,from));if(this.track!==t||words.length<4)return;
      // which candidate actually matches what's sung? switch if another source fits clearly better
      const cs=this.data.candidates||[];if(cs.length>1&&window.SSrc){const rr=SSrc.Lyr2.rank(cs,t,words.map(w=>w.w).join(' '));const top=rr[0],now=rr.find(c=>c.src===(this.data.pick&&this.data.pick.src)&&c.title===(this.data.pick&&this.data.pick.title));
        if(top&&top.heardFit>.25&&(!now||top.heardFit-(now.heardFit||0)>.2)&&top!==now){const nd=SLyrics.fromCandidate(top,t);if(nd.synced){this.data={...this.data,...nd}}}}
      const r=await SLyrics.transcriptAlign(buf,this.data.lines,{windowStart:Math.max(0,from),words});if(this.track!==t||!r||!r.verified)return;
      if(this.align&&this.align.method==='you')return;const moved=Math.abs(r.offset-this.offset)>.2;this.offset=Math.max(0,r.offset);this.snaps=r.snaps||{};this.align={verified:true,method:'transcript',confidence:Math.min(1,.6+r.matched*.08)};if(moved||this.el)this.render()}catch(e){}finally{this.busy=false}},
  async load(t){this.track=t;this.data=null;this.align=null;this.snaps={};this.status='loading';this.render();
    let d=curSrc&&curSrc.lyrics&&curSrc.lyrics.lines&&curSrc.lyrics.lines.length?curSrc.lyrics:(t.src==='radio'||(t.src==='youtube'&&!t.useYT&&!t.preview))?null:await SLyrics.fetchLyrics(t).catch(()=>null);if(this.track!==t)return;
    if(!d&&t.src!=='radio'&&this.precise()){this.status='transcribing';this.render();d=await this.transcribed(t);if(this.track!==t)return}
    this.data=d;this.status=d?'ok':'none';
    const full=curSrc&&(curSrc.full||curSrc.kind==='local');const saved=Store.offsets[t.id];
    if(saved!=null){this.offset=saved.o;this.align={verified:true,method:'you',confidence:1}}
    else if(full||!d||!d.synced){this.offset=0;this.align={verified:full,method:full?'full':'n/a',confidence:full?1:0}}
    else{this.offset=Math.max(0,(t.durationMs/1000||180)*.3);this.align={verified:false,method:'aligning',confidence:0};this.render();
      try{const buf=await eng.decode();if(buf&&this.track===t){const a=await SLyrics.alignPreview(buf,d.lines,(t.durationMs||0)/1000);if(this.track!==t)return;this.offset=a.offset;this.snaps=a.snaps||{};this.align=a}}catch(e){}
      if(!eng.blob)this.align={verified:false,method:'estimate',confidence:0}}
    // music videos often open with an intro the album version doesn't have: start the words that much later
    if(d&&d.synced&&saved==null&&eng.kind==='yt'&&t.durationMs)setTimeout(()=>{if(this.track!==t)return;const dd=(eng.duration||0)-t.durationMs/1000;if(dd>3&&dd<75&&!t.ytStill){this.offset=-dd;this.align={verified:false,method:'video',confidence:.3};this.render()}},3000);
    this.render();if(d&&d.synced&&eng.blob&&saved==null){this.nextCheck=performance.now()+25000;this.verify(t,full?Math.max(0,eng.time):0)}},
  lt(i){return this.data.lines[i].t+(this.snaps[i]||0)},
  async transcribed(t){try{let buf=eng.blob?await eng.decode():null;let fromPreview=false;if(!buf&&t.preview){const b=await fetchBlob(t.preview);if(b){const AC=window.OfflineAudioContext||window.webkitOfflineAudioContext;buf=await new AC(2,44100,44100).decodeAudioData(await b.arrayBuffer());fromPreview=true}}
    if(!buf)return null;const words=await SLyrics.transcribe(buf,0);if(words.length<4)return null;const lines=SLyrics.linesFromWords(words);
    // words heard in the preview can't be placed in a full-length video, so they show as plain text there
    return fromPreview&&eng.kind==='yt'?{synced:false,lines:lines.map(l=>({...l,words:[],unsynced:true})),source:'transcript',transcribed:true}:{synced:true,lines,source:'transcript',transcribed:true,windowed:true}}catch(e){return null}},
  // during a 30-second preview only the lines that fall inside it are shown
  vis(){const d=this.data;if(!d||!d.synced||d.transcribed)return null;const full=curSrc&&(curSrc.full||curSrc.kind==='local');if(full)return null;const a=this.align||{};if(a.method==='aligning')return'wait';
    const dur=eng.duration||30;const lo=this.offset-.6,hi=this.offset+dur+.4;const set=new Set();d.lines.forEach((l,i)=>{const t=this.lt(i);if(t>=lo&&t<=hi)set.add(i);else if(t<lo&&(d.lines[i+1]?this.lt(i+1):t+4)>lo)set.add(i)});return set},
  mount(pane){this.el=pane;pane.style.overflow='hidden';this.render()},
  render(){const p=this.el;if(!p||!p.isConnected||npPane!=='lyrics')return;const d=this.data;
    const vis=this.vis();if(this.status==='transcribing'||vis==='wait'){p.innerHTML=`<div class="ly-sk"><p class="mut small" style="text-align:center;margin:0 0 6px">${this.status==='transcribing'?'Listening for the words…':'Finding where this preview sits in the song…'}</p>${Array(5).fill(0).map((_,i)=>`<div class="sk" style="width:${[78,62,85,54,70][i]}%"></div>`).join('')}</div>`;return}
    if(!this.track||(this.status==='loading'&&!d)){p.innerHTML=`<div class="ly-sk">${Array(6).fill(0).map((_,i)=>`<div class="sk" style="width:${[78,62,85,54,70,40][i]}%"></div>`).join('')}</div>`;return}
    if(!d||!d.lines.length){p.innerHTML=d&&d.instrumental?emptyState('Instrumental','Just the music.','lyrics'):emptyState(navigator.onLine?'Still looking for the words':'You’re offline','Lyrics sources didn’t answer in time — they usually do on a second try.','lyrics',`<button class="pill sm ghost" data-lyretry>${I('refresh')} Try again</button>`);return}
    const a=this.align||{};const conf=d.transcribed?'Transcribed':a.method==='you'?'Synced by you':a.method==='transcript'?'Synced · checked by ear':vis&&!a.verified?'Approximate':a.verified?'Synced':a.method==='aligning'?'Syncing…':d.synced?'Auto-synced':'Lyrics';
    p.innerHTML=`<span class="sync-badge">${conf}</span><button class="pill sm resync" id="resync">${I('refresh')} Back to now</button><div class="ly" id="ly"><div class="ly-in" id="lyin" style="font-size:${Store.settings.lyricSize||1}em">${d.lines.map((l,i)=>vis&&!vis.has(i)?'':`<div class="ly-l ${l.instr?'instr':''}" data-li="${i}">${l.instr?'• • •':l.words&&l.words.length?l.words.map(w=>`<span class="w">${esc(w.w)}</span>`).join(' '):esc(l.text)}</div>`).join('')}</div></div>
    <div class="ly-tools">${d.synced?`<button class="tag btn" data-off="-0.25" aria-label="Lyrics earlier">−0.25s</button><button class="tag btn" data-tapsync>Tap the line you hear</button><button class="tag btn" data-off="0.25" aria-label="Lyrics later">+0.25s</button>`:''}<button class="tag btn" data-lys="-" aria-label="Smaller">A−</button><button class="tag btn" data-lys="+" aria-label="Larger">A+</button></div>`;
    this.active=-1;this.y=this.ty=0;this.bind();this.tick(true)},
  bind(){const ly=$('#ly');if(!ly)return;let sy=null,base=0;const user=()=>{this.userUntil=performance.now()+4000;$('#resync')?.classList.add('on')};
    ly.addEventListener('wheel',e=>{e.preventDefault();user();this.ty-=e.deltaY;this.y=this.ty;this.apply()},{passive:false});
    ly.addEventListener('pointerdown',e=>{e.stopPropagation();sy=e.clientY;base=this.ty;this.moved=false});ly.addEventListener('pointermove',e=>{if(sy==null)return;const dy=e.clientY-sy;if(Math.abs(dy)>6){this.moved=true;user();this.ty=base+dy;this.y=this.ty;this.apply()}});
    const end=()=>{sy=null};ly.addEventListener('pointerup',end);ly.addEventListener('pointercancel',end);ly.addEventListener('pointerleave',end);
    ly.addEventListener('click',e=>{if(this.moved)return;const l=e.target.closest('[data-li]');if(!l)return;const line=this.data.lines[+l.dataset.li];
      if(this.tapMode){this.setOffset(line.t-eng.time,'you');this.tapMode=false;return}
      const t=line.t-this.offset;if(t<0||(eng.duration&&t>eng.duration)){l.classList.add('nope');setTimeout(()=>l.classList.remove('nope'),500);return}eng.seek(t);this.userUntil=0;$('#resync')?.classList.remove('on')});
    $('#resync').onclick=()=>{this.userUntil=0;$('#resync').classList.remove('on')}},
  setOffset(o,method){this.offset=eng.kind==='yt'?o:Math.max(0,o);this.snaps={};this.align={verified:true,method,confidence:1};Store.offsets[this.track.id]={o:this.offset,at:Date.now()};Store.save('offsets');this.render()},
  tick(force){const d=this.data;if(d&&d.synced&&eng.playing&&eng.blob&&curSrc&&(curSrc.full||curSrc.kind==='local')&&performance.now()>this.nextCheck){this.nextCheck=performance.now()+30000;this.verify(this.track,eng.time+.5)}
    if(!d||!d.synced||!this.el||!$('#lyin'))return;const t=eng.time+this.offset+.08;let a=-1;for(let i=0;i<d.lines.length;i++){if(this.lt(i)<=t)a=i;else break}
    if(a!==this.active||force){this.active=a;$$('#lyin .ly-l').forEach(e=>{const i=+e.dataset.li;e.classList.toggle('on',i===a);e.classList.toggle('past',i<a);e.classList.toggle('out',i<a-3)});const el=$(`#lyin [data-li="${Math.max(0,a)}"]`);if(el&&performance.now()>this.userUntil){const ly=$('#ly');this.ty=-(el.offsetTop-ly.clientHeight*.32)}}
    const le=a>=0&&$(`#lyin [data-li="${a}"]`);if(le){const ws=d.lines[a].words||[];const sn=this.snaps[a]||0;$$('.w',le).forEach((w,i)=>{const x=ws[i];if(!x)return;const xt=x.t+sn,xe=x.e+sn;const p=t<=xt?0:t>=xe?100:(t-xt)/(xe-xt)*100;w.style.setProperty('--p',p+'%')})}
    if(!this.raf)this.loop()},
  loop(){const step=()=>{if(!$('#lyin')){this.raf=0;return}if(performance.now()>this.userUntil)this.y+=(this.ty-this.y)*.12;this.apply();if(eng.playing)this.tick();this.raf=requestAnimationFrame(step)};this.raf=requestAnimationFrame(step)},
  apply(){const e=$('#lyin');if(e)e.style.transform=`translate3d(0,${this.y}px,0)`}};
document.addEventListener('click',e=>{if(e.target.closest('[data-lyretry]')&&cur){Lyr.load(cur);return}const o=e.target.closest('[data-off]');if(o)Lyr.setOffset(Lyr.offset-(+o.dataset.off),'you');
  const ts=e.target.closest('[data-tapsync]');if(ts){Lyr.tapMode=true;ts.textContent='Now tap the line you hear';ts.classList.add('on')}
  const z=e.target.closest('[data-lys]');if(z){Store.settings.lyricSize=Math.max(.7,Math.min(1.6,(Store.settings.lyricSize||1)+(z.dataset.lys==='+'?.1:-.1)));Store.save('settings');Lyr.render()}});

/* ---------- visualizer (tap the artwork) ---------- */
const viz={on:false,async toggle(){if(!eng.blob){const a=$('#npart');a&&a.classList.add('nudge');setTimeout(()=>a&&a.classList.remove('nudge'),400);return}this.on=!this.on;this.on?this.start():this.stop()},
  async start(){const c=$('#npart .viz');if(!c||!eng.blob)return;eng.forceGraph=true;await eng.route(true);$('#npart').classList.add('viz-on');this.c=c},
  stop(){$('#npart')?.classList.remove('viz-on');if(eng.forceGraph){eng.forceGraph=false;eng.route(true)}},
  tick(){if(!this.on||!this.c||!this.c.isConnected||!eng.analyser)return;const c=this.c,an=eng.analyser,x=c.getContext('2d');const W=c.width=c.clientWidth*devicePixelRatio,H=c.height=c.clientHeight*devicePixelRatio;const fd=new Uint8Array(an.frequencyBinCount);an.getByteFrequencyData(fd);
    x.clearRect(0,0,W,H);const cx=W/2,cy=H/2,R=Math.min(W,H)*.2;x.lineWidth=2*devicePixelRatio;x.strokeStyle='rgba(255,255,255,.9)';x.beginPath();for(let i=0;i<=200;i++){const v=fd[Math.floor(i/200*fd.length*.55)]/255,a=i/200*Math.PI*2-Math.PI/2,r=R+v*R*1.2;x.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r)}x.closePath();x.stroke();
    const n=64;x.fillStyle='rgba(255,255,255,.55)';for(let i=0;i<n;i++){const v=fd[Math.floor(Math.pow(i/n,1.6)*fd.length*.6)]/255;const h=v*H*.22;x.fillRect(i*W/n+1,H-h,W/n-2,h)}}};
setInterval(()=>viz.tick(),33);

/* ---------- mixes & recommendations ---------- */
async function openMix(m,el){el&&el.classList.add('busy');let list=[];try{list=await m.build()}catch(e){}el&&el.classList.remove('busy');if(!list.length){el&&el.classList.add('nope');return}playList(list,0,m.title);openNP()}
const mixTile=(title,sub,build)=>{const id='mx:'+title;const t={id,kind:'mix',title,artist:sub,build};TR.set(id,t);return t};
async function artistMix(a){const pop=await API.popular(a.name);let collabs=[];if(a.id){try{const d=await API.artist(a.id);collabs=collaborators(d.songs,a.name).slice(0,4)}catch(e){}}
  const extra=(await Promise.all(collabs.map(c=>API.popular(c).catch(()=>[])))).flatMap(x=>x.slice(0,4));return shuffleMix(groupVersions([...pop.slice(0,12),...extra]))}
function shuffleMix(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
async function songRadio(t){const[pop,genre]=await Promise.all([API.popular(t.artist.split(/,|&/)[0]),API.genreTop(t.genre||'Pop',30)]);playList(groupVersions([t,...shuffleMix([...pop.slice(0,8),...hookRank(genre,profile()).slice(0,14)])]),0,t.title+' station')}
async function viral(){const c=SData.LS.get('tt',null);if(c&&Date.now()-c.at<432e5&&c.list.length)return c.list;const r=await Promise.all(VIRAL_SEED.slice(0,14).map(([ti,a])=>API.search(`${a} ${ti}`,{limit:3}).then(x=>x.find(y=>baseTitle(y.title)===baseTitle(ti))||x[0]).catch(()=>null)));
  const g=groupVersions(r.filter(Boolean)).map(t=>({...t,versions:undefined}));if(g.length>5&&!API.offline)SData.LS.set('tt',{at:Date.now(),list:g});return g}

/* ---------- stories: daily recap + year in review (not for brand-new listeners) ---------- */
function summarize(entries,minutes){const tr={},ar={},gn={};for(const h of entries){const k=h.track.id;tr[k]=tr[k]||{t:h.track,n:0};tr[k].n++;const a=h.track.artist.split(/,|&/)[0].trim();ar[a]=(ar[a]||0)+(h.ms||30000);if(h.track.genre)gn[h.track.genre]=(gn[h.track.genre]||0)+1}
  const tt=Object.values(tr).sort((a,b)=>b.n-a.n),ta=Object.entries(ar).sort((a,b)=>b[1]-a[1]),tg=Object.entries(gn).sort((a,b)=>b[1]-a[1]);
  const slim=t=>({title:t.title,artist:t.artist,art:t.art,id:t.id,preview:t.preview,album:t.album,durationMs:t.durationMs,artistId:t.artistId,src:t.src});
  return{minutes,plays:entries.length,tracks:tt.slice(0,5).map(x=>({...slim(x.t),n:x.n})),artists:ta.slice(0,5).map(x=>x[0]),genre:tg[0]?.[0]||null,artists_n:ta.length}}
function myDayStory(){const age=Date.now()-(Store.stats.first||Date.now());if(age<3*864e5)return null;const day=today();const mins=Math.round((Store.stats.days[day]||0)/60000);if(mins<10)return null;
  const start=new Date(day+'T00:00:00').getTime();const e=Store.history.filter(h=>h.at>=start&&!h.imported);if(e.length<3)return null;return{kind:'day',date:day,...summarize(e,mins)}}
function myYearStory(force){const d=new Date(),m=d.getMonth(),dd=d.getDate();const inWin=(m===11&&dd===31)||(m===0&&dd<=14);if(!inWin&&!force)return null;const y=m===0?d.getFullYear()-1:d.getFullYear();
  const days=Object.entries(Store.stats.days).filter(([k])=>k.startsWith(String(y)));const mins=Math.round(days.reduce((a,[,v])=>a+v,0)/60000);if(days.length<20||mins<300)return null;
  if((Store.stats.first||Date.now())>new Date(y,10,1).getTime())return null;const e=Store.history.filter(h=>new Date(h.at).getFullYear()===y);
  const s=summarize(e,mins);const hrs=Store.stats.hours;const peak=hrs.indexOf(Math.max(...hrs));const persona=s.artists_n>60?'The Explorer':s.tracks[0]&&s.tracks[0].n>e.length*.08?'The Loyalist':mins>6000?'The Marathoner':'The Curator';
  return{kind:'year',year:y,...s,peak,persona,days:days.length}}
function storySlides(st,name){const art=t=>`<img src="${esc(t.art||SData.placeholderArt(t.title))}" class="st-art">`;
  if(st.kind==='day')return[`<div class="st-k">${esc(name)}’s day</div><div class="st-big">${st.minutes}<small>minutes</small></div><p>${st.plays} plays · ${st.artists_n} artists</p>`,
    st.tracks[0]?`<div class="st-k">Most played today</div>${art(st.tracks[0])}<div class="st-t">${esc(st.tracks[0].title)}</div><p>${esc(st.tracks[0].artist)}</p><button class="pill" data-stplay="0">${I('play')} Play</button>`:'',
    st.artists.length?`<div class="st-k">On repeat</div>${st.artists.slice(0,5).map((a,i)=>`<div class="st-row"><b>${i+1}</b>${esc(a)}</div>`).join('')}${st.genre?`<p>Mostly ${esc(st.genre)}</p>`:''}`:''].filter(Boolean);
  return[`<div class="st-k">${esc(name)} · ${st.year}</div><div class="st-big">Wrapped</div><p>The year in music.</p>`,`<div class="st-k">Listened for</div><div class="st-big">${st.minutes.toLocaleString()}<small>minutes</small></div><p>across ${st.days} days</p>`,
    st.tracks[0]?`<div class="st-k">Song of the year</div>${art(st.tracks[0])}<div class="st-t">${esc(st.tracks[0].title)}</div><p>${esc(st.tracks[0].artist)} · ${st.tracks[0].n} plays</p><button class="pill" data-stplay="0">${I('play')} Play</button>`:'',
    `<div class="st-k">Top artists</div>${st.artists.map((a,i)=>`<div class="st-row"><b>${i+1}</b>${esc(a)}</div>`).join('')}`,`<div class="st-k">Top genre</div><div class="st-big" style="font-size:clamp(40px,9vw,72px)">${esc(st.genre||'Everything')}</div><p>Peak hour: ${st.peak%12||12}${st.peak<12?'am':'pm'}</p>`,
    `<div class="st-k">Listening personality</div><div class="st-big" style="font-size:clamp(40px,9vw,76px)">${esc(st.persona)}</div><button class="pill" data-stshare>${I('share')} Share</button>`].filter(Boolean)}
let stT=null;
function openStory(st,name){if(!st)return;const slides=storySlides(st,name);const el=$('#story');let i=0;
  el.innerHTML=`<div class="st-bg" style="background-image:url(&quot;${esc(st.tracks[0]?.art||'')}&quot;)"></div><div class="st-bars">${slides.map(()=>'<i><b></b></i>').join('')}</div><button class="icon-btn st-x" aria-label="Close">${I('close')}</button>${slides.map((s,k)=>`<div class="st-slide ${k?'':'on'}">${s}</div>`).join('')}`;
  el.classList.add('on');if(Layout.mode==='mobile')history.pushState({story:1},'');
  const show=k=>{if(k>=slides.length)return closeStoryNav();i=Math.max(0,k);$$('.st-slide',el).forEach((s,j)=>s.classList.toggle('on',j===i));$$('.st-bars b',el).forEach((b,j)=>{b.style.transition='none';b.style.width=j<i?'100%':'0%';if(j===i)requestAnimationFrame(()=>requestAnimationFrame(()=>{b.style.transition='width 5.5s linear';b.style.width='100%'}))});clearTimeout(stT);stT=setTimeout(()=>show(i+1),5600)};show(0);
  el.onclick=e=>{if(e.target.closest('.st-x'))return closeStoryNav();const pl=e.target.closest('[data-stplay]');if(pl){const t=st.tracks[+pl.dataset.stplay];closeStoryNav();playList(st.tracks,+pl.dataset.stplay,name+'’s picks');return}
    if(e.target.closest('[data-stshare]'))return shareYear(st);const r=el.getBoundingClientRect();show(e.clientX<r.width*.3?i-1:i+1)};
  if(!el._g){el._g=1;drag(el,{axis:'y',onMove:(dx,dy)=>{if(dy>0)el.style.transform=`translateY(${dy}px) scale(${1-dy/3000})`},onEnd:(dx,dy,v)=>{el.style.transform='';if(dy>120||v>.6)closeStoryNav()}})}}
function closeStoryNav(){if(history.state&&history.state.story)history.back();else closeStory()}
function closeStory(){clearTimeout(stT);$('#story').classList.remove('on')}
function shareYear(st){const c=document.createElement('canvas');c.width=1080;c.height=1920;const x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,1080,1920);x.fillStyle='#fff';x.font='800 120px Inter,Arial';x.fillText('Wrapped '+st.year,80,300);x.font='700 64px Inter,Arial';x.fillText(st.minutes.toLocaleString()+' minutes',80,480);
  x.font='600 52px Inter,Arial';st.artists.slice(0,5).forEach((a,k)=>x.fillText(`${k+1}. ${a}`.slice(0,30),80,680+k*90));if(st.tracks[0])x.fillText('#1 · '+st.tracks[0].title.slice(0,26),80,1260);x.font='800 90px Inter,Arial';x.fillText(st.persona,80,1500);x.font='700 48px Inter,Arial';x.fillText('▷ sniplit',80,1800);
  c.toBlob(b=>{const f=new File([b],'sniplit-wrapped.png',{type:'image/png'});if(navigator.canShare&&navigator.canShare({files:[f]}))navigator.share({files:[f]}).catch(()=>{});else SFile.download(b,f.name)})}
function storyRing(){const me=SSocial.me;const fr=Object.values(me.friends);const mine=myYearStory()||myDayStory();
  const items=[];if(mine)items.push({id:'me',name:'You',st:mine,live:true});for(const f of fr){const st=(f.p&&(f.p.year||f.p.story));if(st)items.push({id:f.id,name:f.name,st,live:f.p&&f.p.active})}
  if(!items.length)return'';return`<div class="stories">${items.map(x=>`<button class="story" data-story="${x.id}">${avatar(x.id==='me'?(me.name||'You'):x.name,x.id==='me'?me.id:x.id,58,true)}<span class="ell">${esc(x.name)}</span></button>`).join('')}</div>`}
document.addEventListener('click',e=>{const s=e.target.closest('[data-story]');if(!s)return;const id=s.dataset.story;if(id==='me')openStory(myYearStory()||myDayStory(),SSocial.me.name||'Your');else{const f=SSocial.me.friends[id];if(f&&f.p)openStory(f.p.year||f.p.story,f.name)}});

/* ---------- social glue ---------- */
let pushT=0;function socialPush(playlists){clearTimeout(pushT);pushT=setTimeout(()=>{SSocial.update()},800);discordPush()}
/* Discord status (desktop app). Can also mirror another of your devices (e.g. your phone) when this computer is idle. */
function discordPush(){const D=window.sniplitDesktop;if(!D)return;const s=Store.settings;if(s.discord===false){D.setNowPlaying(null);return}
  let n=cur&&eng.playing?{title:cur.title,artist:cur.artist,album:cur.album,art:cur.art&&cur.art.startsWith('https')?cur.art:'',url:cur.src==='local'?'':shareURL(cur),playing:true,position:eng.time,duration:eng.duration||0}:null;
  if(!n&&s.discordMirror){const f=SSocial.me.friends[s.discordMirror];const p=f&&f.p;if(p&&p.active&&p.now&&p.now.playing)n={title:p.now.title,artist:p.now.artist,album:p.now.album,art:p.now.art&&p.now.art.startsWith('https')?p.now.art:'',url:'',playing:true,position:0,duration:0}}
  if(!n&&cur)n={title:cur.title,artist:cur.artist,album:cur.album,art:cur.art&&cur.art.startsWith('https')?cur.art:'',playing:false,idleHide:true};
  D.setNowPlaying(n)}
eng.on('meta',discordPush);setInterval(()=>{if(window.sniplitDesktop&&Store.settings.discordMirror)discordPush()},15000);
SSocial.setProvider(()=>({taste:(()=>{const pr=profile();return{artists:pr.artists.slice(0,8).map(a=>a.name),genres:pr.genres.slice(0,4)}})(),now:cur?{title:cur.title,artist:cur.artist,art:cur.art,id:cur.id,preview:cur.preview,album:cur.album,artistId:cur.artistId,src:cur.src==='local'?'local':cur.src,playing:eng.playing,at:Date.now()}:null,
  story:myDayStory(),year:myYearStory(),playlists:Store.playlists.filter(p=>!p.private).map(p=>({id:p.id,name:p.name,tracks:p.tracks.filter(t=>t.src!=='local').slice(0,200).map(t=>({id:t.id,title:t.title,artist:t.artist,album:t.album,art:t.art&&!t.art.startsWith('data:')?t.art:'',preview:t.preview,durationMs:t.durationMs,artistId:t.artistId,src:t.src,ytId:t.ytId}))}))}));
SSocial.on(()=>{const n=Object.keys(SSocial.me.inReq).length;$$('[data-nav=friends] .dot').forEach(d=>d.remove());if(n)$$('[data-nav=friends]').forEach(b=>b.insertAdjacentHTML('beforeend',`<em class="dot">${Layout.mode==='mobile'?'':n}</em>`));if(location.hash.startsWith('#friends')&&!$('#view input:focus'))V.friends($('#view'),'',routeToken,true)});

/* =============== VIEWS =============== */
let homeMode=SData.LS.get('homeMode','all');
V.home=async(v,_,tok)=>{const prof=profile();const name=SSocial.me.name;
  v.innerHTML=`<header class="home-h"><div><h1>${greet()}${name?', '+esc(name.split(' ')[0]):''}</h1></div></header>${storyRing()}
  <div class="chips modes" id="modes">${[['all','All'],['music','Music'],['videos','Videos'],['podcasts','Podcasts'],['radio','Radio']].map(([k,l])=>`<button class="chip ${homeMode===k?'on':''}" data-mode="${k}">${l}</button>`).join('')}</div><div id="hm">${skeleton()}${skeleton()}</div>`;
  const fh=$('[data-hidehint]');if(fh)fh.onclick=()=>{SData.LS.set('fileHint',true);$('#fileHint').remove()};
  $('#modes').onclick=e=>{const b=e.target.closest('[data-mode]');if(!b)return;homeMode=b.dataset.mode;SData.LS.set('homeMode',homeMode);$$('#modes .chip').forEach(c=>c.classList.toggle('on',c===b));renderMode()};
  const renderMode=async()=>{const hm=$('#hm');hm.innerHTML=skeleton()+skeleton();if(homeMode==='videos')return Sections.videos(hm,tok);if(homeMode==='podcasts')return Sections.podcasts(hm,tok);if(homeMode==='radio')return Sections.radio(hm,tok);return homeMusic(hm,tok,prof)};renderMode()};
async function homeMusic(hm,tok,prof){const parts=[];
  const recent=[];const seen=new Set();for(const h of [...Store.history].reverse()){if(seen.has(h.track.id))continue;seen.add(h.track.id);recent.push(h.track);if(recent.length>=14)break}
  const friendsNow=Object.values(SSocial.me.friends).filter(f=>f.p&&f.p.now&&f.p.active).map(f=>({...f.p.now,id:f.p.now.id||('fn'+f.id),artist:f.name+' · '+f.p.now.artist}));
  if(API.offline||!navigator.onLine){const dls=SData.localLibrary().filter(t=>cachedIds.has(t.id)||t.src==='local');hm.innerHTML=`<div class="offline-bar">${I('offline')}<span>You’re offline — here’s everything that plays without a connection.</span></div>`+(dls.length?shelf('Ready offline',dls):'')+shelf('Jump back in',recent)+(dls.length||recent.length?'':emptyState('Nothing saved yet','Download songs or add files from this device to listen offline.','downloaded'));return}
  if(recent.length)parts.push(shelf('Jump back in',recent));
  if(friendsNow.length)parts.push(shelf('Friends are listening',friendsNow));
  if(!prof.cold){const top=prof.artists.slice(0,4);const mixes=top.map(a=>mixTile(a.name+' Mix','With '+a.name+' and similar',()=>artistMix(a)));
    mixes.push(mixTile('New for you','Fresh in '+(prof.genres[0]||'your genres'),async()=>hookRank(groupVersions((await Promise.all(prof.genres.slice(0,3).map(g=>API.genreTop(g,40)))).flat()),prof).filter(t=>!prof.artists.slice(0,8).some(a=>artistKey(a.name)===artistKey(t.artist))).slice(0,30)));
    mixes.push(mixTile('Deeper','Album cuts & rarities from artists you play',async()=>{const out=[];for(const a of prof.artists.slice(0,4)){if(!a.id)continue;const[d,p]=await Promise.all([API.artist(a.id),API.popular(a.name)]);const vv=vault(d.songs,p);out.push(...vv.gems.slice(0,5),...vv.rare.slice(0,3))}return shuffleMix(out)}));
    parts.push(`<section class="sec"><div class="sec-h"><h2>Made for you</h2></div><div class="mixes">${mixes.map(m=>{const a=[...Object.values(Store.likes),...recent].find(x=>m.title.startsWith(x.artist.split(/,|&/)[0].trim()))||recent[mixes.indexOf(m)]||{};return`<div class="mix" data-play="${esc(m.id)}" tabindex="0">${a.art?`<img src="${esc(a.art)}" alt="">`:''}<div><b>${esc(m.title)}</b><small>${esc(m.artist)}</small></div></div>`}).join('')}</div></section>`)}
  if(!live(tok))return;
  // every shelf below loads on its own: cached copy shows instantly, the fresh one swaps in when it lands
  const slots=[
    ['now','Right now',async()=>[['Right now',groupVersions(await viral().catch(()=>[])).slice(0,20)]]],
    ['pop','Popular',async()=>[['Popular',groupVersions(await SSrc.Deezer.chart(40).catch(()=>[])).slice(0,20)]]],
    ['fresh','Fresh finds',async()=>[['Fresh finds',(await SSrc.Audius.trending()).slice(0,16)]]],
    ['dzpl','Playlists people love',async()=>[['Playlists people love',(await SSrc.Playlists.top()).slice(0,14)]]]];
  if(!prof.cold){const top=prof.artists[0];
    slots.push(['like','You might like',async()=>[['You might like',hookRank(groupVersions(await API.genreTop(prof.genres[0]||'Pop',50).catch(()=>[])),prof).slice(0,14)]]]);
    if(top.id)slots.push(['more:'+top.id,'More from '+top.name,async()=>{const[d,pop]=await Promise.all([API.artist(top.id),API.popular(top.name).catch(()=>[])]);const cs=collaborators(d.songs,top.name).slice(0,8);const vv=vault(d.songs,pop);
      const tiles=cs.map(c=>{const src=d.songs.find(x=>(x.artist+x.title).includes(c));return{id:'aq:'+c,kind:'artistq',title:c,artist:'Artist',art:src?src.art:''}});return[['More from '+top.name,vv.gems.slice(0,12),{see:'artist-'+top.id+'-vault'}],['Artists like '+top.name,tiles,{round:true}]]}])}
  const HC=SData.LS.get('homeCache',{});const slim=t=>({...t,preview:t.dzId?null:t.preview,versions:t.versions&&t.versions.length>1?t.versions.slice(0,6).map(v=>({...v,versions:undefined})):undefined});
  const draw=list=>list.map(([ti,items,o])=>shelf(ti,items,o||{})).join('');
  hm.innerHTML=parts.join('')+slots.map(([k,title])=>{const c=HC[k];return`<div data-slot="${esc(k)}">${c&&c.list&&c.list.some(x=>x[1].length)?draw(c.list):`<section class="sec"><div class="sec-h"><h2 class="sk-t">${esc(title)}</h2></div>${skeleton()}</section>`}</div>`}).join('')+
    (prof.cold?`<section class="sec"><div class="sec-h"><h2>What do you like?</h2></div><div class="chips wrap">${['Hip-Hop/Rap','R&B/Soul','Pop','Alternative','Rock','Electronic','Dance','Country','Latin','K-Pop','Jazz','Indie Pop','Metal','Afrobeats','Classical','Soundtrack'].map(g=>`<button class="chip" data-seedgenre="${g}">${g}</button>`).join('')}</div></section>`:'');
  $$('[data-seedgenre]',hm).forEach(b=>b.onclick=async()=>{b.classList.toggle('on');const top=await API.genreTop(b.dataset.seedgenre,6);top.slice(0,2).forEach(t=>Store.likes[t.id]={...t,likedAt:Date.now(),seed:true});Store.save('likes')});
  let saveT;const fresh=k=>HC[k]&&Date.now()-HC[k].at<6e5;
  await Promise.all(slots.map(async([k,,fn])=>{if(fresh(k))return;let list=[];try{list=await Promise.race([fn(),new Promise(r=>setTimeout(()=>r(null),12000))])||[]}catch(e){}
    if(!live(tok))return;const el=hm.querySelector(`[data-slot="${CSS.escape(k)}"]`);if(!el)return;list=list.filter(x=>x[1]&&x[1].length);
    if(list.length){const sy=scrollY;el.innerHTML=draw(list);el.classList.add('in');if(Math.abs(scrollY-sy)>2)scrollTo(0,sy);HC[k]={at:Date.now(),list:list.map(([a,b,o])=>[a,b.slice(0,20).map(slim),o])};clearTimeout(saveT);saveT=setTimeout(()=>SData.LS.set('homeCache',HC),400)}
    else if(!(HC[k]&&HC[k].list))el.innerHTML=''}));
  if(!live(tok))return;if(API.offline&&!recent.length&&!hm.querySelector('.tile')){hm.innerHTML=`<div class="offline-bar">${I('offline')}<span>You’re offline. Downloads and music on this device still play.</span><a class="pill sm ghost" href="#library-downloads">Downloads</a></div>`}}
const Sections={
  async radio(el,tok){let tag='pop';const draw=async()=>{el.innerHTML=`<div class="chips" id="rt">${['pop','hiphop','rnb','jazz','classical','electronic','rock','news','talk','lofi','latin','kpop','ambient','country'].map(t=>`<button class="chip ${t===tag?'on':''}" data-rt="${t}">${t}</button>`).join('')}</div><div id="rl" style="margin-top:14px">${skeleton(8,'rows')}</div>`;
    $('#rt').onclick=e=>{const b=e.target.closest('[data-rt]');if(b){tag=b.dataset.rt;draw()}};const r=await Radio.search({tag,limit:40});if(!live(tok)||!$('#rl'))return;$('#rl').innerHTML=r.length?trackRows(r,{numbers:false,ctx:'Radio · '+tag}):emptyState('Stations unavailable','The radio directory can’t be reached right now.','radio')};draw()},
  async podcasts(el,tok){el.innerHTML=`<div class="search" style="margin-bottom:14px">${I('search')}<input id="pq" placeholder="Search podcasts"></div><div id="pl">${skeleton()}</div>`;
    const show=async term=>{const r=await Pod.search(term);if(!live(tok)||!$('#pl'))return;$('#pl').innerHTML=r.length?`<div class="grid-tiles">${r.map(p=>{const t={...p,kind:'podcast'};TR.set(p.id,t);return tileHTML(t)}).join('')}</div>`:emptyState('No shows found','Try another search.','podcast')};
    show('music');let tm;$('#pq').oninput=e=>{clearTimeout(tm);tm=setTimeout(()=>show(e.target.value||'music'),350)}},
  async videos(el,tok){if(false){el.innerHTML=`<div class="card"><b>Watch music videos, documentaries & shows</b><p class="mut small">Paste any YouTube link to play it here, or add a YouTube key in Settings → Connections to browse.</p><div class="row"><input id="vurl" placeholder="youtube.com/watch?v=…"><button class="pill sm" id="vgo">Play</button></div></div>`;
      $('#vgo').onclick=async()=>{const id=YT.parseId($('#vurl').value);if(!id){$('#vurl').classList.add('bad');return}const o=await YT.oembed(id);playList([{id:'yt:'+id,src:'youtube',ytId:id,title:o?.title||'Video',artist:o?.author_name||'YouTube',art:o?.thumbnail_url||'',album:'Video',durationMs:0}],0,'Video');openNP()};return}
    el.innerHTML=`<div class="search">${I('search')}<input id="vq" placeholder="Search videos"></div><div id="vl">${skeleton()}</div>`;const vl=$('#vl');let h='';
    for(const[n,q,m] of [['Music videos','official music video',true],['Documentaries','music documentary',false],['Shows & podcasts','music podcast episode',false],['Live sessions','live session',true]]){try{h+=shelf(n,await YT.search(q,{max:10,music:m}))}catch(e){h=emptyState('Videos unavailable',esc(e.message),'video');break}if(!live(tok))return;vl.innerHTML=h}
    let tm;$('#vq').oninput=e=>{clearTimeout(tm);tm=setTimeout(async()=>{const q=e.target.value.trim();if(!q)return;vl.innerHTML=skeleton();try{vl.innerHTML=shelf('Results',await YT.search(q,{max:20}))}catch(x){vl.innerHTML=emptyState('Search failed',esc(x.message),'video')}},400)}}};

V.search=async(v)=>{let filter='All';v.innerHTML=`<h1>Search</h1><div class="search" style="margin:14px 0">${I('search')}<input id="q" placeholder="What do you want to hear?" autocomplete="off" enterkeyhint="search" value="${esc(V.search.last??SData.LS.get('lastSearch',''))}"></div>
  <div class="chips" id="sf">${['All','Songs','Albums','Artists','Playlists','Videos','Podcasts','Radio'].map(f=>`<button class="chip ${f==='All'?'on':''}" data-f="${f}">${f}</button>`).join('')}</div><div id="sr" style="margin-top:14px"></div>`;
  const q=$('#q');if(Layout.mode!=='mobile')setTimeout(()=>q.focus(),60);let tmr;
  const run=async()=>{const term=q.value.trim();V.search.last=term;SData.LS.set('lastSearch',term);const out=$('#sr');if(!term){out.innerHTML=recentSearches()+browseHTML();return}clearTimeout(V.search.kt);V.search.kt=setTimeout(()=>{if(term.length<2)return;Store.searches=[term,...Store.searches.filter(x=>x.toLowerCase()!==term.toLowerCase())].slice(0,12);Store.save('searches')},1800);out.innerHTML=skeleton(6,'rows');
    const want=f=>filter==='All'||filter===f;const jobs=[];
    if(want('Songs'))jobs.push(API.search(term,{limit:50}).then(r=>['songs',groupVersions(r)]));if(want('Artists'))jobs.push(API.search(term,{entity:'musicArtist',limit:6}).then(r=>['artists',r]));
    if(want('Albums'))jobs.push(API.search(term,{entity:'album',limit:20}).then(r=>['albums',r]));if(want('Podcasts'))jobs.push(Pod.search(term).then(r=>['pods',r]));
    if(want('Radio'))jobs.push(Radio.search({name:term,limit:20}).then(r=>['radio',r]));if(filter==='All'||filter==='Songs')jobs.push(SSrc.Audius.search(term).then(r=>['indie',r]));if(want('Videos'))jobs.push(YT.search(term,{max:12}).then(r=>['videos',r]).catch(e=>['videos',[]]));if(want('Playlists'))jobs.push(SSrc.Playlists.search(term).then(r=>['xpls',r]));
    const res={};let left=jobs.length,raf=0;const paint=()=>{raf=0;if(q.value.trim()!==term)return;let h='';const pls=Store.playlists.filter(p=>p.name.toLowerCase().includes(term.toLowerCase()));
    if(res.artists&&res.artists[0]&&filter==='All'){const a=res.artists[0];const s0=(res.songs||[]).find(s=>s.artistId===a.artistId);h+=`<a class="top-hit" href="#artist-${a.artistId}"><img src="${esc(s0?.art||SData.placeholderArt(a.name))}" alt=""><div class="grow"><b>${esc(a.name)}</b><small>Artist${a.genre?' · '+esc(a.genre):''}</small></div><button class="pill sm ghost" data-follow='${esc(JSON.stringify({id:a.artistId,name:a.name,genre:a.genre}))}'>${Store.follows[a.artistId]?'Following':'Follow'}</button></a>`}
    if(res.songs&&res.songs.length)h+=(filter==='All'?'<h2 class="list-h">Songs</h2>':'')+trackRows(res.songs.slice(0,filter==='All'?8:50),{ctx:'Search: '+term,showAlbum:true});
    if(res.artists&&res.artists.length&&filter==='Artists')h+=shelf('Artists',res.artists.map(a=>{const t={id:'ar:'+a.artistId,kind:'artist',artistId:a.artistId,title:a.name,artist:a.genre||'Artist',art:''};TR.set(t.id,t);return t}),{round:true});
    if(res.albums&&res.albums.length)h+=shelf('Albums',res.albums.map(a=>{const t={...a,kind:'album',artist:a.artist+' · '+a.year};TR.set(a.id,t);return t}));
    if(pls.length&&want('Playlists'))h+=shelf('Your playlists',pls.map(p=>{const t={id:'plt:'+p.id,kind:'playlist',plId:p.id,title:p.name,artist:pl(p.tracks.length,'song'),art:p.tracks[0]?.art};TR.set(t.id,t);return t}));
    if(res.xpls&&res.xpls.length)h+=shelf('Playlists',res.xpls);if(Array.isArray(res.videos)&&res.videos.length)h+=shelf('Videos',res.videos);
    if(res.pods&&res.pods.length)h+=shelf('Podcasts',res.pods.map(p=>{const t={...p,kind:'podcast'};TR.set(p.id,t);return t}));if(res.radio&&res.radio.length)h+=shelf('Radio',res.radio);if(res.indie&&res.indie.length)h+=shelf('Independent',res.indie.slice(0,14));if(res.artists&&res.artists[0]&&filter==='All')h+='<div id="sr-live"></div>';
    const sy=scrollY;out.innerHTML=(h||(left?'':emptyState(API.offline?'You’re offline':'No results',API.offline?'Searching what’s saved on this device only.':'Try different words.','search')))+(left?skeleton(4,'rows'):'');if(Math.abs(scrollY-sy)>2)scrollTo(0,sy);
    $$('[data-follow]',out).forEach(b=>b.onclick=e=>{e.preventDefault();const a=JSON.parse(b.dataset.follow);toggleFollow(a);b.textContent=Store.follows[a.id]?'Following':'Follow'})};
    // each source paints as soon as it answers; songs usually land first
    await Promise.all(jobs.map(j=>j.catch(()=>null).then(r=>{left--;if(r)res[r[0]]=r[1];if(q.value.trim()!==term)return;if(!left||r&&(r[0]==='songs'||r[0]==='artists')){cancelAnimationFrame(raf);paint()}else if(!raf)raf=requestAnimationFrame(paint)})));if(q.value.trim()!==term)return;
    if(res.artists&&res.artists[0]&&filter==='All')SSrc.IA.shows(res.artists[0].name).then(sh=>{const el=$('#sr-live');if(el&&sh.length&&q.value.trim()===term)el.innerHTML=shelf('Live recordings',sh.slice(0,12).map(x=>{const t={...x,artist:x.date||'Live'};TR.set(x.id,t);return t}))});
};
  q.oninput=()=>{clearTimeout(tmr);tmr=setTimeout(run,320)};$('#sf').onclick=e=>{const b=e.target.closest('[data-f]');if(!b)return;filter=b.dataset.f;$$('#sf .chip').forEach(c=>c.classList.toggle('on',c===b));run()};run()};
function recentSearches(){return Store.searches.length?`<h2 class="list-h">Recent searches</h2><div class="chips wrap" id="rs">${Store.searches.map(x=>`<button class="chip" data-rs="${esc(x)}">${esc(x)}</button>`).join('')}</div>`:''}
document.addEventListener('click',e=>{const b=e.target.closest('[data-rs]');if(b&&$('#q')){$('#q').value=b.dataset.rs;$('#q').dispatchEvent(new Event('input'))}});
function browseHTML(){return`<h2 class="list-h">Browse</h2><div class="genres">${['Hip-Hop/Rap','R&B/Soul','Pop','Alternative','Electronic','Rock','Country','Latin','K-Pop','Jazz','Afrobeats','Classical'].map((g,i)=>`<button class="genre" data-genre="${g}" style="--h:${i*30}"><b>${g}</b></button>`).join('')}</div>`}
document.addEventListener('click',async e=>{const g=e.target.closest('[data-genre]');if(g){g.classList.add('busy');const list=groupVersions(await API.genreTop(g.dataset.genre,50));g.classList.remove('busy');if(list.length){playList(hookRank(list,profile()),0,g.dataset.genre);openNP()}else g.classList.add('nope')}});

V.artist=async(v,arg,tok)=>{const[id,tab0]=arg.split('-');let tab=tab0||'popular';v.innerHTML=`<div class="hero sk"></div>${skeleton(6,'rows')}`;
  const d=await API.artist(id);if(!live(tok))return;const name=d.info.name;
  const[pop,dzA,adb,wiki,mb,shows,tour]=await Promise.all([API.popular(name),SSrc.Deezer.artist(name),SSrc.ADB.artist(name),SSrc.Wiki.summary(name),SSrc.MB.artist(name),SSrc.IA.shows(name),SSrc.Tour.events(name)]);if(!live(tok))return;
  const dzTop=dzA?await SSrc.Deezer.top(dzA.id):[];const popG=groupVersions(SSrc.mergeTracks([...pop],dzTop.filter(t=>artistKey(t.artist)===artistKey(name))));
  const vv=vault(d.songs,pop);const coll=collaborators(d.songs,name);const photo=(adb&&(adb.fanart||adb.thumb))||(wiki&&wiki.image)||(dzA&&dzA.picture_xl)||(d.albums[0]||popG[0]||{}).art||'';
  const bio=(wiki&&wiki.bio)||(adb&&adb.bio)||'';const facts=[adb&&adb.formed,(adb&&adb.country)||(mb&&mb.country),adb&&adb.style,adb&&adb.mood].filter(Boolean);
  v.innerHTML=`<div class="hero"><div class="bgimg" style="background-image:url(&quot;${esc(photo.replace('600x600','1200x1200'))}&quot;)"></div><div class="grow"><span class="kicker">${esc(d.info.genre||'Artist')}${dzA&&dzA.nb_fan?' · '+Intl.NumberFormat('en',{notation:'compact'}).format(dzA.nb_fan)+' fans':''}</span><h1>${esc(name)}</h1></div>
    <div class="row"><button class="pill" id="aplay">${I('play')} Play</button><button class="pill ghost light" id="afol">${Store.follows[id]?'Following':'Follow'}</button></div></div>
  <div class="seg-u" id="atabs">${[['popular','Popular'],['vault','Vault'],['albums','Releases'],...(shows.length?[['live','Live']]:[]),['related','Similar'],['about','About']].map(([k,l])=>`<button data-at="${k}">${l}</button>`).join('')}</div><div id="ab"></div>`;
  const body=$('#ab');const render=async()=>{$$('#atabs button').forEach(b=>b.classList.toggle('on',b.dataset.at===tab));
    if(tab==='popular')body.innerHTML=trackRows(popG.slice(0,15),{ctx:name})+(tour.length?`<h2 class="list-h">On tour</h2><div class="lib-list">${tour.slice(0,4).map(e=>`<a class="lib-row" href="${esc(e.url||'#')}" target="_blank" rel="noopener"><span class="ph date"><b>${new Date(e.when).toLocaleDateString(undefined,{day:'numeric'})}</b><small>${new Date(e.when).toLocaleDateString(undefined,{month:'short'})}</small></span><div class="grow"><b class="ell">${esc(e.venue||'')}</b><small>${esc(e.city)}</small></div>${I('chevRight')}</a>`).join('')}</div>`:'')+shelf('Latest releases',d.albums.slice(0,12).map(a=>{const t={...a,kind:'album',artist:a.year};TR.set(a.id,t);return t}));
    if(tab==='vault')body.innerHTML=!vv.rare.length&&!vv.gems.length&&!vv.live.length&&!shows.length?emptyState('Nothing hidden here yet','This artist’s catalog is all on the Popular tab.','vault'):(vv.rare.length?'<h2 class="list-h">Rarities</h2>'+trackRows(vv.rare.slice(0,30),{ctx:name+' · Vault'}):'')+(vv.gems.length?'<h2 class="list-h">Deep cuts</h2>'+trackRows(vv.gems.slice(0,30),{ctx:name+' · Vault'}):'')+(vv.live.length?'<h2 class="list-h">Live</h2>'+trackRows(vv.live.slice(0,15),{ctx:name+' · Live'}):'')+(shows.length?shelf('Live in concert',shows.slice(0,12).map(x=>{const t={...x,artist:x.date};TR.set(x.id,t);return t})):'');
    if(tab==='albums')body.innerHTML=`<div class="grid-tiles">${d.albums.map(a=>{const t={...a,kind:'album',artist:a.year+(a.count?' · '+pl(a.count,'song'):'')};TR.set(a.id,t);return tileHTML(t)}).join('')}</div>`;
    if(tab==='live')body.innerHTML=`<div class="grid-tiles">${shows.map(x=>{const t={...x,artist:x.date||'Live'};TR.set(x.id,t);return tileHTML(t)}).join('')}</div>`;
    if(tab==='related'){body.innerHTML=skeleton(6);const[rel,lb]=await Promise.all([dzA?SSrc.Deezer.related(dzA.id):[],mb?SSrc.LB.similar(mb.mbid):[]]);if(!live(tok))return;
      const names=new Map();rel.forEach(r=>names.set(artistKey(r.name),{name:r.name,art:r.art}));lb.forEach(r=>{if(!names.has(artistKey(r.name)))names.set(artistKey(r.name),{name:r.name,art:''})});
      const tile=(n,art,sub)=>{const t={id:'aq:'+n,kind:'artistq',title:n,artist:sub,art:art||''};TR.set(t.id,t);return t};
      body.innerHTML=shelf('Fans also like',[...names.values()].slice(0,16).map(x=>tile(x.name,x.art,'Artist')),{round:true})+shelf('Worked with',coll.slice(0,10).map(c=>{const src=d.songs.find(x=>(x.artist+x.title).includes(c));return tile(c,src?src.art:'','Collaborator')}),{round:true})||emptyState('No similar artists yet','Check back soon.','friends')}
    if(tab==='about')body.innerHTML=`<div class="about">${(adb&&(adb.fanart||adb.thumb))||(wiki&&wiki.image)?`<img src="${esc((adb&&(adb.thumb||adb.fanart))||wiki.image)}" alt="" class="about-img">`:''}<div class="card">${facts.length?`<div class="chips wrap" style="margin-bottom:10px">${facts.map(f=>`<span class="tag">${esc(f)}</span>`).join('')}${(mb&&mb.tags||[]).slice(0,4).map(f=>`<span class="tag">${esc(f)}</span>`).join('')}</div>`:''}
      ${bio?`<p class="bio">${esc(bio.length>1400?bio.slice(0,1400).replace(/\s\S*$/,'')+'…':bio)}</p>`:`<p class="mut">${esc(name)}${d.info.genre?' · '+esc(d.info.genre):''}</p>`}
      <p class="mut small">${d.albums.length} releases${d.albums.length?' · '+esc((d.albums[d.albums.length-1]||{}).year||'')+'–'+esc((d.albums[0]||{}).year||''):''}</p>
      <div class="row" style="flex-wrap:wrap">${wiki&&wiki.url?`<a class="pill sm ghost" href="${esc(wiki.url)}" target="_blank" rel="noopener">Wikipedia</a>`:''}${d.info.url?`<a class="pill sm ghost" href="${esc(d.info.url)}" target="_blank" rel="noopener">Apple Music</a>`:''}${adb&&adb.site?`<a class="pill sm ghost" href="https://${esc(adb.site.replace(/^https?:\/\//,''))}" target="_blank" rel="noopener">Website</a>`:''}</div></div>
      ${tour.length?`<h2 class="list-h">Upcoming shows</h2><div class="lib-list">${tour.map(e=>`<a class="lib-row" href="${esc(e.url||'#')}" target="_blank" rel="noopener"><span class="ph date"><b>${new Date(e.when).getDate()}</b><small>${new Date(e.when).toLocaleDateString(undefined,{month:'short'})}</small></span><div class="grow"><b class="ell">${esc(e.venue||'')}</b><small>${esc(e.city)}</small></div>${I('chevRight')}</a>`).join('')}</div>`:''}</div>`};
  render();$('#atabs').onclick=e=>{const b=e.target.closest('[data-at]');if(b){tab=b.dataset.at;render()}};
  $('#aplay').onclick=()=>{playList(tab==='vault'?[...vv.rare,...vv.gems]:popG,0,name);openNP()};$('#afol').onclick=()=>{toggleFollow({id,name,genre:d.info.genre});$('#afol').textContent=Store.follows[id]?'Following':'Follow'}};
V.show=async(v,ident,tok)=>{v.innerHTML=skeleton(8,'rows');const tr=await SSrc.IA.tracks(ident);if(!live(tok))return;
  v.innerHTML=tr.length?`<div class="coll-h"><img src="${esc(tr[0].art)}" alt=""><div class="grow"><span class="kicker">Live recording</span><h1>${esc(tr[0].album||'')}</h1><p class="mut">${esc(tr[0].artist||'')} · ${pl(tr.length,'track')}</p><div class="row"><button class="pill" id="shp">${I('play')} Play</button></div></div></div><div style="margin-top:20px">${trackRows(tr,{ctx:tr[0].album})}</div>`:emptyState('Recording unavailable','Try again later.','radio');
  const b=$('#shp');if(b)b.onclick=()=>{playList(tr,0,tr[0].album);openNP()}};
V.album=async(v,id,tok)=>{v.innerHTML=skeleton(8,'rows');const d=await API.album(id);if(!live(tok))return;if(!d.album){v.innerHTML=emptyState('Album unavailable','Try again when you’re online.','music');return}const a=d.album;
  v.innerHTML=`<div class="coll-h"><img src="${esc(a.art)}" alt=""><div class="grow"><span class="kicker">Album · ${esc(a.year)}</span><h1>${esc(a.title)}</h1><a class="mut" href="#artist-${a.artistId}">${esc(a.artist)}</a><div class="row" style="margin-top:14px"><button class="pill" id="alp">${I('play')} Play</button><button class="icon-btn" id="aldl" aria-label="Download album">${I('download')}</button></div></div></div><div style="margin-top:22px">${trackRows(d.tracks,{ctx:a.title})}</div>`;
  $('#alp').onclick=()=>{playList(d.tracks,0,a.title);openNP()};$('#aldl').onclick=()=>cacheMany(d.tracks,a.title)};
V.library=async(v,f0)=>{let f=f0||'playlists';const draw=async()=>{const counts={playlists:Store.playlists.length,liked:Object.keys(Store.likes).length,downloads:cachedIds.size,local:Store.imports.length,artists:Object.keys(Store.follows).length,history:Store.history.length};
  v.innerHTML=`<div class="row" style="justify-content:space-between"><h1>Library</h1><button class="icon-btn" data-act="create" aria-label="Create">${I('plus')}</button></div>
  <div class="chips" id="lf">${[['playlists','Playlists'],['liked','Liked'],['downloads','Downloads'],['local','On this device'],['artists','Artists'],['history','History']].map(([k,l])=>`<button class="chip ${f===k?'on':''}" data-lf="${k}">${l}${counts[k]?` <span class="ct">${counts[k]}</span>`:''}</button>`).join('')}</div><div id="lb" style="margin-top:16px"></div>`;
  $('#lf').onclick=e=>{const b=e.target.closest('[data-lf]');if(b){f=b.dataset.lf;history.replaceState(null,'','#library-'+f);draw()}};const lb=$('#lb');
  if(f==='playlists'){const rows=[{href:'#liked',name:'Liked Songs',sub:pl(counts.liked,'song'),icon:'heartF'},...Store.playlists.map(p=>({href:'#playlist-'+p.id,name:p.name,sub:pl(p.tracks.length,'song')+(p.from?' · from '+p.from:''),art:p.tracks[0]?.art}))];
    lb.innerHTML=`<div class="lib-list">${rows.map(r=>`<a class="lib-row" href="${r.href}">${r.art?`<img src="${esc(r.art)}" alt="">`:`<span class="ph">${I(r.icon||'list')}</span>`}<div class="grow"><b class="ell">${esc(r.name)}</b><small>${esc(r.sub)}</small></div>${I('chevRight')}</a>`).join('')}</div>${Store.pending.length?`<p class="mut small" style="margin-top:14px">${Store.pending.length} imported songs are still being matched. <a href="#" id="retry">Retry now</a></p>`:''}`;
    const r=$('#retry');if(r)r.onclick=async e=>{e.preventDefault();r.textContent='Matching…';const p=Store.pending.splice(0);Store.save('pending');await SImport.applyImport({source:'Retry',likes:p.filter(x=>x._k==='like'),playlists:[],history:[]});draw()}}
  if(f==='liked')return go('liked');
  if(f==='downloads'){const keys=await IDB.keys('audio');const items=(await Promise.all(keys.map(k=>IDB.get('audio',k)))).filter(Boolean);const size=items.reduce((a,b)=>a+(b.size||0),0);
    lb.innerHTML=items.length?`<p class="mut small">${items.length} songs · ${(size/1048576).toFixed(1)} MB${Store.premium?'':` · ${FREE_CACHE_LIMIT} max on Free`}</p>${trackRows(items.map(i=>i.meta),{ctx:'Downloads'})}<button class="pill sm ghost" id="clr" style="margin-top:14px">${I('trash')} Remove all downloads</button>`:emptyState('No downloads yet','Tap the download button on any song, album or playlist to keep it offline.','download');
    const c=$('#clr');if(c)c.onclick=async()=>{if(!c.dataset.sure){c.dataset.sure=1;c.innerHTML=`${I('trash')} Tap again to remove`;return}for(const k of keys){await IDB.del('audio',k);cachedIds.delete(k)}refreshSide();draw()}}
  if(f==='local')lb.innerHTML=Store.imports.length?trackRows(Store.imports,{ctx:'On this device',showAlbum:true}):emptyState('Your own music','Add audio files or a whole folder — they play in full with every studio tool.','folder',`<button class="pill" data-act="create">${I('plus')} Add music</button>`);
  if(f==='artists'){const fl=Object.values(Store.follows);lb.innerHTML=fl.length?`<div class="grid-tiles">${fl.map(a=>{const t={id:'ar:'+a.id,kind:'artist',artistId:a.id,title:a.name,artist:a.genre||'Artist',art:SData.localLibrary().find(x=>String(x.artistId)===String(a.id))?.art};TR.set(t.id,t);return tileHTML(t,{round:true})}).join('')}</div>`:emptyState('Follow artists','Following shapes what shows up on Home.','user')}
  if(f==='history'){const h=[...Store.history].reverse().slice(0,300);lb.innerHTML=h.length?`<p class="mut small">${fmt(Store.stats.ms/1000)} listened in total</p>`+trackRows(h.map(x=>x.track),{numbers:false,ctx:'History'}):emptyState('Nothing yet','Songs you play show up here.','clock')}};draw()};
V.liked=v=>{const list=Object.values(Store.likes).sort((a,b)=>(b.likedAt||0)-(a.likedAt||0));v.innerHTML=`<div class="coll-h"><div class="cover-liked">${I('heartF')}</div><div class="grow"><span class="kicker">Playlist</span><h1>Liked Songs</h1><p class="mut">${list.length} songs</p><div class="row"><button class="pill" id="lp">${I('play')} Play</button><button class="icon-btn" id="ls" aria-label="Shuffle">${I('shuffle')}</button><button class="icon-btn" id="ld" aria-label="Download">${I('download')}</button></div></div></div><div style="margin-top:20px">${list.length?trackRows(list,{ctx:'Liked Songs',showAlbum:true}):emptyState('Songs you like','Tap the heart on anything you love.','heart')}</div>`;
  $('#lp').onclick=()=>list.length&&playList(list,0,'Liked Songs');$('#ls').onclick=()=>{Q.shuffle=true;list.length&&playList(shuffleMix(list),0,'Liked Songs')};$('#ld').onclick=()=>cacheMany(list,'Liked Songs')};
V.playlist=(v,id)=>{const p=Store.playlists.find(x=>x.id===id);if(!p){v.innerHTML=emptyState('Playlist not found','It may have been deleted.','list');return}
  v.innerHTML=`<div class="coll-h"><img src="${esc(p.tracks[0]?.art||SData.placeholderArt(p.name))}" alt=""><div class="grow"><span class="kicker">Playlist${p.from?' · from '+esc(p.from):''}</span><h1 contenteditable="true" spellcheck="false" id="pn">${esc(p.name)}</h1><p class="mut">${p.tracks.length} songs${p.private?' · private':''}</p>
  <div class="row" style="flex-wrap:wrap"><button class="pill" id="pp">${I('play')} Play</button><button class="icon-btn" id="pd" aria-label="Download">${I('download')}</button><button class="icon-btn" id="pl" aria-label="Repeat playlist">${I('repeat')}</button><button class="icon-btn" id="pv" aria-label="Visibility">${I(p.private?'lock':'friends')}</button><button class="icon-btn" id="pe" aria-label="Export">${I('export')}</button><button class="icon-btn" id="px" aria-label="Delete">${I('trash')}</button></div></div></div><div style="margin-top:20px">${p.tracks.length?trackRows(p.tracks,{ctx:p.name}):emptyState('Empty playlist','Add songs from any ⋯ menu.','plus')}</div>`;
  $('#pn').onblur=()=>{p.name=$('#pn').textContent.trim()||p.name;Store.save('playlists');refreshSide();socialPush(true)};$('#pp').onclick=()=>p.tracks.length&&playList(p.tracks,0,p.name);$('#pd').onclick=()=>cacheMany(p.tracks,p.name);
  $('#pl').onclick=()=>{Q.loop='all';renderLoopBtns();$('#pl').classList.add('on');p.tracks.length&&playList(p.tracks,0,p.name)};
  $('#pv').onclick=()=>{p.private=!p.private;Store.save('playlists');socialPush(true);route()};
  $('#pe').onclick=async()=>{SFile.download(await SFile.makeZip([{name:SFile.safeName(p.name)+'.m3u8',data:SImport.toM3U(p)},{name:SFile.safeName(p.name)+'.xspf',data:SImport.toXSPF(p)},{name:SFile.safeName(p.name)+'.json',data:JSON.stringify(p,null,2)}]),SFile.safeName(p.name)+'.zip')};
  $('#px').onclick=()=>{const b=$('#px');if(b.dataset.sure){Store.playlists=Store.playlists.filter(x=>x!==p);Store.save('playlists');refreshSide();go('library')}else{b.dataset.sure=1;b.classList.add('danger')}}};
V.xpl=async(v,arg,tok)=>{const[src,id]=arg.split('~');v.innerHTML=`<div class="coll-h"><div class="sk" style="width:180px;aspect-ratio:1;border-radius:14px"></div><div class="grow"><div class="sk" style="height:28px;width:60%;border-radius:8px"></div></div></div>${skeleton(8,'rows')}`;
  const d=await SSrc.Playlists.tracks(src,decodeURIComponent(id));if(!live(tok))return;if(!d||!d.tracks.length){v.innerHTML=emptyState('Playlist unavailable','It couldn’t be loaded right now — try again in a moment.','list');return}
  const list=src==='yt'?d.tracks:groupVersions(d.tracks);const saved=Store.playlists.find(p=>p.xref===arg);
  v.innerHTML=`<div class="coll-h"><img src="${esc(d.art||list[0]?.art||SData.placeholderArt(d.title))}" alt=""><div class="grow"><span class="kicker">Playlist · ${esc(d.owner||({dz:'Deezer',au:'Audius',yt:'YouTube'})[src])}</span><h1>${esc(d.title)}</h1><p class="mut">${list.length} ${src==='yt'?'videos':'songs'}</p>
  <div class="row"><button class="pill" id="xp">${I('play')} Play</button><button class="icon-btn" id="xs" aria-label="Shuffle">${I('shuffle')}</button><button class="pill ghost" id="xv">${saved?I('check')+' In your library':I('plus')+' Save'}</button></div></div></div><div style="margin-top:20px">${trackRows(list,{ctx:d.title,showAlbum:true})}</div>`;
  $('#xp').onclick=()=>playList(list,0,d.title);$('#xs').onclick=()=>playList(shuffleMix(list),0,d.title);
  $('#xv').onclick=()=>{if(Store.playlists.find(p=>p.xref===arg))return;const p=newPlaylist(d.title,list);p.xref=arg;p.from=d.owner||'';Store.save('playlists');refreshSide();$('#xv').innerHTML=I('check')+' In your library'}};
V.podcast=async(v,pid,tok)=>{v.innerHTML=skeleton(8,'rows');const eps=await Pod.episodes(pid);if(!live(tok))return;v.innerHTML=eps.length?`<div class="coll-h"><img src="${esc(eps[0].art)}" alt=""><div class="grow"><span class="kicker">Podcast</span><h1>${esc(eps[0].artist)}</h1><p class="mut">${eps.length} episodes</p></div></div><div style="margin-top:20px">${trackRows(eps,{numbers:false,ctx:eps[0].artist})}</div>`:emptyState('No episodes','This show can’t be loaded right now.','podcast')};

/* ---------- friends ---------- */
V.friends=(v,_,tok,soft)=>{const me=SSocial.me;const fr=Object.values(me.friends).sort((a,b)=>((b.p&&b.p.active)?1:0)-((a.p&&a.p.active)?1:0)||((b.p&&b.p.at)||0)-((a.p&&a.p.at)||0));const inR=Object.values(me.inReq),out=Object.values(me.out);
  if(!soft||!$('#fr-root')){v.innerHTML=`<div id="fr-root"></div>`;SSocial.start()}
  const status=f=>{const p=f.p||{};if(p.active&&SSocial.isLive(f.id))return p.now&&p.now.playing?`<span class="live-dot"></span>Listening to <b>${esc(p.now.title)}</b> · ${esc(p.now.artist)}`:'<span class="live-dot"></span>Active now';if(p.active)return'<span class="live-dot"></span>Active now';return p.at?`Active ${ago(p.at)}${p.now?` · last played ${esc(p.now.title)}`:''}`:'Waiting to connect'};
  const ffq=$('#ffq')?$('#ffq').value:'';
  $('#fr-root').innerHTML=`<div class="row" style="justify-content:space-between"><h1>Friends</h1><div class="row"><span class="conn ${SSocial.online?'on':''}">${SSocial.online?'Connected':'Connecting…'}</span><button class="icon-btn" id="myl" aria-label="Invite with a link" title="Invite with a link">${I('link')}</button></div></div>
  ${storyRing()}
  <div class="card me-card">${avatar(me.name||'You',me.id,52)}<div class="grow"><input id="myname" value="${esc(me.name)}" placeholder="Your name" maxlength="40" aria-label="Your name"><small class="mut">Friends see this name</small></div></div>
  ${findFriendsHTML()}
  ${(me.gifts||[]).length?`<h2 class="list-h">Sent to you</h2>${trackRows(me.gifts.slice(0,10).map(g=>({...g.track,artist:g.track.artist+' · from '+g.name})),{numbers:false,ctx:'From friends'})}`:''}
  ${inR.length?`<h2 class="list-h">Requests</h2>${inR.map(r=>`<div class="friend">${avatar(r.name,r.id,44)}<div class="grow"><b>${esc(r.name)}</b><small>Wants to be friends</small></div><button class="pill sm" data-acc="${r.id}">Accept</button><button class="icon-btn" data-dec="${r.id}" aria-label="Decline">${I('close')}</button></div>`).join('')}`:''}
  ${fr.length?`<h2 class="list-h">Your friends</h2>${fr.map(f=>`<div class="friend" data-friend="${f.id}">${avatar(f.name,f.id,44,!!(f.p&&(f.p.story||f.p.year)))}<div class="grow"><b>${esc(f.name)}</b><small class="ell">${status(f)}</small></div>${f.p&&f.p.now&&f.p.now.preview?`<button class="icon-btn" data-along="${f.id}" aria-label="Listen along">${I('play')}</button>`:''}${I('chevRight')}</div>`).join('')}`:''}
  ${out.length?`<h2 class="list-h">Sent</h2>${out.map(o=>`<div class="friend">${avatar('?',o.id,44)}<div class="grow"><b>Pending</b><small>Waiting for them to accept</small></div><button class="pill sm ghost" data-cancel="${o.id}">Cancel</button></div>`).join('')}`:''}
  <p class="tiny mut" style="margin-top:20px">${I('lock')} Friend data is end-to-end encrypted and travels directly between devices. Turn off sharing in Settings → Privacy.</p>`;
  const r=$('#fr-root');
  $('#myname').onchange=e=>{SSocial.setName(e.target.value);renderShell()};
  $('#myl').onclick=async()=>{const l=SSocial.link();if(navigator.share)navigator.share({title:'Add me on sniplit',url:l}).catch(()=>{});else{try{await navigator.clipboard.writeText(l);flash($('#myl'),I('check'));const m=$('#ffmsg');if(m)m.textContent='Invite link copied'}catch(e){const m=$('#ffmsg');if(m)m.textContent=l}}};
  const fq=$('#ffq');if(fq){fq.value=ffq;fq.oninput=()=>{$('#ffl').innerHTML=findFriendsList(fq.value)};if(ffq)$('#ffl').innerHTML=findFriendsList(ffq)}
  $('#ffdisc')&&($('#ffdisc').onclick=()=>{SSocial.setOpt('discoverable',!me.discoverable);V.friends(v,_,tok,true)});
  if(V.friends.pending){const c=V.friends.pending;V.friends.pending='';SSocial.request(c).then(()=>{const m=$('#ffmsg');if(m)m.textContent='Request sent — you’ll be connected when they accept.'},e=>{const m=$('#ffmsg');if(m)m.textContent=e.message})}
  r.onclick=e=>{const ad=e.target.closest('[data-ffadd]');if(ad){const x=SSocial.directory().find(y=>y.id===ad.dataset.ffadd);if(x)SSocial.request(x.code).then(()=>{ad.textContent='Requested';ad.disabled=true},err=>{ad.textContent=err.message});return}
    const a=e.target.closest('[data-acc]'),d=e.target.closest('[data-dec]'),c=e.target.closest('[data-cancel]'),al=e.target.closest('[data-along]'),fe=e.target.closest('[data-friend]');
    if(a)return SSocial.accept(a.dataset.acc);if(d)return SSocial.decline(d.dataset.dec);if(c)return SSocial.cancel(c.dataset.cancel);
    if(al){e.stopPropagation();const f=me.friends[al.dataset.along];playList([f.p.now],0,'With '+f.name);openNP();return}if(fe&&!e.target.closest('.story'))go('friend-'+fe.dataset.friend)}};
function tasteMatch(x){const pr=profile();const mine=new Set(pr.artists.slice(0,25).map(a=>artistKey(a.name)));const mg=new Set(pr.genres.slice(0,6));const sa=x.artists.filter(a=>mine.has(artistKey(a)));const sg=x.genres.filter(g=>mg.has(g));return{score:sa.length*3+sg.length+(x.now?.5:0)+Math.max(0,1-(Date.now()-x.at)/864e5),sa,sg}}
function findFriendsList(q=''){const qq=q.trim().toLowerCase();let list=SSocial.directory().map(x=>({...x,m:tasteMatch(x)}));if(qq)list=list.filter(x=>(x.name+' '+x.artists.join(' ')).toLowerCase().includes(qq));list.sort((a,b)=>b.m.score-a.m.score);
  if(!list.length)return SSocial.online?`<p class="mut small ff-empty">${qq?'No one matches that yet.':'No one is listed yet — invite someone with your link.'}</p>`:`<div class="ff-sk">${Array(3).fill('<div class="friend"><div class="sk" style="width:44px;height:44px;border-radius:50%"></div><div class="grow"><div class="sk" style="height:12px;width:40%;border-radius:6px"></div><div class="sk" style="height:10px;width:65%;border-radius:6px;margin-top:8px"></div></div></div>').join('')}</div>`;
  return list.slice(0,30).map(x=>{const why=x.m.sa.length?`${x.m.sa.length} artist${x.m.sa.length>1?'s':''} in common · ${esc(x.m.sa.slice(0,2).join(', '))}`:x.now?`Listening to ${esc(x.now.title)} · ${esc(x.now.artist)}`:x.artists.length?`Into ${esc(x.artists.slice(0,2).join(', '))}`:`Active ${ago(x.at)}`;
    return`<div class="friend">${avatar(x.name||'?',x.id,44)}<div class="grow"><b class="ell">${esc(x.name||'sniplit listener')}</b><small class="ell">${why}</small></div><button class="pill sm" data-ffadd="${esc(x.id)}">${I('userPlus')} Add</button></div>`}).join('')}
function findFriendsHTML(){const me=SSocial.me;return`<section class="ff"><div class="sec-h"><h2>Find friends</h2><button class="tag btn ${me.discoverable?'on':''}" id="ffdisc" aria-pressed="${!!me.discoverable}">${me.discoverable?'You’re listed':'Hidden'}</button></div>
  <div class="search">${I('search')}<input id="ffq" placeholder="Search people or artists" autocomplete="off"></div><p class="small mut" id="ffmsg"></p><div id="ffl">${findFriendsList()}</div></section>`}
V.friend=(v,id)=>{const f=SSocial.me.friends[id];if(!f){go('friends');return}SSocial.requestPlaylists(id);const p=f.p||{};const live=SSocial.isLive(id);
  v.innerHTML=`<div class="coll-h">${avatar(f.name,f.id,120,!!(p.story||p.year))}<div class="grow"><span class="kicker">${live?'<span class="live-dot"></span>Active now':p.at?'Active '+ago(p.at):'Friend'}</span><h1>${esc(f.name)}</h1>
  <div class="row">${p.story||p.year?`<button class="pill" data-story="${f.id}">${I('spark')} ${p.year?'Year in review':'Today’s recap'}</button>`:''}<button class="pill ghost" id="unf">Remove</button></div></div></div>
  ${p.now?`<h2 class="list-h">${p.active&&p.now.playing?'Listening now':'Last played'}</h2>${trackRows([p.now],{numbers:false,ctx:'With '+f.name})}`:''}
  <h2 class="list-h">Playlists</h2><div id="fpl">${f.playlists?(f.playlists.length?f.playlists.map((pl,i)=>`<div class="lib-row" data-fpl="${i}">${pl.tracks[0]?.art?`<img src="${esc(pl.tracks[0].art)}">`:`<span class="ph">${I('list')}</span>`}<div class="grow"><b class="ell">${esc(pl.name)}</b><small>${pl.tracks.length} songs${f.plAt?' · updated '+ago(f.plAt):''}</small></div><button class="pill sm ghost" data-save="${i}">Save</button></div>`).join(''):emptyState('No shared playlists','They haven’t shared any yet.','list')):live?skeleton(3,'rows'):emptyState('Playlists appear when you’re both online','They load directly from their device.','friends')}</div>`;
  $('#unf').onclick=()=>{const b=$('#unf');if(b.dataset.sure){SSocial.remove(id);go('friends')}else{b.dataset.sure=1;b.textContent='Tap again to remove'}};
  v.onclick=e=>{const s=e.target.closest('[data-save]');if(s){e.stopPropagation();const pl=f.playlists[+s.dataset.save];newPlaylist(pl.name,pl.tracks).from=f.name;Store.save('playlists');refreshSide();s.textContent='Saved';s.disabled=true;return}
    const r=e.target.closest('[data-fpl]');if(r){const pl=f.playlists[+r.dataset.fpl];playList(pl.tracks,0,pl.name+' · '+f.name);openNP()}}};
SSocial.on(()=>{if(location.hash.startsWith('#friend-')){const f=SSocial.me.friends[location.hash.slice(8)];const el=$('#fpl');if(f&&f.playlists&&el&&el.querySelector('.sk'))route()}});

V.import=v=>{v.innerHTML=`<h1>Bring your library</h1><p class="sub">Your playlists, likes and history — matched to the catalog on this device. Nothing is uploaded.</p>
  <div class="drop" id="drop">${I('folder')}<p><b>Drop a folder or audio files</b><br><span class="small">Everything inside, including sub-folders, with tags & artwork.</span></p><div class="row" style="justify-content:center;flex-wrap:wrap"><label class="pill">${I('folder')} Choose folder<input type="file" webkitdirectory directory multiple hidden id="fdir"></label><label class="pill ghost">${I('music')} Choose files<input type="file" multiple accept="audio/*,.flac,.m4a,.aiff,.opus" hidden id="ffile"></label></div></div>
  <div class="progress" style="margin:14px 0;display:none" id="ipw"><i id="ip"></i></div><p class="mut small" id="ipt"></p>
  <div class="grid2" style="margin-top:22px">${[['Spotify','Drop your data-export files (YourLibrary.json, Playlist*.json, StreamingHistory*.json) or an Exportify CSV.','spotify'],['Apple Music','Drop “Apple Music Library Tracks.json” from your Apple privacy export, or Library.xml (File → Library → Export).','file'],['YouTube Music','Drop Google Takeout history or playlist CSVs — or paste links below.','file'],['Deezer','Paste your public profile link.','deezer'],['Last.fm','Enter your username.','lastfm'],['Anything else','CSV from TuneMyMusic or Soundiiz, M3U, XSPF, or a pasted list.','file']].map(([n,d,k])=>`<div class="card"><b>${n}</b><p class="mut small">${d}</p>${k==='spotify'?`<div class="row">${Store.linked.spotify||Store.settings.spotifyClientId?`<button class="pill sm ghost" id="sp-link">${Store.linked.spotify?'Sync now':'Link Spotify'}</button>`:''}<label class="pill sm ghost">Drop files<input type="file" multiple hidden accept=".json,.csv" data-exp></label></div>`:k==='deezer'?`<div class="row"><input id="dz" placeholder="deezer.com/profile/…"><button class="pill sm" id="dz-go">Import</button></div>`:k==='lastfm'?`<div class="row"><input id="lf" placeholder="Username"><button class="pill sm" id="lf-go">Import</button></div>`:`<label class="pill sm ghost">Choose file<input type="file" multiple hidden accept=".json,.xml,.csv,.tsv,.m3u,.m3u8,.xspf,.txt" data-exp></label>`}</div>`).join('')}</div>
  <h3 class="sec" style="margin-bottom:8px">Paste a list</h3><textarea id="paste" rows="5" placeholder="Artist – Title, one per line, or YouTube / SoundCloud links"></textarea><button class="pill sm" id="paste-go" style="margin-top:8px">Import list</button>
  <h3 class="sec" style="margin-bottom:8px">Restore from sniplit</h3><label class="pill sm ghost">Choose sniplit-identity.json<input type="file" hidden accept=".json" data-exp></label>`;
  const prog=(p,txt)=>{$('#ipw').style.display='block';$('#ip').style.width=p*100+'%';$('#ipt').textContent=txt};
  const doFiles=async files=>{if(!files.length)return;prog(0,`Adding ${files.length} files…`);const a=await SImport.importFiles(files,(p,t)=>prog(p,`${Math.round(p*100)}% · ${t.title}`));prog(1,`Added ${a.length} songs.`);refreshSide();if(a.length)playList(a,0,'On this device')};
  $('#fdir').onchange=e=>doFiles(e.target.files);$('#ffile').onchange=e=>doFiles(e.target.files);
  const dr=$('#drop');dr.ondragover=e=>{e.preventDefault();dr.classList.add('over')};dr.ondragleave=()=>dr.classList.remove('over');dr.ondrop=async e=>{e.preventDefault();dr.classList.remove('over');doFiles(await SImport.filesFromDrop(e.dataTransfer))};
  const runImport=async data=>{if(data.identity){SImport.importIdentity(data.identity);prog(1,'Restored.');refreshSide();return}prog(0,`Matching ${data.source}…`);const r=await SImport.applyImport(data,(p,m,t)=>prog(p,`${m} of ${t} matched · ${data.source}`));prog(1,`${r.matched} of ${r.total} matched${r.playlists?' · '+r.playlists+' playlists':''}. The rest keep retrying.`);refreshSide()};
  $$('[data-exp]').forEach(i=>i.onchange=async e=>{for(const f of e.target.files){try{await runImport(await SImport.parseExport(f))}catch(err){prog(0,f.name+': '+err.message)}}});
  $('#paste-go').onclick=()=>runImport(SImport.parseText($('#paste').value,'Pasted list'));
  $('#sp-link')&&($('#sp-link').onclick=async()=>{try{if(Store.linked.spotify)await runImport(await SImport.Linked.spotifyPull());else await SImport.Linked.spotifyStart()}catch(e){prog(0,e.message)}});
  $('#dz-go').onclick=async()=>{try{await runImport(await SImport.Linked.deezerPull($('#dz').value))}catch(e){prog(0,e.message)}};
  $('#lf-go').onclick=async()=>{try{await runImport(await SImport.Linked.lastfmPull($('#lf').value.trim()))}catch(e){prog(0,e.message)}}};
V.export=v=>{v.innerHTML=`<h1>Export your library</h1><p class="sub">Playlists, collections, ratings, listening history, metadata and preferences — in open formats.</p>
  <div class="card">${[['playlists','Playlists',Store.playlists.length],['history','Listening history',Store.history.length],['ratings','Ratings',Object.keys(Store.ratings).length],['likes','Liked songs',Object.keys(Store.likes).length]].map(([k,l,n])=>`<div class="set-row"><div>${l}<small>${n} items</small></div><button class="toggle on" data-part="${k}" aria-label="${l}"></button></div>`).join('')}
  <h3 style="margin-top:18px">Format</h3><select id="xf"><option value="zip">Bundle — JSON + CSV + M3U8 + XSPF</option><option value="json">JSON — sniplit identity</option></select>
  <button class="pill wide" style="margin-top:16px" id="xgo">${I('export')} Export</button></div>
  <p class="mut small" style="margin-top:12px">CSV, M3U8 and XSPF open in TuneMyMusic, Soundiiz, Apple Music, VLC and foobar2000. API keys are never included.</p>`;
  $$('[data-part]').forEach(t=>t.onclick=()=>t.classList.toggle('on'));
  $('#xgo').onclick=async()=>{const parts=$$('[data-part].on').map(t=>t.dataset.part);const f=$('#xf').value;const b=await SImport.exportIdentity(f,parts);SFile.download(b,'sniplit-library-'+today()+(f==='json'?'.json':'.zip'));flash($('#xgo'),`${I('check')} Exported`,1500)}};
V.terms=v=>{v.innerHTML=`<article class="legal">${SLegal.terms.replace('{{d}}',SLegal.updated)}</article>`};
V.privacy=v=>{v.innerHTML=`<article class="legal">${SLegal.privacy.replace('{{d}}',SLegal.updated)}</article>`};
V.wrapped=v=>{const st=myYearStory(true)||myDayStory();if(!st){v.innerHTML=emptyState('Your recap is on its way','Keep listening — your daily recap appears after a few days, and your year in review arrives every New Year.','spark');return}openStory(st,SSocial.me.name||'Your');go('home')};
V.premium=v=>{const rows=[['Full-length songs','Choose a full source per song','Plays full songs automatically'],['Ads from sniplit','None','None'],['Studio','Every tool','Every tool + both stems in one export'],['Export quality','16-bit WAV, AIFF, Opus, AAC','+ 24-bit & 32-bit float WAV'],['Downloads',`Up to ${FREE_CACHE_LIMIT} songs`,'Unlimited'],['Vault','Every artist','Also digs through collaborators’ catalogs'],['Year in review','Every New Year','Any day, plus HD share cards']];
  v.innerHTML=`<div class="hero prem"><div><span class="kicker">sniplit Premium</span><h1>Everything, uncapped.</h1><p>Free keeps every feature. Premium removes the limits.</p><button class="pill" id="gp">${Store.premium?'Manage Premium':'Try it free for 7 days'}</button></div></div>
  <div class="card sec cmp"><div class="cmp-r head"><span></span><span>Free</span><span>Premium</span></div>${rows.map(r=>`<div class="cmp-r"><b>${r[0]}</b><span>${r[1]}</span><span>${r[2]}</span></div>`).join('')}</div>
  <p class="mut small" style="margin-top:12px">Billing isn’t connected in this build — the trial switches Premium on for this device.</p>`;
  $('#gp').onclick=()=>{Store.premium=!Store.premium;Store.save('premium');renderShell();route()}};
V.preferences=(v,sec)=>{const s=Store.settings,me=SSocial.me;if(s.preciseSync===undefined)s.preciseSync=Lyr.precise();if(s.discordOn===undefined)s.discordOn=s.discord!==false;const tg=(k,l,d,obj='s')=>`<div class="set-row"><div>${l}${d?`<small>${d}</small>`:''}</div><button class="toggle ${(obj==='me'?me[k]:s[k])?'on':''}" data-${obj==='me'?'soc':'set'}="${k}" aria-label="${l}"></button></div>`;
  v.innerHTML=`<div class="coll-h small">${avatar(me.name||'You',me.id,64)}<div class="grow"><h1>${esc(me.name||'Settings')}</h1><p class="mut">${Store.premium?'Premium':'Free'} · ${fmt(Store.stats.ms/1000)} listened · no account needed</p></div></div>
  <div class="grid2" style="align-items:start;margin-top:18px">
  <div class="card"><h3>Appearance</h3><div class="set-row"><div>Theme</div><div class="seg" style="min-width:210px">${['dark','light','system'].map(t=>`<button data-theme="${t}" class="${s.theme===t?'on':''}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div></div>
   <div class="set-row"><div>Accent</div><div class="swatches">${['#ffffff','#a3a3ff','#7ee0b4','#f5c451','#f57c3b','#3b9cf5'].map(c=>`<button class="sw ${s.accent===c?'on':''}" style="background:${c}" data-acc="${c}" aria-label="Accent ${c}"></button>`).join('')}</div></div>
   <div class="set-row"><div>Layout<small>Auto picks phone, desktop or TV</small></div><select data-sel="layout" style="width:auto">${[['auto','Auto'],['mobile','Phone'],['desktop','Desktop'],['tv','TV']].map(([x,l])=>`<option value="${x}" ${s.layout===x?'selected':''}>${l}</option>`).join('')}</select></div>
   ${tg('mono','Monochrome artwork')}${tg('reduceMotion','Reduce motion')}${tg('compact','Compact')}</div>
  <div class="card"><h3>Playback</h3>${tg('keepAwake','Keep awake while playing','Stops power-saving from cutting playback')}${tg('fxBackground','Studio effects in the background (iPhone)','Off keeps music playing when the phone locks')}${tg('autoFull','Full songs automatically','Premium · uses video sources when available')}${tg('explicit','Prefer explicit versions')}${tg('preciseSync','Check lyric timing by ear','Listens to the vocals to confirm where each line lands. Downloads a small speech model once.')}</div>
  <div class="card"><h3>Privacy</h3>${tg('share','Share what I’m listening to','Friends see now playing and your daily recap','me')}${tg('sharePlaylists','Share my playlists with friends','Mark single playlists private from the playlist page','me')}${tg('discoverable','Show me in Find friends','Lists your name and a few favourite artists so people can add you','me')}</div>
  <div class="card" id="connections"><h3>Connections</h3><p class="small mut" style="margin:0 0 10px">Nothing here is needed to listen. These only add account syncing and Last.fm imports.</p>
   <label class="small mut">Spotify Client ID (optional) · redirect ${esc(location.origin+location.pathname)}</label><input data-text="spotifyClientId" value="${esc(s.spotifyClientId)}" style="margin:6px 0 12px">
   <label class="small mut">Last.fm API key (for importing your Last.fm history)</label><input data-text="lastfmKey" value="${esc(s.lastfmKey)}" style="margin:6px 0 12px">
   <label class="small mut">Friends relay (optional, wss://…)</label><input data-text="broker" value="${esc(s.broker||'')}" placeholder="Uses public relays by default" style="margin:6px 0 12px">
   <div class="set-row"><div>Linked accounts<small>${Object.keys(Store.linked).map(k=>k+' · '+(Store.linked[k].lastSync?ago(Store.linked[k].lastSync):'never')).join(' · ')||'None'}</small></div><button class="pill sm ghost" id="chk">${I('refresh')} Check now</button></div></div>
  <div class="card"><h3>Discord</h3>${window.sniplitDesktop?`${tg('discordOn','Show what I’m playing on Discord','Appears as “Listening to …” on your profile')}<div class="set-row"><div>When this computer is idle, show<small>Link your phone as a friend, then pick it here</small></div><select data-sel="discordMirror" style="width:auto"><option value="">Nothing</option>${Object.values(me.friends).map(f=>`<option value="${f.id}" ${s.discordMirror===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}</select></div><p class="tiny mut" id="dstat"></p>`:`<p class="mut small">Discord shows your music through the sniplit desktop app (Windows, macOS, Linux). To show what’s playing on this phone: open the desktop app, add this phone as a friend from the Friends tab, then choose it under Settings → Discord.</p>`}</div>
  <div class="card"><h3>Your data</h3><div class="set-row"><div>Bring your library</div><a class="pill sm ghost" href="#import">Open</a></div><div class="set-row"><div>Export your library</div><a class="pill sm ghost" href="#export">Open</a></div>
   <div class="set-row"><div>Install the app</div><button class="pill sm ghost" id="inst">Install</button></div><div class="set-row"><div>Reset this device<small>Clears likes, history and playlists here</small></div><button class="pill sm ghost" id="rst">Reset</button></div></div>
  <div class="card"><h3>Premium</h3><div class="set-row"><div>${Store.premium?'Premium is on':'Free'}<small>Full songs, unlimited downloads, studio-grade exports</small></div><a class="pill sm" href="#premium">${Store.premium?'Manage':'See Premium'}</a></div></div></div>
  <p class="tiny mut" style="margin-top:18px"><a href="#terms">Terms of Use</a> · <a href="#privacy">Privacy Policy</a> · sniplit 3.0</p>`;
  if(sec==='connections')setTimeout(()=>$('#connections').scrollIntoView({behavior:'smooth'}),100);
  v.onclick=async e=>{const t=e.target.closest('[data-set]');if(t){s[t.dataset.set]=!s[t.dataset.set];t.classList.toggle('on');Store.save('settings');applyLayout()}
    const so=e.target.closest('[data-soc]');if(so){SSocial.setOpt(so.dataset.soc,!me[so.dataset.soc]);so.classList.toggle('on')}
    const th=e.target.closest('[data-theme]');if(th){s.theme=th.dataset.theme;Store.save('settings');applyLayout();route()}const ac=e.target.closest('[data-acc]');if(ac){s.accent=ac.dataset.acc;Store.save('settings');applyLayout();route()}
    const ck=e.target.closest('#chk');if(ck){ck.classList.add('busy');await SImport.Linked.checkAll();ck.classList.remove('busy');route()}
    if(e.target.closest('#inst')){if(window.__bip)__bip.prompt();else{const b=e.target.closest('#inst');b.textContent=/iP(hone|ad)/.test(navigator.userAgent)?'Share → Add to Home Screen':'Use your browser’s Install option'}}
    const rs=e.target.closest('#rst');if(rs){if(rs.dataset.sure){localStorage.clear();location.reload()}else{rs.dataset.sure=1;rs.textContent='Tap again to reset'}}};
  v.onchange=e=>{const t=e.target;if(t.dataset.text!=null){s[t.dataset.text]=t.value.trim();Store.save('settings')}if(t.dataset.sel){s[t.dataset.sel]=t.value;Store.save('settings');applyLayout();renderShell();discordPush()}};
  if(window.sniplitDesktop)sniplitDesktop.discordStatus().then(st=>{const el=$('#dstat');if(el)el.textContent=!st.configured?'Discord isn’t configured in this build.':st.connected?'Connected to Discord.':'Waiting for the Discord app to open…'})};

/* ---------- boot ---------- */
addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.__bip=e});
document.addEventListener('gesturestart',e=>e.preventDefault());
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',()=>{if(Store.settings.theme==='system')applyLayout()});
async function boot(){const fx=Store.settings.fx;if(fx){Object.assign(eng.fx,fx,{eq:[...(fx.eq||eng.fx.eq)]})}applyLayout();renderShell();
  Store.restore().then(n=>{if(n){applyLayout();renderShell();refreshSide&&refreshSide();route()}});
  const qs=new URLSearchParams(location.search);if(qs.get('code')&&qs.get('state')==='spotify'){try{await SImport.Linked.spotifyFinish(qs.get('code'));history.replaceState(null,'',location.pathname+'#import');setTimeout(async()=>{await SImport.applyImport(await SImport.Linked.spotifyPull());refreshSide()},500)}catch(e){}}
  if(Store.queueState&&Store.queueState.list&&Store.queueState.list.length){Q.list=Store.queueState.list;Q.i=Store.queueState.i;Q.ctx=Store.queueState.ctx;cur=Q.list[Q.i];renderMini()}
  IDB.keys('audio').then(async k=>{Store.cachedMeta=(await Promise.all(k.slice(0,300).map(x=>IDB.get('audio',x)))).filter(Boolean).map(x=>x.meta)});
  await route();
  if(Object.keys(SSocial.me.friends).length||Object.keys(SSocial.me.out).length)SSocial.start();
  const last=Math.max(0,...Object.values(Store.linked).map(x=>x.lastSync||0));if(Object.keys(Store.linked).length&&Date.now()-last>216e5)SImport.Linked.checkAll().then(refreshSide);
  if('serviceWorker'in navigator&&(/^(https|sniplit):$/.test(location.protocol)||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(()=>{})}
window.sniplit={cacheTrack,eng,Q,playList,openNP,closeNP,setPane,editorSheet,castSheet,exportSheet,shareSheet,createSheet,openStory,myDayStory,myYearStory,go,Lyr,API,Store,viz};
boot();
})();
