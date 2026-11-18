/* if the browser hands this app.js an older copy of another file (half-updated cache), keep going instead of crashing */
const SL=window.SLicense||{ok:false,state:{ok:false},ready:Promise.resolve(),on(){return()=>{}},refresh:async()=>({ok:false}),redeem:async()=>({ok:false,reason:'Reload sniplit to finish updating'}),trial:async()=>{throw new Error('Reload sniplit to finish updating')}};
const isBlk=t=>{try{return SData.isBlocked?SData.isBlocked(t):false}catch(e){return false}},blkList=()=>{try{return SData.blocked?SData.blocked():[]}catch(e){return[]}};
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
function toast(){return}
function toastOld(msg,act,fn,ms=6000){let t=document.getElementById('toast');if(!msg){t&&t.classList.remove('on');return}if(!t){t=document.createElement('div');t.id='toast';t.setAttribute('role','status');document.body.appendChild(t)}
  t.innerHTML=`<span>${esc(msg)}</span>${act?`<button class="pill sm">${esc(act)}</button>`:''}`;if(act)t.querySelector('button').onclick=()=>{t.classList.remove('on');fn&&fn()};requestAnimationFrame(()=>t.classList.add('on'));clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),ms)}
function flash(el,html,ms=900){if(!el)return;const o=el.innerHTML;el.innerHTML=html;el.classList.add('flash');setTimeout(()=>{el.innerHTML=o;el.classList.remove('flash')},ms)}

/* ---------- globals ---------- */
const eng=new Engine();
const Q={list:[],i:-1,loop:Store.settings.loop||'off',shuffle:!!Store.settings.shuffle,ctx:'',ab:null};
let cur=null,ytActive=null,adLock=false,curSrc=null;

/* ---------- layout ---------- */
const isStandalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
const Layout={mode:'desktop'};
const FREE_ACC=['#ffffff','#a3a3ff','#7ee0b4','#f5c451','#f57c3b','#3b9cf5'],PRO_ACC=['#ff5fa2','#c08bff','#5ce1e6','#ff3b3b','#b8ff5c','#ffb38a'];
function applyLayout(){const s=Store.settings,b=document.body,w=innerWidth;let lay=s.layout;
  if(new URLSearchParams(location.search).get('tv'))lay='tv';
  if(lay==='auto'){const tvUA=/smart-?tv|tizen|web0s|webos|aft[a-z]|crkey|bravia|googletv|android tv|hbbtv|roku/i.test(navigator.userAgent);lay=tvUA?'tv':w<=820?'mobile':'desktop'}
  // phones only get the TV layout while held sideways; upright they always get the phone layout back
  const phone=Math.min(screen.width,screen.height)<600||(matchMedia('(pointer:coarse)').matches&&Math.min(innerWidth,innerHeight)<540);if(lay==='tv'&&phone&&innerHeight>innerWidth)lay='mobile';
  Layout.mode=lay;for(const[k,v]of[['mob','mobile'],['desk','desktop'],['tv','tv']])b.classList.toggle(k,lay===v);
  b.classList.toggle('standalone',!!isStandalone);
  b.classList.toggle('light',s.theme==='light'||(s.theme==='system'&&matchMedia('(prefers-color-scheme: light)').matches));
  {const bg=getComputedStyle(b).getPropertyValue('--bg').trim()||'#060606',fg=getComputedStyle(b).getPropertyValue('--fg').trim()||'#f4f4f4';$$('meta[name=theme-color]').forEach(m=>m.content=bg);const D=window.sniplitDesktop;if(D){b.classList.add('electron',D.platform==='darwin'?'mac':'pc');D.setTheme&&D.setTheme({bg,fg})}}
  b.classList.remove('mono');b.classList.toggle('reduce',!!s.reduceMotion);b.classList.toggle('compact',!!s.compact);
  // installed (home-screen web app, Android app, desktop app): no logo in the header, like a native app
  b.classList.toggle('appmode',!!(window.sniplitAndroid||window.sniplitDesktop||matchMedia('(display-mode: standalone)').matches||navigator.standalone||b.classList.contains('electron')));
  const light=b.classList.contains('light');const want=!Store.premium&&!FREE_ACC.includes(s.accent)?'#ffffff':(s.accent||'#ffffff');const acc=want==='#ffffff'&&light?'#0b0b0b':want;
  const lum=h=>{const n=parseInt(String(h).slice(1),16);if(isNaN(n))return 1;const c=[n>>16&255,n>>8&255,n&255].map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
  document.documentElement.style.setProperty('--acc',acc);document.documentElement.style.setProperty('--accfg',lum(acc)>.36?'#000':'#fff');
  Layout.mode=lay}
addEventListener('resize',()=>{const m=Layout.mode;applyLayout();if(m!==Layout.mode){renderShell();route()}});

/* ---------- shell ---------- */
const TABS=[['home','Home','home'],['search','Search','search'],['friends','Friends','friends'],['library','Library','library']];
/* avatars are generated characters (lib/avatars.js), seeded by the person's id — or a reroll they chose */
function avatar(name,id,size=32,ring,online){const seed=String(id||name||'x')+(id&&SSocial.me&&id===SSocial.me.id&&SData.LS.get('avSeed','')?'#'+SData.LS.get('avSeed',''):'');const px=size<=34?96:size<=64?160:256;const u=window.SAvatars?SAvatars.url(seed,px):'';
  return`<span class="av ${ring?'ring':''} ${online?'online':''}" style="width:${size}px;height:${size}px;font-size:${size*.42}px">${u?`<img src="${u}" alt="" draggable="false">`:esc((name||'?').trim()[0]||'?').toUpperCase()}</span>`}
function renderShell(){const me=SSocial.me;const reqs=Object.keys(me.inReq).length;
  $('#side').innerHTML=`<a class="logo" href="#home">${I('logo')}sniplit</a>${TABS.map(([k,l,i])=>`<a class="nav" href="#${k}" data-nav="${k}">${I(i)}<span>${l}</span>${k==='friends'&&reqs?`<em class="dot">${reqs}</em>`:''}</a>`).join('')}
    <div class="side-sep"></div><div class="side-head"><span>Your library</span><button class="icon-btn sm" data-act="create" aria-label="Create">${I('plus')}</button></div>
    <div class="side-list">${sideList()}</div>
    <a class="me-row" href="#preferences">${avatar(me.name||'You',me.id,30)}<span class="grow ell">${esc(me.name||'You')}</span>${Store.premium?`<span class="crown">${I('crown')}</span>`:''}${I('gear')}</a>`;
  $('#topbar').innerHTML=`<a class="logo" href="#home">${I('logo')}sniplit</a><div class="row" style="gap:2px"><button class="icon-btn" data-act="create" aria-label="Create">${I('plus')}</button><a class="icon-btn" href="#preferences" aria-label="Profile & settings${SSocial.online?' · online':''}">${avatar(me.name||'You',me.id,28,false,SSocial.online)}</a></div>`;
  $('#tabs').innerHTML=TABS.map(([k,l,i])=>`<button data-go="${k}" data-nav="${k}">${I(i)}<span>${l}</span>${k==='friends'&&reqs?'<em class="dot"></em>':''}</button>`).join('');
  markNav();renderMini()}
/* a playlist's cover is a collage of what's inside it (4 different covers), or the single cover if there's only one */
const coverArts=list=>[...new Set((list||[]).map(t=>t&&t.art).filter(Boolean))].slice(0,4);
function cover(arts,cls=''){arts=arts||[];if(arts.length>=4)return`<span class="collage ${cls}">${arts.slice(0,4).map(a=>`<img src="${esc(thumb(a,200))}" alt="" loading="lazy" decoding="async">`).join('')}</span>`;
  return arts[0]?`<img class="${cls}" src="${esc(thumb(arts[0],300))}" alt="" loading="lazy" decoding="async">`:''}
function sideList(){const items=[{id:'liked',name:'Liked Songs',sub:pl(Object.keys(Store.likes).length,'song'),art:null,icon:'heartF',href:'#liked'},...Store.playlists.map(p=>({name:p.name,sub:pl(p.tracks.length,'song')+(p.from?' · from '+p.from:''),arts:coverArts(p.tracks),href:'#playlist-'+p.id})),{name:'Lyric Studio',sub:'Make a lyric video',icon:'video',href:'#lyricvideo'},{name:'Downloads',sub:[...cachedIds].filter(k=>!stashIds.has(k)).length+' offline',icon:'downloaded',href:'#library-downloads'},{name:'On this device',sub:Store.imports.length+' files',icon:'folder',href:'#library-local'}];
  return items.map(x=>`<a class="side-item" href="${x.href}">${x.arts&&x.arts.length?cover(x.arts):`<span class="ph">${I(x.icon||'music')}</span>`}<span class="grow"><b class="ell">${esc(x.name)}</b><small class="ell">${esc(x.sub)}</small></span></a>`).join('')}
function markNav(){const r=(location.hash||'#home').slice(1).split('-')[0];$$('[data-nav]').forEach(e=>e.classList.toggle('on',e.dataset.nav===r))}

/* ---------- router ---------- */
const V={};let routeToken=0;
/* Pages are kept, not rebuilt: when you leave a finished page its elements are set aside (detached, so ids never
   clash) and put back when you return — no reload, same scroll position. Lists that change all the time
   (library, likes, settings) are always drawn fresh. Tapping the tab you're already on reloads it. */
const VC=new Map();const VC_TTL={home:15*6e4,search:30*6e4,artist:60*6e4,album:60*6e4,genre:60*6e4,xpl:60*6e4,podcast:60*6e4,friend:5*6e4,lyricvideo:Infinity,pl:10*6e4};let curKey=null,curDone=false;
function stashView(){if(!curKey)return;const name=curKey.split('-')[0];const view=$('#view');if(!(name in VC_TTL)||!curDone||!view.firstChild||view.querySelector('.sk,.spinner')&&name!=='lyricvideo'){if(name==='lyricvideo'&&window.__lvs){try{window.__lvs.destroy()}catch(e){}window.__lvs=null}return}
  const frag=document.createDocumentFragment();while(view.firstChild)frag.appendChild(view.firstChild);const old=VC.get(curKey);
  VC.set(curKey,{frag,scroll:$('#main').scrollTop,at:old&&old.keepAt?old.at:Date.now(),lvs:name==='lyricvideo'?window.__lvs:null});if(window.__lvs&&name==='lyricvideo'){try{window.__lvs.pause&&window.__lvs.pause()}catch(e){}window.__lvs=null}
  while(VC.size>12){const k=VC.keys().next().value;const e=VC.get(k);if(e.lvs)try{e.lvs.destroy()}catch(x){}VC.delete(k)}}
function dropView(key){const e=VC.get(key);if(e&&e.lvs)try{e.lvs.destroy()}catch(x){}VC.delete(key)}
async function route(opt){const nav=!!(opt&&opt.nav);
  // only navigation (links, back/forward) reuses a kept page; when code asks to route, the page is rebuilt
  if(!nav&&curKey===decodeURIComponent((location.hash||'#home').slice(1)||'home')){curDone=false}
  stashView();
  if(/^#tt_(session|error)=/.test(location.hash)){const m=location.hash.match(/^#tt_(session|error)=([^&]*)/);if(m[1]==='session')SData.LS.set('ttSessionSet',Date.now()),localStorage.setItem('sn.ttSession',decodeURIComponent(m[2]));else setTimeout(()=>toast('TikTok didn’t connect: '+decodeURIComponent(m[2]).replace(/_/g,' ')),600);history.replaceState(null,'','#lyricvideo');}
  const h=decodeURIComponent((location.hash||'#home').slice(1))||'home';
  if(h.startsWith('t-')){const[raw,ls]=h.slice(2).split('~');history.replaceState(null,'','#home');route();
    // wait until the saved library has been restored (it redraws the shell), then show the shared song
    (window.__restored||Promise.resolve()).then(()=>setTimeout(()=>openShared(raw,ls?ls.split('.').map(Number):[]),80));return}
  if(h.startsWith('add-')){history.replaceState(null,'','#friends');V.friends.pending=h.slice(4);return route()}
  const[name,...rest]=h.split('-');const arg=rest.join('-');const fn=V[name]||(name==='home'?V.home:v=>{v.innerHTML=emptyState('Page not found','That link doesn’t lead anywhere in sniplit.','search','<a class="pill" href="#home">Go home</a>')});const tok=++routeToken;
  window.SAnalytics&&SAnalytics.track('page',{p:name});
  document.body.classList.toggle('chatting',name==='chat');
  const view=$('#view');curKey=h;curDone=false;const kept=VC.get(h);
  if(kept&&!nav)dropView(h);else if(kept&&Date.now()-kept.at<(VC_TTL[name]||0)){VC.delete(h);++routeToken;view.innerHTML='';view.className='';view.appendChild(kept.frag);if(kept.lvs)window.__lvs=kept.lvs;markNav();requestAnimationFrame(()=>{$('#main').scrollTop=kept.scroll});curDone=true;return}
  if(kept)dropView(h);
  view.innerHTML='';view.className='fade-in';$('#main').scrollTop=0;markNav();
  try{await fn(view,arg,tok);if(tok===routeToken)curDone=true}catch(e){if(window.SNIPLIT_DEBUG)console.error(e);if(tok===routeToken){view.innerHTML=emptyState('Couldn’t load this',API.offline?'You’re offline. It will load when you’re back.':'Something went wrong on our side. Try again.','refresh','<button class="pill" id="rretry">Try again</button>');$('#rretry').onclick=()=>route()}}
}
addEventListener('hashchange',()=>route({nav:true}));
/* going to the page you're on reloads it (and is how you refresh a kept page) */
const go=h=>{if(location.hash==='#'+h||(!location.hash&&h==='home')){curDone=false;dropView(h);route()}else location.hash=h};
document.addEventListener('click',e=>{const a=e.target.closest('a.nav[data-nav],a.logo');if(!a)return;const h=(a.getAttribute('href')||'').slice(1);if(h&&location.hash==='#'+h){e.preventDefault();go(h)}});
const live=tok=>tok===routeToken;
function emptyState(t,s,icon='music',action=''){return`<div class="empty"><span class="empty-i">${I(icon)}</span><b>${t}</b><p>${s}</p>${action}</div>`}

/* ---------- render helpers ---------- */
const TR=new Map(),LISTS={};const reg=t=>{TR.set(t.id,t);return t.id};
const thumb=(u,n=300)=>!u||!/mzstatic\.com|dzcdn\.net/.test(u)?u:u.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)/,`/${n}x${n}bb.jpg`).replace(/\/(\d{3,4})x\1-000000-80-0-0\.jpg$/,`/${n<=120?120:n<=250?250:500}x${n<=120?120:n<=250?250:500}-000000-80-0-0.jpg`);
let tileN=0;function tileHTML(t,{round=false,sub}={}){reg(t);const eager=tileN++<8;return`<div class="tile ${round?'round':''}" data-play="${esc(t.id)}" tabindex="0"><div class="art">${t.arts&&t.arts.length>=4?cover(t.arts):''}<img ${t.arts&&t.arts.length>=4?'hidden ':''}${eager?'fetchpriority="high"':'loading="lazy"'} decoding="async" src="${esc(thumb(t.art)||SData.placeholderArt(t.title))}" alt="" onload="this.classList.add('ld')" onerror="this.src='${SData.placeholderArt(t.title||'x').replace(/'/g,'%27')}'">${cachedIds.has(t.id)?`<span class="cached">${I('downloaded')}</span>`:''}${t.kind?'':`<span class="play">${I('play')}</span>`}</div><div class="t ell">${esc(t.title)}</div><div class="s ell">${esc(sub??t.artist)}</div></div>`}
function shelf(title,items,{see,round,sub}={}){items=(items||[]).filter(t=>!isBlk(t));if(!items.length)return'';return`<section class="sec"><div class="sec-h"><h2>${esc(title)}</h2>${see?`<a class="see" href="#${see}">Show all</a>`:''}</div><div class="shelf">${items.map(t=>tileHTML(t,{round,sub:sub&&sub(t)})).join('')}</div></section>`}
function trackRows(list,{numbers=true,ctx='',showAlbum=false}={}){const ids=list.map(reg);const key='L'+Math.random().toString(36).slice(2,8);LISTS[key]={ids,ctx};
  return`<div class="tl" data-list="${key}">${list.map((t,i)=>`<div class="tr ${cur&&cur.id===t.id?'on':''}" data-idx="${i}" tabindex="0"><div class="n">${numbers?i+1:''}</div><img loading="lazy" decoding="async" src="${esc(thumb(t.art,120)||SData.placeholderArt(t.title))}" alt="" onload="this.classList.add('ld')"><div class="grow"><div class="tt ell">${esc(t.title)}</div><div class="ta ell">${t.explicit?'<span class="badge e">E</span>':''}${cachedIds.has(t.id)?`<span class="dl-i">${I('downloaded')}</span>`:''}${esc(t.artist)}${showAlbum&&t.album?' · '+esc(t.album):''}${t.versions&&t.versions.length>1?` <span class="vers" data-vers="${esc(t.id)}">${t.versions.length} versions</span>`:''}</div></div><div class="d">${t.durationMs?fmt(t.durationMs/1000):''}</div><button class="icon-btn" data-more="${esc(t.id)}" aria-label="More">${I('more')}</button></div>`).join('')}</div>`}
/* compact filter menus replace rows of pills: one button shows the current choice, a menu holds the rest */
function filterDD(id,icon,label,value,opts){const cur0=opts.find(o=>o[0]===value)||opts[0];return`<div class="dd fdd" id="${id}"><button class="dd-btn" aria-haspopup="menu" aria-expanded="false">${I(icon)}<span>${esc(label)}</span><b class="ell">${esc(cur0[1])}</b>${I('chevDown')}</button>
  <div class="dd-menu" role="menu">${opts.map(([k,l,sub])=>`<button role="menuitemradio" aria-checked="${k===value}" data-v="${esc(k)}"><b>${esc(l)}</b>${sub?`<small>${esc(sub)}</small>`:''}</button>`).join('')}</div></div>`}
function wireDD(el,onPick){if(!el)return;const btn=el.querySelector('.dd-btn');btn.onclick=e=>{e.stopPropagation();const o=!el.classList.contains('open');$$('.fdd.open').forEach(x=>{x.classList.remove('open');x.querySelector('.dd-btn').setAttribute('aria-expanded','false')});el.classList.toggle('open',o);btn.setAttribute('aria-expanded',o)};
  el.querySelector('.dd-menu').onclick=e=>{const b=e.target.closest('[data-v]');if(!b)return;el.classList.remove('open');btn.setAttribute('aria-expanded','false');$$('[data-v]',el).forEach(x=>x.setAttribute('aria-checked',x===b));el.querySelector('.dd-btn b').textContent=b.querySelector('b').textContent;onPick(b.dataset.v)}}
document.addEventListener('click',async e=>{const g=e.target.closest('[data-game]');if(!g)return;if(g.dataset.game==='guess')return guessGame();
  if(g.dataset.game==='roulette'){g.classList.add('busy');const prof=profile();const seen=new Set(prof.seen);const a=prof.artists[Math.floor(Math.random()*Math.min(6,prof.artists.length))];let pool=[];
    try{const near=a?await nearArtists(a.name,prof.artists.map(x=>artistKey(x.name))):[];const pick=near[Math.floor(Math.random()*Math.min(8,near.length))];pool=pick?await deepFrom(pick.name,null,6,t=>!seen.has(t.id)):await API.genreTop(prof.genres[0]||'Pop',60)}catch(x){}
    g.classList.remove('busy');const t=shuffleMix(pool.filter(t=>!seen.has(t.id)))[0];if(t){playList([t],0,'Song roulette');openNP();toast(`Song roulette: ${t.title} — ${t.artist}`)}else toast('Couldn’t spin right now — try again')}});
document.addEventListener('change',e=>{if(e.target.id==='pfname'){SSocial.setName(e.target.value.trim()||('guest_'+SSocial.me.id.slice(0,8)));renderShell();toast('Name saved')}});
document.addEventListener('click',e=>{if(!e.target.closest('.fdd'))$$('.fdd.open').forEach(x=>x.classList.remove('open'))});
function skeleton(n=6,kind='tile'){if(kind==='rows')return`<div class="sk-rows" aria-hidden="true">${Array(n).fill('<div class="sk-row"><div class="sk" style="width:48px;height:48px;border-radius:8px;flex:none"></div><div><div class="sk" style="height:12px;width:55%;border-radius:6px"></div><div class="sk" style="height:10px;width:35%;border-radius:6px;margin-top:8px"></div></div></div>').join('')}</div>`;
  return`<div class="shelf">${Array(n).fill('<div class="tile"><div class="art sk"></div><div class="sk" style="height:12px;width:78%;border-radius:6px;margin-top:10px"></div><div class="sk" style="height:10px;width:52%;border-radius:6px;margin-top:7px"></div></div>').join('')}</div>`}
const greet=()=>{const h=new Date().getHours();return h<5?'Good night':h<12?'Good morning':h<18?'Good afternoon':'Good evening'};

/* ---------- click delegation ---------- */
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-play],[data-idx],[data-more],[data-vers],[data-go]');if(!t)return;
  if(t.dataset.vers){e.stopPropagation();return versionsSheet(TR.get(t.dataset.vers))}
  if(t.dataset.more){e.stopPropagation();return trackMenu(TR.get(t.dataset.more))}
  if(t.dataset.play){const tr=TR.get(t.dataset.play);if(!tr)return;
    if(tr.kind==='podcast')return go('podcast-'+tr.pid);if(tr.kind==='mix')return openMix(tr,t);if(tr.kind==='artist')return go('artist-'+tr.artistId);
    if(tr.kind==='artistq')return openArtist(tr.title);
    if(tr.kind==='album')return go('album-'+tr.albumId);if(tr.kind==='iashow')return go('show-'+tr.ident);if(tr.kind==='playlist')return go('playlist-'+tr.plId);if(tr.kind==='xpl')return go('xpl-'+tr.xsrc+'~'+encodeURIComponent(tr.xid));
    const sh=t.closest('.shelf');const sib=sh?$$('[data-play]',sh).map(x=>TR.get(x.dataset.play)).filter(x=>x&&!x.kind):[tr];return playList(sib,Math.max(0,sib.indexOf(tr)),'')}
  if(t.dataset.idx!=null){const L=LISTS[t.closest('[data-list]').dataset.list];return playList(L.ids.map(id=>TR.get(id)),+t.dataset.idx,L.ctx)}
  if(t.dataset.go)return go(t.dataset.go);
});

/* ---------- player ---------- */
async function playList(list,i=0,ctx=''){Q.list=list.filter(Boolean);Q.i=i;Q.ctx=ctx;const h=location.hash.match(/^#artist-(\d+)/),gh=location.hash.match(/^#genre-(.+)/);Q.seed=h?{kind:'artist',id:h[1],name:ctx.split(' · ')[0]}:gh?{kind:'genre',name:decodeURIComponent(gh[1])}:null;Q.used=new Set();saveQueue();await loadCurrent()}
function saveQueue(pos){const st=Math.max(0,Q.i-100);Store.queueState={list:Q.list.slice(st,st+200).map(t=>({...t,versions:undefined})),i:Q.i-st,ctx:Q.ctx,pos:pos||0,id:cur&&cur.id};Store.save('queueState')}
let posSaved=0;function savePos(){if(!cur||!Store.queueState||cur.src==='radio')return;Store.queueState.pos=eng.time||0;Store.queueState.id=cur.id;Store.save('queueState');posSaved=performance.now()}
addEventListener('pagehide',()=>{savePos();Store.save('stats','history')});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){savePos();Store.save('stats')}});
let loadTok=0;
async function loadCurrent(autoplay=true,at=0){const t=Q.list[Q.i];if(!t)return;if(castTo){cur=t;renderMini();renderNP();markRows();curSrc=null;if(t.src!=='youtube'&&Store.settings.fullFirst!==false&&!t.ytCands&&castTo.youtube&&!castTo.audio)await ytCandsFor(t).catch(()=>{});castLoad(t,at);renderCastBar();return}cur=t;const tok=++loadTok;adLock=false;curSrc=null;busyNow=!!autoplay;bufNow=false;srcNoted=false;renderPlayState();Lyr.reset();renderMini();renderNP();markRows();
  try{let src=await resolveSource(t);if(tok!==loadTok)return;const pre=PRE.get(t.id);if(pre&&pre.blob&&src.url&&!src.yt&&!src.blob&&(src.url===pre.url))src={...src,blob:pre.blob};if(src.url&&!src.live&&!src.blob){const ok=await canPlay(src.url);if(tok!==loadTok)return;if(!ok){if(t.previewOnly)throw new Error('nopreview');throw new Error('dead')}}
    if(src.yt){await eng.load({yt:src.yt});if(tok!==loadTok)return;ytActive=src.yt;placeYT();await src.yt.init(autoplay);if(tok!==loadTok||eng.yt!==src.yt){try{src.yt.stop()}catch(e){}return}}else{ytActive=null;placeYT();await eng.load(src,{autoplay,at})}
    curSrc=src;busyNow=false;renderPlayState();if(src.fx)Promise.resolve(eng.setFx(src.fx)).catch(()=>{});mediaSession();Lyr.load(t);listenStart(t,src);renderNP();socialPush();fadeInYT();preArmed=true}
  catch(e){if(tok!==loadTok)return;
    // a shaky connection isn't a missing song: wait for the network and try the same song again before giving up on it
    const tries=(t._tries||0);if(tries<2&&(!navigator.onLine||/fetch|network|timeout|load|abort/i.test(String(e&&e.message||e))||e.message==='dead')){
      Q.list[Q.i]={...t,_tries:tries+1};renderPlayState(true);if(!navigator.onLine)await new Promise(r=>{const on=()=>{removeEventListener('online',on);r()};addEventListener('online',on);setTimeout(r,20000)});else await new Promise(r=>setTimeout(r,tries?3500:1200));
      if(tok===loadTok)return loadCurrent(autoplay,at);return}
    if(!t.previewOnly&&e.message!=='nopreview'){const good=goodSrc(t);Q.list[Q.i]={...t,previewOnly:!good||good.kind==='preview',ytBad:!good,useYT:good&&good.kind==='yt'&&!(t.ytTried||[]).includes(good.id)?good.id:null,_tries:0};if(Q.list[Q.i].useYT){Q.list[Q.i].previewOnly=false}return loadCurrent(autoplay,at)}
    // songs saved by older versions can point at ids or links that no longer work: look the song up again once
    if(!t.refreshed&&t.title&&t.artist&&t.src!=='local'){try{const r=await API.search(`${t.artist} ${t.title}`,{limit:8});const m=r.find(x=>baseTitle(x.title).toLowerCase()===baseTitle(t.title).toLowerCase()&&artistKey(x.artist).startsWith(artistKey(t.artist).split(' ')[0]));
      if(m&&tok===loadTok){Q.list[Q.i]={...m,refreshed:true};saveQueue();return loadCurrent(autoplay,at)}}catch(x){}}
    busyNow=false;autoSkips++;if(autoSkips>2||Q.list.length<2){autoSkips=0;note('This song can’t be played right now');renderPlayState();return}
    note('Can’t play this one — trying the next');setTimeout(()=>next(false,true),900)}}
eng.on('buffering',b=>{bufNow=!!b;renderPlayState()});
eng.on('blocked',()=>{busyNow=false;bufNow=false;renderPlayState();toast('Tap to start playback','Play',()=>eng.play(),10000)});
let autoSkips=0;eng.on('state',()=>{if(eng.playing){autoSkips=0;if(cur&&curSrc&&!adLock&&eng.time>2)rememberSrc(cur,curSrc);if(cur&&cur._tries)cur._tries=0}});
const FILE=location.protocol==='file:';
const dzFresh=new Map();// Deezer preview links expire after a few hours: always ask for a current one
async function freshPreview(t){if(t.dzId){const k=t.dzId;const c=dzFresh.get(k);if(c&&Date.now()-c.at<18e5)return c.u;const x=await SSrc.Deezer.track(t.dzId);if(x&&x.preview){dzFresh.set(k,{u:x.preview,at:Date.now()});return x.preview}}
  if(t.preview)return t.preview;
  // no preview of its own (e.g. an independent release): find the same song in the catalog
  try{const r=(await API.search(`${t.artist} ${baseTitle(t.title)}`,{limit:5})).find(x=>x.preview&&artistKey(x.artist)===artistKey(t.artist)&&baseTitle(x.title)===baseTitle(t.title));return r?r.preview:null}catch(e){return null}}
/* the source each song last played from, remembered, so a song that worked once is found straight away next time */
function goodSrc(t){const m=SData.LS.get('goodSrc',{});return t&&m[t.id]||null}
function rememberSrc(t,src){if(!t||!src)return;const m=SData.LS.get('goodSrc',{});const v=src.yt?{kind:'yt',id:src.yt.id}:src.kind==='preview'?{kind:'preview'}:null;if(!v)return;v.at=Date.now();m[t.id]=v;const ks=Object.keys(m);if(ks.length>1500)ks.sort((a,b)=>m[a].at-m[b].at).slice(0,300).forEach(k=>delete m[k]);SData.LS.set('goodSrc',m)}
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
  // with the screen off or the app in the background, YouTube's player can't start — so the next song uses a source
  // sniplit plays itself (full song where one exists, otherwise the preview) and the queue keeps going
  const bg=document.visibilityState==='hidden';
  if(!bg&&!t.previewOnly&&!t.ytBad&&Store.settings.fullFirst!==false&&navigator.onLine){
    {const g=goodSrc(t);if(g&&g.kind==='yt'&&!(t.ytTried||[]).includes(g.id)&&!(t.ytCands||[]).includes(g.id)&&!t.ytCands){t.ytCands=[g.id];ytCandsFor({...t,ytCands:null},PRE.get(t.id)).then(c=>{const q=Q.list.find(x=>x.id===t.id);if(q)q.ytCands=[g.id,...c.filter(x=>x!==g.id)]}).catch(()=>{})}}
    if(!t.ytCands)await ytCandsFor(t,PRE.get(t.id));
    const id=t.ytCands.find(x=>!(t.ytTried||[]).includes(x));if(id){t.ytPick=id;t.ytStill=(t.ytStillIds||[]).includes(id)||t.ytCands.indexOf(id)<2;return takeCuedYT(t,id)||ytSource(id,t)}}
  const pv=await freshPreview(t);if(!pv)throw new Error('nopreview');
  const blob=await fetchBlob(pv);return blob?{blob,kind:'preview'}:{url:pv,kind:'preview'}}
function canPlay(url){return new Promise(r=>{const a=new Audio();let done=false;const f=v=>{if(!done){done=true;a.src='';r(v)}};a.preload='metadata';a.onloadedmetadata=()=>f(true);a.onerror=()=>f(false);setTimeout(()=>f(true),5000);a.src=url})}
async function fetchBlob(url){try{const r=await fetch(url,{mode:'cors'});if(!r.ok)return null;return await r.blob()}catch(e){return null}}
function ytSource(id,t){const host=document.createElement('div');host.className='yt-host';
  const yt=new YTSource(host,id,{title:t.title,artist:String(t.artist||'').split(/,|&| feat/i)[0],expectedDuration:(t.durationMs||0)/1000,onEvent:(ev,d)=>{if(ev==='error'&&cur&&cur.id===t.id){const tried=[...(cur.ytTried||[]),id];const more=(cur.ytCands||[]).some(x=>!tried.includes(x))&&!cur.useYT;Q.list[Q.i]={...cur,ytTried:tried,ytBad:!more,useYT:null};loadCurrent(true);return}if(ev==='ended')onEnded();if(ev==='state'){renderPlayState();mediaSessionState();androidState()}if(ev==='ad'){if(adLock&&!d)window.__adEnd=Date.now();adLock=d;renderAd();if(!d&&Lyr.el)Lyr.render()}if(ev==='needtap'){$('#yt-park').classList.add('tap');if(!$('#np.on')&&cur)openNP();toast('Tap the artwork once to start — your phone needs one tap on the video')}if(ev==='tapped'){$('#yt-park').classList.remove('tap');toast(null)}if(ev==='time')onTime()}});yt.hostEl=host;return{yt,kind:'youtube',full:true}}
/* YouTube stays visible: over the artwork in Now Playing, otherwise in the mini player's artwork slot. Never moved in the DOM.
   The frame is cover-fitted and slightly enlarged so letterbox bars and player chrome fall outside the visible area. */
function fitYT(park,W,H){const host=ytActive&&ytActive.hostEl;if(!host)return;const still=cur&&cur.ytStill;const k=adLock?1:still?1.25:1.24;let w,h;if(adLock){w=W;h=H}else if(W/H>16/9){w=W;h=W*9/16}else{h=H;w=H*16/9}
  host.style.setProperty('--yw',w*k+'px');host.style.setProperty('--yh',h*k+'px');park.classList.toggle('ad',!!adLock)}
let _safeT=null;function safeTop(){if(_safeT==null){const p=document.createElement('div');p.style.cssText='position:fixed;top:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden';document.body.appendChild(p);_safeT=parseFloat(getComputedStyle(p).paddingTop)||0;p.remove();addEventListener('resize',()=>_safeT=null,{once:true})}return _safeT}
function placeYT(){const park=$('#yt-park');
  if(!ytActive){park.style.cssText='position:fixed;left:-9999px;top:0;width:10px;height:10px';$('.np-art')?.classList.remove('video');$('#mini .mi img')?.classList.remove('vid');return}
  if(ytActive.hostEl.parentNode!==park)park.appendChild(ytActive.hostEl);ytActive.hostEl.classList.remove('cued');for(const h of[...park.children])if(h!==ytActive.hostEl&&!(ytNext&&h===ytNext.host))h.remove();
  const art=$('#np.on .np-art');const r=art&&art.getBoundingClientRect();const mi=$('#mini:not(.hide) .mi img');const mr=mi&&mi.getBoundingClientRect();
  let box=null,rad=18,z=65;
  if(r&&r.width>40&&getComputedStyle(art).display!=='none'){art.classList.add('video');box=r}
  else if(mr&&mr.width>20&&!$('#np.on')){box=mr;rad=8;z=26;mi.classList.add('vid')}
  if(!box){park.style.cssText='position:fixed;left:-9999px;top:0;width:200px;height:200px';return}
  // the video sits over the artwork but never over the header or outside the scrolling area: whatever of the artwork
  // has scrolled under the header (or off the panel) is clipped off the video too
  let ct=0,cb=0;if(art&&box===r){const np=$('#np.on');const head=np&&$('.np-top',np);let sc=art.parentElement;while(sc&&sc!==np&&!/(auto|scroll)/.test(getComputedStyle(sc).overflowY))sc=sc.parentElement;
    const sr=(sc||np||document.body).getBoundingClientRect();const safeT=safeTop();const hp=head&&getComputedStyle(head).position;const hb=hp==='sticky'||hp==='fixed'?head.getBoundingClientRect().bottom:sr.top+safeT;const top=Math.max(sr.top,hb),bot=sr.bottom;ct=Math.max(0,top-box.top);cb=Math.max(0,box.bottom-bot)}
  Object.assign(park.style,{position:'fixed',left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px',borderRadius:rad+'px',overflow:'hidden',zIndex:z,boxShadow:'none',clipPath:ct||cb?`inset(${ct}px 0 ${cb}px 0 round ${rad}px)`:'',visibility:ct+cb>=box.height-1?'hidden':'visible'});park.className='yt-park';fitYT(park,box.width,box.height)}
let ytRaf=0,ytLast='';(function follow(){ytRaf=requestAnimationFrame(follow);if(!ytActive)return;const art=$('#np.on .np-art')||$('#mini:not(.hide) .mi img');const r=art&&art.getBoundingClientRect();const key=r?[r.left,r.top,r.width,r.height].map(Math.round).join():'';if(key!==ytLast){ytLast=key;placeYT()}})();
/* while an ad runs, the artwork frame becomes 16:9 so the ad fills it edge to edge (no black bars), with all of its own buttons visible */
function renderAd(){$$('.np-art').forEach(a=>a.classList.toggle('ad16',!!adLock));setTimeout(()=>ytActive&&placeYT(),30);$$('.adlock').forEach(e=>e.classList.toggle('on',adLock));$$('[data-lock]').forEach(b=>b.disabled=adLock)}
function next(manual=true,skipErr){if(adLock)return;if(!Q.list.length)return;if(cur&&!skipErr&&!castTo){const d=eng.duration||((cur.durationMs||0)/1000);Flow.outcome(cur,manual?(d?eng.time/d:0):1,{liked:!!Store.likes[cur.id]})}if(Q.shuffle)Q.i=Math.floor(Math.random()*Q.list.length);else if(Q.i<Q.list.length-1)Q.i++;else if(Q.loop==='forever'||Store.settings.autoplay!==false&&Q.loop!=='all'){endless();return}else if(Q.loop==='all'||manual)Q.i=0;else return;saveQueue();loadCurrent();if(Q.list.length-Q.i<=2&&Store.settings.autoplay!==false)endless(true)}
/* the queue never runs dry: from an artist page it keeps going through that artist (then artists like them);
   otherwise it follows what's playing. Nothing already queued or recently played comes back. */
let extending=null;
/* ---------- Flow ----------
   The endless queue learns while you listen, within this session. Every automatic song comes from a "lane"
   (the radio around the song, close neighbours' deeper cuts, more of the same artist, your own favourites, or a wild
   two-steps-away discovery). Each lane keeps a running score from what you actually do — finish a song and its lane
   earns trust, skip it and it loses some — and the next songs are drawn from lanes in proportion to a random sample of
   that trust (Thompson sampling), so it leans into what's working without ever locking into one thing.
   Skips also act immediately: songs by an artist you just skipped are pulled from what's coming up, and the rest of the
   upcoming automatic songs are re-ordered by the new scores and by tempo, so each song flows into the next. */
const Flow={lanes:{radio:[1,1],near:[1.4,1],own:[1,1],taste:[1.2,1],wild:[.8,1]},art:{},bpm:new Map(),
  load(){try{const v=JSON.parse(sessionStorage.getItem('sn.flow')||'null');if(v&&Date.now()-v.at<6*36e5){this.lanes=v.lanes;this.art=v.art||{}}}catch(e){}},
  save(){try{sessionStorage.setItem('sn.flow',JSON.stringify({lanes:this.lanes,art:this.art,at:Date.now()}))}catch(e){}},
  beta(a,b){const g=k=>{let x=0;for(let i=0;i<Math.max(1,Math.round(k*2));i++)x-=Math.log(Math.random());return x/2};const x=g(a),y=g(b);return x/(x+y)},
  sample(){const o={};for(const[k,[a,b]]of Object.entries(this.lanes))o[k]=this.beta(a,b);return o},
  // what happened to a song: f = how much of it played (0–1)
  outcome(t,f,{liked}={}){if(!t)return;const l=t.flowLane,ak=artistKey(String(t.artist||'').split(/,|&| feat/i)[0]);const win=liked?2:f>.85?1:f>.5?.5:0,loss=f<.25?1:f<.5?.4:0;
    if(l&&this.lanes[l]){this.lanes[l][0]+=win;this.lanes[l][1]+=loss}this.art[ak]=(this.art[ak]||0)+win-loss*1.3;
    if(loss>=1&&t.flowLane)this.prune(ak);this.save();this.reorder()},
  prune(ak){// a quick skip on an automatic song: that artist's other upcoming automatic songs go
    if((this.art[ak]||0)>-1)return;const keep=Q.list.slice(0,Q.i+1),rest=Q.list.slice(Q.i+1).filter(x=>!(x.flowLane&&artistKey(String(x.artist||'').split(/,|&| feat/i)[0])===ak));if(rest.length!==Q.list.length-Q.i-1){Q.list=[...keep,...rest];saveQueue()}},
  score(x,smp,prevBpm){const ak=artistKey(String(x.artist||'').split(/,|&| feat/i)[0]);let s=(smp[x.flowLane]||.5)*3+(this.art[ak]||0)*.6;const b=this.bpm.get(x.id);if(b&&prevBpm){const d=Math.min(Math.abs(b-prevBpm),Math.abs(b*2-prevBpm),Math.abs(b-prevBpm*2));s-=Math.min(1.5,d/25)}return s},
  // the automatic songs still to come are put in the best order for right now; songs you queued yourself never move
  reorder(){const start=Q.i+1;let j=start;while(j<Q.list.length&&!Q.list[j].flowLane)j++;const tail=Q.list.slice(j);if(tail.length<3)return;const smp=this.sample();
    const out=[];let prev=this.bpm.get((Q.list[j-1]||{}).id)||0;const pool=[...tail];while(pool.length){let bi=0,bs=-1e9;for(let k=0;k<Math.min(pool.length,12);k++){const sc=this.score(pool[k],smp,prev);if(sc>bs){bs=sc;bi=k}}const x=pool.splice(bi,1)[0];out.push(x);prev=this.bpm.get(x.id)||prev}
    Q.list=[...Q.list.slice(0,j),...out];saveQueue();if($('#np.on')&&npPane==='queue')renderNP()},
  // tempo from Deezer for a few upcoming songs, so neighbours flow into each other
  async tempos(list){if(netTier()<2)return;for(const t of list.slice(0,10)){if(this.bpm.has(t.id))continue;try{let dz=t.dzId;if(!dz){const r=await SSrc.Deezer.search(`${t.artist} ${baseTitle(t.title)}`,3).catch(()=>[]);dz=r[0]&&r[0].dzId}if(dz){const x=await SSrc.Deezer.track(dz);if(x&&x.bpm)this.bpm.set(t.id,x.bpm)}}catch(e){}}},
  why(t){const l=t.flowLane,src=t.flowFrom?esc(t.flowFrom):'';return l==='radio'?`Around ${src}`:l==='near'?`Close to ${src}, less known`:l==='own'?`More from ${src}`:l==='taste'?'From artists you keep finishing':l==='wild'?'A step further out':''}};
Flow.load();
/* spread artists out: never the same artist twice in a row, at most `cap` per batch */
function diversify(list,cap=3){list=list.filter(t=>!isBlk(t));const per={},out=[],wait=[];for(const t of list){const k=artistKey(t.artist);if((per[k]=(per[k]||0)+1)>cap)continue;
  if(out.length&&artistKey(out[out.length-1].artist)===k)wait.push(t);else{out.push(t);for(let i=0;i<wait.length;i++)if(artistKey(wait[i].artist)!==artistKey(out[out.length-1].artist)){out.push(wait.splice(i,1)[0]);i=-1}}}return out.concat(wait)}
/* deeper picks from one artist: a couple of hits, then songs from across the catalog that never charted */
async function deepFrom(name,id,n,fresh){const[pop,cat]=await Promise.all([API.popular(name).catch(()=>[]),API.catalog(name,id).catch(()=>[])]);
  const popK=new Set(pop.slice(0,10).map(t=>baseTitle(t.title).toLowerCase()));const deep=shuffleMix(groupVersions(cat).filter(t=>!popK.has(baseTitle(t.title).toLowerCase())&&fresh(t)));
  return[...shuffleMix(pop.slice(0,8).filter(fresh)).slice(0,Math.ceil(n/3)),...deep].slice(0,n)}
/* artists one and two steps away, smaller ones first — that's where discovery lives */
async function nearArtists(name,known){const dz=await SSrc.Deezer.artist(name).catch(()=>null);if(!dz)return[];const r1=await SSrc.Deezer.related(dz.id).catch(()=>[]);
  const r2=(await Promise.all(shuffleMix(r1).slice(0,3).map(r=>SSrc.Deezer.related(r.dzId).catch(()=>[])))).flat();
  const seen=new Set([artistKey(name),...(known||[])]);return[...r1,...r2].filter(r=>{const k=artistKey(r.name);if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>(a.fans||0)-(b.fans||0)+(Math.random()-.5)*2e5)}
async function endless(silent){if(extending)return extending;extending=(async()=>{const seed=Q.list[Q.i]||cur;if(!seed)return;
  if(API.offline||!navigator.onLine){const inQ=new Set(Q.list.map(t=>t.id));const pool=SData.localLibrary().filter(t=>(cachedIds.has(t.id)||t.src==='local')&&!inQ.has(t.id));const fresh=new Set(unplayedStash().map(t=>t.id));
    const add=diversify([...shuffleMix(pool.filter(t=>fresh.has(t.id))),...shuffleMix(pool.filter(t=>!fresh.has(t.id)))]).slice(0,20);if(add.length){Q.list.push(...add);saveQueue()}
    if(!silent){if(Q.i<Q.list.length-1){Q.i++;saveQueue();loadCurrent()}}return}
  const recentKeys=new Set(Store.history.slice(-400).map(h=>artistKey(h.track.artist)+'|'+baseTitle(h.track.title)));const have=new Set(Q.list.map(t=>artistKey(t.artist)+'|'+baseTitle(t.title)));
  const fresh=t=>{const k=artistKey(t.artist)+'|'+baseTitle(t.title);return t&&!have.has(k)&&!recentKeys.has(k)&&!/\b(live|instrumental|karaoke|acapella|sped up|slowed|remix)\b/i.test(t.title)};
  let add=[];
  try{if(Q.seed&&Q.seed.kind==='artist'){// artist radio: walk the whole catalog, hits mixed with album cuts, then the artists around them
      add=await deepFrom(Q.seed.name,Q.seed.id,12,fresh);
      if(add.length<5){const near=(await nearArtists(Q.seed.name)).slice(0,5);for(const r of near)add.push(...(await deepFrom(r.name,null,3,fresh)))}}
    else if(Q.seed&&Q.seed.kind==='genre'){const top=await API.genreTop(Q.seed.name,100).catch(()=>[]);add=shuffleMix(hookRank(groupVersions(top),profile()).filter(fresh).slice(0,30)).slice(0,12)}
    else{const art=seed.artist.split(/,|&| feat/i)[0].trim();const dz=await SSrc.Deezer.artist(art).catch(()=>null);const prof=profile();
      const[radio,near,own]=await Promise.all([dz?SSrc.Deezer.radio(dz.id).catch(()=>[]):[],nearArtists(art,prof.artists.slice(0,30).map(a=>artistKey(a.name))),deepFrom(art,seed.artistId,3,fresh)]);
      const nearPicks=(await Promise.all(near.slice(0,4).map(r=>deepFrom(r.name,null,2,fresh)))).flat();
      // Deezer's radio leans popular; rank it by taste, then interleave with deep cuts and lesser-known neighbours
      const rad=hookRank(groupVersions(radio).filter(fresh),prof).slice(0,8);
      // Flow lanes: favourites this session keeps finishing, and a wild card two steps away
      const liked=Object.entries(Flow.art).filter(([,v])=>v>=1).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k])=>k);
      const favName=k=>(Store.history.slice().reverse().find(h=>artistKey(String(h.track.artist).split(/,|&| feat/i)[0])===k)||{}).track;
      const taste=(await Promise.all(liked.map(k=>{const ft=favName(k);return ft?deepFrom(String(ft.artist).split(/,|&| feat/i)[0].trim(),ft.artistId,2,fresh).catch(()=>[]):[]}))).flat();
      const far=near[near.length-1]?await nearArtists(near[near.length-1].name,prof.artists.slice(0,30).map(a=>artistKey(a.name))).catch(()=>[]):[];const wild=far[2]?await deepFrom(far[Math.floor(Math.random()*Math.min(5,far.length))].name,null,2,fresh).catch(()=>[]):[];
      const tag=(l,lane,from)=>l.map(t=>({...t,flowLane:lane,flowFrom:from}));
      const L={radio:tag(rad,'radio',art),near:tag(nearPicks,'near',art),own:tag(own,'own',art),taste:tag(taste,'taste',''),wild:tag(wild,'wild',near[near.length-1]&&near[near.length-1].name||'')};
      // draw from lanes by a sample of how well each has done this session
      add=[];const smp=Flow.sample();const order=Object.keys(L).sort((a,b)=>smp[b]-smp[a]);const quota={};const tot=order.reduce((a,k)=>a+smp[k],0)||1;for(const k of order)quota[k]=Math.max(1,Math.round(16*smp[k]/tot));
      for(let i=0;add.length<16&&i<16;i++)for(const k of order)if(L[k][i]&&i<quota[k]+(add.length<10?2:0))add.push(L[k][i]);
      Flow.tempos(add).then(()=>Flow.reorder()).catch(()=>{})}}catch(e){}
  add=diversify(add.filter((t,i,a)=>t&&a.findIndex(x=>artistKey(x.artist)+'|'+baseTitle(x.title)===artistKey(t.artist)+'|'+baseTitle(t.title))===i));
  if(add.length){Q.list.push(...add);saveQueue();if($('#np.on'))renderNP()}
  if(!silent){if(Q.i<Q.list.length-1){Q.i++;saveQueue();loadCurrent()}else{Q.i=0;loadCurrent()}}})().finally(()=>extending=null);return extending}
function prev(){if(adLock)return;if(eng.time>3){eng.seek(Q.ab?Q.ab[0]:0);return}Q.i=(Q.i-1+Q.list.length)%Q.list.length;saveQueue();loadCurrent()}
/* ---------- preloading: the 4 songs before and after the current one are made ready ----------
   Their source is worked out (YouTube ids, Audius streams), short audio (previews) is fetched into memory, and their
   lyrics and artwork are fetched (lyrics are also saved for offline). Skipping and crossfading then need no network. */
const PRE=new Map();let preRun=0;
/* every YouTube upload of a song that could stand in for the full version, best first; found ahead of time for queued songs */
async function ytCandsFor(t,slot){if(t.ytCands)return t.ytCands;if(slot&&slot.yt)return slot.yt.then(c=>{t.ytCands=c;t.ytStillIds=slot.still||[];return c});
  const job=(async()=>{let c=await Promise.race([SSrc.youtubeFor(t),new Promise(r=>setTimeout(()=>r([]),3500))]).catch(()=>[]);c=[...c];let still=[];
    try{const s=await Promise.race([YT.sourcesFor(t),new Promise(r=>setTimeout(()=>r([]),c.length?1500:6000))]);const order=['Audio','Official video','Lyric video','Video','Visualizer'];
      s.sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind)).forEach(x=>{if(!c.includes(x.ytId)&&x.kind!=='Live'&&x.kind!=='Edit')c.push(x.ytId)});still=s.filter(x=>x.kind==='Audio').map(x=>x.ytId)}catch(e){}
    if(slot)slot.still=still;t.ytStillIds=still;return c.slice(0,5)})();
  if(slot)slot.yt=job;const c=await job;if(c.length)t.ytCands=c;else if(slot)slot.yt=null;return c}
/* Getting ready for what's next, politely: nothing starts until the current song is actually playing, the nearest
   songs come first, slow or data-saver connections fetch only the essentials, and only one thing downloads at a time. */
function netTier(){const c=navigator.connection;if(!navigator.onLine)return 0;if(!c)return 2;if(c.saveData||/(^|-)2g/.test(c.effectiveType||''))return 0;if(c.effectiveType==='3g'||(c.downlink&&c.downlink<1.5))return 1;return 2}
let preArmed=false;
async function preloadAround(){const run=++preRun;if(!navigator.onLine||!Q.list.length)return;const tier=netTier();
  const reach=tier===2?4:tier===1?2:1;const idx=[1,-1,2,3,-2,4,-3,-4].filter(d=>Math.abs(d)<=reach).map(d=>Q.i+d).filter(i=>i>=0&&i<Q.list.length);const keep=new Set(idx.map(i=>Q.list[i].id));
  for(const[k]of PRE)if(!keep.has(k)&&!(cur&&cur.id===k))PRE.delete(k);
  for(const[n,i]of idx.entries()){if(run!==preRun)return;
    // the song playing now always wins: if it stalls, everything else waits
    while(run===preRun&&(isBusy()||bufNow))await sleep(800);if(run!==preRun)return;
    const t=Q.list[i];if(!t||t.live||PRE.has(t.id))continue;const e={at:Date.now()};PRE.set(t.id,e);
    SLyrics.fetchLyrics(t).catch(()=>{});if(t.art&&!t.art.startsWith('data:')&&tier){const im=new Image();im.decoding='async';im.src=t.art}
    try{if(t.src==='audius'){e.url=await SSrc.Audius.streamUrl(t.auId);e.full=true}
      else if(t.src!=='youtube'&&t.src!=='local'&&t.src!=='radio'&&t.src!=='podcast'){const fullWay=Store.settings.fullFirst!==false&&!t.previewOnly;
        if(fullWay&&!t.ytCands)await ytCandsFor(t,e).then(c=>{const q=Q.list.find(x=>x.id===t.id);if(q&&c.length&&!q.ytCands){q.ytCands=c;q.ytStillIds=t.ytStillIds}}).catch(()=>{});
        // the next song's player is set up (paused, nothing playing) so it starts the moment it's needed
        if(fullWay&&n===0&&tier===2&&i===Q.i+1&&document.visibilityState==='visible')cueNextYT(Q.list[i]);
        // the preview file is only a backup when the full song plays through YouTube, so it's fetched just for the nearest songs
        const needBlob=!fullWay||Math.abs(i-Q.i)<=1;const u=t.preview?(t.dzId?await freshPreview(t).catch(()=>t.preview):t.preview):null;if(u){e.url=u;if(needBlob&&tier===2)e.blob=await fetchBlob(u)}}}catch(x){}
    await new Promise(r=>(window.requestIdleCallback||setTimeout)(r,{timeout:1500}));await sleep(tier===2?150:700)}}
/* one hidden YouTube player, cued (not playing) with the next song */
let ytNext=null;
async function cueNextYT(t){const cands=(Q.list.find(x=>x.id===t.id)||t).ytCands;const id=cands&&cands.find(x=>!(t.ytTried||[]).includes(x));if(!id)return;if(ytNext&&ytNext.id===id)return;
  if(ytNext){try{ytNext.src.yt.stop()}catch(e){}ytNext.host&&ytNext.host.remove();ytNext=null}
  // it waits inside the same parking spot the visible player uses, so it never has to move (moving a player reloads it)
  const src=ytSource(id,t);src.yt.hostEl.classList.add('cued');$('#yt-park').appendChild(src.yt.hostEl);ytNext={id,tid:t.id,src,host:src.yt.hostEl};try{await src.yt.init(false)}catch(e){ytNext=null}}
function takeCuedYT(t,id){if(ytNext&&ytNext.tid===t.id&&ytNext.id===id){const s=ytNext.src;ytNext=null;return s}return null}
/* ---------- crossfade ----------
   Songs sniplit plays itself overlap for the crossfade length. YouTube songs can't overlap (one player), so they
   fade out at the end and the next one fades in. Phones that ignore volume (iPhone) just play back to back. */
let fading=null;
function xfadeSecs(){const v=Store.settings.xfade;return v==null?4:+v}
function maybeCrossfade(){const xf=xfadeSecs();if(cur&&fading===cur.id&&eng.duration-eng.time>xf+1){fading=null;if(eng.kind==='yt'&&eng.yt)try{eng.yt.volume(Math.min(1,eng.fx.volume??1))}catch(e){}}if(!xf||!cur||fading===cur.id||Q.loop==='one'||Q.ab||studioOpen||adLock)return;const d=eng.duration,t=eng.time;if(!d||d<xf*3||d-t>xf||d-t<.3)return;
  if(eng.kind==='yt'&&eng.yt){fading=cur.id;const v0=Math.round(100*Math.min(1,eng.fx.volume??1));const t0=performance.now(),T=Math.max(.5,d-t)*1000;const iv=setInterval(()=>{const p=Math.min(1,(performance.now()-t0)/T);try{eng.yt.volume((1-p)*v0/100)}catch(e){}if(p>=1)clearInterval(iv)},80);return}
  if(eng.kind!=='file'||!eng.canFade||Q.shuffle)return;const nxt=Q.list[Q.i+1];if(!nxt)return;const pre=PRE.get(nxt.id);if(!pre||!(pre.blob||pre.url)||nxt.live)return;
  // only when the next song would also be played by sniplit itself (not by YouTube)
  const viaYT=nxt.src==='youtube'||nxt.useYT||(!nxt.previewOnly&&!nxt.ytBad&&Store.settings.fullFirst!==false&&nxt.src!=='audius'&&nxt.src!=='local'&&nxt.src!=='archive'&&!pre.full);if(viaYT)return;
  fading=cur.id;logListen(true);const src={url:pre.url,blob:pre.blob,kind:'file',full:!!pre.full};
  eng.crossfade(src,Math.min(xf,d-t),()=>{Q.i++;cur=Q.list[Q.i];curSrc=src;saveQueue();Lyr.reset();Lyr.load(cur);renderMini();renderNP();markRows();mediaSession();socialPush();setTimeout(preloadAround,800);if(Q.list.length-Q.i<=2&&Store.settings.autoplay!==false)endless(true)}).then(ok=>{if(!ok)fading=null})}
function fadeInYT(){if(eng.kind!=='yt'||!eng.yt||!xfadeSecs())return;const v0=Math.min(1,eng.fx.volume??1);try{eng.yt.volume(0)}catch(e){}const t0=performance.now();const iv=setInterval(()=>{const p=Math.min(1,(performance.now()-t0)/1500);try{eng.yt.volume(p*v0)}catch(e){}if(p>=1)clearInterval(iv)},80)}
function onEnded(){logListen(true);if(studioOpen||Q.loop==='one'){eng.seek(Q.ab?Q.ab[0]:0);eng.play();return}next(false)}
eng.on('ended',onEnded);eng.on('state',()=>{renderPlayState();mediaSessionState();wake();socialPush();androidState()});
function androidState(){const A=window.sniplitAndroid;if(A&&A.playing)try{A.playing(!!eng.playing,cur?cur.title:'sniplit',cur?cur.artist:'')}catch(e){}}
// Android back button: close what's open first
window.sniplitBack=()=>{if($('#story.on')){closeStory();return true}if($('#sheet.on')){closeSheet();return true}if($('#np.on')){closeNP();return true}if(location.hash&&location.hash!=='#home'){history.back();return true}return false};eng.on('time',onTime);eng.on('meta',()=>renderNP(true));

/* listening time + history */
let lastWall=0,sessionMs=0,logged=false;
/* listening time per song, for the owner's analytics */
let LT=null;function listenStart(t,src){listenFlush();LT={id:t.id,title:t.title,artist:t.artist,kind:src&&(src.yt?'youtube':src.full?'full':src.live?'radio':'preview'),ms:0,last:0}}
function listenFlush(){if(LT&&LT.ms>3000&&window.SAnalytics)SAnalytics.track('listen',{kind:LT.kind});LT=null}
addEventListener('pagehide',listenFlush);
setInterval(()=>{if(!LT)return;const now=performance.now();if(eng.playing&&LT.last)LT.ms+=Math.min(2000,now-LT.last);LT.last=eng.playing?now:0;if(LT.ms>=12e4){const k={...LT};listenFlush();LT={...k,ms:0}}},1000);
let srcNoted=false;
function onTime(){maybeCrossfade();if(preArmed&&eng.playing&&!adLock&&eng.time>3){preArmed=false;preloadAround()}if(!srcNoted&&cur&&curSrc&&eng.playing&&!adLock&&eng.time>8){srcNoted=true;rememberSrc(cur,curSrc)}if(bufNow&&eng.playing&&eng.kind!=='yt'){}const now=performance.now();if(eng.playing&&lastWall){const d=Math.min(1500,now-lastWall);sessionMs+=d;Store.stats.ms+=d;const day=today();Store.stats.days[day]=(Store.stats.days[day]||0)+d;Store.stats.hours[new Date().getHours()]+=d}lastWall=eng.playing?now:0;
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
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){wake();if(cur&&curSrc&&!curSrc.full&&curSrc.kind!=='yt'&&!cur.previewOnly&&cur.src!=='local'&&eng.playing)toast('Playing the preview while sniplit was in the background','Full song',()=>{Q.list[Q.i]={...cur,previewOnly:false};loadCurrent(true)},8000)}
  if(document.visibilityState==='hidden'&&eng.el===eng.fxEl&&/iP(hone|ad|od)/.test(navigator.userAgent)&&eng.playing&&!Store.settings.fxBackground){const saved={...eng.fx};eng.forceGraph=false;Object.assign(eng.fx,{...Engine.DEFAULT_FX,volume:saved.volume,rate:saved.rate});eng.route(true).then(()=>{Object.assign(eng.fx,saved);eng._pendingFx=true})}
  if(document.visibilityState==='visible'&&eng._pendingFx){eng._pendingFx=false;eng.setFx({})}});

/* ---------- mini player ---------- */
function renderMini(){const m=$('#mini');if(!cur){m.classList.add('hide');return}m.classList.remove('hide');
  m.innerHTML=`<div class="prog"><i></i></div><div class="mi" data-act="np"><img src="${esc(cur.art||SData.placeholderArt(cur.title))}" alt=""><div class="grow"><div class="ell mt">${esc(cur.title)}</div><div class="ell mut small">${esc(cur.artist)}</div></div></div>
  <div class="ctr"><button class="icon-btn hide-m" data-act="shuffle" aria-label="Shuffle">${I('shuffle')}</button><button class="icon-btn hide-m" data-act="prev" data-lock aria-label="Previous">${I('prev')}</button><button class="pp" data-act="toggle" aria-label="Play or pause">${I(eng.playing?'pause':'play')}</button><button class="icon-btn" data-act="next" data-lock aria-label="Next">${I('next')}</button><button class="icon-btn hide-m" data-act="loop" aria-label="Repeat">${I('repeat')}</button></div>
  <div class="rt"><button class="icon-btn" data-act="lyrics" aria-label="Lyrics">${I('lyrics')}</button><button class="icon-btn" data-act="queue" aria-label="Queue">${I('queue')}</button><button class="icon-btn" data-act="cast" aria-label="Devices">${I('cast')}</button><span class="vol-wrap">${I('volume')}<input class="vol" type="range" min="0" max="1" step="0.01" value="${eng.fx.volume}" data-act="vol" aria-label="Volume"></span></div>`;
  renderPlayState();renderLoopBtns();bindMiniSwipe()}
/* while a song is being found, loading or buffering, the play button becomes a calm spinning ring instead of a frozen icon */
let busyNow=false,bufNow=false;const isBusy=()=>busyNow||bufNow||(eng.kind==='yt'&&eng.yt&&eng.yt.state===3&&!adLock);
function renderPlayState(){const busy=isBusy();$$('[data-act=toggle]').forEach(b=>{const want=busy?'busy':eng.playing?'pause':'play';if(b.dataset.st===want)return;b.dataset.st=want;b.classList.toggle('busy',busy);b.innerHTML=busy?'<span class="spin" aria-hidden="true"></span>':I(want);b.setAttribute('aria-label',busy?'Loading':eng.playing?'Pause':'Play')});$('#np')?.classList.toggle('playing',eng.playing)}
function renderLoopBtns(){$$('[data-act=loop]').forEach(b=>{b.classList.toggle('on',Q.loop!=='off');b.dataset.mode=Q.loop;b.setAttribute('aria-label',{off:'Repeat off',all:'Repeat all',one:'Repeat one',forever:'Endless'}[Q.loop])});$$('[data-act=shuffle]').forEach(b=>b.classList.toggle('on',Q.shuffle))}
function renderProgress(){if(adLock&&eng.yt&&eng.yt.adDuration){const ad=eng.yt.adDuration,at=eng.yt.adTime,ap=ad?at/ad*100:0;$$('#mini .prog i').forEach(e=>e.style.width=ap+'%');const s=$('#np .seek');if(s&&!seeking){$('i',s).style.width=ap+'%';$('b',s).style.left=ap+'%';$('#np .t0').textContent='Ad · '+fmt(at);$('#np .t1').textContent='-'+fmt(Math.max(0,ad-at))}return}
  const d=eng.duration,t=eng.time,p=d?t/d*100:0;$$('#mini .prog i').forEach(e=>e.style.width=p+'%');
  const s=$('#np .seek');if(s&&!seeking){$('i',s).style.width=p+'%';$('b',s).style.left=p+'%';const bu=$('u',s);if(bu)bu.style.width=(d?eng.buffered/d*100:0)+'%';$('#np .t0').textContent=fmt(t);$('#np .t1').textContent=cur&&cur.src==='radio'?'LIVE':'-'+fmt(Math.max(0,d-t))}}
document.addEventListener('input',e=>{if(e.target.dataset.act==='vol'){eng.setFx({volume:+e.target.value});keepFx()}});
document.addEventListener('input',e=>{if(e.target.id==='accany'&&Store.premium){Store.settings.accent=e.target.value;Store.save('settings');applyLayout()}});
let fxT;function keepFx(){clearTimeout(fxT);fxT=setTimeout(async()=>{try{sessionStorage.setItem('sn.fxs',JSON.stringify({...eng.fx,eq:[...eng.fx.eq]}))}catch(e){}
  // downloaded songs remember their own studio settings
  if(cur&&cachedIds.has(cur.id)){const c=await IDB.get('audio',cur.id);if(c){c.fx={...eng.fx,eq:[...eng.fx.eq]};IDB.put('audio',cur.id,c)}}},400)}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b||b.disabled)return;const a=b.dataset.act;
  const A={np:openNP,toggle:()=>{if(eng.kind==='none'&&cur){const st=Store.queueState;return loadCurrent(true,st&&st.id===cur.id?st.pos||0:0)}eng.toggle()},next:()=>next(),prev,shuffle:()=>{Q.shuffle=!Q.shuffle;Store.settings.shuffle=Q.shuffle;Store.save('settings');renderLoopBtns()},
    loop:()=>{const o=['off','all','one','forever'];Q.loop=o[(o.indexOf(Q.loop)+1)%4];Store.settings.loop=Q.loop;Store.save('settings');renderLoopBtns();note({off:'Repeat off',all:'Repeating this list',one:'Repeating this song',forever:'Endless — keeps going with similar songs'}[Q.loop])},
    lyrics:()=>{openNP();setPane('lyrics')},queue:()=>{openNP();setPane('queue')},studio:editorSheet,cast:castSheet,share:()=>shareSheet(cur),dl:()=>cacheTrack(cur,b),export:()=>exportSheet(cur),closeNP,versions:()=>versionsSheet(cur),like:()=>toggleLike(cur,b),more:()=>trackMenu(cur),artist:()=>{closeNP();openArtist(String(cur.artist||'').split(/,|&| feat| x /i)[0].trim(),cur.artistId)},create:createSheet};
  if(A[a]){e.preventDefault();A[a]()}});

/* ---------- now playing ---------- */
let npPane=Layout.mode==='mobile'?null:'lyrics';
/* long titles drift slowly sideways — measured once per title and width, never restarted mid-scroll */
function marquee(){const t=$('#np .np-meta .t');if(!t)return;const txt=t.textContent,key=txt+'|'+Math.round(t.clientWidth);if(t.dataset.mq===key)return;t.dataset.mq=key;t.classList.remove('mq');t.textContent=txt;
  requestAnimationFrame(()=>{if(!t.isConnected||t.dataset.mq!==key)return;const over=t.scrollWidth-t.clientWidth;if(over>4&&t.clientWidth>40){const px=Math.min(over+48,4000);t.style.setProperty('--mqx',-px+'px');t.style.setProperty('--mqd',Math.max(10,px/24).toFixed(1)+'s');t.innerHTML=`<span>${esc(txt)}</span>`;t.classList.add('mq')}})}
new MutationObserver(()=>{clearTimeout(marquee.t);marquee.t=setTimeout(marquee,120)}).observe(document.getElementById('np'),{childList:true,subtree:true});addEventListener('resize',()=>{clearTimeout(marquee.t);marquee.t=setTimeout(marquee,200)});
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
  else if(p==='queue'){pane.style.overflow='auto';pane.innerHTML=`<div class="row" style="justify-content:space-between;margin:4px 0 8px"><span class="mut small">${Q.list.length} songs · ${esc(Q.ctx||'Queue')}</span><button class="tag btn" data-cachepl>${I('download')}Download all</button></div>`+(Q.list.some(t=>t.flowLane)?`<div class="flow-h"><span class="flow-dot"></span><b>Flow</b><small>Learning from what you finish and skip — automatic songs reorder as you go</small></div>`:'')+trackRows(Q.list,{ctx:Q.ctx});
    // automatic songs say why they're there
    $$('.tl',pane).forEach((r,k)=>{const t=Q.list[k];if(t&&t.flowLane&&k>Q.i){const w=Flow.why(t);const sm=r.querySelector('small');if(w&&sm)sm.insertAdjacentHTML('beforeend',` <span class="why">· ${w}</span>`)}})}
  else if(p==='video'){pane.style.overflow='auto';pane.innerHTML=`<div class="card"><h3>Watch</h3><p class="mut small">Pick a video for this song — it plays in place of the artwork.</p><div id="srcs">${skeleton(3,'rows')}</div><div class="row" style="margin-top:10px"><input id="ytpaste" placeholder="Or paste a YouTube link"><button class="pill sm" id="ytgo">Play</button></div></div>`;
    YT.sourcesFor(cur).then(s=>{const el=$('#srcs');if(!el)return;el.innerHTML=s.length?s.map(v=>`<div class="opt" role="button" tabindex="0" data-ytsrc="${esc(v.ytId)}"><img src="${esc(v.art)}" style="width:96px;height:54px;object-fit:cover;border-radius:8px"><div class="grow"><b class="ell" style="display:block">${esc(v.kind)}</b><small class="ell">${esc(v.title)} · ${fmt(v.durationMs/1000)}</small></div></div>`).join(''):'<p class="mut small">No videos found.</p>'}).catch(e=>{const el=$('#srcs');if(el)el.innerHTML=`<p class="mut small">${esc(e.message)}</p>`})}
  else if(p==='about'){pane.style.overflow='auto';const v=cur.versions||[cur];pane.innerHTML=`<div class="card"><h3>${esc(cur.title)}</h3><p class="mut small">${esc(cur.artist)} · ${esc(cur.album||'')} · ${esc((cur.release||'').slice(0,4))} · ${esc(cur.genre||'')}</p>
    <div class="set-row"><div>Your rating</div><div class="row" style="gap:0">${[1,2,3,4,5].map(n=>`<button class="icon-btn" data-rate="${n}" style="width:32px;height:32px;color:${(Store.ratings[cur.id]||0)>=n?'var(--fg)':'var(--mut2)'}">${I((Store.ratings[cur.id]||0)>=n?'starF':'star')}</button>`).join('')}</div></div>
    <div class="set-row"><div>Versions<small>${v.map(x=>(x.vtags||SData.versionTags(x)).join(' · ')).join('  |  ')}</small></div></div>${cur.url?`<div class="set-row"><div>Full release<small>Apple Music</small></div><a class="pill sm ghost" href="${esc(cur.url)}" target="_blank" rel="noopener">Open</a></div>`:''}
    <div id="xinfo"></div><div class="set-row"><div>Studio export</div><button class="pill sm ghost" data-act="export">${I('export')}Export audio</button></div></div>`;
    const t=cur;Promise.all([SSrc.MB.recording(t),SSrc.Links.of(t)]).then(([mb,ln])=>{const el=$('#xinfo');if(!el||cur!==t)return;let h='';
      if(mb){h+=`<div class="set-row"><div>First released<small>${esc(mb.first||'—')}${mb.release?' · '+esc(mb.release):''}</small></div>${mb.releaseId?`<img src="${SSrc.MB.cover(mb.releaseId)}" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover" onerror="this.remove()">`:''}</div>`;if(mb.isrc)h+=`<div class="set-row"><div>ISRC<small>${esc(mb.isrc)} · on ${pl(mb.releases,'release')}</small></div></div>`}
      if(ln&&ln.links.length)h+=`<div class="set-row" style="display:block"><div>Also on</div><div class="links">${ln.links.map(l=>`<a class="tag btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join('')}</div></div>`;el.innerHTML=h})}}
document.addEventListener('click',async e=>{const p=e.target.closest('[data-pane]');if(p){setPane(p.dataset.pane);return}
  const r=e.target.closest('[data-rate]');if(r&&cur){Store.ratings[cur.id]=+r.dataset.rate;if(+r.dataset.rate>=4&&!Store.likes[cur.id])toggleLike(cur);Store.save('ratings');setPane('about');return}
  const up=e.target.closest('[data-usepreview]');if(up&&cur){closeSheet();Q.list[Q.i]={...cur,previewOnly:true,previewChosen:true,useYT:null};loadCurrent().then(()=>setTimeout(editorSheet,600));return}
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
  const fe=document.activeElement,native=fe&&/^(BUTTON|A|SUMMARY)$/.test(fe.tagName),custom=fe&&fe!==document.body&&!native&&(fe.matches('[role=button],[tabindex],[data-play],[data-idx]'));
  if(e.code==='Space'&&custom){e.preventDefault();fe.click()}else if(e.code==='Space'&&!native){e.preventDefault();eng.toggle()}else if(e.key==='MediaTrackNext')next();else if(e.key==='MediaTrackPrevious')prev();else if(e.key==='MediaPlayPause')eng.toggle();
  else if(e.key==='Escape'||e.key==='GoBack'||e.key==='BrowserBack'||[4,10009,461].includes(e.keyCode)||(e.key==='Backspace'&&Layout.mode==='tv')){e.preventDefault();if(!window.sniplitBack())history.length>1&&history.back()}
  else if(e.key==='MediaPlay'){if(!eng.playing)eng.toggle()}else if(e.key==='MediaPause'||e.key==='MediaStop'){if(eng.playing)eng.toggle()}
  else if(e.key==='MediaFastForward'||e.keyCode===228)eng.seek(Math.min(eng.duration||0,eng.time+10));else if(e.key==='MediaRewind'||e.keyCode===227)eng.seek(Math.max(0,eng.time-10));
  else if((Layout.mode==='tv'||!matchMedia('(pointer:fine)').matches)&&e.key.startsWith('Arrow')){e.preventDefault();spatial(e.key)}
  else if(e.key==='Enter'&&custom){e.preventDefault();fe.click()}});
function spatial(dir){const scope=$('#sheet.on')||$('#story.on')||$('#np.on')||document;const els=$$('a,button,[tabindex="0"],input,select',scope).filter(x=>{const r=x.getBoundingClientRect();return r.width&&r.height&&r.bottom>0&&r.top<innerHeight*1.5&&getComputedStyle(x).visibility!=='hidden'});
  const a=els.includes(document.activeElement)?document.activeElement:null;if(!a){(els.find(x=>x.closest('#view'))||els[0])?.focus();return}const ar=a.getBoundingClientRect(),ac=[ar.left+ar.width/2,ar.top+ar.height/2];let best=null,bd=1e9;
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
function openSheet(html,{wide}={}){studioOpen=false;if(sheetBye){const f=sheetBye;sheetBye=null;try{f()}catch(e){}}const s=$('#sheet');s.onclick=null;s.oninput=null;s.innerHTML='<div class="grab"></div>'+html+'<div class="sheet-note"></div>';s.classList.toggle('wide',!!wide);s.style.transform='';s.classList.add('on');$('#scrim').classList.add('on');if(Layout.mode==='mobile')history.pushState({sheet:1},'');
  if(!s._g){s._g=1;drag(s,{axis:'y',onStart:()=>{if(s.scrollTop>0)return;s.style.transition='none'},onMove:(dx,dy)=>{if(Layout.mode==='mobile'&&s.scrollTop<=0&&dy>0)s.style.transform=`translateY(${dy}px)`},onEnd:(dx,dy,v)=>{s.style.transition='';if(Layout.mode==='mobile'&&s.scrollTop<=0&&(dy>120||v>.6)){if(history.state&&history.state.sheet)history.back();else closeSheet()}else s.style.transform=''}})}
  return s}
let studioOpen=false,sheetBye=null;function closeSheet(){studioOpen=false;if(sheetBye){const f=sheetBye;sheetBye=null;try{f()}catch(e){}}const s=$('#sheet');s.classList.remove('on');s.style.transform='';$('#scrim').classList.remove('on')}
$('#scrim').addEventListener('click',()=>{if(history.state&&history.state.sheet)history.back();else closeSheet()});
document.addEventListener('click',e=>{if(e.target.closest('[data-close]')){if(history.state&&history.state.sheet)history.back();else closeSheet()}});
const sheetH=t=>`<div class="sheet-h"><h2>${t}</h2><button class="icon-btn" data-close aria-label="Close">${I('close')}</button></div>`;
const opt=(icon,label,act,sub='')=>`<div class="opt" role="button" tabindex="0" data-m="${act}">${I(icon)}<div class="grow">${label}${sub?`<small>${sub}</small>`:''}</div></div>`;

function createSheet(){const s=openSheet(`${sheetH('Create')}${opt('list','New playlist','pl','Start empty and add from any ⋯ menu')}${opt('music','Add audio files','files','MP3, M4A, FLAC, WAV, AIFF, OGG…')}${opt('folder','Add a folder','folder','Every audio file inside, sub-folders included')}${opt('import','Bring your library','import','From Spotify, Apple Music, YouTube, Deezer, Last.fm or a list')}${opt('export','Export your library','export','Playlists, ratings, history & preferences')}
  <input type="file" multiple accept="audio/*,.flac,.m4a,.aiff,.opus" hidden id="cf"><input type="file" webkitdirectory directory multiple hidden id="cd"><div class="progress" id="cpw" style="display:none;margin-top:12px"><i id="cp"></i></div>`);
  s.onclick=e=>{const m=e.target.closest('[data-m]');if(!m)return;const a=m.dataset.m;if(a==='pl'){const p=newPlaylist('My playlist #'+(Store.playlists.length+1));closeSheet();go('playlist-'+p.id)}if(a==='files')$('#cf').click();if(a==='folder')$('#cd').click();if(a==='import'){closeSheet();go('import')}if(a==='export'){closeSheet();go('export')}};
  const run=async files=>{$('#cpw').style.display='block';const a=await SImport.importFiles(files,p=>{const el=$('#cp');if(el)el.style.width=p*100+'%'});refreshSide();closeSheet();if(a.length){playList(a,0,'On this device');go('library-local')}else note('No audio files found')};
  $('#cf').onchange=e=>run(e.target.files);$('#cd').onchange=e=>run(e.target.files)}
function trackMenu(t){if(!t)return;reg(t);const liked=!!Store.likes[t.id];
  const s=openSheet(`<div class="row" style="margin:0 0 12px"><img src="${esc(t.art||SData.placeholderArt(t.title))}" style="width:52px;height:52px;border-radius:10px;object-fit:cover"><div class="grow"><b class="ell" style="display:block">${esc(t.title)}</b><span class="mut small">${esc(t.artist)}</span></div><button class="icon-btn" data-close>${I('close')}</button></div>
  ${opt('queue','Play next','next')}${opt(liked?'heartF':'heart',liked?'Remove from Liked Songs':'Add to Liked Songs','like')}${opt('plus','Add to playlist','pl')}${cur&&t.id===cur.id&&curSrc&&curSrc.kind==='preview'?opt('play','Play the full song','full'):''}${opt('versions','Versions & sources','vers')}${opt(cachedIds.has(t.id)?'downloaded':'download',cachedIds.has(t.id)?'Remove download':'Download','dl')}${opt('export','Export audio','exp')}${opt('video','Make a lyric video','lvs')}${t.artist?opt('close','Don’t show '+esc(String(t.artist).split(/,|&| feat/i)[0].trim()),'blk'):''}${opt('share','Share','share')}${t.artistId?opt('user','Go to artist','artist'):''}${opt('radio','Start a station from this','radio')}`);
  s.onclick=async e=>{const m=e.target.closest('[data-m]');if(!m)return;const a=m.dataset.m;
    if(a==='next'){Q.list.splice(Q.i+1,0,t);saveQueue();flash(m,`${I('check')}<div class="grow">Playing next</div>`);setTimeout(closeSheet,500);return}
    if(a==='like'){toggleLike(t);flash(m,`${I('check')}<div class="grow">Done</div>`);setTimeout(closeSheet,400);return}
    if(a==='dl'){if(cachedIds.has(t.id)){await IDB.del('audio',t.id);cachedIds.delete(t.id);closeSheet()}else{flash(m,`${I('download')}<div class="grow">Downloading…</div>`,4000);const ok=await cacheTrack(t);m.innerHTML=ok?`${I('check')}<div class="grow">Downloaded</div>`:`${I('close')}<div class="grow">Can’t download this source</div>`;setTimeout(closeSheet,700)}return}
    closeSheet();if(a==='full'){Q.list[Q.i]={...cur,previewOnly:false,ytBad:false,ytTried:[],ytCands:null};loadCurrent(true);return}if(a==='pl')addToPlaylistSheet([t]);if(a==='vers')versionsSheet(t);if(a==='exp')exportSheet(t);if(a==='lvs')go('lyricvideo-'+t.id);if(a==='blk'){blockArtist(String(t.artist).split(/,|&| feat/i)[0].trim(),t.genre)}if(a==='share')shareSheet(t);if(a==='artist')go('artist-'+t.artistId);if(a==='radio')songRadio(t)}}
function addToPlaylistSheet(tracks){const s=openSheet(`${sheetH('Add to playlist')}${opt('plus','New playlist','new')}${Store.playlists.map(p=>`<div class="opt" role="button" tabindex="0" data-pl="${p.id}"><img src="${esc(p.tracks[0]?.art||SData.placeholderArt(p.name))}" class="opt-art"><div class="grow">${esc(p.name)}<small>${p.tracks.length} songs</small></div></div>`).join('')}`);
  s.onclick=e=>{const n=e.target.closest('[data-m=new]'),p=e.target.closest('[data-pl]');if(n){newPlaylist('My playlist #'+(Store.playlists.length+1),tracks);flash(n,`${I('check')}<div class="grow">Created</div>`);setTimeout(closeSheet,450)}
    if(p){const pl=Store.playlists.find(x=>x.id===p.dataset.pl);tracks.forEach(t=>{if(!pl.tracks.some(x=>x.id===t.id))pl.tracks.push({...t,versions:undefined})});Store.save('playlists');refreshSide();socialPush(true);flash(p,`${I('check')}<div class="grow">Added to ${esc(pl.name)}</div>`);setTimeout(closeSheet,450)}}}
async function versionsSheet(t){if(!t)return;const vs=t.versions&&t.versions.length?t.versions:[t];vs.forEach(reg);
  const s=openSheet(`${sheetH('Versions & sources')}${vs.map(v=>`<div class="opt" role="button" tabindex="0" data-pv="${esc(v.id)}"><img src="${esc(v.art)}" class="opt-art"><div class="grow"><b class="ell" style="display:block">${esc(v.title)}</b><small>${esc(v.album||'')} ${(v.vtags||SData.versionTags(v)).map(x=>`<span class="badge">${x}</span>`).join(' ')}</small></div><span class="mut small">${v.durationMs?fmt(v.durationMs/1000):''}</span></div>`).join('')}
  <h3 style="margin:18px 0 6px">Video</h3><div id="vsrc" class="mut small">${skeleton(2,'rows')}</div>`);
  s.onclick=e=>{const v=e.target.closest('[data-pv]'),y=e.target.closest('[data-ytsrc]');if(v){const tr={...TR.get(v.dataset.pv),versions:vs};closeSheet();if(cur&&baseTitle(cur.title)===baseTitle(tr.title)){Q.list[Q.i]=tr;loadCurrent(true,eng.time)}else playList([tr],0)}
    if(y){closeSheet();const tr={...t,useYT:y.dataset.ytsrc};if(cur&&cur.id===t.id){Q.list[Q.i]=tr;loadCurrent()}else playList([tr],0)}};
  {try{const src=await YT.sourcesFor(t);const el=$('#vsrc');if(el)el.innerHTML=src.length?src.map(v=>`<div class="opt" role="button" tabindex="0" data-ytsrc="${esc(v.ytId)}"><img src="${esc(v.art)}" style="width:80px;height:45px;border-radius:6px;object-fit:cover"><div class="grow"><b style="color:var(--fg)">${esc(v.kind)}</b><small class="ell">${esc(v.title)} · ${fmt(v.durationMs/1000)}</small></div></div>`).join(''):'No videos found.'}catch(e){const el=$('#vsrc');if(el)el.textContent=e.message}}}

/* ---------- offline downloads ---------- */
/* Downloads: the whole song whenever the source provides the audio file (independent releases, live archives, podcasts,
   your own files) — stored as an uncompressed WAV together with metadata, artwork, lyrics and your studio settings.
   Songs that stream through YouTube's player can't be saved; their 30-second preview is kept instead. */
async function fullFileFor(t){if(cur&&t.id===cur.id&&eng.blob&&curSrc&&curSrc.full)return eng.blob;
  if(t.src==='audius'){const u=await SSrc.Audius.streamUrl(t.auId);return u?fetchBlob(u):null}
  if(t.src==='archive'||t.src==='podcast')return fetchBlob(t.stream);return null}
async function toWav(blob){try{const AC=window.OfflineAudioContext||window.webkitOfflineAudioContext;const buf=await new AC(2,44100,44100).decodeAudioData(await blob.arrayBuffer());return{wav:SFile.encodeWAV(buf,16),dur:buf.duration}}catch(e){return null}}
async function cacheTrack(t,btn,opt={}){if(!t)return false;if(cachedIds.has(t.id))return true;if(t.src==='local'||t.live)return opt.batch?'skip':true;
  if(!opt.stash&&!Store.premium&&cachedIds.size-stashIds.size>=FREE_CACHE_LIMIT){if(!opt.batch)note(`Free downloads hold ${FREE_CACHE_LIMIT} songs — Premium is unlimited`);return opt.batch?'limit':false}
  if(btn)btn.classList.add('busy');let full=false,src=null;
  try{src=await fullFileFor(t).catch(()=>null);full=!!src;if(!src&&t.preview)src=await fetchBlob(t.preview);
    if(!src){const u=await freshPreview(t).catch(()=>null)||(t.artist?await API.search(t.artist+' '+t.title,{limit:3}).then(r=>{const m=r.find(x=>x.preview&&baseTitle(x.title).toLowerCase()===baseTitle(t.title).toLowerCase());return m&&m.preview}).catch(()=>null):null);if(u)src=await fetchBlob(u)}
    if(!src){if(!opt.batch)note(t.src==='youtube'&&!t.preview?'Videos stream only — they can’t be saved offline':'This source can’t be saved offline');return false}
    // store the file as it came (it already plays everywhere); only formats a phone can't decode get converted
    const native=/audio\/(mp4|mpeg|aac|x-m4a|mp3|ogg|webm|wav|flac)/.test(src.type||'');const w=native?null:await toWav(src);const blob=w?w.wav:src;
    const[lyr,artBlob]=await Promise.all([opt.batch?Promise.resolve(null):SLyrics.fetchLyrics(t).catch(()=>null),t.art&&!t.art.startsWith('data:')?fetchBlob(t.art):null]);
    if(opt.batch)SLyrics.fetchLyrics(t).then(l=>l&&IDB.get('audio',t.id).then(r=>r&&IDB.put('audio',t.id,{...r,lyrics:{...l,candidates:undefined}}))).catch(()=>{});
    await IDB.put('audio',t.id,{blob,meta:{...t,versions:undefined},full,format:w?'wav':'original',duration:w?w.dur:0,lyrics:lyr?{...lyr,candidates:undefined}:null,art:artBlob||null,fx:null,at:Date.now(),size:blob.size});
    cachedIds.add(t.id);(Store.cachedMeta=Store.cachedMeta||[]).push({...t,versions:undefined,stash:!!opt.stash});if(opt.stash){stashIds.add(t.id);SData.LS.set('stashIds',[...stashIds])}else if(stashIds.delete(t.id))SData.LS.set('stashIds',[...stashIds]);if(!opt.batch&&!full&&(t.src!=='youtube'))note(cur&&cur.id===t.id&&eng.kind==='yt'?'The full song streams through YouTube — the 30-second preview was saved':'Saved');
    if(cur&&cur.id===t.id){$$('#np [data-act=dl]').forEach(b=>{b.classList.add('on');b.innerHTML=I('downloaded')})}refreshSide();return true}
  finally{if(btn)btn.classList.remove('busy')}}
/* batch downloads run as a background job (three at a time); the sheet is only a window onto it */
/* ---------- offline stash ----------
   While you're online (and not on metered data), sniplit quietly saves ~40 songs it thinks you'll like but haven't
   heard — previews or full songs where allowed — so being offline still brings new music. Played ones rotate out. */
const stashIds=new Set(SData.LS.get('stashIds',[]));const STASH_TARGET=40,STASH_MAX=90;let stashing=false;
const stashMeta=()=>(Store.cachedMeta||[]).filter(t=>stashIds.has(t.id));
function unplayedStash(){const played=new Set(Store.history.map(h=>h.track&&h.track.id));return stashMeta().filter(t=>!played.has(t.id))}
async function fillStash(){if(stashing||!navigator.onLine||API.offline||Store.settings.offlineStash===false)return;const c=navigator.connection;if(c&&(c.saveData||c.type==='cellular'))return;stashing=true;
  try{const played=new Set(Store.history.map(h=>h.track&&h.track.id));
    // rotate out what's been played, oldest first, once over the cap
    const old=stashMeta().filter(t=>played.has(t.id));for(const t of old.slice(0,Math.max(0,stashIds.size-STASH_MAX+10))){await IDB.del('audio',t.id).catch(()=>{});cachedIds.delete(t.id);stashIds.delete(t.id)}
    SData.LS.set('stashIds',[...stashIds]);let need=STASH_TARGET-unplayedStash().length;if(need<=0)return;
    const prof=profile();if(prof.cold)return;const seen=new Set(prof.seen);const fr=t=>t&&!seen.has(t.id)&&!cachedIds.has(t.id)&&!t.live;
    const pools=await Promise.all([...prof.artists.slice(0,4).map(a=>deepFrom(a.name,a.id,5,fr).catch(()=>[])),...prof.genres.slice(0,2).map(g=>API.genreTop(g,50).then(l=>hookRank(groupVersions(l),prof).filter(fr).slice(0,14)).catch(()=>[])),
      nearArtists((prof.artists[0]||{}).name||'',prof.artists.map(a=>artistKey(a.name))).then(n=>Promise.all(n.slice(0,4).map(r=>deepFrom(r.name,null,3,fr).catch(()=>[])))).then(x=>x.flat()).catch(()=>[])]);
    const cand=diversify(shuffleMix(pools.flat().filter(fr)));
    for(const t of cand){if(need<=0||!navigator.onLine)break;if(await cacheTrack(t,null,{batch:true,stash:true}).catch(()=>false)===true)need--;await sleep(1200)}}
  finally{stashing=false}}
setTimeout(()=>{const run=()=>(window.requestIdleCallback||setTimeout)(()=>fillStash());run();setInterval(run,30*6e4)},25000);
const DLJ={list:[],i:0,ok:0,fail:0,skip:0,limit:false,running:false,label:''};
function dlProgress(){const p=$('#cp'),pt=$('#cpt');const n=DLJ.list.length,d=DLJ.ok+DLJ.fail+DLJ.skip;if(p)p.style.width=(n?d/n*100:0)+'%';
  if(pt)pt.textContent=DLJ.running?`${d} of ${n} · ${DLJ.ok} saved${DLJ.fail?` · ${DLJ.fail} couldn’t be saved`:''}`:`${DLJ.ok} of ${n} songs ready offline${DLJ.fail?` · ${DLJ.fail} had nothing to save (video-only)`:''}${DLJ.limit?` · free storage is full (${FREE_CACHE_LIMIT} songs)`:''}`}
async function cacheMany(list,label){list=(list||[]).filter(t=>t&&!cachedIds.has(t.id));
  openSheet(`${sheetH('Downloading')}<p class="mut small">${esc(label||'')}</p><div class="progress"><i id="cp"></i></div><p class="mut small" id="cpt">Starting…</p><p class="mut small">You can close this — downloads keep going.</p>`);
  if(DLJ.running){DLJ.list.push(...list.filter(t=>!DLJ.list.includes(t)));dlProgress();return}
  if(!list.length){const pt=$('#cpt');if(pt)pt.textContent='Everything here is already downloaded.';return}
  Object.assign(DLJ,{list,i:0,ok:0,fail:0,skip:0,limit:false,running:true,label});dlProgress();
  const worker=async()=>{while(DLJ.i<DLJ.list.length&&!DLJ.limit){const t=DLJ.list[DLJ.i++];const r=await cacheTrack(t,null,{batch:true}).catch(()=>false);
    if(r==='limit'){DLJ.limit=true;DLJ.fail++}else if(r==='skip')DLJ.skip++;else if(r)DLJ.ok++;else DLJ.fail++;dlProgress()}};
  await Promise.all([worker(),worker(),worker()]);DLJ.running=false;dlProgress();refreshSide();if(DLJ.list.length>=5)sniplitNotify('downloads','dl','Downloads finished',`${DLJ.ok} song${DLJ.ok===1?'':'s'} saved for offline${DLJ.label?' · '+DLJ.label:''}${DLJ.fail?` · ${DLJ.fail} couldn’t be saved`:''}`,'#downloads');
  if(!$('#sheet.on'))toast(`${DLJ.ok} song${DLJ.ok===1?'':'s'} downloaded${DLJ.label?' · '+DLJ.label:''}`)}

/* ---------- share ---------- */
const SITE=window.SNIPLIT_SITE||'https://ayqshi.github.io/sniplet/www/index.html';
function shareURL(t,lines){const base=/^https?:$/.test(location.protocol)&&!/^(localhost|127\.)/.test(location.hostname)?location.origin+location.pathname:SITE;const id=String(t.id).replace(/^(it|dz|au|yt):/,'$1');return base+'#t-'+id+(lines&&lines.length?'~'+lines.join('.'):'')}
async function sharedTrack(raw){const m=raw.match(/^(it|dz|au|yt)?(.+)$/);const kind=m[1]||'it',id=m[2];
  if(kind==='it')return API.lookupTrack('it:'+id);if(kind==='dz')return SSrc.Deezer.track(id);if(kind==='yt')return{id:'yt:'+id,src:'youtube',ytId:id,title:'Shared video',artist:'',art:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`};
  if(kind==='au'){const r=await SSrc.get(`https://api.audius.co/v1/tracks/${id}?app_name=sniplit`).catch(()=>null);return r&&r.data?{id:'au:'+id,src:'audius',auId:id,title:r.data.title,artist:r.data.user&&r.data.user.name,art:r.data.artwork&&r.data.artwork['480x480']}:null}return null}
/* someone opened a shared song: show it (with the shared lyrics) in a popup — playing starts from the Play button */
async function openShared(raw,lineIdx){const s=openSheet(`<div class="shared-pop"><div class="sk" style="width:100%;aspect-ratio:4/5;border-radius:18px"></div></div>`);const t=await sharedTrack(raw).catch(()=>null);
  if(!t){s.innerHTML=emptyState('Song unavailable','That shared song couldn’t be found.','music');return}reg(t);
  let lines=[];if(lineIdx.length){const d=await SLyrics.fetchLyrics(t).catch(()=>null);if(d)lines=lineIdx.map(i=>d.lines.filter(l=>!l.instr)[i]).filter(Boolean).map(l=>l.text)}
  s.innerHTML=`<div class="shared-pop">${sheetH('Shared with you')}<canvas id="spc" width="1080" height="1350"></canvas><div class="row" style="margin-top:14px"><button class="pill" id="spp">${I('play')} Play</button><button class="pill ghost" data-close>Close</button></div></div>`;
  await drawLyricCard($('#spc'),t,lines.length?lines:[`${t.title}`]);$('#spp').onclick=()=>{closeSheet();playList([t],0,'Shared with you');openNP()}}
async function shareSheet(t){if(!t)return;const url=shareURL(t);const lines=(Lyr.data&&Lyr.track&&Lyr.track.id===t.id?Lyr.data.lines:[]).filter(l=>!l.instr);
  const s=openSheet(`${sheetH('Share')}<div class="share-song"><canvas id="shcard" width="1080" height="1350" aria-label="Share card"></canvas><div class="grow"><b class="ell">${esc(t.title)}</b><small class="ell">${esc(t.artist||'')}</small><small class="mut">${t.album?esc(t.album):''}</small></div></div>
  <div class="row share-url"><input readonly value="${esc(url)}" id="shu" aria-label="Link"><button class="icon-btn" data-sh="copy" aria-label="Copy link">${I('copy')}</button></div>
  <div class="share-row">${[['share','Share','native'],['link','Copy link','copy'],['send','Send to a friend','friend']].map(([i,l,k])=>`<button data-sh="${k}"><span>${I(i)}</span>${l}</button>`).join('')}</div>
  ${lines.length?`<h3>Lyrics card</h3><p class="mut small">Tap lines to include.</p><div id="shl" style="max-height:200px;overflow:auto;margin:8px 0">${lines.map((l,i)=>`<div class="opt" role="button" tabindex="0" data-li="${i}" style="padding:8px"><span class="radio"></span><div class="grow">${esc(l.text)}</div></div>`).join('')}</div><div class="row"><button class="pill" data-sh="card">Create card</button><button class="pill ghost" data-sh="ltext">Copy lyrics</button></div><canvas id="lcard" width="1080" height="1350" style="width:100%;border-radius:14px;margin-top:12px;display:none"></canvas>`:''}`);
  const sel=new Set();drawLyricCard($('#shcard'),t,[],url).catch(()=>{});
  s.onclick=async e=>{const li=e.target.closest('[data-li]');if(li){const i=+li.dataset.li;sel.has(i)?sel.delete(i):sel.add(i);$('.radio',li).classList.toggle('on',sel.has(i));return}
    const b=e.target.closest('[data-sh]');if(!b)return;const b0=b;const k=b.dataset.sh;const text=`${t.title} — ${t.artist}`;const chosen=[...sel].sort((a,b)=>a-b).map(i=>lines[i].text);
    const copy=async v=>{try{await navigator.clipboard.writeText(v);flash(b,`<span>${I('check')}</span>Copied`)}catch(x){$('#shu').select()}};
    if(k==='copy')copy(url);if(k==='native'){// share the card picture together with the link where the device allows files
      let files=null;try{const c=$('#shcard');const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.9));const f=new File([blob],'sniplit.jpg',{type:'image/jpeg'});if(navigator.canShare&&navigator.canShare({files:[f]}))files=[f]}catch(x){}
      if(navigator.share)navigator.share({title:t.title,text:`${text}\n${url}`,url,...(files?{files}:{})}).catch(()=>navigator.share({title:t.title,text,url}).catch(()=>{}));else copy(url)}
    if(k==='friend'){closeSheet();sendToFriendSheet(t)}
    if(k==='ltext')copy((chosen.length?chosen:lines.map(l=>l.text)).join('\n')+`\n\n— ${t.title}, ${t.artist}\n${url}`);
    if(k==='card'){const idx=chosen.length?[...sel].sort((a,b)=>a-b):[0,1,2,3].filter(i=>lines[i]);const link=shareURL(t,idx);const c=$('#lcard');c.style.display='block';await drawLyricCard(c,t,idx.map(i=>lines[i].text),link);
      // the link travels with the picture: in the share text and on the clipboard (some apps keep only the image)
      try{await navigator.clipboard.writeText(link)}catch(x){}
      c.toBlob(b=>{const f=new File([b],SFile.safeName(t.title)+'-lyrics.png',{type:'image/png'});const data={files:[f],title:t.title,text:`${text}\n${link}`};if(navigator.canShare&&navigator.canShare(data))navigator.share(data).catch(()=>{});else{SFile.download(b,f.name);flash(b0,`<span>${I('check')}</span>Saved · link copied`)}},'image/png')}}}
function sendToFriendSheet(t){const fr=Object.values(SSocial.me.friends);const s=openSheet(`${sheetH('Send to a friend')}${fr.length?fr.map(f=>`<div class="opt" role="button" tabindex="0" data-fr="${f.id}">${avatar(f.name,f.id,36)}<div class="grow">${esc(f.name)}<small>${SSocial.isLive(f.id)?'Online':'Gets it next time they open sniplit'}</small></div>${I('send')}</div>`).join(''):emptyState('No friends yet','Add friends from the Friends tab to send them songs.','friends')}`);
  s.onclick=e=>{const f=e.target.closest('[data-fr]');if(!f)return;SSocial.sendMsg(f.dataset.fr,{kind:'song',track:t}).catch(()=>{});flash(f,`${I('check')}<div class="grow">Sent</div>`)}}
async function drawLyricCard(c,t,lines,link){const x=c.getContext('2d');x.fillStyle='#0a0a0a';x.fillRect(0,0,c.width,c.height);
  try{const img=await loadImg(t.art);x.save();x.filter='blur(40px) saturate(1.2) brightness(.45)';x.drawImage(img,-100,-100,c.width+200,c.height+200);x.restore();x.save();x.beginPath();x.roundRect(80,80,180,180,22);x.clip();x.drawImage(img,80,80,180,180);x.restore()}catch(e){const g=x.createLinearGradient(0,0,0,c.height);g.addColorStop(0,'#1d1d1d');g.addColorStop(1,'#060606');x.fillStyle=g;x.fillRect(0,0,c.width,c.height)}
  x.fillStyle='#fff';x.font='700 40px Inter,Arial';x.fillText(t.title.slice(0,32),290,150);x.fillStyle='#bbb';x.font='500 32px Inter,Arial';x.fillText(t.artist.slice(0,36),290,200);
  x.fillStyle='#fff';x.font='800 64px Inter,Arial';let y=420;for(const l of lines){for(const w of wrap(x,l,920)){x.fillText(w,80,y);y+=80}y+=24;if(y>1180)break}x.font='700 34px Inter,Arial';x.fillStyle='#fff';x.fillText('▷ sniplit',80,1250);x.font='500 24px Inter,Arial';x.fillStyle='rgba(255,255,255,.6)';x.fillText((link||SITE).replace(/^https?:\/\//,'').slice(0,60),80,1292)}
function wrap(x,s,w){const out=[];let line='';for(const word of s.split(' ')){const t=line?line+' '+word:word;if(x.measureText(t).width>w&&line){out.push(line);line=word}else line=t}if(line)out.push(line);return out}
function loadImg(src){const one=u=>new Promise((r,j)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>r(i);i.onerror=j;i.src=u});if(!src)return Promise.reject();const u=thumb(src,600)||src;return one(u+(u.includes('?')?'&':'?')+'sncard=1').catch(()=>one(src+(src.includes('?')?'&':'?')+'sncard=2'))}

/* ---------- devices / cast ---------- */
function castSheet(){const hasRP=!!(eng.raw.remote&&eng.raw.remote.prompt),hasAP=!!window.WebKitPlaybackTargetAvailabilityEvent,hasPres=!!window.PresentationRequest;
  const s=openSheet(`${sheetH('Devices')}${opt('phone','This device','this','Playing here')}${hasAP?opt('airplay','AirPlay','airplay','Apple TV, HomePod & AirPlay speakers'):''}${hasRP?opt('cast','Cast','remote','Chromecast & nearby speakers'):''}${hasPres?opt('tv','Show on a screen','present','Opens sniplit’s TV view on that display'):''}${opt('tv','TV layout here','tvmode','Big-screen view with remote navigation')}${window.sniplitAndroid&&sniplitAndroid.castDiscover?`<h3 class="list-h sm">TVs & speakers on your Wi-Fi</h3><div id="castl"><div class="spin-c sm"><span class="spinner"></span><small class="mut">Looking on your Wi-Fi…</small></div></div>`:''}`);
  if(window.sniplitAndroid&&sniplitAndroid.castDiscover){castFound=null;sniplitAndroid.castDiscover()}
  s.onclick=async e=>{const o=e.target.closest('[data-m]');if(!o)return;const c=o.dataset.m;
    if(eng.kind==='yt'&&(c==='airplay'||c==='remote')){note('Use the cast button inside the video for YouTube sources');return}
    if(c==='airplay'){try{eng.el.webkitShowPlaybackTargetPicker()}catch(x){note('AirPlay isn’t available here')}}
    if(c==='remote'){try{await eng.raw.remote.prompt()}catch(x){note(x.name==='NotFoundError'?'No devices found nearby':'Casting isn’t available here')}}
    if(c==='present'){try{const req=new PresentationRequest([location.pathname+'?tv=1#home']);const conn=await req.start();conn.onconnect=()=>conn.send(JSON.stringify({cmd:'load',track:{...cur,versions:undefined},t:eng.time}));closeSheet()}catch(x){note('No screens found')}}
    if(c==='tvmode'){Store.settings.layout='tv';Store.save('settings');applyLayout();renderShell();closeSheet();route()}
    if(c==='this'){if(castTo)stopCasting();closeSheet()}
    const dv=e.target.closest('[data-castdev]');if(dv){closeSheet();startCasting(dv.dataset.castdev)}}}
if(navigator.presentation&&navigator.presentation.receiver){navigator.presentation.receiver.connectionList.then(l=>{const h=c=>c.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.cmd==='load'){playList([m.track],0,'Casting');setTimeout(()=>eng.seek(m.t||0),800);openNP()}};l.connections.forEach(h);l.onconnectionavailable=ev=>h(ev.connection)})}

/* ---------- casting from the Android app to a TV on the same Wi-Fi ----------
   The TV fetches and plays the song itself (DLNA), or opens it in its YouTube app (DIAL). The phone becomes the remote. */
let castTo=null,castFound=null,castPoll=0;
window.sniplitCast=m=>{if(m.type==='devices'){castFound=m.devices;const el=$('#castl');if(el)el.innerHTML=m.devices.length?m.devices.map(d=>`<div class="opt" role="button" tabindex="0" data-castdev="${esc(d.id)}">${I('tv')}<div class="grow"><b>${esc(d.name)}</b><small>${[d.audio?'Music':'',d.youtube?'YouTube':''].filter(Boolean).join(' · ')||'Screen'}${castTo&&castTo.id===d.id?' · connected':''}</small></div></div>`).join(''):'<p class="small mut">Nothing found. Make sure the TV is on and on the same Wi-Fi, then open this again.</p>'}
  if(m.type==='status'){if(m.state==='error'){note(m.message);if(castTo&&!castTo.ok)stopCasting()}else if(castTo){castTo.ok=true;castTo.mode=m.state;renderCastBar()}}
  if(m.type==='position'&&castTo){castTo.t=m.t;castTo.d=m.d||castTo.d;castTo.state=m.state;const was=castTo.playing;castTo.playing=m.state==='PLAYING';renderCastBar();if(was&&m.state==='STOPPED'&&castTo.d&&castTo.t<1&&castTo.last>castTo.d-6){castTo.last=0;next(false)}castTo.last=m.t}};
function startCasting(id){const d=(castFound||[]).find(x=>x.id===id);if(!d)return;castTo={id,name:d.name,audio:d.audio,youtube:d.youtube,ok:false};if(eng.playing)eng.pause();castLoad(cur,eng.time);clearInterval(castPoll);castPoll=setInterval(()=>{if(castTo&&castTo.mode==='playing')sniplitAndroid.castPosition(castTo.id)},2000);renderCastBar()}
function stopCasting(){if(!castTo)return;try{sniplitAndroid.castControl(castTo.id,'stop',0)}catch(e){}clearInterval(castPoll);castTo=null;renderCastBar()}
async function castLoad(t,at=0){if(!castTo||!t)return;const yt=t.src==='youtube'?t.ytId:(curSrc&&curSrc.yt?curSrc.yt.id:t.useYT||(t.ytCands&&t.ytCands[0]));
  if(castTo.youtube&&yt&&(!castTo.audio||curSrc&&curSrc.yt)){sniplitAndroid.castYouTube(castTo.id,yt,at||0);castTo.mode='youtube';renderCastBar();return}
  if(castTo.audio){let url=null,mime='audio/mpeg';if(t.src==='audius')url=await SSrc.Audius.streamUrl(t.auId).catch(()=>null);else if(t.src==='archive'||t.src==='podcast'||t.src==='radio')url=t.stream;if(!url)url=await freshPreview(t).catch(()=>t.preview);if(url&&/\.m4a|itunes|mzstatic|aac/i.test(url))mime='audio/mp4';
    if(url){sniplitAndroid.castPlay(castTo.id,url,t.title||'',t.artist||'',t.art&&!String(t.art).startsWith('data:')?t.art:'',mime);castTo.d=(t.durationMs||30000)/1000;return}}
  note('This song can’t be sent to that TV — it plays on your phone instead');stopCasting();loadCurrent(true)}
function renderCastBar(){let b=$('#castbar');if(!castTo){b&&b.remove();return}if(!b){b=document.createElement('div');b.id='castbar';document.body.appendChild(b)}
  b.innerHTML=`${I('tv')}<div class="grow"><b class="ell">${castTo.ok?'Playing on':'Connecting to'} ${esc(castTo.name)}</b><small class="ell">${cur?esc(cur.title)+' · '+esc(cur.artist):''}${castTo.mode==='youtube'?' · in YouTube on the TV':''}</small></div>${castTo.mode!=='youtube'?`<button class="icon-btn" data-cast="toggle" aria-label="Play or pause on the TV">${I(castTo.playing===false?'play':'pause')}</button>`:''}<button class="icon-btn" data-cast="next" aria-label="Next on the TV">${I('next')}</button><button class="icon-btn" data-cast="stop" aria-label="Stop casting">${I('close')}</button>`;
  b.onclick=e=>{const k=e.target.closest('[data-cast]');if(!k)return;const a=k.dataset.cast;if(a==='stop')stopCasting();if(a==='next')next();if(a==='toggle'){const p=castTo.playing!==false;sniplitAndroid.castControl(castTo.id,p?'pause':'play',0);castTo.playing=!p;renderCastBar()}}}

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
function editorSheet(){if(!cur)return;setTimeout(()=>studioOpen=true,0);const f=eng.fx;const cap=eng.kind==='yt'?'yt':eng.fxCapable?'ok':'no';if(cap==='yt')edTab='speed';
  const s=openSheet(`${sheetH('Studio')}${cap!=='ok'?`<p class="hint">${cap==='yt'?'Full songs play through YouTube’s player, which only allows speed. For pitch, bass, reverb and the rest, play a version sniplit can process.'+(cur.preview?' <button class="pill sm ghost" data-usepreview style="margin-top:8px">Edit the 30-second preview instead</button>':''):'Download this song to unlock pitch, EQ, bass and vocal tools.'}</p>`:''}
  <div class="seg" id="edt" ${cap==='yt'?'hidden':''}>${[['speed','Speed'],['pitch','Pitch'],['eq','EQ'],['bass','Bass'],['vocals','Vocals'],['fx','Space'],['presets','Presets']].map(([k,l])=>`<button data-ed="${k}" class="${edTab===k?'on':''}">${l}</button>`).join('')}</div>
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
  ${F.map(([k,l,d,lock],i)=>`<div class="opt" role="button" tabindex="0" data-fmt="${k}"><span class="radio ${i===0?'on':''}"></span><div class="grow">${l}${lock?' <span class="badge">Premium</span>':''}<small>${d}</small></div></div>`).join('')}
  <div class="opt" role="button" tabindex="0" data-fmt="meta"><span class="radio"></span><div class="grow">Lyrics & artwork<small>Synced .lrc, cover art and tags</small></div></div>
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
  async verify(t,from){if(adLock||Date.now()-(window.__adEnd||0)<4000)return;if(!this.precise()||this.busy||!this.data||!this.data.synced||this.align&&this.align.method==='you')return;this.busy=true;
    try{const buf=await eng.decode();if(!buf||this.track!==t)return;const words=await SLyrics.transcribe(buf,Math.max(0,from));if(this.track!==t||words.length<4)return;
      // which candidate actually matches what's sung? switch if another source fits clearly better
      const cs=this.data.candidates||[];if(cs.length>1&&window.SSrc){const rr=SSrc.Lyr2.rank(cs,t,words.map(w=>w.w).join(' '));const top=rr[0],now=rr.find(c=>c.src===(this.data.pick&&this.data.pick.src)&&c.title===(this.data.pick&&this.data.pick.title));
        if(top&&top.heardFit>.25&&(!now||top.heardFit-(now.heardFit||0)>.2)&&top!==now){const nd=SLyrics.fromCandidate(top,t);if(nd.synced){this.data={...this.data,...nd}}}}
      const r=await SLyrics.transcriptAlign(buf,this.data.lines,{windowStart:Math.max(0,from),words});if(this.track!==t||!r)return;
      // estimated (un-timed) lyrics: pin every line that was heard, re-spread the rest between them
      if(this.data.estimated&&Object.keys(r.hits||{}).length>=2){const hits={};for(const[i,h]of Object.entries(r.hits))hits[i]={t:h.t+this.offset};this.data={...this.data,lines:SLyrics.anchorLines(this.data.lines,hits,eng.duration||(t.durationMs||0)/1000),anchored:true};this.align={verified:true,method:'transcript',confidence:.7};this.render();return}
      if(!r.verified)return;
      if(this.align&&this.align.method==='you')return;const moved=Math.abs(r.offset-this.offset)>.2;this.offset=Math.max(0,r.offset);this.snaps=r.snaps||{};this.align={verified:true,method:'transcript',confidence:Math.min(1,.6+r.matched*.08)};if(moved||this.el)this.render()}catch(e){}finally{this.busy=false}},
  async load(t){this.track=t;this.data=null;this.align=null;this.snaps={};this.status='loading';this.render();
    let d=curSrc&&curSrc.lyrics&&curSrc.lyrics.lines&&curSrc.lyrics.lines.length?curSrc.lyrics:(t.src==='radio'||(t.src==='youtube'&&!t.useYT&&!t.preview))?null:await SLyrics.fetchLyrics(t).catch(()=>null);if(this.track!==t)return;
    if(!d&&t.src!=='radio'&&this.precise()){this.status='transcribing';this.render();d=await this.transcribed(t);if(this.track!==t)return}
    if(d&&!d.synced&&!d.instrumental&&!d.transcribed&&d.lines.length&&(eng.kind==='yt'||(curSrc&&(curSrc.full||curSrc.kind==='local')))){const dur=(t.durationMs||0)/1000||eng.duration;const est=SLyrics.estimateLines(d.lines,dur);if(est)d={...d,synced:true,estimated:true,lines:est}}
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
  /* long breaks between sung lines (intro, solos, beat switches) get a row of gently bouncing notes, so the screen never sits empty */
  gaps(L,vis){const g={};const end=i=>{const l=L[i];const w=l.words&&l.words.length?l.words[l.words.length-1]:null;if(w&&w.e)return w.e;const n=String(l.text||'').split(/\s+/).length;return l.t+Math.min(6,n*.34+1.2)};
    const ok=i=>L[i]&&!L[i].instr&&(!vis||vis.has(i));const first=L.findIndex((l,i)=>ok(i));if(first>=0&&L[first].t>=6&&!(first>0&&L[first-1].instr))g[-1]=[0,L[first].t];
    for(let i=0;i<L.length-1;i++){if(!ok(i)||L[i+1].instr)continue;const e=end(i),n=L[i+1].t;if(n-e>=5)g[i]=[e,n]}return g},
  /* uncommon words get a one-line meaning just above them, found ahead of time so it's there when the line is sung */
  async wordInfo(w){const m=this.wd||(this.wd=SData.LS.get('wdef2',{}));if(w in m)return m[w];if(netTier()<1)return null;
    try{const r=await fetch('https://api.datamuse.com/words?sp='+encodeURIComponent(w)+'&md=fdp&max=1');const j=await r.json();const x=j&&j[0];let v=0;
      if(x&&x.word===w){const f=+((x.tags||[]).find(t=>/^f:/.test(t))||'f:99').slice(2);
        // only real, specific meanings: no "plural of…", no slang/informal senses, nothing that just repeats the word, and only nouns, verbs, adjectives or adverbs
        const defs=(x.defs||[]).map(d=>{const[pos,txt]=d.split('\t');return{pos,txt:(txt||'').replace(/^\(.*?\)\s*/,'').trim()}}).filter(d=>/^(n|v|adj|adv)$/.test(d.pos)&&d.txt.length>=12&&d.txt.length<=110&&!/^(plural|past|present|third person|alternative|variant|obsolete|archaic|informal|slang|vulgar|offensive)\b/i.test(d.txt)&&!new RegExp('\\b'+w+'\\b','i').test(d.txt)&&!(window.SClean&&SClean.has(d.txt)));
        defs.sort((a,b)=>(a.pos==='n'?0:a.pos==='adj'?1:2)-(b.pos==='n'?0:b.pos==='adj'?1:2)||a.txt.length-b.txt.length);
        if(f<1.6&&defs.length)v={f,d:defs[0].txt,pos:defs[0].pos}}
      m[w]=v;const ks=Object.keys(m);if(ks.length>3000)delete m[ks[0]];clearTimeout(this.wdT);this.wdT=setTimeout(()=>SData.LS.set('wdef2',m),2000);return v}catch(e){return null}},
  cands(i){const l=this.data&&this.data.lines[i];if(!l||l.instr)return[];const txt=l.words&&l.words.length?l.words.map(w=>w.w).join(' '):l.text||'';const skip=new Set(String((this.track&&(this.track.title+' '+this.track.artist))||'').toLowerCase().split(/[^a-z']+/));
    const toks=String(txt).split(/\s+/);return[...new Set(toks.map((raw,k)=>{const w=raw.toLowerCase().replace(/^[^a-z]+|[^a-z']+$/g,'').replace(/'s$/,'');
      // names and places (capitalised mid-line), contractions and dropped-g slang, swearing, and words from the song's own title are left alone
      if(k>0&&/^[A-Z][a-z]/.test(raw.replace(/^[^A-Za-z]+/,''))&&!/^I$/.test(raw))return'';if(/'/.test(w)||/in$/.test(w)&&!/(ain|tion|sion)$/.test(w)&&w.length<7)return'';
      return w.length>=5&&!/\*/.test(raw)&&!skip.has(w)&&!(window.SClean&&SClean.bad(w))&&!/^(somebody|nothing|something|everything|anything|everybody|without|another|forever|tonight|myself|yourself|really|always|around|through|thinking|feeling|money|gonna|wanna|gotta|baby|never|maybe|people|little|better|nobody|already|alright)$/.test(w)?w:''}).filter(Boolean))].slice(0,6)},
  /* lines in another language get their English meaning in the same quiet bubble */
  foreign(t){t=String(t||'');if(t.length<4)return false;if(/[\u0400-\u04FF\u0590-\u06FF\u0900-\u097F\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/.test(t))return true;
    const ws=t.toLowerCase().normalize('NFC').split(/[^a-zà-ÿœæß']+/).filter(Boolean);if(ws.length<3)return false;const EN=/^(the|and|you|i|me|my|is|it|to|a|of|in|on|that|we|for|with|your|be|i'm|don't|just|all|so|but|like|know|got|get|what|this|love|no|yeah|oh|when|can|up|now)$/;
    const OT=/^(el|la|los|las|que|de|y|en|mi|tu|te|yo|no|lo|se|por|para|con|una|un|es|está|como|pero|más|quiero|amor|corazón|eu|você|não|meu|minha|tudo|o|je|tu|il|elle|nous|vous|les|des|est|pas|mon|ma|toi|moi|ich|du|und|nicht|ein|eine|der|die|das|ist|mit|mein|dich|mich|io|che|il|non|sono|mio|mia|ti|amo|cuore|perché)$/;
    let en=0,ot=0;for(const w of ws){if(EN.test(w))en++;if(OT.test(w))ot++}const acc=/[ñ¿¡çßãõœâêîôûäöü]/.test(t);return ot>=2&&ot>en||(acc&&ot>=1&&ot>=en)},
  async translate(t){const m=this.tr||(this.tr=SData.LS.get('ltr',{}));const k=t.slice(0,200);if(k in m)return m[k];if(netTier()<1)return null;let v=0;
    try{const r=await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q='+encodeURIComponent(k));const j=await r.json();const out=(j[0]||[]).map(x=>x[0]).join('').trim(),lang=j[2]||'';
      if(out&&lang&&lang!=='en'&&out.toLowerCase()!==k.toLowerCase())v={t:out,lang}}catch(e){
      try{const r=await fetch('https://api.mymemory.translated.net/get?langpair=Autodetect|en&q='+encodeURIComponent(k));const j=await r.json();const out=j&&j.responseData&&j.responseData.translatedText;if(out&&out.toLowerCase()!==k.toLowerCase()&&!/INVALID|MYMEMORY/i.test(out))v={t:out,lang:''}}catch(x){return null}}
    m[k]=v;const ks=Object.keys(m);if(ks.length>2000)delete m[ks[0]];clearTimeout(this.trT);this.trT=setTimeout(()=>SData.LS.set('ltr',m),2000);return v},
  lineText(i){const l=this.data&&this.data.lines[i];return l?(l.words&&l.words.length?l.words.map(w=>w.w).join(' '):l.text||''):''},
  async define(a){if(a<0)return;$$('#lyin .ly-def').forEach(x=>x.remove());$$('#lyin .rare').forEach(x=>x.classList.remove('rare'));
    if(this.shownFor!==(this.track&&this.track.id)){this.shownFor=this.track&&this.track.id;this.shown=new Set()}
    const trOn=Store.settings.lyricTranslate!==false,dfOn=Store.settings.lyricDefs!==false;
    for(const j of[a+1,a+2]){if(trOn&&this.foreign(this.lineText(j)))this.translate(this.lineText(j));else if(dfOn)this.cands(j).forEach(w=>this.wordInfo(w))}
    const le0=()=>$(`#lyin [data-li="${a}"]`);const txt=this.lineText(a);
    if(trOn&&this.foreign(txt)){const tr=await this.translate(txt);if(!tr||this.active!==a)return;const le=le0();if(!le)return;let name='';try{name=tr.lang?new Intl.DisplayNames(['en'],{type:'language'}).of(tr.lang):''}catch(e){}
      const b=document.createElement('span');b.className='ly-def tr';b.innerHTML=`<b>${esc(name||'Translated')}</b> ${esc(window.SClean?SClean.clean(tr.t):tr.t)}`;le.appendChild(b);b.style.left='0px';requestAnimationFrame(()=>b.classList.add('in'));return}
    if(!dfOn)return;const ws=this.cands(a).filter(w=>!this.shown.has(w));if(!ws.length)return;const info=(await Promise.all(ws.map(w=>this.wordInfo(w).then(v=>v&&{w,...v})))).filter(Boolean).sort((x,y)=>x.f-y.f)[0];
    if(!info||this.active!==a)return;const le=le0();if(!le)return;this.shown.add(info.w);
    if(!$('.w',le)){le.innerHTML=String(le.textContent).split(/(\s+)/).map(p=>/\s/.test(p)?p:`<span class="w">${esc(p)}</span>`).join('')}
    const span=$$('.w',le).find(x=>x.textContent.toLowerCase().replace(/[^a-z'\-]/g,'').replace(/'s$/,'')===info.w);if(!span)return;span.classList.add('rare');
    const b=document.createElement('span');b.className='ly-def';b.innerHTML=`<b>${esc(info.w)}</b><i>${info.pos==='n'?'noun':info.pos==='v'?'verb':info.pos==='adj'?'adjective':'adverb'}</i> ${esc(info.d)}`;le.appendChild(b);
    const lr=le.getBoundingClientRect(),sr=span.getBoundingClientRect();const room=Math.min(lr.width,(le.closest('#ly')||le).getBoundingClientRect().right-lr.left-12);const x=Math.max(0,Math.min(room-b.offsetWidth,sr.left-lr.left+sr.width/2-b.offsetWidth/2));b.style.left=x+'px';requestAnimationFrame(()=>b.classList.add('in'))},
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
    const a=this.align||{};const conf=d.estimated&&!d.anchored?'Following along':d.transcribed?'Transcribed':a.method==='you'?'Synced by you':a.method==='transcript'?'Synced · checked by ear':vis&&!a.verified?'Approximate':a.verified?'Synced':a.method==='aligning'?'Syncing…':d.synced?'Auto-synced':'Lyrics';
    const gaps=d.synced?this.gaps(d.lines,vis):{};const note=g=>`<div class="ly-gap" data-g0="${g[0].toFixed(2)}" data-g1="${g[1].toFixed(2)}" aria-hidden="true"><i>♪</i><i>♫</i><i>♪</i></div>`;
    p.innerHTML=`<span class="sync-badge">${conf}</span><div class="ly" id="ly"><div class="ly-in" id="lyin" style="font-size:${Store.settings.lyricSize||1}em">${gaps[-1]?note(gaps[-1]):''}${d.lines.map((l,i)=>vis&&!vis.has(i)?'':`<div class="ly-l ${l.instr?'instr':''}" data-li="${i}">${l.instr?'<i>♪</i> <i>♫</i> <i>♪</i>':l.words&&l.words.length?l.words.map(w=>`<span class="w">${esc(w.w)}</span>`).join(' '):esc(l.text)}</div>${gaps[i]?note(gaps[i]):''}`).join('')}</div></div>
    <div class="ly-tools"><button class="tag btn" data-lys="-" aria-label="Smaller">A−</button><button class="tag btn" data-lys="+" aria-label="Larger">A+</button></div>`;
    this.active=-1;this.y=this.ty=0;this.bind();this.tick(true)},
  bind(){const ly=$('#ly');if(!ly)return;let sy=null,base=0;const user=()=>{this.userUntil=performance.now()+2600};const lim=()=>{const inn=$('#lyin');const max=ly.clientHeight*.35,min=-(inn.scrollHeight-ly.clientHeight*.45);this.ty=Math.max(min,Math.min(max,this.ty));this.y=this.ty};
    ly.addEventListener('wheel',e=>{e.preventDefault();user();this.ty-=e.deltaY;lim();this.apply()},{passive:false});
    ly.addEventListener('pointerdown',e=>{e.stopPropagation();sy=e.clientY;base=this.ty;this.moved=false});ly.addEventListener('pointermove',e=>{if(sy==null)return;const dy=e.clientY-sy;if(Math.abs(dy)>6){this.moved=true;user();this.ty=base+dy;lim();this.apply()}});
    const end=()=>{sy=null};ly.addEventListener('pointerup',end);ly.addEventListener('pointercancel',end);ly.addEventListener('pointerleave',end);
    ly.addEventListener('click',e=>{if(this.moved)return;const l=e.target.closest('[data-li]');if(!l)return;const line=this.data.lines[+l.dataset.li];
      const t=this.lt(+l.dataset.li)-this.offset;if(t<0||(eng.duration&&t>eng.duration)){l.classList.add('nope');setTimeout(()=>l.classList.remove('nope'),500);return}eng.seek(t);this.userUntil=0})},
  setOffset(o,method){this.offset=eng.kind==='yt'?o:Math.max(0,o);this.snaps={};this.align={verified:true,method,confidence:1};Store.offsets[this.track.id]={o:this.offset,at:Date.now()};Store.save('offsets');this.render()},
  tick(force){const d=this.data;if(d&&d.synced&&eng.playing&&eng.blob&&curSrc&&(curSrc.full||curSrc.kind==='local')&&performance.now()>this.nextCheck){this.nextCheck=performance.now()+30000;this.verify(this.track,eng.time+.5)}
    if(!d||!d.synced||!this.el||!$('#lyin'))return;const t=eng.time+this.offset+.08;let a=-1;for(let i=0;i<d.lines.length;i++){if(this.lt(i)<=t)a=i;else break}
    if(a!==this.active||force){this.active=a;if(Store.settings.lyricDefs!==false||Store.settings.lyricTranslate!==false)this.define(a);$$('#lyin .ly-l').forEach(e=>{const i=+e.dataset.li;e.classList.toggle('on',i===a);e.classList.toggle('past',i<a);e.classList.toggle('out',i<a-3)});const el=$(`#lyin [data-li="${Math.max(0,a)}"]`)||$('#lyin .ly-l');if(el&&performance.now()>this.userUntil){const ly=$('#ly');this.ty=-(el.offsetTop-ly.clientHeight*.32)}}
    // inside a long break: the notes take focus and fill in time with the music
    let gin=null;for(const g of $$('#lyin .ly-gap')){const g0=+g.dataset.g0,g1=+g.dataset.g1;const on=t>=g0&&t<g1;if(on){gin=g;g.style.setProperty('--gp',((t-g0)/(g1-g0)*100).toFixed(1)+'%')}if(g.classList.contains('on')!==on)g.classList.toggle('on',on)}
    if(gin!==this.gapEl){this.gapEl=gin;if(gin){$$('#lyin .ly-l.on').forEach(e=>e.classList.remove('on'));if(performance.now()>this.userUntil){const ly=$('#ly');this.ty=-(gin.offsetTop-ly.clientHeight*.32)}}else if(a>=0){const el=$(`#lyin [data-li="${a}"]`);if(el){el.classList.add('on');if(performance.now()>this.userUntil){const ly=$('#ly');this.ty=-(el.offsetTop-ly.clientHeight*.32)}}}}
    const le=a>=0&&!gin&&$(`#lyin [data-li="${a}"]`);if(le){const ws=d.lines[a].words||[];const sn=this.snaps[a]||0;$$('.w',le).forEach((w,i)=>{const x=ws[i];if(!x)return;const xt=x.t+sn,xe=x.e+sn;const p=t<=xt?0:t>=xe?100:(t-xt)/(xe-xt)*100;w.style.setProperty('--p',p+'%')})}
    if(!this.raf)this.loop()},
  loop(){const step=()=>{if(!$('#lyin')){this.raf=0;return}if(performance.now()>this.userUntil){if(this.wasUser){this.wasUser=false;this.tick(true)}this.y+=(this.ty-this.y)*.12}else this.wasUser=true;this.apply();if(eng.playing)this.tick();this.raf=requestAnimationFrame(step)};this.raf=requestAnimationFrame(step)},
  apply(){const e=$('#lyin');if(e)e.style.transform=`translate3d(0,${this.y}px,0)`}};
document.addEventListener('click',e=>{if(e.target.closest('[data-lyretry]')&&cur){Lyr.load(cur);return}const o=e.target.closest('[data-off]');if(o)Lyr.setOffset(Lyr.offset-(+o.dataset.off),'you');
  const ts=e.target.closest('[data-tapsync]');if(ts){Lyr.tapMode=true;ts.textContent='Now tap the line you hear';ts.classList.add('on')}
  const z=e.target.closest('[data-lys]');if(z){Store.settings.lyricSize=Math.max(.7,Math.min(1.6,(Store.settings.lyricSize||1)+(z.dataset.lys==='+'?.1:-.1)));Store.save('settings');Lyr.render()}});

/* ---------- visualizer (tap the artwork) ---------- */
const viz={on:false,async toggle(){if(!eng.blob){const a=$('#npart');a&&a.classList.add('nudge');setTimeout(()=>a&&a.classList.remove('nudge'),400);return}this.on=!this.on;this.on?this.start():this.stop()},
  async start(){const c=$('#npart .viz');if(!c||!eng.blob)return;const was=eng.playing,t0=eng.time;
    try{eng.forceGraph=true;await eng.route(true);if(eng.ctx&&eng.ctx.state!=='running')await eng.ctx.resume().catch(()=>{});if(was&&!eng.playing)await eng.play()}catch(e){}
    $('#npart')?.classList.add('viz-on');this.c=c;
    // the visualizer must never cost the music: if sound isn't moving through it a moment later, go back to plain playback
    if(was)setTimeout(async()=>{const stuck=!eng.playing||eng.time<=t0+.3||(eng.ctx&&eng.ctx.state!=='running');if(stuck&&this.on){this.on=false;$('#npart')?.classList.remove('viz-on');eng.forceGraph=false;try{await eng.route(true)}catch(e){}if(!eng.playing)eng.play()}},1600)},
  stop(){$('#npart')?.classList.remove('viz-on');if(eng.forceGraph){eng.forceGraph=false;eng.route(true)}},
  tick(){if(!this.on||!this.c||!this.c.isConnected||!eng.analyser)return;const c=this.c,an=eng.analyser,x=c.getContext('2d');const W=c.width=c.clientWidth*devicePixelRatio,H=c.height=c.clientHeight*devicePixelRatio;const fd=new Uint8Array(an.frequencyBinCount);an.getByteFrequencyData(fd);
    x.clearRect(0,0,W,H);const cx=W/2,cy=H/2,R=Math.min(W,H)*.2;x.lineWidth=2*devicePixelRatio;x.strokeStyle='rgba(255,255,255,.9)';x.beginPath();for(let i=0;i<=200;i++){const v=fd[Math.floor(i/200*fd.length*.55)]/255,a=i/200*Math.PI*2-Math.PI/2,r=R+v*R*1.2;x.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r)}x.closePath();x.stroke();
    const n=64;x.fillStyle='rgba(255,255,255,.55)';for(let i=0;i<n;i++){const v=fd[Math.floor(Math.pow(i/n,1.6)*fd.length*.6)]/255;const h=v*H*.22;x.fillRect(i*W/n+1,H-h,W/n-2,h)}}};
setInterval(()=>viz.tick(),33);

/* ---------- mixes & recommendations ---------- */
/* the vault digs well past the charts: every album track, guest features, rarities by name, and uploads of
   unreleased songs, snippets and demos found on YouTube and Audius (played through their own players) */
const VAULT=new Map();
async function deepVault(name,id,d,pop,vv){const k=artistKey(name);if(VAULT.has(k))return VAULT.get(k);
  const popK=new Set(pop.slice(0,15).map(t=>baseTitle(t.title).toLowerCase()));const key=t=>baseTitle(t.title).toLowerCase().replace(/[^a-z0-9]/g,'');
  const RARE=/\b(unreleased|snippet|demo|rare|leak(ed)?|og version|early version|alternate|alt version|v1|v2|cdq|hq|throwaway|scrapped|lost|old song|soundcloud)\b/i;
  const[cat,yts,au,feats]=await Promise.all([API.catalog(name,id).catch(()=>[]),
    Promise.all([`${name} unreleased`,`${name} unreleased songs`,`${name} snippet`,`${name} rare songs`,`${name} demo`,`${name} soundcloud`].map(q=>YT.search(q,{max:25}).catch(()=>[]))).then(x=>x.flat()),
    SSrc.Audius.search(name).catch(()=>[]),API.search(name,{limit:120}).catch(()=>[])]);
  const catK=new Set(cat.map(key));const seen=new Set();const uniq=t=>{const kk=key(t);if(!kk||seen.has(kk))return false;seen.add(kk);return true};
  // uploads: the artist's name must be in the title or channel, and either a rarity word or a song the catalog doesn't have
  const nm=k.split(' ')[0];const unreleased=yts.filter(t=>{const blob=(t.title+' '+t.artist).toLowerCase();return blob.includes(nm)&&(RARE.test(t.title)||!catK.has(key(t)))&&!/\b(reaction|reacts?|review|interview|podcast|explained|tutorial|type beat|karaoke|cover|lyrics? video|full album)\b/i.test(t.title)&&(t.durationMs||0)>45e3&&(t.durationMs||0)<9e5})
    .concat(au.filter(t=>artistKey(t.artist).includes(nm)&&!catK.has(key(t)))).filter(uniq);
  const deep=groupVersions(cat).filter(t=>!popK.has(baseTitle(t.title).toLowerCase())&&!RARE.test(t.title)&&!/\blive\b/i.test(t.title)).filter(uniq);
  const rare=[...vv.rare,...cat.filter(t=>RARE.test(t.title+' '+(t.album||'')))].filter(uniq);
  const fe=feats.filter(t=>!artistKey(t.artist).startsWith(nm)&&(t.title+' '+t.artist).toLowerCase().includes(nm)).filter(uniq);
  const live=vv.live.filter(uniq);const v={unreleased:unreleased.slice(0,80),deep:deep.slice(0,120),rare,feats:fe.slice(0,60),live};v.total=v.unreleased.length+v.deep.length+v.rare.length+v.feats.length+v.live.length;VAULT.set(k,v);return v}
/* ---------- Guess the song: 8 rounds, 6-second clips from music you'd know, 4 choices ---------- */
async function guessGame(){const wasPlaying=eng.playing;if(wasPlaying)eng.pause();const s=openSheet(`${sheetH('Guess the song')}<div class="spin-c"><div class="spinner"></div><p class="mut small">Picking songs you should know…</p></div>`);
  const prof=profile();const pools=await Promise.all([...prof.artists.slice(0,6).map(a=>API.popular(a.name).catch(()=>[])),...(prof.genres.length?prof.genres.slice(0,2):['Pop','Hip-Hop/Rap']).map(g=>API.genreTop(g,40).catch(()=>[]))]);
  const all=groupVersions(pools.flat()).filter(t=>t.preview&&t.title);const uniq=[...new Map(all.map(t=>[baseTitle(t.title).toLowerCase(),t])).values()];
  if(uniq.length<8){s.innerHTML=sheetH('Guess the song')+emptyState('Not enough songs yet','Play a little more music and come back — or check your connection.','music');return}
  const rounds=shuffleMix(uniq).slice(0,8);const au=new Audio();au.preload='auto';let r=0,score=0,streak=0,best=SData.LS.get('guessBest',0),timer=null,gone=false;
  // leaving the game early (closing the sheet, swiping it away, Back) stops its music and its clock for good
  sheetBye=()=>{gone=true;clearInterval(timer);au.pause();au.removeAttribute('src');au.load()};
  const end=()=>{au.pause();clearInterval(timer);if(score>best){best=score;SData.LS.set('guessBest',best)}
    s.innerHTML=`${sheetH('Guess the song')}<div class="gg-end"><b>${score}</b><span>points</span><p class="mut">${score>=best&&score>0?'New best!':'Best: '+best}</p><div class="row" style="gap:8px;justify-content:center"><button class="pill" id="ggagain">Play again</button><button class="pill ghost" id="ggq">Play these songs</button></div></div>`;
    $('#ggagain').onclick=()=>guessGame();$('#ggq').onclick=()=>{closeSheet();playList(rounds,0,'Guess the song');openNP()}};
  const round=()=>{if(gone)return;if(r>=rounds.length)return end();const t=rounds[r];const wrong=shuffleMix(uniq.filter(x=>x!==t&&baseTitle(x.title).toLowerCase()!==baseTitle(t.title).toLowerCase())).slice(0,3);const opts=shuffleMix([t,...wrong]);
    s.innerHTML=`${sheetH('Guess the song')}<div class="gg"><div class="gg-top"><span>Round ${r+1} / ${rounds.length}</span><span>${score} pts${streak>1?` · 🔥 ${streak}`:''}</span></div><div class="gg-bar"><i id="ggt"></i></div>
      <div class="gg-wave">${'<i></i>'.repeat(14)}</div><div class="gg-opts">${opts.map((o,i)=>`<button class="gg-o" data-o="${i}"><b class="ell">${esc(o.title)}</b><small class="ell">${esc(o.artist)}</small></button>`).join('')}</div></div>`;
    au.src=t.preview;au.currentTime=0;const st=()=>{try{au.currentTime=Math.min(12,Math.max(0,(au.duration||30)*.3))}catch(e){}au.play().catch(()=>{})};au.readyState>=1?st():au.onloadedmetadata=st;
    const T=8000,t0=performance.now();clearInterval(timer);timer=setInterval(()=>{const p=(performance.now()-t0)/T;const b=$('#ggt');if(b)b.style.width=Math.max(0,100-p*100)+'%';if(p>=1){clearInterval(timer);pick(-1)}},60);
    let done=false;const pick=i=>{if(done)return;done=true;clearInterval(timer);const ok=i>=0&&opts[i]===t;const left=Math.max(0,T-(performance.now()-t0));
      if(ok){streak++;score+=100+Math.round(left/80)+(streak>1?streak*20:0)}else streak=0;
      $$('.gg-o',s).forEach((b,k)=>{b.disabled=true;if(opts[k]===t)b.classList.add('right');else if(k===i)b.classList.add('wrong')});setTimeout(()=>{r++;round()},1300)};
    $$('.gg-o',s).forEach(b=>b.onclick=()=>pick(+b.dataset.o))};
  round();const obs=new MutationObserver(()=>{if(!$('#sheet.on')){au.pause();clearInterval(timer);obs.disconnect()}});obs.observe($('#sheet'),{attributes:true,attributeFilter:['class']})}
const playCards=()=>`<section class="sec play-cards"><button class="play-card" data-game="guess"><span class="pc-ic">${I('music')}</span><div><b>Guess the song</b><small>8 quick rounds from music you love${SData.LS.get('guessBest',0)?` · best ${SData.LS.get('guessBest',0)}`:''}</small></div>${I('chevRight')}</button><button class="play-card" data-game="roulette"><span class="pc-ic">${I('shuffle')}</span><div><b>Song roulette</b><small>One tap, one song you’ve never heard</small></div>${I('chevRight')}</button><a class="play-card" href="#wrapped"><span class="pc-ic">${I('spark')}</span><div><b>Your Wrapped</b><small>Your habits, streaks and discoveries — any day</small></div>${I('chevRight')}</a></section>`;
function blockArtist(name,genre){const k=artistKey(name);const b=blkList().filter(x=>x.k!==k);b.push({k,name,genre:genre||'',at:Date.now()});SData.LS.set('blocked',b);
  // nothing by them stays queued after what's playing now
  const keep=Q.list.slice(0,Q.i+1),rest=Q.list.slice(Q.i+1).filter(t=>!isBlk(t));Q.list=[...keep,...rest];saveQueue();VC.clear();if(curKey)curDone=false;route()}
function unblockArtist(k){SData.LS.set('blocked',blkList().filter(x=>x.k!==k));VC.clear()}
/* any artist name → their page. Tries the exact catalog artist, then the artist behind their songs, so a name never dead-ends in search */
const ARID=new Map();
async function artistIdFor(name){if(!name)return null;const k=artistKey(name);if(ARID.has(k))return ARID.get(k);const mem=SData.LS.get('arid',{});if(mem[k]){ARID.set(k,mem[k]);return mem[k]}
  let id=null;try{const as=await API.search(name,{entity:'musicArtist',limit:8});const m=as.find(a=>artistKey(a.name)===k)||as.find(a=>artistKey(a.name).startsWith(k)||k.startsWith(artistKey(a.name)));if(m)id=m.artistId}catch(e){}
  if(!id)try{const ss=await API.search(name,{limit:15});const m=ss.find(t=>t.artistId&&artistKey(String(t.artist).split(/,|&| feat/i)[0])===k);if(m)id=m.artistId}catch(e){}
  if(id){ARID.set(k,id);mem[k]=id;const ks=Object.keys(mem);if(ks.length>800)delete mem[ks[0]];SData.LS.set('arid',mem)}return id}
async function openArtist(name,id){if(id&&/^\d+$/.test(String(id)))return go('artist-'+id);go('artist-n~'+encodeURIComponent(name||'').replace(/-/g,'%2D'))}
async function openMix(m,el){el&&el.classList.add('busy');let list=[];try{list=await m.build()}catch(e){}el&&el.classList.remove('busy');if(!list.length){el&&el.classList.add('nope');return}playList(list,0,m.title);openNP();if(m.more)fillMix(m.title,m.more)}
/* Made-for-you mixes start fast with a first handful, then keep filling in the background to about four hours */
const MIX_TARGET=4*3600e3;const mixDur=l=>l.reduce((a,t)=>a+(t.durationMs||210000),0);
async function fillMix(title,sources){const key=t=>artistKey(t.artist)+'|'+baseTitle(t.title).toLowerCase();let i=0,idle=0;
  while(Q.ctx===title&&mixDur(Q.list)<MIX_TARGET&&idle<sources.length*2){const src=sources[i++%sources.length];let add=await src().catch(()=>[]);if(Q.ctx!==title)return;
    const have=new Set(Q.list.map(key));add=(add||[]).filter(t=>t&&!t.live&&t.kind!=='artistq'&&!have.has(key(t)));add=diversify(add.filter((t,k,a)=>a.findIndex(x=>key(x)===key(t))===k));
    if(add.length){idle=0;Q.list.push(...add);saveQueue();if($('#np.on'))renderNP()}else idle++;await sleep(300)}}
/* a long mix around one artist: their hits, album cuts, collaborators, then the artists around them */
function artistMixSources(a){const prof=profile();const seen=new Set(prof.seen);const fr=t=>!seen.has(t.id);let near=null;const nearP=()=>near||(near=nearArtists(a.name,prof.artists.slice(0,20).map(x=>artistKey(x.name))).catch(()=>[]));let k=0;
  return[()=>deepFrom(a.name,a.id,14,()=>true),async()=>{const dz=await SSrc.Deezer.artist(a.name).catch(()=>null);return dz?hookRank(groupVersions(await SSrc.Deezer.radio(dz.id)),prof).slice(0,25):[]},
    async()=>{const n=(await nearP()).slice(k,k+=4);return(await Promise.all(n.map(r=>deepFrom(r.name,null,5,fr).catch(()=>[])))).flat()},
    async()=>{const g=(prof.genres[k%Math.max(1,prof.genres.length)])||'Pop';return hookRank(groupVersions(await API.genreTop(g,60)),prof).filter(fr).slice(0,15)}]}
const mixTile=(title,sub,build)=>{const id='mx:'+title;const t={id,kind:'mix',title,artist:sub,build:async()=>{const l=await build();const a=coverArts(l);if(a.length>=4){const m=SData.LS.get('mixArt',{});m[id]=a;SData.LS.set('mixArt',m)}return l}};TR.set(id,t);return t};
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
SSocial.setProvider(()=>({note:myNote(),pro:Store.premium,taste:(()=>{const pr=profile();return{artists:pr.artists.slice(0,8).map(a=>a.name),genres:pr.genres.slice(0,4)}})(),now:cur?{title:cur.title,artist:cur.artist,art:cur.art,id:cur.id,preview:cur.preview,album:cur.album,artistId:cur.artistId,src:cur.src==='local'?'local':cur.src,playing:eng.playing,at:Date.now()}:null,
  likes:Object.values(Store.likes).filter(t=>t.src!=='local').sort((a,b)=>(b.likedAt||0)-(a.likedAt||0)).slice(0,300).map(t=>({id:t.id,title:t.title,artist:t.artist,album:t.album,art:t.art&&!String(t.art).startsWith('data:')?t.art:'',preview:t.preview,durationMs:t.durationMs,artistId:t.artistId,src:t.src,ytId:t.ytId,dzId:t.dzId,itId:t.itId})),follows:Object.values(Store.follows).map(a=>({id:a.id,name:a.name})),
  story:myDayStory(),year:myYearStory(),playlists:Store.playlists.filter(p=>!p.private).map(p=>({id:p.id,name:p.name,saved:!!(p.from||p.xsrc||p.imported),tracks:p.tracks.filter(t=>t.src!=='local').slice(0,200).map(t=>({id:t.id,title:t.title,artist:t.artist,album:t.album,art:t.art&&!t.art.startsWith('data:')?t.art:'',preview:t.preview,durationMs:t.durationMs,artistId:t.artistId,src:t.src,ytId:t.ytId}))}))}));
SL.on(()=>{renderShell();applyLayout();try{SSocial.update()}catch(e){}if(/^#(premium|preferences)/.test(location.hash)){curDone=false;route()}});
SSocial.on(()=>{$$('#topbar .av').forEach(a=>a.classList.toggle('online',!!SSocial.online));const n=Object.keys(SSocial.me.inReq).length+(SSocial.unreadTotal?SSocial.unreadTotal():0);$$('[data-nav=friends] .dot').forEach(d=>d.remove());if(n)$$('[data-nav=friends]').forEach(b=>b.insertAdjacentHTML('beforeend',`<em class="dot">${Layout.mode==='mobile'?'':n}</em>`));if(location.hash.startsWith('#friends')&&!$('#view input:focus'))V.friends($('#view'),'',routeToken,true)});

/* =============== VIEWS =============== */
let homeMode=SData.LS.get('homeMode','all');
V.home=async(v,_,tok)=>{const prof=profile();const name=SSocial.me.name;
  v.innerHTML=`<header class="home-h"><div><h1>${greet()}${name&&!/^guest_/.test(name)?', '+esc(name.split(' ')[0]):''}</h1></div></header>${storyRing()}
  <div class="frow" id="modes">${filterDD('modedd','filter','Showing',homeMode,[['all','Everything','Your mixes, songs and picks'],['music','Music','Songs and albums only'],['videos','Videos','Music videos and clips'],['podcasts','Podcasts','Shows and episodes'],['radio','Radio','Live stations']])}<span id="subdd"></span></div><div id="hm">${skeleton()}${skeleton()}</div>`;
  const fh=$('[data-hidehint]');if(fh)fh.onclick=()=>{SData.LS.set('fileHint',true);$('#fileHint').remove()};
  wireDD($('#modedd'),k=>{homeMode=k;SData.LS.set('homeMode',homeMode);renderMode()});
  const renderMode=async()=>{const hm=$('#hm');hm.innerHTML=skeleton()+skeleton();const sd=$('#subdd');if(sd)sd.innerHTML='';if(homeMode==='videos')return Sections.videos(hm,tok);if(homeMode==='podcasts')return Sections.podcasts(hm,tok);if(homeMode==='radio')return Sections.radio(hm,tok);return homeMusic(hm,tok,prof)};renderMode()};
async function homeMusic(hm,tok,prof){const parts=[];
  const recent=[];const seen=new Set();for(const h of [...Store.history].reverse()){if(seen.has(h.track.id))continue;seen.add(h.track.id);recent.push(h.track);if(recent.length>=14)break}
  const friendsNow=Object.values(SSocial.me.friends).filter(f=>f.p&&f.p.now&&f.p.active).map(f=>({...f.p.now,id:f.p.now.id||('fn'+f.id),artist:f.name+' · '+f.p.now.artist}));
  if(API.offline||!navigator.onLine){const all=SData.localLibrary().filter(t=>cachedIds.has(t.id)||t.src==='local');const fresh=shuffleMix(unplayedStash());const mine=all.filter(t=>!stashIds.has(t.id));
    const byArtist={};for(const t of all){const k=artistKey(t.artist);(byArtist[k]=byArtist[k]||[]).push(t)}const groups=Object.values(byArtist).filter(g=>g.length>=3).sort((a,b)=>b.length-a.length).slice(0,4);
    hm.innerHTML=`<div class="offline-bar">${I('offline')}<span>You’re offline — ${all.length} songs play without a connection${fresh.length?`, ${fresh.length} you haven’t heard yet`:''}.</span>${all.length?'<button class="pill sm" id="offmix">'+I('shuffle')+' Shuffle all</button>':''}</div>`
      +(fresh.length?shelf('New for you, saved for offline',fresh):'')+shelf('Jump back in',recent.filter(t=>cachedIds.has(t.id)||t.src==='local'))+(mine.length?shelf('Your downloads',shuffleMix(mine)):'')
      +groups.map(g=>shelf(g[0].artist+' · offline',g)).join('')+(all.length?'':emptyState('Nothing saved yet','Download songs or add files from this device to listen offline. When you’re back online, sniplit saves new picks for you automatically.','downloaded'));
    const om=$('#offmix');if(om)om.onclick=()=>{playList(diversify(shuffleMix([...fresh,...shuffleMix(mine)])),0,'Offline mix');openNP()};return}
  if(recent.length>=4)parts.push(shelf('Jump back in',recent));
  if(friendsNow.length)parts.push(shelf('Friends are listening',friendsNow));
  if(!prof.cold){const top=prof.artists.slice(0,4);const mixes=top.map(a=>{const m=mixTile(a.name+' Mix','4 hours · '+a.name+' and around',()=>artistMix(a));m.more=artistMixSources(a);return m});
    {const known=t=>prof.artists.slice(0,8).some(a=>artistKey(a.name)===artistKey(t.artist));const m=mixTile('New for you','4 hours · fresh in '+(prof.genres[0]||'your genres'),async()=>hookRank(groupVersions((await Promise.all(prof.genres.slice(0,3).map(g=>API.genreTop(g,40)))).flat()),prof).filter(t=>!known(t)).slice(0,30));let g=0;
      m.more=[async()=>hookRank(groupVersions(await API.genreTop(prof.genres[g++%Math.max(1,prof.genres.length)]||'Pop',100)),prof).filter(t=>!known(t)).slice(10,40),async()=>{const a=prof.artists[g%Math.max(1,prof.artists.length)];if(!a)return[];const n=(await nearArtists(a.name,prof.artists.map(x=>artistKey(x.name))).catch(()=>[])).slice(0,5);return(await Promise.all(n.map(r=>deepFrom(r.name,null,4,()=>true).catch(()=>[])))).flat()}];mixes.push(m)}
    {const dm=mixTile('Deeper','4 hours · album cuts & rarities',async()=>{const out=[];for(const a of prof.artists.slice(0,4)){if(!a.id)continue;const[d,p]=await Promise.all([API.artist(a.id),API.popular(a.name)]);const vv=vault(d.songs,p);out.push(...vv.gems.slice(0,5),...vv.rare.slice(0,3))}return shuffleMix(out)});let di=0;const prof2=profile();dm.more=[async()=>{const a=prof2.artists[di++%Math.max(1,prof2.artists.length)];if(!a)return[];const cat=await API.catalog(a.name,a.id).catch(()=>[]);const pop=new Set((await API.popular(a.name).catch(()=>[])).slice(0,10).map(t=>baseTitle(t.title).toLowerCase()));return shuffleMix(groupVersions(cat).filter(t=>!pop.has(baseTitle(t.title).toLowerCase()))).slice(0,12)}];mixes.push(dm)}
    parts.push(playCards());
    parts.push(`<section class="sec"><div class="sec-h"><h2>Made for you</h2></div><div class="mixes">${mixes.map((m,mi)=>{const known=[...Object.values(Store.likes),...recent,...Store.history.slice(-200).map(h=>h.track)];const mine=SData.LS.get('mixArt',{})[m.id];const nm=m.title.replace(/ Mix$/,'');const arts=mine&&mine.length>=4?mine:coverArts(m.title.endsWith(' Mix')?known.filter(x=>artistKey(x.artist)===artistKey(nm)).concat(known.filter(x=>artistKey(x.artist)!==artistKey(nm))):known.slice(mi*3));return`<div class="mix" data-play="${esc(m.id)}" tabindex="0">${cover(arts,'mix-art')}<div><b>${esc(m.title)}</b><small>${esc(m.artist)}</small></div></div>`}).join('')}</div></section>`)}
  if(!live(tok))return;
  // every shelf below loads on its own: cached copy shows instantly, the fresh one swaps in when it lands
  const slots=[
    ['now','Right now',async()=>{const ch=await API.charts().catch(()=>[]);const v=groupVersions(ch.length>=10?ch:await viral().catch(()=>[]));return[['Right now',(prof.cold?v:hookRank(v,prof).concat(v.filter(t=>prof.seen.has(t.id)))).slice(0,20)]]}],
    // popular in the genres this listener actually plays through, not just the global chart
    ['pop','Popular',async()=>{const gs=prof.cold?[0]:[...new Set(prof.genres.slice(0,3).map(g=>SSrc.Deezer.genreId(g)))].slice(0,2);const lists=await Promise.all(gs.map(g=>SSrc.Deezer.chart(30,g).catch(()=>[])));
      let mix=[];for(let i=0;i<30;i++)for(const l of lists)if(l[i])mix.push(l[i]);if(mix.length<8)mix=mix.concat(await SSrc.Deezer.chart(30).catch(()=>[]));
      const g=groupVersions(mix).filter((t,i,a)=>a.findIndex(x=>x.id===t.id)===i);return[[prof.cold?'Popular':'Popular with you in mind',(prof.cold?g:hookRank(g,prof).concat(g.filter(t=>prof.seen.has(t.id)))).slice(0,20)]]}],
    ['fresh','Fresh finds',async()=>[['Fresh finds',(await SSrc.Audius.trending()).slice(0,16)]]],
    ['dzpl','Playlists people love',async()=>[['Playlists people love',(await SSrc.Playlists.top()).slice(0,14)]]]];
  if(!prof.cold){const top=prof.artists[0];
    slots.push(['like','You might like',async()=>[['You might like',hookRank(groupVersions(await API.genreTop(prof.genres[0]||'Pop',50).catch(()=>[])),prof).slice(0,14)]]]);
    slots.push(['deep','Deep cuts for you',async()=>{const seen=new Set([...prof.seen]);const fr=t=>!seen.has(t.id)&&!seen.has('k:'+artistKey(t.artist)+'|'+baseTitle(t.title));
      const lists=await Promise.all(prof.artists.slice(0,5).map(a=>deepFrom(a.name,a.id,4,fr).catch(()=>[])));return[['Deep cuts for you',diversify(lists.flatMap(l=>l.slice(1))).slice(0,16)]]}]);
    slots.push(['disc','Artists to discover',async()=>{const known=new Set([...prof.artists.map(a=>artistKey(a.name)),...Object.values(Store.follows||{}).map(f=>artistKey(f.name||''))]);
      const near=(await Promise.all(prof.artists.slice(0,3).map(a=>nearArtists(a.name,[...known]).catch(()=>[])))).flat().filter((r,i,a)=>a.findIndex(x=>x.name===r.name)===i&&!known.has(artistKey(r.name)));
      return[['Artists to discover',near.slice(0,16).map(r=>({id:'aq:'+r.name,kind:'artistq',title:r.name,artist:r.fans?Intl.NumberFormat('en',{notation:'compact'}).format(r.fans)+' fans':'Artist',art:r.art})),{round:true}]]}]);
    if(top.id)slots.push(['more:'+top.id,'More from '+top.name,async()=>{const[d,pop]=await Promise.all([API.artist(top.id),API.popular(top.name).catch(()=>[])]);const cs=collaborators(d.songs,top.name).slice(0,8);const vv=vault(d.songs,pop);
      const tiles=cs.map(c=>{const src=d.songs.find(x=>(x.artist+x.title).includes(c));return{id:'aq:'+c,kind:'artistq',title:c,artist:'Artist',art:src?src.art:''}});return[['More from '+top.name,vv.gems.slice(0,12),{see:'artist-'+top.id+'-vault'}],['Artists like '+top.name,tiles,{round:true}]]}])}
  const HC=SData.LS.get('homeCache',{});const slim=t=>({...t,preview:t.dzId?null:t.preview,versions:t.versions&&t.versions.length>1?t.versions.slice(0,6).map(v=>({...v,versions:undefined})):undefined});
  const draw=list=>list.map(([ti,items,o])=>shelf(ti,items,o||{})).join('');
  hm.innerHTML=parts.join('')+slots.map(([k,title])=>{const c=HC[k];return`<div data-slot="${esc(k)}">${c&&c.list&&c.list.some(x=>x[1].length)?draw(c.list):`<section class="sec"><div class="sec-h"><h2 class="sk-t">${esc(title)}</h2></div>${skeleton()}</section>`}</div>`}).join('')+
    (prof.cold?playCards()+`<section class="sec"><div class="sec-h"><h2>What do you like?</h2></div><p class="mut small" style="margin:-4px 0 12px">Pick a few — sniplit builds your home from them.</p><div class="genres seedcards">${SGenres.list.map(g=>`<button class="genre seed" data-seedgenre="${esc(g)}" aria-pressed="false" style="--gc:${SGenres.color(g)}"><img class="gart" src="${SGenres.art(g)}" alt=""><b>${esc(g)}</b><i class="seed-ck">${I('check')}</i></button>`).join('')}</div></section>`:'');
  $$('[data-seedgenre]',hm).forEach(b=>b.onclick=async()=>{const g=b.dataset.seedgenre,on=b.classList.toggle('on');b.setAttribute('aria-pressed',on);
    if(on){b.classList.add('busy');const top=await API.genreTop(g,6).catch(()=>[]);b.classList.remove('busy');top.slice(0,2).forEach(t=>Store.likes[t.id]={...t,likedAt:Date.now(),seed:g})}
    else for(const[k,t]of Object.entries(Store.likes))if(t.seed===g)delete Store.likes[k];
    Store.save('likes');const n=$$('[data-seedgenre].on',hm).length;let go2=$('#seedgo',hm);
    if(n&&!go2){b.closest('section').insertAdjacentHTML('beforeend','<button class="pill seedgo" id="seedgo">Build my home</button>');go2=$('#seedgo',hm);go2.onclick=()=>{SData.LS.set('homeCache',{});route()}}else if(!n&&go2)go2.remove()});
  let saveT;const fresh=k=>HC[k]&&Date.now()-HC[k].at<6e5;
  await Promise.all(slots.map(async([k,,fn])=>{if(fresh(k))return;let list=[];try{list=await Promise.race([fn(),new Promise(r=>setTimeout(()=>r(null),12000))])||[]}catch(e){}
    if(!live(tok))return;const el=hm.querySelector(`[data-slot="${CSS.escape(k)}"]`);if(!el)return;list=list.filter(x=>x[1]&&x[1].length);
    if(list.length){const sy=scrollY;el.innerHTML=draw(list);el.classList.add('in');if(Math.abs(scrollY-sy)>2)scrollTo(0,sy);HC[k]={at:Date.now(),list:list.map(([a,b,o])=>[a,b.slice(0,20).map(slim),o])};clearTimeout(saveT);saveT=setTimeout(()=>SData.LS.set('homeCache',HC),400)}
    else if(!(HC[k]&&HC[k].list))el.innerHTML=''}));
  if(!live(tok))return;if(!API.offline&&!hm.querySelector('.tile')&&!prof.cold){hm.insertAdjacentHTML('beforeend',emptyState('Music services aren’t answering','This is usually brief. Your library and downloads still work.','refresh','<button class="pill" id="hretry">Try again</button>'));$('#hretry').onclick=()=>route()}
  if(API.offline&&!recent.length&&!hm.querySelector('.tile')){hm.innerHTML=`<div class="offline-bar">${I('offline')}<span>You’re offline. Downloads and music on this device still play.</span><a class="pill sm ghost" href="#library-downloads">Downloads</a></div>`}}
const Sections={
  async radio(el,tok){let tag=SData.LS.get('radioTag','pop');const TAGS=[['pop','Pop'],['hiphop','Hip-hop'],['rnb','R&B'],['jazz','Jazz'],['classical','Classical'],['electronic','Electronic'],['rock','Rock'],['lofi','Lo-fi'],['latin','Latin'],['kpop','K-pop'],['ambient','Ambient'],['country','Country'],['news','News'],['talk','Talk']];
    const sub=$('#subdd');if(sub){sub.innerHTML=filterDD('rtdd','radio','Stations',tag,TAGS);wireDD($('#rtdd'),k=>{tag=k;SData.LS.set('radioTag',k);draw()})}
    const draw=async()=>{el.innerHTML=`<div id="rl">${skeleton(8,'rows')}</div>`;const r=await Radio.search({tag,limit:40});if(!live(tok)||!$('#rl'))return;$('#rl').innerHTML=r.length?trackRows(r,{numbers:false,ctx:'Radio · '+tag}):emptyState('Stations unavailable','The radio directory can’t be reached right now.','radio')};draw()},
  async podcasts(el,tok){el.innerHTML=`<div class="search" style="margin-bottom:14px">${I('search')}<input id="pq" placeholder="Search podcasts"></div><div id="pl">${skeleton()}</div>`;
    const show=async term=>{const r=await Pod.search(term);if(!live(tok)||!$('#pl'))return;$('#pl').innerHTML=r.length?`<div class="grid-tiles">${r.map(p=>{const t={...p,kind:'podcast'};TR.set(p.id,t);return tileHTML(t)}).join('')}</div>`:emptyState('No shows found','Try another search.','podcast')};
    show('music');let tm;$('#pq').oninput=e=>{clearTimeout(tm);tm=setTimeout(()=>show(e.target.value||'music'),350)}},
  async videos(el,tok){if(false){el.innerHTML=`<div class="card"><b>Watch music videos, documentaries & shows</b><p class="mut small">Paste any YouTube link to play it here, or add a YouTube key in Settings → Connections to browse.</p><div class="row"><input id="vurl" placeholder="youtube.com/watch?v=…"><button class="pill sm" id="vgo">Play</button></div></div>`;
      $('#vgo').onclick=async()=>{const id=YT.parseId($('#vurl').value);if(!id){$('#vurl').classList.add('bad');return}const o=await YT.oembed(id);playList([{id:'yt:'+id,src:'youtube',ytId:id,title:o?.title||'Video',artist:o?.author_name||'YouTube',art:o?.thumbnail_url||'',album:'Video',durationMs:0}],0,'Video');openNP()};return}
    el.innerHTML=`<div class="search">${I('search')}<input id="vq" placeholder="Search videos"></div><div id="vl">${skeleton()}</div>`;const vl=$('#vl');let h='';
    for(const[n,q,m] of [['Music videos','official music video',true],['Documentaries','music documentary',false],['Shows & podcasts','music podcast episode',false],['Live sessions','live session',true]]){try{h+=shelf(n,await YT.search(q,{max:10,music:m}))}catch(e){h=emptyState('Videos unavailable',esc(e.message),'video');break}if(!live(tok))return;vl.innerHTML=h}
    let tm;$('#vq').oninput=e=>{clearTimeout(tm);tm=setTimeout(async()=>{const q=e.target.value.trim();if(!q)return;vl.innerHTML=skeleton();try{vl.innerHTML=shelf('Results',await YT.search(q,{max:20}))}catch(x){vl.innerHTML=emptyState('Search failed',esc(x.message),'video')}},400)}}};


V.search=async(v)=>{let filter='All';V.search.cache=V.search.cache||new Map();v.innerHTML=`<h1>Search</h1><div class="search" style="margin:14px 0">${I('search')}<input id="q" placeholder="What do you want to hear?" autocomplete="off" enterkeyhint="search" value=""></div>
  <div class="frow">${filterDD('sf','filter','Showing','All',[['All','Everything'],['Songs','Songs'],['Albums','Albums'],['Artists','Artists'],['Playlists','Playlists'],['Videos','Videos'],['Podcasts','Podcasts'],['Radio','Radio stations']])}</div><div id="sr" style="margin-top:14px"></div>`;
  const q=$('#q');if(Layout.mode!=='mobile')setTimeout(()=>q.focus(),60);let tmr;
  const remember=term=>{if(term.length<2)return;Store.searches=[term,...Store.searches.filter(x=>x.toLowerCase()!==term.toLowerCase())].slice(0,12);Store.save('searches')};
  q.addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(V.search.kt);remember(q.value.trim());q.blur()}});$('#sr').addEventListener('click',e=>{if(e.target.closest('.row,.tile,.tl,[data-i]'))remember(q.value.trim())},true);
  const run=async()=>{const term=q.value.trim();V.search.last=term;const out=$('#sr');if(!term){out.innerHTML=recentSearches()+browseHTML();return}clearTimeout(V.search.kt);V.search.kt=setTimeout(()=>remember(term),1800);if(!out.querySelector('.tl'))out.innerHTML='<div class="spin-c"><span class="spinner"></span></div>';
    const want=f=>filter==="All"||filter===f;const jobs=[];V.search.cache=V.search.cache||new Map();const cached=V.search.cache.get(filter+'|'+term);
    if(want('Songs'))jobs.push(API.search(term,{limit:50}).then(r=>['songs',groupVersions(r)]));
    if(filter==='Artists'){jobs.push(API.search(term,{entity:'musicArtist',limit:12}).then(r=>['artists',r]));jobs.push(API.search(term,{limit:40}).then(r=>['songs',r]));}else if(filter==='All')jobs.push(API.search(term,{entity:'musicArtist',limit:8}).then(r=>['artists',r]));
    if(filter==='Albums')jobs.push(API.search(term,{entity:'album',limit:30}).then(r=>['albums',r]));if(want('Podcasts'))jobs.push(Pod.search(term).then(r=>['pods',r]));
    if(want('Radio'))jobs.push(Radio.search({name:term,limit:20}).then(r=>['radio',r]));if(filter==='All'||filter==='Songs')jobs.push(SSrc.Audius.search(term).then(r=>['indie',r]));if(filter==='Videos')jobs.push(YT.search(term,{max:12}).then(r=>['videos',r]).catch(e=>['videos',[]]));if(want('Playlists'))jobs.push(SSrc.Playlists.search(term).then(r=>['xpls',r]));
    const res=cached?{...cached}:{};let left=cached?0:jobs.length,raf=0;if(cached){jobs.length=0}const paint=()=>{raf=0;if(q.value.trim()!==term)return;let h='';const pls=Store.playlists.filter(p=>p.name.toLowerCase().includes(term.toLowerCase()));
    // the artist shows up top when the search is for them; otherwise every artist in the results sits in a row of their own
    const nq=artistKey(term),artMatch=a=>{const k=artistKey(a.name);return k===nq||k.startsWith(nq)||(nq.length>3&&nq.startsWith(k))};
    const allArts=(()=>{const m=new Map();for(const a of res.artists||[])m.set(a.artistId,{...a});for(const t of res.songs||[]){if(t.artistId&&!m.has(t.artistId)&&m.size<10)m.set(t.artistId,{artistId:t.artistId,name:String(t.artist).split(/,|&| feat/i)[0].trim(),genre:t.genre})}
      for(const a of m.values()){const s0=(res.songs||[]).find(s=>s.artistId===a.artistId);a.art=a.art||(s0&&s0.art)||''}return[...m.values()].sort((x,y)=>(artMatch(y)?1:0)-(artMatch(x)?1:0))})();
    if(filter==='All'&&res.artists&&res.artists[0]&&artMatch(res.artists[0])){const a=res.artists[0];const s0=(res.songs||[]).find(s=>s.artistId===a.artistId);h+=`<a class="top-hit" href="#artist-${a.artistId}"><img src="${esc(s0?.art||SData.placeholderArt(a.name))}" alt=""><div class="grow"><b>${esc(a.name)}</b><small>Artist${a.genre?' · '+esc(a.genre):''}</small></div><button class="pill sm ghost" data-follow='${esc(JSON.stringify({id:a.artistId,name:a.name,genre:a.genre}))}'>${Store.follows[a.artistId]?'Following':'Follow'}</button></a>`}
    if(filter==='All'&&allArts.length&&!(res.artists&&res.artists[0]&&artMatch(res.artists[0])&&allArts.length<2))h+=shelf('Artists',allArts.slice(0,10).map(a=>{const t={id:'ar:'+a.artistId,kind:'artist',artistId:a.artistId,title:a.name,artist:a.genre||'Artist',art:a.art};TR.set(t.id,t);return t}),{round:true});
    if(res.songs&&res.songs.length&&filter!=='Artists')h+=(filter==='All'?'<h2 class="list-h">Songs</h2>':'')+trackRows(res.songs.slice(0,filter==='All'?8:50),{ctx:'Search: '+term,showAlbum:true});
    if(filter==='Artists'&&allArts.length)h+=shelf('Artists',allArts.slice(0,24).map(a=>{const t={id:'ar:'+a.artistId,kind:'artist',artistId:a.artistId,title:a.name,artist:'Artist',art:a.art};TR.set(t.id,t);return t}),{round:true});
    if(!res.albums&&filter==='All'&&res.songs){const seen=new Set();res.albums=res.songs.filter(t=>t.albumId&&!seen.has(t.albumId)&&seen.add(t.albumId)&&!/ - Single$/.test(t.album||'')).slice(0,12).map(t=>({id:'al:'+t.albumId,albumId:t.albumId,title:t.album,artist:t.artist,art:t.art,year:(t.release||'').slice(0,4)}))}
    if(res.albums&&res.albums.length)h+=shelf('Albums',res.albums.map(a=>{const t={...a,kind:'album',artist:a.artist+' · '+a.year};TR.set(a.id,t);return t}));
    if(pls.length&&want('Playlists'))h+=shelf('Your playlists',pls.map(p=>{const t={id:'plt:'+p.id,kind:'playlist',plId:p.id,title:p.name,artist:pl(p.tracks.length,'song'),art:p.tracks[0]?.art,arts:coverArts(p.tracks)};TR.set(t.id,t);return t}));
    if(res.xpls&&res.xpls.length)h+=shelf('Playlists',res.xpls);if(Array.isArray(res.videos)&&res.videos.length)h+=shelf('Videos',res.videos);
    if(res.pods&&res.pods.length)h+=shelf('Podcasts',res.pods.map(p=>{const t={...p,kind:'podcast'};TR.set(p.id,t);return t}));if(res.radio&&res.radio.length)h+=shelf('Radio',res.radio);if(res.indie&&res.indie.length)h+=shelf('Independent',res.indie.slice(0,14));if(res.artists&&res.artists[0]&&filter==='All')h+='<div id="sr-live"></div>';
    const sy=scrollY;out.innerHTML=(h||(left?'<div class="spin-c"><span class="spinner"></span></div>':emptyState(API.offline?'You’re offline':'No results',API.offline?'Searching what’s saved on this device only.':'Try different words.','search')))+(left&&h?'<div class="spin-c sm"><span class="spinner"></span></div>':'');if(!left)V.search.cache.set(filter+'|'+term,{...res});if(Math.abs(scrollY-sy)>2)scrollTo(0,sy);
    $$('[data-follow]',out).forEach(b=>b.onclick=e=>{e.preventDefault();const a=JSON.parse(b.dataset.follow);toggleFollow(a);b.textContent=Store.follows[a.id]?'Following':'Follow'})};
    // each source paints as soon as it answers; songs usually land first
    if(cached)paint();
    await Promise.all(jobs.map(j=>j.catch(()=>null).then(r=>{left--;if(r)res[r[0]]=r[1];if(q.value.trim()!==term)return;if(!left||r&&(r[0]==='songs'||r[0]==='artists')){cancelAnimationFrame(raf);paint()}else if(!raf)raf=requestAnimationFrame(paint)})));if(q.value.trim()!==term)return;
    if(res.artists&&res.artists[0]&&filter==='All')SSrc.IA.shows(res.artists[0].name).then(sh=>{const el=$('#sr-live');if(el&&sh.length&&q.value.trim()===term)el.innerHTML=shelf('Live recordings',sh.slice(0,12).map(x=>{const t={...x,artist:x.date||'Live'};TR.set(x.id,t);return t}))});
};
  q.oninput=()=>{clearTimeout(tmr);tmr=setTimeout(run,320)};wireDD($('#sf'),k=>{filter=k;run()});run()};
function recentSearches(open){const S=Store.searches;if(!S.length)return'';const chip=x=>`<span class="hchip"><button class="hc-t" data-rs="${esc(x)}">${I('clock')}<span class="ell">${esc(x)}</span></button><button class="hc-x" data-rsx="${esc(x)}" aria-label="Remove ${esc(x)}">${I('close')}</button></span>`;
  return`<div class="hist" id="rs"><div class="hist-row">${S.slice(0,3).map(chip).join('')}${S.length>3||open?`<button class="hchip more" data-rsm aria-expanded="${!!open}">${open?'Less':'+'+(S.length-3)}</button>`:''}</div>
    ${open?`<div class="hist-all">${S.slice(3).map(chip).join('')}<button class="pill sm ghost" data-rsall>Remove all</button></div>`:''}</div>`}
document.addEventListener('click',e=>{const redraw=open=>{const el=$('#rs');if(el)el.outerHTML=recentSearches(open)||''};
  const x=e.target.closest('[data-rsx]');if(x){Store.searches=Store.searches.filter(s=>s!==x.dataset.rsx);Store.save('searches');redraw(!!$('#rs .hist-all'));return}
  if(e.target.closest('[data-rsm]')){redraw(!$('#rs .hist-all'));return}if(e.target.closest('[data-rsall]')){Store.searches=[];Store.save('searches');redraw(false);return}
  const b=e.target.closest('[data-rs]');if(b&&$('#q')){$('#q').value=b.dataset.rs;$('#q').dispatchEvent(new Event('input'))}});
/* Browse: each genre has its own artwork; once we know a genre's #1 song its cover leans into the corner, Spotify-style */
const GENRE_COV=SData.LS.get('genreCov',{});
function genreCovers(){const now=Date.now();const want=SGenres.list.filter(g=>!(GENRE_COV[g]&&now-GENRE_COV[g].at<3*864e5)&&SGenres.dzId(g));if(!want.length)return;
  let i=0;const step=async()=>{const g=want[i++];if(!g)return SData.LS.set('genreCov',GENRE_COV);const top=await SSrc.Deezer.chart(3,SGenres.dzId(g)).catch(()=>[]);const t=top.find(x=>x.art);
    if(t){GENRE_COV[g]={u:t.art,at:Date.now()};const el=document.querySelector(`.genre[data-g="${CSS.escape(g)}"]`);if(el&&!el.querySelector('.gcov'))el.insertAdjacentHTML('beforeend',`<img class="gcov" src="${esc(thumb(t.art,250))}" alt="" loading="lazy" decoding="async">`)}step()};step();step();step()}
function genreCard(g){const c=GENRE_COV[g];return`<a class="genre" href="#genre-${encodeURIComponent(g)}" data-g="${esc(g)}" style="--gc:${SGenres.color(g)}"><img class="gart" src="${SGenres.art(g)}" alt=""><b>${esc(g)}</b>${c?`<img class="gcov" src="${esc(thumb(c.u,250))}" alt="" loading="lazy" decoding="async">`:''}</a>`}
function browseHTML(){setTimeout(genreCovers,300);const pr=profile();const mine=pr.cold?[]:SGenres.list.filter(g=>pr.genres.some(x=>SGenres.find(x)&&SGenres.find(x)[0]===g||String(x).toLowerCase()===g.toLowerCase()));
  const rest=SGenres.list.filter(g=>!mine.includes(g));
  return(mine.length?`<h2 class="list-h">Your genres</h2><div class="genres">${mine.map(genreCard).join('')}</div>`:'')+`<h2 class="list-h">Browse all</h2><div class="genres">${rest.map(genreCard).join('')}</div>`}

/* ---------- Lyric Studio ---------- */
/* audio the studio may use: the person's own files and downloads, full songs from sources that publish them openly
   (Audius, Internet Archive), otherwise the 30-second store preview, labelled as such. YouTube audio is never recorded. */
async function studioAudio(t){
  if(t.src==='local'){const f=await IDB.get('files',t.id);if(f)return{blob:f.blob,full:true,kind:'file',label:'Your file · full song'}}
  const c=await IDB.get('audio',t.id);if(c&&c.blob&&c.full&&c.src!=='youtube')return{blob:c.blob,full:true,kind:'cached',label:'Your download · full song'};
  if(t.src==='audius'){const u=await SSrc.Audius.streamUrl(t.auId).catch(()=>null);if(u){const r=await fetch(u).catch(()=>null);if(r&&r.ok)return{blob:await r.blob(),full:true,kind:'audius',label:'Audius · full song',note:'This song streams free on Audius. Posting it somewhere else still needs the artist’s permission.'}}}
  if(t.src==='archive'&&t.stream){const r=await fetch(t.stream).catch(()=>null);if(r&&r.ok)return{blob:await r.blob(),full:true,kind:'archive',label:'Internet Archive · full recording',note:'Check this recording’s license on archive.org before posting it.'}}
  if(c&&c.blob)return{blob:c.blob,full:false,kind:'clip',label:'30-second preview clip (saved) — import the full song for a full video'};
  const u=await freshPreview(t).catch(()=>null);if(u){const r=await fetch(u).catch(()=>null);if(r&&r.ok)return{blob:await r.blob(),full:false,kind:'clip',label:'30-second store preview — import the full song for a full video',note:'Store previews are for listening, not republishing. Use your own copy, or a song you have the rights to.'}}
  throw new Error('No audio sniplit can use for this song. Full songs here play through YouTube’s player, which can’t be recorded — import your own copy.')}
V.lyricvideo=(v,id)=>{const t=id?(TR.get(id)||(cur&&cur.id===id?cur:null)):null;
  window.__lvs=SLStudio.mount(v,{track:t,current:cur,esc,I,toast,audioFor:studioAudio,search:q=>API.search(q,{limit:10}),server:()=>String(Store.settings.studioServer||window.SNIPLIT_SERVER||'').trim().replace(/\/+$/,''),pauseMain:()=>{if(eng.playing)eng.pause()},premium:()=>Store.premium,upsell:m=>{if(confirm(m+'. See Premium?'))go('premium')}})};

/* ---------- genre page ---------- */
V.genre=async(v,name,tok)=>{name=decodeURIComponent(name||'Pop');const G=SGenres;const id=G.dzId(name)??SSrc.Deezer.genreId(name);
  v.innerHTML=`<div class="g-hero" style="--gc:${G.color(name)}"><img class="gart" src="${G.art(name)||SData.placeholderArt(name)}" alt=""><div class="g-in"><span class="kicker">Genre</span><h1>${esc(name)}</h1><div class="row"><button class="pill" id="gp" disabled>${I('play')} Play</button><button class="icon-btn" id="gs" aria-label="Shuffle" disabled>${I('shuffle')}</button></div></div></div><div id="gbody"><div class="spin-c"><div class="spinner"></div></div></div>`;
  const[top,arts,pls,rel]=await Promise.all([API.genreTop(name,60).catch(()=>[]),id?SSrc.Deezer.chartArtists(id,16):Promise.resolve([]),id?SSrc.Deezer.chartPlaylists(id,12):SSrc.Playlists.search(G.words(name)).catch(()=>[]),id?SSrc.Deezer.releases(id,16):Promise.resolve([])]);
  if(!live(tok))return;const body=$('#gbody');const list=groupVersions(top);
  if(!list.length&&!arts.length&&!(pls||[]).length){body.innerHTML=emptyState('Couldn’t load '+esc(name),API.offline?'You’re offline — this will fill in when you’re back.':'The music services didn’t answer. Try again in a moment.','refresh','<button class="pill" id="gr">Try again</button>');$('#gr').onclick=()=>route();return}
  const forYou=hookRank(list,profile()).slice(0,14);
  body.innerHTML=(list.length?`<section class="sec"><div class="sec-h"><h2>Top ${esc(name)} songs</h2></div>${trackRows(list.slice(0,20),{ctx:name})}</section>`:'')
    +shelf('Picked for you',forYou)
    +shelf('Artists',(arts||[]).map(a=>({id:'aq:'+a.name,kind:'artistq',title:a.name,artist:'Artist',art:a.art})),{round:true})
    +shelf('New releases',(rel||[]).map(a=>({id:'xpl:dzal:'+a.id,kind:'xpl',xsrc:'dzal',xid:a.id,title:a.title,artist:a.artist||'',art:a.art})))
    +shelf('Playlists',(pls||[]).map(p=>p.kind?p:{id:'xpl:dz:'+p.id,kind:'xpl',xsrc:'dz',xid:p.id,title:p.title,artist:p.owner+(p.n?` · ${p.n} songs`:''),art:p.art}));
  const gp=$('#gp'),gs=$('#gs');if(list.length){gp.disabled=gs.disabled=false;gp.onclick=()=>{playList(list,0,name);openNP()};gs.onclick=()=>{playList(shuffleMix(list),0,name);openNP()}}else{gp.hidden=gs.hidden=true}
  const c=list.find(t=>t.art);if(c&&!GENRE_COV[name]){GENRE_COV[name]={u:c.art,at:Date.now()};SData.LS.set('genreCov',GENRE_COV)}};

V.artist=async(v,arg,tok)=>{const[id,tab0]=arg.split('-');if(!/^\d+$/.test(id)){v.innerHTML=`<div class="hero sk"></div>${skeleton(6,'rows')}`;const real=await artistIdFor(decodeURIComponent(id.replace(/^n~/,'')));if(!live(tok))return;if(real){history.replaceState(null,'','#artist-'+real+(tab0?'-'+tab0:''));return V.artist(v,real+(tab0?'-'+tab0:''),tok)}v.innerHTML=`<div class="empty"><b>Couldn’t open this artist</b><p class="small mut">Check your connection and try again.</p></div>`;return}let tab=tab0||'popular';v.innerHTML=`<div class="hero sk"></div>${skeleton(6,'rows')}`;
  const d=await API.artist(id);if(!live(tok))return;const name=d.info.name||((d.songs[0]||{}).artist||'').split(/ & |, | feat/i)[0];
  const cap=(p,d,ms=4500)=>Promise.race([p.catch(()=>d),new Promise(r=>setTimeout(()=>r(d),ms))]);const[pop,dzA,adb,wiki,mb,shows,tour]=await Promise.all([API.popular(name),cap(SSrc.Deezer.artist(name),null),cap(SSrc.ADB.artist(name),null),cap(SSrc.Wiki.summary(name),null),cap(SSrc.MB.artist(name),null),cap(SSrc.IA.shows(name),[]),cap(SSrc.Tour.events(name),[],3000)]);if(!live(tok))return;
  const dzTop=dzA?await SSrc.Deezer.top(dzA.id):[];const popG=groupVersions(SSrc.mergeTracks([...pop],dzTop.filter(t=>artistKey(t.artist)===artistKey(name))));
  const vv=vault(d.songs,pop);const coll=collaborators(d.songs,name);const photo=(adb&&adb.fanart)||(dzA&&dzA.picture_xl&&!/\/artist\/\/|d41d8cd98f00b204e9800998ecf8427e/.test(dzA.picture_xl)?dzA.picture_xl:'')||(wiki&&wiki.image)||(adb&&adb.thumb)||(d.albums[0]||popG[0]||{}).art||'';
  const bio=(wiki&&wiki.bio)||(adb&&adb.bio)||'';const facts=[adb&&adb.formed,(adb&&adb.country)||(mb&&mb.country),adb&&adb.style,adb&&adb.mood].filter(Boolean);
  v.innerHTML=`<div class="hero"><div class="bgimg" style="background-image:url(&quot;${esc(photo.replace('600x600','1200x1200'))}&quot;)"></div><div class="grow"><span class="kicker">${esc(d.info.genre||'Artist')}${dzA&&dzA.nb_fan?' · '+Intl.NumberFormat('en',{notation:'compact'}).format(dzA.nb_fan)+' fans':''}</span><h1>${esc(name)}</h1></div>
    <div class="row"><button class="pill" id="aplay">${I('play')} Play</button><button class="pill ghost light" id="afol">${Store.follows[id]?'Following':'Follow'}</button></div></div>
  <div class="seg-u" id="atabs">${[['popular','Popular'],['all','All songs'],['vault','Vault'],['albums','Releases'],...(shows.length?[['live','Live']]:[]),['related','Similar'],['about','About']].map(([k,l])=>`<button data-at="${k}">${l}</button>`).join('')}</div><div id="ab"></div>`;
  const body=$('#ab');const render=async()=>{$$('#atabs button').forEach(b=>b.classList.toggle('on',b.dataset.at===tab));
    if(tab==='popular')body.innerHTML=trackRows(popG.slice(0,15),{ctx:name})+(tour.length?`<h2 class="list-h">On tour</h2><div class="lib-list">${tour.slice(0,4).map(e=>`<a class="lib-row" href="${esc(e.url||'#')}" target="_blank" rel="noopener"><span class="ph date"><b>${new Date(e.when).toLocaleDateString(undefined,{day:'numeric'})}</b><small>${new Date(e.when).toLocaleDateString(undefined,{month:'short'})}</small></span><div class="grow"><b class="ell">${esc(e.venue||'')}</b><small>${esc(e.city)}</small></div>${I('chevRight')}</a>`).join('')}</div>`:'')+shelf('Latest releases',d.albums.slice(0,12).map(a=>{const t={...a,kind:'album',artist:a.year};TR.set(a.id,t);return t}));
    if(tab==='all'){body.innerHTML=`<div class="spin-c"><div class="spinner"></div><p class="mut small">Gathering every release…</p></div>`;const cat=groupVersions(await API.catalog(name,id).catch(()=>[]));if(!live(tok)||tab!=='all')return;
      const rank=new Map(popG.map((t,i)=>[baseTitle(t.title).toLowerCase(),i]));let sort=SData.LS.get('catSort','popular');
      const draw=()=>{const l=[...cat].sort(sort==='new'?(a,b)=>String(b.release||'').localeCompare(String(a.release||'')):sort==='az'?(a,b)=>a.title.localeCompare(b.title):(a,b)=>(rank.get(baseTitle(a.title).toLowerCase())??999)-(rank.get(baseTitle(b.title).toLowerCase())??999)||String(b.release||'').localeCompare(String(a.release||'')));
        body.innerHTML=cat.length?`<div class="row cat-h"><b>${pl(cat.length,'song')}</b><div class="chips">${[['popular','Popular'],['new','Newest'],['az','A–Z']].map(([k,l])=>`<button class="chip ${sort===k?'on':''}" data-cs="${k}">${l}</button>`).join('')}</div><button class="pill sm" id="catp">${I('play')} Play all</button><button class="icon-btn" id="cats" aria-label="Shuffle all">${I('shuffle')}</button></div>${trackRows(l,{ctx:name+' · All songs'})}`:emptyState('Couldn’t gather the catalog','Try again in a moment.','list');
        if(!cat.length)return;$('#catp').onclick=()=>{playList(l,0,name+' · All songs');openNP()};$('#cats').onclick=()=>{playList(shuffleMix(l),0,name+' · All songs');openNP()};
        $$('[data-cs]',body).forEach(b=>b.onclick=()=>{sort=b.dataset.cs;SData.LS.set('catSort',sort);draw()})};draw()}
    if(tab==='vault'){body.innerHTML=`<div class="spin-c"><div class="spinner"></div><p class="mut small">Opening the vault…</p></div>`;const X=await deepVault(name,id,d,pop,vv).catch(()=>null);if(!live(tok)||tab!=='vault')return;
      const sec=(h,l,sub)=>l&&l.length?`<h2 class="list-h">${h} <span class="ct">${l.length}</span></h2>${sub?`<p class="mut small" style="margin:-6px 0 10px">${sub}</p>`:''}`+trackRows(l,{ctx:name+' · Vault'}):'';
      body.innerHTML=X&&X.total?`<div class="row cat-h"><b>${X.total} songs off the beaten path</b><button class="pill sm" id="vplay">${I('play')} Play the vault</button><button class="icon-btn" id="vshuf" aria-label="Shuffle the vault">${I('shuffle')}</button></div>`
        +sec('Unreleased & rare',X.unreleased,'Uploads found on YouTube and Audius — snippets, demos and songs that never came out officially')+sec('Deep cuts',X.deep,'Album tracks that never charted')+sec('Rarities',X.rare)+sec('Features',X.feats,'Songs where '+esc(name)+' is a guest')+sec('Live',X.live)
        +(shows.length?shelf('Live in concert',shows.slice(0,12).map(x=>{const t={...x,artist:x.date};TR.set(x.id,t);return t})):''):emptyState('Nothing hidden here yet','This artist’s catalog is all on the Popular tab.','vault');
      if(X&&X.total){const all=[...X.unreleased,...X.deep,...X.rare,...X.feats];$('#vplay').onclick=()=>{playList(all,0,name+' · Vault');openNP()};$('#vshuf').onclick=()=>{playList(shuffleMix(all),0,name+' · Vault');openNP()}}}
    if(false)body.innerHTML=!vv.rare.length&&!vv.gems.length&&!vv.live.length&&!shows.length?emptyState('Nothing hidden here yet','This artist’s catalog is all on the Popular tab.','vault'):(vv.rare.length?'<h2 class="list-h">Rarities</h2>'+trackRows(vv.rare.slice(0,30),{ctx:name+' · Vault'}):'')+(vv.gems.length?'<h2 class="list-h">Deep cuts</h2>'+trackRows(vv.gems.slice(0,30),{ctx:name+' · Vault'}):'')+(vv.live.length?'<h2 class="list-h">Live</h2>'+trackRows(vv.live.slice(0,15),{ctx:name+' · Live'}):'')+(shows.length?shelf('Live in concert',shows.slice(0,12).map(x=>{const t={...x,artist:x.date};TR.set(x.id,t);return t})):'');
    if(tab==='albums'){body.innerHTML=skeleton(8);const dzAl=dzA?await cap(SSrc.Deezer.albums(dzA.id),[],6000):[];if(!live(tok)||tab!=='albums')return;
      const kindOf=a=>/\bsingle\b/i.test(a.title||'')||a.type==='single'?'Singles':/\bEP\b/.test(a.title||'')||a.type==='ep'?'EPs':a.type==='compile'||/\b(live|greatest hits|best of|collection)\b/i.test(a.title||'')?'Live & compilations':'Albums';
      const seen=new Map();for(const a of d.albums){const k=SData.baseTitle(String(a.title).replace(/ - (Single|EP)$/,''));seen.set(k,{...a,title:a.title.replace(/ - (Single|EP)$/,''),kindName:kindOf(a),sort:a.release||a.year,t:{...a,kind:'album'}})}
      for(const a of dzAl){const k=SData.baseTitle(a.title);if(seen.has(k))continue;seen.set(k,{...a,kindName:kindOf(a),sort:a.date||a.year,t:{id:a.id,kind:'xpl',xsrc:'dzal',xid:a.dzAlbum,title:a.title,art:a.art}})}
      const groups={};[...seen.values()].sort((x,y)=>String(y.sort||'').localeCompare(String(x.sort||''))).forEach(a=>{(groups[a.kindName]=groups[a.kindName]||[]).push(a)});
      body.innerHTML=['Albums','EPs','Singles','Live & compilations'].filter(g=>groups[g]).map(g=>`<h2 class="list-h">${g} <small class="mut">${groups[g].length}</small></h2><div class="grid-tiles">${groups[g].map(a=>{const t={...a.t,title:a.title,artist:a.year||''};TR.set(t.id,t);return tileHTML(t)}).join('')}</div>`).join('')||emptyState('No releases found','Try again in a moment.','list')}
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
V.library=async(v,f0)=>{let f=f0||'playlists';const draw=async()=>{const counts={playlists:Store.playlists.length,liked:Object.keys(Store.likes).length,downloads:[...cachedIds].filter(k=>!stashIds.has(k)).length,local:Store.imports.length,artists:Object.keys(Store.follows).length,history:Store.history.length};
  v.innerHTML=`<div class="row" style="justify-content:space-between"><h1>Library</h1><button class="icon-btn" data-act="create" aria-label="Create">${I('plus')}</button></div>
  <form class="linkimp" id="limp"><span>${I('import')}</span><input id="limpu" type="url" inputmode="url" placeholder="Paste a playlist link — Spotify, Apple Music, SoundCloud, YouTube…" aria-label="Playlist link" autocomplete="off"><button class="pill sm" type="submit">Import</button></form><p class="mut small" id="limpm" hidden></p>
  <div class="chips" id="lf">${[['playlists','Playlists'],['liked','Liked'],['downloads','Downloads'],['local','On this device'],['artists','Artists'],['history','History']].map(([k,l])=>`<button class="chip ${f===k?'on':''}" data-lf="${k}">${l}${counts[k]?` <span class="ct">${counts[k]}</span>`:''}</button>`).join('')}</div><div id="lb" style="margin-top:16px"></div>`;
  $('#lf').onclick=e=>{const b=e.target.closest('[data-lf]');if(b){f=b.dataset.lf;history.replaceState(null,'','#library-'+f);draw()}};const lb=$('#lb');
  $('#limp').onsubmit=async e=>{e.preventDefault();const u=$('#limpu').value.trim();if(!u)return;const m=$('#limpm');m.hidden=false;const btn=$('#limp button');btn.disabled=true;
    try{m.textContent='Reading the playlist…';const d=await SImport.fromLink(u,String(Store.settings.studioServer||window.SNIPLIT_SERVER||'').trim());m.textContent=`Found ${d.items.length} songs in “${d.name}” · matching…`;
      const r=await SImport.applyImport({source:d.source,likes:[],history:[],playlists:[{name:d.name,items:d.items}]},(p,mm,t)=>{m.textContent=`Matching… ${mm} of ${t} found`});
      m.textContent=`Added “${d.name}”: ${r.matched} of ${r.total} songs matched. Missing ones keep retrying in the background.`;$('#limpu').value='';refreshSide();f='playlists';setTimeout(draw,1600)}
    catch(err){m.textContent=err.message||String(err)}btn.disabled=false};
  if(f==='playlists'){const rows=[{href:'#liked',name:'Liked Songs',sub:pl(counts.liked,'song'),icon:'heartF'},...Store.playlists.map(p=>({href:'#playlist-'+p.id,name:p.name,sub:pl(p.tracks.length,'song')+(p.from?' · from '+p.from:''),arts:coverArts(p.tracks)}))];
    lb.innerHTML=`<div class="lib-list">${rows.map(r=>`<a class="lib-row" href="${r.href}">${r.arts&&r.arts.length?cover(r.arts):`<span class="ph">${I(r.icon||'list')}</span>`}<div class="grow"><b class="ell">${esc(r.name)}</b><small>${esc(r.sub)}</small></div>${I('chevRight')}</a>`).join('')}</div>${Store.pending.length?`<p class="mut small" style="margin-top:14px">${Store.pending.length} imported songs are still being matched. <a href="#" id="retry">Retry now</a></p>`:''}`;
    const r=$('#retry');if(r)r.onclick=async e=>{e.preventDefault();r.textContent='Matching…';const p=Store.pending.splice(0);Store.save('pending');await SImport.applyImport({source:'Retry',likes:p.filter(x=>x._k==='like'),playlists:[],history:[]});draw()}}
  if(f==='liked')return go('liked');
  if(f==='downloads'){const keys=(await IDB.keys('audio')).filter(k=>!stashIds.has(k));const items=(await Promise.all(keys.map(k=>IDB.get('audio',k)))).filter(Boolean);const size=items.reduce((a,b)=>a+(b.size||0),0);
    lb.innerHTML=items.length?`<p class="mut small">${items.length} songs · ${(size/1048576).toFixed(1)} MB${Store.premium?'':` · ${FREE_CACHE_LIMIT} max on Free`}</p>${trackRows(items.map(i=>i.meta),{ctx:'Downloads'})}<button class="pill sm ghost" id="clr" style="margin-top:14px">${I('trash')} Remove all downloads</button>`:emptyState('No downloads yet','Tap the download button on any song, album or playlist to keep it offline.','download');
    {const st=stashMeta();if(st.length)lb.insertAdjacentHTML('beforeend',`<h2 class="list-h" style="margin-top:28px">Saved for you offline <span class="ct">${st.length}</span></h2><p class="mut small" style="margin:-6px 0 10px">New picks sniplit saved automatically so offline still has something new. They rotate out once played and don’t count toward your downloads. Turn this off in Settings → Playback.</p>${trackRows(st,{ctx:'Saved for offline'})}`)}
    const c=$('#clr');if(c)c.onclick=async()=>{if(!c.dataset.sure){c.dataset.sure=1;c.innerHTML=`${I('trash')} Tap again to remove`;return}for(const k of keys){await IDB.del('audio',k);cachedIds.delete(k)}refreshSide();draw()}}
  if(f==='local')lb.innerHTML=Store.imports.length?trackRows(Store.imports,{ctx:'On this device',showAlbum:true}):emptyState('Your own music','Add audio files or a whole folder — they play in full with every studio tool.','folder',`<button class="pill" data-act="create">${I('plus')} Add music</button>`);
  if(f==='artists'){const fl=Object.values(Store.follows);lb.innerHTML=fl.length?`<div class="grid-tiles">${fl.map(a=>{const t={id:'ar:'+a.id,kind:'artist',artistId:a.id,title:a.name,artist:a.genre||'Artist',art:SData.localLibrary().find(x=>String(x.artistId)===String(a.id))?.art};TR.set(t.id,t);return tileHTML(t,{round:true})}).join('')}</div>`:emptyState('Follow artists','Following shapes what shows up on Home.','user')}
  if(f==='history'){const h=[...Store.history].reverse().slice(0,300);lb.innerHTML=h.length?`<p class="mut small">${fmt(Store.stats.ms/1000)} listened in total</p>`+trackRows(h.map(x=>x.track),{numbers:false,ctx:'History'}):emptyState('Nothing yet','Songs you play show up here.','clock')}};draw()};
V.liked=v=>{const list=Object.values(Store.likes).sort((a,b)=>(b.likedAt||0)-(a.likedAt||0));v.innerHTML=`<div class="coll-h"><div class="cover-liked">${I('heartF')}</div><div class="grow"><span class="kicker">Playlist</span><h1>Liked Songs</h1><p class="mut">${list.length} songs</p><div class="row"><button class="pill" id="lp">${I('play')} Play</button><button class="icon-btn" id="ls" aria-label="Shuffle">${I('shuffle')}</button><button class="icon-btn" id="ld" aria-label="Download">${I('download')}</button></div></div></div><div style="margin-top:20px">${list.length?trackRows(list,{ctx:'Liked Songs',showAlbum:true}):emptyState('Songs you like','Tap the heart on anything you love.','heart')}</div>`;
  $('#lp').onclick=()=>list.length&&playList(list,0,'Liked Songs');$('#ls').onclick=()=>{Q.shuffle=true;list.length&&playList(shuffleMix(list),0,'Liked Songs')};$('#ld').onclick=()=>cacheMany(list,'Liked Songs');if(!list.length)['#lp','#ls','#ld'].forEach(x=>$(x).disabled=true)};
V.playlist=(v,id)=>{const p=Store.playlists.find(x=>x.id===id);if(!p){v.innerHTML=emptyState('Playlist not found','It may have been deleted.','list');return}
  v.innerHTML=`<div class="coll-h">${coverArts(p.tracks).length?cover(coverArts(p.tracks),'coll-art'):`<img src="${esc(SData.placeholderArt(p.name))}" alt="">`}<div class="grow"><span class="kicker">Playlist${p.from?' · from '+esc(p.from):''}</span><h1 contenteditable="true" spellcheck="false" id="pn">${esc(p.name)}</h1><p class="mut">${p.tracks.length} songs${p.private?' · private':''}</p>
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
/* ---------- notes ----------
   Like a status, but a song: 30 seconds of it and one line of its lyrics, shown above your avatar to friends for 24 hours. */
function myNote(){const n=SData.LS.get('myNote',null);return n&&Date.now()-n.at<864e5?n:null}
function noteBubble(n){if(!n)return'';const t=n.track||{};return`<span class="nb">${n.line?`“${esc(n.line.text.slice(0,48))}${n.line.text.length>48?'…':''}”`:`<span class="nb-m">${I('music')}<b class="ell">${esc(t.title||'')}</b></span><small class="ell">${esc(String(t.artist||''))}</small>`}</span>`}
function notesRow(){const me=SSocial.me,mine=myNote();const fr=Object.values(me.friends).filter(f=>f.p&&f.p.note).sort((a,b)=>b.p.note.at-a.p.note.at);
  return`<div class="notes-row" role="list"><button class="note-it me" data-note="me" role="listitem">${noteBubble(mine)||'<span class="nb add">Share a song…</span>'}${avatar(me.name||'You',me.id,64)}<small>Your note</small></button>${fr.map(f=>`<button class="note-it" data-note="${f.id}" role="listitem">${noteBubble(f.p.note)}${avatar(f.name,f.id,64)}<small class="ell">${esc(f.name)}</small></button>`).join('')}</div>`}
let noteAu=null;function stopNoteAu(){if(noteAu){noteAu.pause();noteAu.removeAttribute('src');noteAu=null}}
async function showNote(n,who,fid){if(!n)return;const t=n.track;let raf=0;
  openSheet(`<div class="note-sh">${who==='me'?avatar(SSocial.me.name||'You',SSocial.me.id,84):avatar(SSocial.me.friends[fid]?.name||'',fid,84)}
    <div class="note-song">${I('wave')}<b>${esc(t.title)}</b><span class="mut"> · ${esc(t.artist)}</span></div>
    ${n.line?`<p class="note-line" id="nline">${n.line.words&&n.line.words.length?n.line.words.map(w=>`<span class="w">${esc(w.w)}</span>`).join(' '):String(n.line.text).split(/\s+/).map(w=>`<span class="w">${esc(w)}</span>`).join(' ')}</p>`:''}${n.text?`<p class="note-text">${esc(window.SClean?SClean.clean(n.text):n.text)}</p>`:''}
    <small class="mut">${who==='me'?'Shared with friends':'Shared with you'} · ${ago(n.at)}</small></div>
    ${who==='me'?`<button class="pill big" data-nact="new">Leave a new note</button><button class="pill ghost" data-nact="del">Delete note</button>`:`<button class="pill big" data-nact="play">${I('play')} Play the song</button><button class="pill ghost" data-nact="reply">${I('chat')} Reply</button>`}`);
  sheetBye=()=>{cancelAnimationFrame(raf);stopNoteAu()};
  // 30 seconds of the song, and its lyric line lighting up word by word in time with it
  const pv=await freshPreview(t).catch(()=>t.preview);if(pv&&$('.note-sh')){const was=eng.playing;if(was)eng.pause();noteAu=new Audio(pv);noteAu.loop=true;noteAu.volume=.9;noteAu.currentTime=n.start||0;noteAu.play().catch(()=>{});noteAu.was=was;
    const L=n.line,ws=$$('#nline .w');const dur=L?Math.max(1.5,(L.end||L.t+4)-L.t):0;const wt=L&&L.words&&L.words.length?L.words.map(w=>[(w.t-L.t)/dur,((w.e||w.t+.4)-L.t)/dur]):ws.map((_,i)=>[i/ws.length,(i+1)/ws.length]);
    const step=()=>{if(!noteAu)return;const at=noteAu.currentTime-(n.at0!=null?n.at0:(n.start||0));const ph=dur?(((at%dur)+dur)%dur)/dur:0;ws.forEach((w,i)=>{const[a,b]=wt[i]||[0,0];w.style.setProperty('--p',(ph<=a?0:ph>=b?100:(ph-a)/(b-a)*100).toFixed(0)+'%')});raf=requestAnimationFrame(step)};step()}
  $('#sheet').onclick=e=>{const b=e.target.closest('[data-nact]');if(!b)return;const k=b.dataset.nact;const was=noteAu&&noteAu.was;closeSheet();
    if(k==='new')noteMaker();if(k==='del'){SData.LS.set('myNote',null);SSocial.update&&SSocial.update();curDone=false;route()}
    if(k==='play'){playList([t],0,'From a note');openNP()}if(k==='reply'){go('chat-'+fid);setTimeout(()=>SSocial.sendMsg(fid,{kind:'song',track:t,text:'↩︎ your note'}).catch(()=>{}),400)}
    if(k!=='play'&&was)eng.play()}}
async function noteMaker(seed){const pick=async t=>{openSheet(`${sheetH('New note')}<div class="spin-c"><div class="spinner"></div><p class="mut small">Getting the lyrics…</p></div>`);
    const L=await SLyrics.fetchLyrics(t).catch(()=>null);const lines=(L&&L.lines||[]).map((l,i,a)=>({...l,end:a[i+1]?a[i+1].t:l.t+4})).filter(l=>!l.instr&&String(l.text||'').trim().length>2);
    const uniq=lines.filter((l,i)=>lines.findIndex(x=>x.text===l.text)===i).slice(0,80);
    openSheet(`${sheetH('New note')}<div class="nm-song"><img src="${esc(t.art||'')}" alt=""><div class="grow"><b class="ell">${esc(t.title)}</b><small class="ell">${esc(t.artist)}</small></div><button class="pill sm ghost" data-nm="song">Change</button></div>
      <input class="field" id="nmtext" maxlength="60" placeholder="Add a few words (optional)">
      <p class="small mut" style="margin:10px 0 6px">${uniq.length?'Pick the line that says it best':'No lyrics found for this one — your note will show the song.'}</p><div class="nm-lines">${uniq.map((l,i)=>`<button class="nm-l" data-nl="${i}">${esc(l.text)}</button>`).join('')}</div>
      <button class="pill big" data-nm="post">Share note</button>`);let sel=uniq.length?0:-1;$$('.nm-l')[0]?.classList.add('on');
    $('#sheet').onclick=e=>{const l=e.target.closest('[data-nl]');if(l){sel=+l.dataset.nl;$$('.nm-l').forEach(x=>x.classList.toggle('on',x===l));return}const b=e.target.closest('[data-nm]');if(!b)return;
      if(b.dataset.nm==='song')return songPicker(pick);
      if(b.dataset.nm==='post'){const l=sel>=0?uniq[sel]:null;const slim={id:t.id,title:t.title,artist:t.artist,art:t.art&&!String(t.art).startsWith('data:')?t.art:'',preview:t.preview,dzId:t.dzId,itId:t.itId,artistId:t.artistId,durationMs:t.durationMs,src:t.src==='local'?'itunes':t.src};
        const note={track:slim,line:l?{text:l.text,t:l.t,end:l.end,words:(l.words||[]).slice(0,24).map(w=>({w:w.w,t:w.t,e:w.e}))}:null,text:$('#nmtext').value.trim().slice(0,60),at:Date.now()};
        SData.LS.set('myNote',note);SSocial.update&&SSocial.update();closeSheet();curDone=false;route()}}};
  if(seed||cur)return pick(seed||cur);songPicker(pick)}
document.addEventListener('click',e=>{const n=e.target.closest('[data-note]');if(!n)return;const id=n.dataset.note;if(id==='me'){const m=myNote();return m?showNote(m,'me'):noteMaker()}const f=SSocial.me.friends[id];if(f&&f.p&&f.p.note)showNote(f.p.note,'friend',id)});
V.friends=(v,_,tok,soft)=>{const me=SSocial.me;const fr=Object.values(me.friends).sort((a,b)=>((b.p&&b.p.active)?1:0)-((a.p&&a.p.active)?1:0)||((b.p&&b.p.at)||0)-((a.p&&a.p.at)||0));const inR=Object.values(me.inReq),out=Object.values(me.out);
  if(!soft||!$('#fr-root')){v.innerHTML=`<div id="fr-root"></div>`;SSocial.start()}
  const status=f=>{const p=f.p||{};if(p.active&&SSocial.isLive(f.id))return p.now&&p.now.playing?`<span class="live-dot"></span>Listening to <b>${esc(p.now.title)}</b> · ${esc(p.now.artist)}`:'<span class="live-dot"></span>Active now';if(p.active)return'<span class="live-dot"></span>Active now';return p.at?`Active ${ago(p.at)}${p.now?` · last played ${esc(p.now.title)}`:''}`:'Waiting to connect'};
  const ffq=$('#ffq')?$('#ffq').value:'';
  $('#fr-root').innerHTML=`<div class="row" style="justify-content:space-between"><h1>Friends</h1><div class="row"><button class="icon-btn" id="myl" aria-label="Invite with a link" title="Invite with a link">${I('link')}</button></div></div>
  ${notesRow()}${storyRing()}
  <div class="card me-card">${avatar(me.name||'You',me.id,52)}<div class="grow"><input id="myname" value="${esc(me.name)}" placeholder="Your name" maxlength="40" aria-label="Your name"><small class="mut">Friends see this name</small></div></div>
  ${findFriendsHTML()}
  ${(me.gifts||[]).length?`<h2 class="list-h">Sent to you</h2>${trackRows(me.gifts.slice(0,10).map(g=>({...g.track,artist:g.track.artist+' · from '+g.name})),{numbers:false,ctx:'From friends'})}`:''}
  ${inR.length?`<h2 class="list-h">Requests</h2>${inR.map(r=>`<div class="friend">${avatar(r.name,r.id,44)}<div class="grow"><b>${esc(r.name)}</b><small>Wants to be friends</small></div><button class="pill sm" data-acc="${r.id}">Accept</button><button class="icon-btn" data-dec="${r.id}" aria-label="Decline">${I('close')}</button></div>`).join('')}`:''}
  ${fr.length?`<h2 class="list-h">Your friends</h2>${fr.map(f=>`<div class="friend" data-friend="${f.id}">${avatar(f.name,f.id,44,!!(f.p&&(f.p.story||f.p.year)))}<div class="grow"><b>${esc(f.name)}${f.p&&f.p.pro?' <span class="pro-b" title="Premium supporter">✦</span>':''}</b><small class="ell">${status(f)}</small></div>${(SSocial.unread?SSocial.unread(f.id):0)?`<span class="ubadge">${(SSocial.unread?SSocial.unread(f.id):0)}</span>`:''}<button class="icon-btn" onclick="event.stopPropagation();location.hash='#chat-${f.id}'" aria-label="Message ${esc(f.name)}">${I('chat')}</button>${f.p&&f.p.now&&f.p.now.preview?`<button class="icon-btn" data-along="${f.id}" aria-label="Listen along">${I('play')}</button>`:''}${I('chevRight')}</div>`).join('')}`:''}
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
/* ---------- messages ---------- */
const chatFmtDay=at=>{const d=new Date(at),n=new Date();const same=d.toDateString()===n.toDateString();const y=new Date(n-864e5).toDateString()===d.toDateString();return same?'Today':y?'Yesterday':d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})};
const chatTime=at=>new Date(at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
function chatExt(mime){return/mp4|aac|m4a/.test(mime)?'m4a':/ogg/.test(mime)?'ogg':/jpeg/.test(mime)?'jpg':/png/.test(mime)?'png':'webm'}
function dlData(dataUrl,name){const a=document.createElement('a');a.href=dataUrl;a.download=name;document.body.appendChild(a);a.click();a.remove()}
function bubble(m){const st=m.me?({sending:'Sending…',waiting:'Delivered when they’re online',sent:'Sent',delivered:'Delivered',seen:'Seen',failed:'Not sent — hold to retry'}[m.state]||''):'';
  const CL=x=>window.SClean?SClean.clean(x):x;let body='';if(m.kind==='text')body=`<p>${esc(CL(m.text)).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>')}</p>`;
  else if(m.kind==='image')body=`<img class="cm-img" src="${esc(m.data||'')}" alt="Photo" loading="lazy">${m.text?`<p>${esc(CL(m.text))}</p>`:''}`;
  else if(m.kind==='voice')body=`<div class="cm-voice" data-vn="${m.id}"><button class="icon-btn" data-vplay aria-label="Play voice note">${I('play')}</button><div class="cm-vbar"><i></i></div><span class="small">${fmt(m.dur||0)}</span></div><button class="cm-tx-t" data-vtx="${m.id}" aria-expanded="${!!m.txOpen}">${m.txOpen?'Hide transcript':'Transcript'}</button>${m.txOpen?`<p class="cm-tx">${m.text?esc(CL(m.text)):m.txBusy?'<span class="mut">Transcribing…</span>':'<span class="mut">No words heard.</span>'}</p>`:''}`;
  else if(m.kind==='song'&&m.track)body=`<div class="cm-song" data-csong="${m.id}"><img src="${esc(m.track.art||SData.placeholderArt(m.track.title))}" alt=""><div class="grow"><b class="ell">${esc(m.track.title)}</b><small class="ell">${esc(m.track.artist||'')}</small></div><span class="icon-btn">${I('play')}</span></div>${m.text?`<p class="cm-cap">${esc(CL(m.text))}</p>`:''}`;
  return`<div class="cm ${m.me?'me':'them'} k-${m.kind}" data-mid="${m.id}" tabindex="0">${body}<small class="cm-meta">${chatTime(m.at)}${st?' · '+st:''}</small></div>`}
V.chat=async(v,id,tok)=>{const f=SSocial.me.friends[id];if(!f){go('friends');return}const L=await SSocial.chat(id);if(tok!==routeToken)return;
  const live=SSocial.isLive(id),p=f.p||{};
  v.className='chatv';v.innerHTML=`<div class="chat-h"><a class="icon-btn" href="#friend-${f.id}" aria-label="Back">${I('chevDown')}</a>${avatar(f.name,f.id,38)}<div class="grow"><b>${esc(f.name)}</b><small id="chst">${f.typing&&Date.now()-f.typing<4500?'typing…':live?'Connected directly':p.active?'Online':p.at?'Active '+ago(p.at):'Messages wait for them to come online'}</small></div></div>
  <div class="chat-list" id="chl">${L.length?'':`<div class="chat-empty">${avatar(f.name,f.id,72)}<b>Say hi to ${esc(f.name)}</b><p class="small mut">Messages are end-to-end encrypted between your two devices. Nothing is stored on a server, so they live only on your phones.</p></div>`}${L.map((m,i)=>{const day=chatFmtDay(m.at);const prev=L[i-1];return(!prev||chatFmtDay(prev.at)!==day?`<div class="chat-day">${day}</div>`:'')+bubble(m)}).join('')}</div>
  <div class="chat-in"><button class="icon-btn" id="chimg" aria-label="Send a photo">${I('image')}</button><button class="icon-btn" id="chsong" aria-label="Send a song">${I('music')}</button><textarea id="cht" rows="1" placeholder="Message" maxlength="4000"></textarea><button class="icon-btn" id="chmic" aria-label="Hold to record a voice note">${I('mic')}</button><button class="icon-btn hide" id="chsend" aria-label="Send">${I('send')}</button><input type="file" id="chfile" accept="image/*" hidden></div>
  <div class="chat-rec hide" id="chrec"><span class="rec-dot"></span><b id="chrt">0:00</b><span class="grow small mut" id="chrh">Release to send · slide away to cancel</span><button class="pill sm ghost" id="chrx">Cancel</button><button class="pill sm" id="chrs">Send</button></div>`;
  const list=$('#chl');list.scrollTop=list.scrollHeight;SSocial.markRead(id);
  const ta=$('#cht'),sendB=$('#chsend'),mic=$('#chmic');
  const sync=()=>{const has=ta.value.trim().length>0;sendB.classList.toggle('hide',!has);mic.classList.toggle('hide',has);ta.style.height='auto';ta.style.height=Math.min(140,ta.scrollHeight)+'px'};
  ta.oninput=()=>{sync();SSocial.typing(id)};
  const sendText=()=>{const t=ta.value.trim();if(!t)return;ta.value='';sync();SSocial.sendMsg(id,{kind:'text',text:t})};
  sendB.onclick=sendText;ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!matchMedia('(pointer:coarse)').matches){e.preventDefault();sendText()}};
  $('#chimg').onclick=()=>$('#chfile').click();
  $('#chfile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{const data=await shrinkImage(file);SSocial.sendMsg(id,{kind:'image',data,mime:'image/jpeg',name:file.name||'photo.jpg'})}catch(x){alert('That photo couldn’t be opened.')}};
  $('#chsong').onclick=()=>songPicker(t=>SSocial.sendMsg(id,{kind:'song',track:t}));
  // voice notes: hold the mic (or tap it, then Send) — recorded on this device, sent as a small Opus/AAC file
  let rec=null;const recUI=on=>{$('#chrec').classList.toggle('hide',!on);$('.chat-in',v).classList.toggle('hide',on)};
  const startRec=async()=>{if(rec)return;let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})}catch(x){alert('Microphone access is needed to record a voice note.');return}
    const mt=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t))||'';
    const mr=new MediaRecorder(stream,mt?{mimeType:mt,audioBitsPerSecond:32000}:{audioBitsPerSecond:32000});const chunks=[];const t0=Date.now();rec={mr,stream,chunks,t0,cancel:false};
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(SR){try{const sr=new SR();sr.continuous=true;sr.interimResults=false;sr.lang=navigator.language||'en-US';rec.said=[];sr.onresult=ev=>{for(let k=ev.resultIndex;k<ev.results.length;k++)if(ev.results[k].isFinal)rec.said.push(ev.results[k][0].transcript.trim())};sr.onerror=()=>{};sr.start();rec.sr=sr}catch(x){}}
    mr.ondataavailable=e=>e.data.size&&chunks.push(e.data);mr.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const r=rec;rec=null;recUI(false);clearInterval(r.iv);if(r.cancel)return;const dur=(Date.now()-r.t0)/1000;if(dur<.6)return;
      const blob=new Blob(chunks,{type:mr.mimeType||mt||'audio/webm'});const data=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(blob)});if(r.sr){try{r.sr.stop()}catch(x){}await sleep(700)}const said=(r.said||[]).join(' ').replace(/\s+/g,' ').trim();SSocial.sendMsg(id,{kind:'voice',data,mime:blob.type,dur,text:said})};
    mr.start(250);recUI(true);rec.iv=setInterval(()=>{const s=(Date.now()-t0)/1000;const el=$('#chrt');if(el)el.textContent=fmt(s);if(s>=120&&rec)rec.mr.stop()},200)};
  const stopRec=cancel=>{if(!rec)return;rec.cancel=!!cancel;if(cancel&&rec.sr)try{rec.sr.abort()}catch(x){}try{rec.mr.stop()}catch(x){}};
  let holdT=0,held=false,sx=0;mic.onpointerdown=e=>{e.preventDefault();sx=e.clientX;held=false;holdT=setTimeout(()=>{held=true;startRec()},220)};
  mic.onpointerup=()=>{clearTimeout(holdT);if(held){stopRec(false)}else startRec()};mic.onpointerleave=e=>{if(held&&rec&&Math.abs(e.clientX-sx)>60)stopRec(true)};mic.oncontextmenu=e=>e.preventDefault();
  $('#chrx').onclick=()=>stopRec(true);$('#chrs').onclick=()=>stopRec(false);
  // voice note playback
  let vAudio=null,vId=null;const vplay=m=>{if(vAudio&&vId===m.id){vAudio.paused?vAudio.play():vAudio.pause();return}if(vAudio){vAudio.pause()}if(eng.playing)eng.pause();vAudio=new Audio(m.data);vId=m.id;const box=$(`[data-vn="${m.id}"]`,v);
    const ui=()=>{const b=box&&box.isConnected?box:$(`[data-vn="${m.id}"]`,v);if(!b)return;$('i',$('.cm-vbar',b)).style.width=(vAudio.duration&&isFinite(vAudio.duration)?vAudio.currentTime/vAudio.duration*100:0)+'%';$('[data-vplay]',b).innerHTML=I(vAudio.paused?'play':'pause')};
    vAudio.ontimeupdate=ui;vAudio.onplay=ui;vAudio.onpause=ui;vAudio.onended=()=>{ui();vId=null};vAudio.play().catch(()=>{})};
  // hold (touch) or right-click (mouse) a message for its options
  const menuFor=async mid=>{const L2=await SSocial.chat(id);const m=L2.find(x=>x.id===mid);if(!m)return;const o=(ic,l,a)=>`<div class="opt" role="button" tabindex="0" data-cma="${a}">${I(ic)}<div class="grow">${l}</div></div>`;
    openSheet(`<div class="sheet-h"><div><b>${m.kind==='text'?'Message':m.kind==='image'?'Photo':m.kind==='voice'?'Voice note':'Song'}</b><small>${m.me?'You':esc(f.name)} · ${chatFmtDay(m.at)} ${chatTime(m.at)}</small></div></div>
      ${m.kind==='text'||m.text?o('copy','Copy text','copy'):''}${m.kind==='image'?o('download','Save photo','save')+o('eye','View full size','view'):''}${m.kind==='voice'?o('play','Play','vplay')+o('download','Download voice note','save'):''}${m.kind==='song'?o('play','Play','play')+o('queue','Play next','qnext')+o('heart','Add to Liked Songs','like'):''}
      ${m.me&&m.state==='failed'?o('send','Try sending again','retry'):''}${o('share','Forward to another friend','fwd')}${o('trash','Delete for me','del')}${m.me?o('close','Unsend for everyone','unsend'):''}`);
    $('#sheet').onclick=async e=>{const a=e.target.closest('[data-cma]');if(!a)return;const k=a.dataset.cma;closeSheet();
      if(k==='copy')navigator.clipboard&&navigator.clipboard.writeText(m.text).catch(()=>{});
      if(k==='save')dlData(m.data,(m.kind==='voice'?'voice-note-':'photo-')+new Date(m.at).toISOString().slice(0,19).replace(/[:T]/g,'-')+'.'+chatExt(m.mime));
      if(k==='view')viewImage(m.data);if(k==='vplay')vplay(m);
      if(k==='play'){playList([m.track],0,'From '+(m.me?'you':f.name));openNP()}if(k==='qnext'){Q.list.splice(Q.i+1,0,m.track);saveQueue()}if(k==='like'){Store.likes[m.track.id]={...m.track,likedAt:Date.now()};Store.save('likes')}
      if(k==='retry'){await SSocial.deleteMsg(id,m.id);const{kind,text,data,mime,dur,name,track}=m;SSocial.sendMsg(id,{kind,text,data,mime,dur,name,track})}
      if(k==='fwd')friendPicker(fid=>{const{kind,text,data,mime,dur,name,track}=m;SSocial.sendMsg(fid,{kind,text,data,mime,dur,name,track})},id);
      if(k==='del')SSocial.deleteMsg(id,m.id,false);if(k==='unsend')SSocial.deleteMsg(id,m.id,true)}};
  let lp=0,lpMoved=false;list.addEventListener('pointerdown',e=>{const b=e.target.closest('.cm');if(!b||e.pointerType==='mouse')return;lpMoved=false;const x0=e.clientX,y0=e.clientY;clearTimeout(lp);lp=setTimeout(()=>{if(!lpMoved){navigator.vibrate&&navigator.vibrate(12);b.classList.add('held');setTimeout(()=>b.classList.remove('held'),300);menuFor(b.dataset.mid)}},480);
    const mv=ev=>{if(Math.hypot(ev.clientX-x0,ev.clientY-y0)>10){lpMoved=true;clearTimeout(lp)}};const up=()=>{clearTimeout(lp);list.removeEventListener('pointermove',mv);list.removeEventListener('pointerup',up);list.removeEventListener('pointercancel',up)};
    list.addEventListener('pointermove',mv);list.addEventListener('pointerup',up);list.addEventListener('pointercancel',up)});
  list.addEventListener('contextmenu',e=>{const b=e.target.closest('.cm');if(!b)return;e.preventDefault();menuFor(b.dataset.mid)});
  list.addEventListener('click',async e=>{const tx=e.target.closest('[data-vtx]');if(tx){const mid=tx.dataset.vtx;const m=(await SSocial.chat(id)).find(x=>x.id===mid);if(!m)return;const open=!m.txOpen;
      await SSocial.patchMsg(id,mid,{txOpen:open});rebubble(mid);if(open&&!m.text&&!m.txDone){await SSocial.patchMsg(id,mid,{txBusy:true});rebubble(mid);let text='';
        try{const ab=await (await fetch(m.data)).arrayBuffer();const AC=window.OfflineAudioContext||window.webkitOfflineAudioContext;const buf=await new AC(1,16000,16000).decodeAudioData(ab);const parts=[];for(let s0=0;s0<buf.duration;s0+=29){const w=await SLyrics.transcribe(buf,s0,30).catch(()=>[]);parts.push(w.map(x=>x.w).join(' '))}text=parts.join(' ').replace(/\s+/g,' ').trim()}catch(x){}
        await SSocial.patchMsg(id,mid,{text,txBusy:false,txDone:true});rebubble(mid)}return}
    const vp=e.target.closest('[data-vplay]');if(vp){const mid=vp.closest('[data-vn]').dataset.vn;const m=(await SSocial.chat(id)).find(x=>x.id===mid);if(m)vplay(m);return}
    const sg=e.target.closest('[data-csong]');if(sg){const m=(await SSocial.chat(id)).find(x=>x.id===sg.dataset.csong);if(m){playList([m.track],0,'From '+(m.me?'you':f.name));openNP()}return}
    const im=e.target.closest('.cm-img');if(im)viewImage(im.src)});
  const rebubble=async mid=>{const m=(await SSocial.chat(id)).find(x=>x.id===mid);const el=$(`.cm[data-mid="${mid}"]`,list);if(m&&el){const tmp=document.createElement('div');tmp.innerHTML=bubble(m);el.replaceWith(tmp.firstElementChild)}};
  // new messages arrive in place without rebuilding the page
  const off=SSocial.on(async()=>{if(!list.isConnected){off();if(vAudio)vAudio.pause();return}const L2=await SSocial.chat(id);const atEnd=list.scrollHeight-list.scrollTop-list.clientHeight<80;
    const have=new Set($$('.cm',list).map(b=>b.dataset.mid));const want=new Set(L2.map(m=>m.id));let changed=false;
    $$('.cm',list).forEach(b=>{if(!want.has(b.dataset.mid)){b.remove();changed=true}});
    for(const m of L2){const el=$(`.cm[data-mid="${m.id}"]`,list);if(!el){$('.chat-empty',list)?.remove();list.insertAdjacentHTML('beforeend',bubble(m));changed=true}else if(m.me){const meta=$('.cm-meta',el);const nw=bubble(m).match(/<small class="cm-meta">(.*?)<\/small>/)[1];if(meta.innerHTML!==nw)meta.innerHTML=nw}}
    if(changed&&atEnd)list.scrollTop=list.scrollHeight;if(location.hash==='#chat-'+id&&document.visibilityState==='visible')SSocial.markRead(id);
    const st=$('#chst');if(st)st.textContent=f.typing&&Date.now()-f.typing<4500?'typing…':SSocial.isLive(id)?'Connected directly':(f.p&&f.p.active)?'Online':'Messages wait for them to come online'})};
async function shrinkImage(file){const bmp=await createImageBitmap(file);let max=1440,q=.78,out='';for(let i=0;i<4;i++){const k=Math.min(1,max/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);out=c.toDataURL('image/jpeg',q);if(out.length<450000)break;max*=.78;q-=.08}return out}
function viewImage(src){const d=document.createElement('div');d.className='imgview';d.innerHTML=`<img src="${esc(src)}" alt=""><button class="icon-btn" aria-label="Close">${I('close')}</button>`;d.onclick=()=>d.remove();document.body.appendChild(d)}
function songPicker(cb){const seen=new Set();const pool=[cur,...Store.history.slice().reverse().map(h=>h.track),...Object.values(Store.likes)].filter(t=>t&&!seen.has(t.id)&&seen.add(t.id)).slice(0,30);
  openSheet(`<div class="sheet-h"><div><b>Send a song</b></div></div><input class="field" id="spq" placeholder="Search for a song"><div id="spl">${pool.map(t=>`<div class="opt" role="button" tabindex="0" data-spi="${esc(t.id)}"><img class="opt-art" src="${esc(t.art||'')}" alt=""><div class="grow"><b class="ell">${esc(t.title)}</b><small class="ell">${esc(t.artist||'')}</small></div></div>`).join('')}</div>`);
  const map=new Map(pool.map(t=>[String(t.id),t]));let qT=0;$('#spq').oninput=e=>{clearTimeout(qT);const q=e.target.value.trim();if(!q)return;qT=setTimeout(async()=>{const r=await API.search(q,{limit:12}).catch(()=>[]);r.forEach(t=>map.set(String(t.id),t));const el=$('#spl');if(el)el.innerHTML=r.map(t=>`<div class="opt" role="button" tabindex="0" data-spi="${esc(t.id)}"><img class="opt-art" src="${esc(t.art||'')}" alt=""><div class="grow"><b class="ell">${esc(t.title)}</b><small class="ell">${esc(t.artist||'')}</small></div></div>`).join('')},350)};
  $('#sheet').onclick=e=>{const o=e.target.closest('[data-spi]');if(!o)return;const t=map.get(o.dataset.spi);closeSheet();if(t)cb(t)}}
function friendPicker(cb,except){const fr=Object.values(SSocial.me.friends).filter(f=>f.id!==except);if(!fr.length){alert('Add another friend first.');return}
  openSheet(`<div class="sheet-h"><div><b>Forward to</b></div></div>${fr.map(f=>`<div class="opt" role="button" tabindex="0" data-fpk="${f.id}">${avatar(f.name,f.id,32)}<div class="grow">${esc(f.name)}</div></div>`).join('')}`);
  $('#sheet').onclick=e=>{const o=e.target.closest('[data-fpk]');if(!o)return;closeSheet();cb(o.dataset.fpk)}}
V.friend=(v,id)=>{const f=SSocial.me.friends[id];if(!f){go('friends');return}SSocial.requestPlaylists(id);const p=f.p||{};const live=SSocial.isLive(id);
  v.innerHTML=`<div class="coll-h">${avatar(f.name,f.id,120,!!(p.story||p.year))}<div class="grow"><span class="kicker">${live?'<span class="live-dot"></span>Active now':p.at?'Active '+ago(p.at):'Friend'}</span><h1>${esc(f.name)}${p.pro?' <span class="pro-b" title="Premium supporter">✦</span>':''}</h1>
  <div class="row"><button class="pill" onclick="location.hash='#chat-${f.id}'">${I('chat')} Message</button>${p.story||p.year?`<button class="pill ghost" data-story="${f.id}">${I('spark')} ${p.year?'Year in review':'Today’s recap'}</button>`:''}<button class="pill ghost" id="unf">Remove</button></div></div></div>
  ${p.now?`<h2 class="list-h">${p.active&&p.now.playing?'Listening now':'Last played'}</h2>${trackRows([p.now],{numbers:false,ctx:'With '+f.name})}`:''}
  ${f.likes&&f.likes.length?`<h2 class="list-h">Liked songs <small class="mut">${f.likes.length}</small></h2><div class="row" style="gap:8px;margin-bottom:8px"><button class="pill sm" data-flikes="play">${I('play')} Play</button><button class="pill sm ghost" data-flikes="shuffle">${I('shuffle')} Shuffle</button><button class="pill sm ghost" data-flikes="save">${I('plus')} Save as playlist</button></div>${trackRows(f.likes.slice(0,12),{ctx:f.name+'’s liked songs'})}${f.likes.length>12?`<button class="pill sm ghost" data-flikes="all">See all ${f.likes.length}</button>`:''}`:''}
  ${f.follows&&f.follows.length?`<h2 class="list-h">Follows</h2><div class="chips">${f.follows.slice(0,30).map(a=>`<button class="chip" data-fart="${esc(a.name)}" data-fid="${esc(a.id||'')}">${esc(a.name)}</button>`).join('')}</div>`:''}
  <h2 class="list-h">Playlists</h2><div id="fpl">${f.playlists?(f.playlists.length?f.playlists.map((pl,i)=>`<div class="lib-row" data-fpl="${i}">${pl.tracks[0]?.art?`<img src="${esc(pl.tracks[0].art)}">`:`<span class="ph">${I('list')}</span>`}<div class="grow"><b class="ell">${esc(pl.name)}</b><small>${pl.saved?'Saved · ':''}${pl.tracks.length} songs${f.plAt?' · updated '+ago(f.plAt):''}</small></div><button class="pill sm ghost" data-save="${i}">Save</button></div>`).join(''):emptyState('No shared playlists','They haven’t shared any yet.','list')):live?skeleton(3,'rows'):emptyState('Playlists appear when you’re both online','They load directly from their device.','friends')}</div>`;
  $('#unf').onclick=()=>{const b=$('#unf');if(b.dataset.sure){SSocial.remove(id);go('friends')}else{b.dataset.sure=1;b.textContent='Tap again to remove'}};
  v.onclick=e=>{const s=e.target.closest('[data-save]');if(s){e.stopPropagation();const pl=f.playlists[+s.dataset.save];newPlaylist(pl.name,pl.tracks).from=f.name;Store.save('playlists');refreshSide();s.textContent='Saved';s.disabled=true;return}
    const r=e.target.closest('[data-fpl]');if(r){const pl=f.playlists[+r.dataset.fpl];playList(pl.tracks,0,pl.name+' · '+f.name);openNP()}
    const fl=e.target.closest('[data-flikes]');if(fl){const k=fl.dataset.flikes,L=f.likes||[];if(k==='play'){playList(L,0,f.name+'’s liked songs');openNP()}if(k==='shuffle'){playList(shuffleMix(L),0,f.name+'’s liked songs');openNP()}
      if(k==='save'){newPlaylist(f.name+'’s liked songs',L).from=f.name;Store.save('playlists');refreshSide();fl.textContent='Saved';fl.disabled=true}if(k==='all'){fl.insertAdjacentHTML('beforebegin',trackRows(L.slice(12),{ctx:f.name+'’s liked songs'}));fl.remove()}}
    const fa=e.target.closest('[data-fart]');if(fa)openArtist(fa.dataset.fart,fa.dataset.fid)}};
// a friend's page fills itself in the moment their device answers (playlists, liked songs, follows)
let fpSeen={};SSocial.on(()=>{if(!location.hash.startsWith('#friend-'))return;const id=location.hash.slice(8),f=SSocial.me.friends[id];if(!f)return;const live=SSocial.isLive(id);
  if(live&&(!f.plAt||Date.now()-f.plAt>6e4)&&Date.now()-(fpSeen.req||0)>8000){fpSeen.req=Date.now();SSocial.requestPlaylists&&SSocial.requestPlaylists(id)}
  const sig=x=>x?x.length+':'+(x[0]&&(x[0].id||x[0].name)||''):'-';const key=id+'|'+live+'|'+sig(f.likes)+'|'+sig(f.follows)+'|'+sig(f.playlists)+'|'+(f.playlists||[]).reduce((n,p)=>n+(p.tracks||[]).length,0);if(fpSeen.key&&fpSeen.key!==key&&$('#fpl')){fpSeen.key=key;curDone=false;route()}else fpSeen.key=key});

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
/* ---------- Wrapped ----------
   Not just minutes: when you listen, how you listen, what you skip, how your taste moved, what you discovered and when. */
function wrapData(range){const now=Date.now(),y=new Date().getFullYear();const from=range==='month'?now-30*864e5:range==='year'?new Date(y,0,1).getTime():0;
  const H=Store.history.filter(h=>h.at>=from&&!h.imported&&h.track);if(H.length<5)return null;
  const ak=t=>String(t.artist||'').split(/,|&| feat/i)[0].trim(),dur=h=>(h.track.durationMs||0),frac=h=>h.full?1:dur(h)?Math.min(1,(h.ms||0)/dur(h)):Math.min(1,(h.ms||0)/180000);
  const ms=H.reduce((a,h)=>a+(h.ms||0),0),mins=Math.round(ms/6e4);
  const by=(f,w=h=>h.ms||0)=>{const m=new Map();for(const h of H){const k=f(h);if(k==null)continue;const o=m.get(k)||{k,v:0,n:0,h};o.v+=w(h);o.n++;m.set(k,o)}return[...m.values()].sort((a,b)=>b.v-a.v)};
  const songs=by(h=>h.track.id,()=>1),artists=by(h=>ak(h.track)),genres=by(h=>h.track.genre||null);
  // when
  const hours=Array(24).fill(0),wd=Array(7).fill(0);for(const h of H){const d=new Date(h.at);hours[d.getHours()]+=h.ms||0;wd[d.getDay()]+=h.ms||0}
  const peak=hours.indexOf(Math.max(...hours)),night=Math.round((hours.slice(0,5).reduce((a,b)=>a+b,0))/Math.max(1,ms)*100),wkend=Math.round((wd[0]+wd[6])/Math.max(1,ms)*100);
  const dayKeys=[...new Set(H.map(h=>new Date(h.at).toDateString()))].map(d=>new Date(d).getTime()).sort((a,b)=>a-b);let streak=1,best=1;for(let k=1;k<dayKeys.length;k++){streak=Math.round((dayKeys[k]-dayKeys[k-1])/864e5)===1?streak+1:1;best=Math.max(best,streak)}
  // sessions: plays less than 20 minutes apart belong together
  const ses=[];for(const h of H){const l=ses[ses.length-1];if(l&&h.at-l.end<12e5){l.end=h.at+(h.ms||0);l.ms+=h.ms||0;l.n++}else ses.push({start:h.at,end:h.at+(h.ms||0),ms:h.ms||0,n:1})}const longest=ses.sort((a,b)=>b.ms-a.ms)[0];
  // how
  const skips=H.filter(h=>frac(h)<.3&&(h.ms||0)<45000),skipRate=Math.round(skips.length/H.length*100);
  const skipBy=by(h=>frac(h)<.3&&(h.ms||0)<45000?ak(h.track):null,()=>1).filter(x=>x.n>=3);const playsBy=new Map(by(h=>ak(h.track),()=>1).map(x=>[x.k,x.n]));
  const mostSkipped=skipBy.map(x=>({...x,r:x.n/(playsBy.get(x.k)||1)})).sort((a,b)=>b.r-a.r)[0];
  const finishers=by(h=>h.track.id,h=>frac(h)>.9?1:0).filter(x=>x.n>=3&&x.v===x.n).length;
  const once=songs.filter(x=>x.n===1).length,onceP=Math.round(once/Math.max(1,songs.length)*100);
  // obsession: the most plays of one song in one day, and the longest run of the same song back to back
  const perDay=by(h=>h.track.id+'|'+new Date(h.at).toDateString(),()=>1)[0];let run=1,bestRun={n:1,h:H[0]};for(let k=1;k<H.length;k++){run=H[k].track.id===H[k-1].track.id?run+1:1;if(run>bestRun.n)bestRun={n:run,h:H[k]}}
  // discovery: artists heard for the first time in this period, and when the top artist was first played
  const firstEver=new Map();for(const h of Store.history){const k=ak(h.track);if(!firstEver.has(k))firstEver.set(k,h.at)}
  const newArts=[...firstEver.entries()].filter(([,at])=>at>=from).length,top=artists[0];const met=top?firstEver.get(top.k):0;
  const monthNew={};for(const[k,at]of firstEver)if(at>=from){const m=new Date(at).toLocaleString(undefined,{month:'short'});monthNew[m]=(monthNew[m]||0)+1}
  // era: how old the music is
  const yrs=H.map(h=>+String(h.track.release||'').slice(0,4)).filter(x=>x>1900);const avgYear=yrs.length?Math.round(yrs.reduce((a,b)=>a+b,0)/yrs.length):0;
  const decades=by(h=>{const yy=+String(h.track.release||'').slice(0,4);return yy>1900?Math.floor(yy/10)*10+'s':null});
  // drift: the top genre at the start of the period against the end
  const half=H[Math.floor(H.length/2)].at;const g1=by(h=>h.at<half?h.track.genre||null:null)[0],g2=by(h=>h.at>=half?h.track.genre||null:null)[0];
  const share=top?Math.round(top.v/Math.max(1,ms)*100):0;
  const persona=onceP>65&&newArts>20?['The Explorer','You treat every week like a new city — two out of three songs you only needed once.']:share>25?['The Devotee',`One artist owns ${share}% of your listening. That’s loyalty.`]:night>22?['The Night Shift',`${night}% of your music happens between midnight and 5am.`]:skipRate<12?['The Finisher','You rarely skip. When you press play, you mean it.']:bestRun.n>=5?['The Replayer',`You once played the same song ${bestRun.n} times in a row.`]:['The Curator','A little of everything, chosen carefully.'];
  return{H,mins,plays:H.length,songs,artists,genres,hours,wd,peak,night,wkend,days:dayKeys.length,best,longest,skipRate,mostSkipped,finishers,onceP,perDay,bestRun,newArts,met,top,monthNew,avgYear,decades,g1,g2,share,persona,sessions:ses.length}}
V.wrapped=(v,arg)=>{const range=arg||'year';const d=wrapData(range);const tabs=`<div class="wr-tabs">${[['month','Last 30 days'],['year','This year'],['all','All time']].map(([k,l])=>`<a class="pill sm ${k===range?'':'ghost'}" href="#wrapped-${k}">${l}</a>`).join('')}</div>`;
  if(!d){v.innerHTML=`<h1>Wrapped</h1>${tabs}`+emptyState('Not enough listening yet','Play a few more songs and this fills itself in — minutes, habits, discoveries and more.','spark');return}
  const hr=h=>new Date(2000,0,1,h).toLocaleTimeString(undefined,{hour:'numeric'});const art=t=>esc(t.art||SData.placeholderArt(t.title));const mx=Math.max(...d.hours,1),wmx=Math.max(...d.wd,1);const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const card=(k,big,sub,extra='')=>`<div class="wr-c"><span class="wr-k">${k}</span>${big?`<div class="wr-big">${big}</div>`:''}${sub?`<p>${sub}</p>`:''}${extra}</div>`;
  const ts=d.songs.slice(0,5).map(x=>x.h.track),ta=d.artists.slice(0,5);
  v.innerHTML=`<div class="wr"><h1>Wrapped</h1>${tabs}
   <div class="wr-hero"><span class="wr-k">You are</span><div class="wr-big">${d.persona[0]}</div><p>${d.persona[1]}</p></div>
   <div class="wr-g">${card('Listening',Intl.NumberFormat().format(d.mins)+'<small> min</small>',`${Intl.NumberFormat().format(d.plays)} plays · ${d.songs.length} songs · ${d.artists.length} artists`)}
   ${card('Most days in a row',d.best+'<small> days</small>',`You listened on ${d.days} different days`)}</div>
   <div class="wr-c"><span class="wr-k">Your top songs</span>${ts.map((t,i)=>`<div class="wr-row" data-wrp="${i}"><b>${i+1}</b><img src="${art(t)}" alt=""><div class="grow"><b class="ell">${esc(t.title)}</b><small class="ell">${esc(t.artist)} · ${d.songs[i].n} plays</small></div></div>`).join('')}<button class="pill sm" data-wrall>${I('play')} Play all five</button></div>
   <div class="wr-c"><span class="wr-k">Your top artists</span>${ta.map((a,i)=>`<div class="wr-row"><b>${i+1}</b><div class="grow"><b class="ell">${esc(a.k)}</b><small>${Math.round(a.v/6e4)} min · ${a.n} plays</small></div></div>`).join('')}${d.met&&d.top?`<p class="small mut">You first played ${esc(d.top.k)} on ${new Date(d.met).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})}. They’re ${d.share}% of everything you’ve heard since.</p>`:''}</div>
   <div class="wr-c"><span class="wr-k">Your clock</span><div class="wr-clock">${d.hours.map((v2,h)=>`<i style="height:${Math.max(3,v2/mx*100)}%" title="${hr(h)}" class="${h===d.peak?'pk':''}"></i>`).join('')}</div><div class="wr-ax"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div><p>Your music peaks around <b>${hr(d.peak)}</b>. ${d.night>8?`${d.night}% of it happens after midnight.`:'You’re mostly a daytime listener.'}</p>
     <div class="wr-wd">${d.wd.map((v2,k)=>`<div><i style="height:${Math.max(4,v2/wmx*100)}%"></i><small>${days[k]}</small></div>`).join('')}</div><p class="small mut">${d.wkend>40?'Weekends are when you really listen.':`${100-d.wkend}% of your listening is on weekdays.`}</p></div>
   <div class="wr-g">${d.bestRun.n>=3?card('Stuck on repeat',d.bestRun.n+'<small>× in a row</small>',`${esc(d.bestRun.h.track.title)} — ${esc(d.bestRun.h.track.artist)}`):''}${d.perDay&&d.perDay.v>=4?card('Your biggest day for one song',d.perDay.v+'<small> plays</small>',`${esc(d.perDay.h.track.title)} on ${new Date(d.perDay.h.at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}`):''}
   ${d.longest?card('Longest session',Math.round(d.longest.ms/6e4)+'<small> min</small>',`${d.longest.n} songs, starting ${new Date(d.longest.start).toLocaleString(undefined,{weekday:'long',hour:'numeric',minute:'2-digit'})}`):''}
   ${card('Skip rate',d.skipRate+'<small>%</small>',d.mostSkipped?`You keep giving ${esc(d.mostSkipped.k)} chances — and skipping ${Math.round(d.mostSkipped.r*100)}% of the time.`:d.finishers?`${d.finishers} songs you have never once skipped.`:'')}</div>
   <div class="wr-g">${card('New to you',d.newArts+'<small> artists</small>',Object.keys(d.monthNew).length>1?`Most discoveries in ${Object.entries(d.monthNew).sort((a,b)=>b[1]-a[1])[0][0]}`:'Discovered in this period')}
   ${card('One and done',d.onceP+'<small>%</small>','of the songs you played, you only needed once')}
   ${d.avgYear?card('Your music’s age',(new Date().getFullYear()-d.avgYear)+'<small> years</small>',`Average release year ${d.avgYear}${d.decades[0]?` · mostly the ${esc(d.decades[0].k)}`:''}`):''}
   ${d.g1&&d.g2&&d.g1.k!==d.g2.k?card('How your taste moved','',`You started with <b>${esc(d.g1.k)}</b> and ended up in <b>${esc(d.g2.k)}</b>.`):d.genres[0]?card('Your sound','',`<b>${esc(d.genres[0].k)}</b>${d.genres[1]?`, then ${esc(d.genres[1].k)}`:''}${d.genres[2]?` and ${esc(d.genres[2].k)}`:''}.`):''}</div>
   <div class="wr-c" id="wrnext"><span class="wr-k">Next, you’ll probably love</span><div class="spin-c sm"><span class="spinner"></span></div></div>
   <button class="pill ghost" data-wrstory>${I('spark')} Open as a story</button></div>`;
  v.onclick=e=>{const r=e.target.closest('[data-wrp]');if(r){playList(ts,+r.dataset.wrp,'Your top songs');openNP()}if(e.target.closest('[data-wrall]')){playList(ts,0,'Your top songs');openNP()}if(e.target.closest('[data-wrstory]')){const st=myYearStory(true)||myDayStory();if(st)openStory(st,SSocial.me.name||'Your')}};
  // three artists close to your favourites that you haven't played yet
  (async()=>{const el=$('#wrnext');if(!el)return;const have=new Set(d.artists.map(a=>artistKey(a.k)));let out=[];try{for(const a of d.artists.slice(0,3)){const n=await nearArtists(a.k,[...have]);for(const x of n)if(!have.has(artistKey(x.name))&&!out.some(o=>o.name===x.name))out.push(x);if(out.length>=6)break}}catch(e){}
    if(!el.isConnected)return;el.innerHTML=`<span class="wr-k">Next, you’ll probably love</span>${out.length?`<div class="wr-next">${out.slice(0,6).map(x=>`<button class="wr-a" data-wrart="${esc(x.name)}">${x.art?`<img src="${esc(x.art)}" alt="">`:''}<b class="ell">${esc(x.name)}</b></button>`).join('')}</div>`:'<p class="small mut">Back online, this fills in with artists close to your favourites.</p>'}`;
    el.onclick=e=>{const b=e.target.closest('[data-wrart]');if(b)openArtist(b.dataset.wrart)}})()};
const PLANS=[{id:'monthly',name:'Monthly',price:'$3.99',per:'/month',sub:'Cancel any time'},{id:'yearly',name:'Yearly',price:'$29.99',per:'/year',sub:'$2.50 a month · save 37%',best:true},{id:'lifetime',name:'Lifetime',price:'$69',per:' once',sub:'Pay once, keep it forever'}];
const PERKS=[['play','Full songs, automatically','Every song starts in full — no choosing a source each time.'],['download','Unlimited downloads',`Free keeps ${FREE_CACHE_LIMIT}. Premium keeps your whole library offline.`],['video','4K & 1440p lyric videos','Export at the sizes TikTok, Reels and YouTube look sharpest at.'],['studio','Studio-grade exports','24-bit and 32-bit float WAV, and both stems in one pack.'],['vault','Deeper vaults','Also digs through collaborators’ catalogs for the rare stuff.'],['spark','Year in review, any day','Plus HD share cards whenever you want them.'],['star','Premium colours','Six extra accents, or pick any colour you like.'],['crown','Supporter badge','Friends see the ✦ next to your name.']];
V.premium=async v=>{await SL.ready;const L=SL.state;let sel=V.premium.sel||'yearly';
  const ends=L.exp?new Date(L.exp).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'}):'';
  const rows=[['Full-length songs','Choose per song','Automatic'],['Downloads',`Up to ${FREE_CACHE_LIMIT}`,'Unlimited'],['Lyric videos','Up to 1080p','Up to 4K'],['Export quality','16-bit WAV, AIFF, Opus, AAC','+ 24-bit & 32-bit float'],['Stems','One at a time','Both in one pack'],['Vault','Every artist','+ collaborators’ catalogs'],['Year in review','Every New Year','Any day + HD cards'],['Colours','6 accents','12 + any colour'],['Ads from sniplit','None','None']];
  v.innerHTML=`<div class="prem2"><div class="prem-hero"><div class="prem-glow"></div><span class="kicker">${I('crown')} sniplit Premium</span><h1>${L.ok?'You’re Premium.':'Hear everything.<br>Keep everything.'}</h1>
    <p>${L.ok?(L.plan==='trial'?`Your free year runs until ${ends}. Renew it any time.`:L.exp?`Your ${esc(L.plan)} plan renews on ${ends}.`:'Lifetime — thank you for backing sniplit.'):'Every feature stays free. Premium takes the limits off and helps keep sniplit independent — no account, no tracking, no ads.'}</p></div>
    <div class="perks">${PERKS.map(([ic,t,d])=>`<div class="perk">${I(ic)}<b>${t}</b><small>${d}</small></div>`).join('')}</div>
    ${L.ok&&L.plan==='trial'?`<div class="card trial-c"><div class="grow"><b>Free year · until ${ends}</b><small>Renew any time to start a fresh year from today.</small></div><button class="pill" id="ptrial">${I('refresh')} Renew</button></div>`:''}
    ${L.ok?'':`<h2 class="list-h">Choose a plan</h2><div class="plans">${PLANS.map(p=>`<button class="plan ${p.id===sel?'on':''}" data-plan="${p.id}">${p.best?'<em>Best value</em>':''}<b>${p.name}</b><span class="price">${p.price}<small>${p.per}</small></span><small>${p.sub}</small></button>`).join('')}</div>
    <button class="pill big" id="pcheck">Continue with ${PLANS.find(p=>p.id===sel).name}</button><button class="pill ghost" id="ptrial">Start a free year of Premium</button><p class="small mut" id="pmsg"></p>`}
    <div class="card sec cmp"><div class="cmp-r head"><span></span><span>Free</span><span>Premium</span></div>${rows.map(r=>`<div class="cmp-r"><b>${r[0]}</b><span>${r[1]}</span><span>${r[2]}</span></div>`).join('')}</div>
    <div class="card"><h3>Have a code?</h3><p class="small mut">Gift and purchase codes are tied to your sniplit ID (<code>${esc(SSocial.me.id)}</code>).</p><div class="row"><input class="field grow" id="pcode" placeholder="Paste your code" autocomplete="off" spellcheck="false"><button class="pill" id="predeem">Redeem</button></div><p class="small" id="prmsg"></p></div>
    <p class="small mut">Premium is tied to your sniplit ID, not this device. To bring it to a new phone, copy your recovery key from Settings → Profile and restore it there.</p></div>`;
  window.SAnalytics&&SAnalytics.track('premium_view');
  v.onclick=async e=>{const pl=e.target.closest('[data-plan]');if(pl){V.premium.sel=pl.dataset.plan;$$('.plan',v).forEach(b=>b.classList.toggle('on',b===pl));$('#pcheck').textContent='Continue with '+PLANS.find(p=>p.id===pl.dataset.plan).name;return}
    if(e.target.closest('#pcheck'))return checkoutSheet(PLANS.find(p=>p.id===(V.premium.sel||'yearly')));
    if(e.target.closest('#ptrial')){const m=$('#pmsg');if(m)m.textContent='Starting your free year…';try{await SL.trial();renderShell();applyLayout();route()}catch(x){if(m)m.textContent=x.message}return}
    if(e.target.closest('#predeem')){const m=$('#prmsg');const r=await SL.redeem($('#pcode').value);if(r.ok){renderShell();applyLayout();route()}else m.textContent=r.reason==='expired'?'That code has expired.':r.reason}}};
function checkoutSheet(plan){window.SAnalytics&&SAnalytics.track('checkout_view',{k:plan.id});
  openSheet(`<div class="sheet-h"><div><b>Checkout</b><small>sniplit Premium · ${plan.name}</small></div></div>
    <div class="co-sum"><div class="row"><span class="grow">${plan.name} plan</span><b>${plan.price}${plan.per}</b></div>${plan.id!=='lifetime'?`<div class="row small mut"><span class="grow">First 7 days</span><span>Free</span></div>`:''}<div class="row small mut"><span class="grow">Due today</span><b>${plan.id==='lifetime'?plan.price:'$0.00'}</b></div></div>
    <div class="co-pay">${[['Apple Pay','phone'],['Google Pay','phone'],['Card','crown'],['PayPal','link']].map(([n,ic])=>`<button class="co-m" data-paym="${n}">${I(ic)}<span>${n}</span></button>`).join('')}</div>
    <div class="co-soon" id="cosoon" hidden><b>Payments open soon</b><p class="small mut">sniplit isn’t taking payments yet, so nothing was charged. When checkout opens, Premium will be one tap from here — and it will stay tied to your sniplit ID, with no account to make.</p></div>
    <p class="small mut co-fine">Secure checkout by a payment provider. sniplit never sees your card. Cancel any time in two taps.</p>`);
  $('#sheet').onclick=e=>{const m=e.target.closest('[data-paym]');if(!m)return;$$('.co-m').forEach(b=>b.classList.toggle('on',b===m));const s=$('#cosoon');s.hidden=false;s.classList.add('pop')}}
/* choose a picture: a grid of generated characters, more on demand */
function avatarPicker(){const me=SSocial.me;let batch=0;const draw=()=>{const opts=[...Array(24)].map((_,i)=>'o'+batch+'_'+i);
    s.innerHTML=`${sheetH('Choose a picture')}<div class="avgrid">${opts.map(o=>`<button class="avopt ${SData.LS.get('avSeed','')===o?'on':''}" data-av="${o}" aria-label="Character ${o}"><img src="${SAvatars.url(String(me.id)+'#'+o,160)}" alt=""></button>`).join('')}</div>
      <div class="row" style="gap:8px;margin-top:14px"><button class="pill ghost" id="avmore">${I('refresh')} More characters</button><button class="pill ghost" id="avorig">My original</button></div>`;
    $('#avmore').onclick=()=>{batch++;draw()};$('#avorig').onclick=()=>{SData.LS.set('avSeed','');done()};$$('[data-av]',s).forEach(b=>b.onclick=()=>{SData.LS.set('avSeed',b.dataset.av);done()})};
  const done=()=>{closeSheet();renderShell();if(location.hash.startsWith('#preferences')||location.hash.startsWith('#friends')){curDone=false;route()}try{SSocial.update()}catch(e){}};
  const s=openSheet('');draw()}
V.preferences=(v,sec)=>{const s=Store.settings,me=SSocial.me;if(s.preciseSync===undefined)s.preciseSync=Lyr.precise();if(s.lyricDefs===undefined)s.lyricDefs=true;if(s.lyricTranslate===undefined)s.lyricTranslate=true;if(s.cleanLang===undefined)s.cleanLang=true;if(s.discordOn===undefined)s.discordOn=s.discord!==false;const tg=(k,l,d,obj='s')=>`<div class="set-row"><div>${l}${d?`<small>${d}</small>`:''}</div><button class="toggle ${(obj==='me'?me[k]:s[k])?'on':''}" data-${obj==='me'?'soc':'set'}="${k}" aria-label="${l}"></button></div>`;
  v.innerHTML=`<div class="coll-h small"><button class="av-roll" id="avroll" aria-label="New character" title="New character">${avatar(me.name||'You',me.id,64)}<i>${I('refresh')}</i></button><div class="grow"><h1>${esc(me.name||'Settings')}</h1><p class="mut">${Store.premium?'Premium':'Free'} · ${fmt(Store.stats.ms/1000)} listened · no account needed</p></div></div>
  <div class="grid2" style="align-items:start;margin-top:18px">
  <div class="card"><h3>Profile</h3><div class="set-row"><div class="row" style="gap:12px">${avatar(me.name||'You',me.id,44)}<div>Picture<small>Pick any character</small></div></div><button class="pill sm ghost" id="avpick">Choose</button></div>
   <label class="small mut">Name</label><input id="pfname" value="${esc(me.name||'')}" maxlength="40" aria-label="Your name" style="margin:6px 0 12px">
   <div class="set-row"><div>Your ID<small style="font-family:ui-monospace,Menlo,monospace">${esc(SSocial.uuid())}</small></div><button class="pill sm ghost" id="cpid">Copy recovery key</button></div>
   <div class="set-row"><div>Use sniplit on another device<small>Paste your recovery key there to keep the same ID</small></div><button class="pill sm ghost" id="rsid">Restore</button></div></div>
  <div class="card"><h3>Appearance</h3><div class="set-row"><div>Theme</div><div class="seg" style="min-width:210px">${['dark','light','system'].map(t=>`<button data-theme="${t}" class="${s.theme===t?'on':''}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div></div>
   <div class="set-row"><div>Accent</div><div class="swatches">${FREE_ACC.map(c=>`<button class="sw ${s.accent===c?'on':''}" style="background:${c}" data-acc="${c}" aria-label="Accent ${c}"></button>`).join('')}</div></div>
   <div class="set-row"><div>Premium colours<small>${Store.premium?'Or pick any colour':'Part of Premium'}</small></div><div class="swatches">${PRO_ACC.map(c=>`<button class="sw ${s.accent===c?'on':''} ${Store.premium?'':'locked'}" style="background:${c}" data-acc="${c}" aria-label="Accent ${c}"></button>`).join('')}<label class="sw any ${Store.premium?'':'locked'}" aria-label="Any colour"><input type="color" id="accany" value="${/^#[0-9a-f]{6}$/i.test(s.accent)?s.accent:'#ffffff'}" ${Store.premium?'':'disabled'}></label></div></div>
   <div class="set-row"><div>Layout<small>Auto picks phone, desktop or TV</small></div><select data-sel="layout" style="width:auto">${[['auto','Auto'],['mobile','Phone'],['desktop','Desktop'],['tv','TV']].map(([x,l])=>`<option value="${x}" ${s.layout===x?'selected':''}>${l}</option>`).join('')}</select></div>
   ${tg('reduceMotion','Reduce motion')}${tg('compact','Compact')}</div>
  <div class="card"><h3>Playback</h3><div class="set-row"><div>Crossfade<small>Blend one song into the next</small></div><select data-sel="xfade" style="width:auto">${[['0','Off'],['2','2 s'],['4','4 s'],['6','6 s'],['8','8 s'],['12','12 s']].map(([x,l])=>`<option value="${x}" ${String(s.xfade??4)===x?'selected':''}>${l}</option>`).join('')}</select></div>${tg('offlineStash','Save new picks for offline','Keeps about '+STASH_TARGET+' songs you haven’t heard ready, on Wi-Fi only ('+stashIds.size+' saved now)')}${tg('keepAwake','Keep awake while playing','Stops power-saving from cutting playback')}${tg('fxBackground','Studio effects in the background (iPhone)','Off keeps music playing when the phone locks')}${tg('autoFull','Full songs automatically','Premium · uses video sources when available')}${tg('explicit','Prefer explicit versions')}${tg('preciseSync','Check lyric timing by ear','Listens to the vocals to confirm where each line lands. Downloads a small speech model once.')}${tg('lyricDefs','Explain rare words','A short meaning floats above unusual words while they’re sung')}${tg('lyricTranslate','Translate other languages','Lines sung in another language show their English meaning above them')}</div>
  <div class="card"><h3>Notifications</h3>${(()=>{const n=Store.settings.notify||{};return`<div class="set-row"><div>Notify me<small>Silent and rare — only when sniplit isn’t open</small></div><button class="toggle ${n.on?'on':''}" data-notif="on" aria-label="Notifications"></button></div>${n.on?NOTE_KINDS.map(([k,l,d])=>`<div class="set-row"><div>${l}<small>${d}</small></div><button class="toggle ${n[k]!==false?'on':''}" data-notif="${k}" aria-label="${l}"></button></div>`).join(''):''}`})()}</div>
  <div class="card"><h3>Hidden artists</h3>${blkList().length?blkList().map(b=>`<div class="set-row"><div>${esc(b.name)}<small>Hidden ${ago(b.at)}</small></div><button class="pill sm ghost" data-unblock="${esc(b.k)}">Show again</button></div>`).join(''):'<p class="small mut">Use “Don’t show …” in any song’s ⋯ menu to keep an artist out of your feed.</p>'}</div>
  <div class="card"><h3>Privacy</h3>${tg('analytics','Anonymous usage counts','Which screens are opened and how many songs are played — no songs, names, searches or IP addresses. See the Privacy policy')}${tg('share','Share what I’m listening to','Friends see now playing and your daily recap','me')}${tg('cleanLang','Filter swearing','Hides swear words and slurs in messages, names, notes and word meanings')}${tg('shareLikes','Share liked songs','Friends can see and play your liked songs and the artists you follow','me')}${tg('sharePlaylists','Share my playlists with friends','Mark single playlists private from the playlist page','me')}${tg('discoverable','Show me in Find friends','Lists your name and a few favourite artists so people can add you','me')}</div>
  <div class="card" id="advanced"><h3>Advanced</h3><p class="small mut" style="margin:0 0 10px">Optional. Leave empty unless you run your own sniplit server.</p>
   <label class="small mut">sniplit server — TikTok publishing and Spotify / Apple Music / SoundCloud playlist links (optional, https://…)</label><input data-text="studioServer" aria-label="sniplit server address" autocomplete="off" inputmode="url" value="${esc(s.studioServer||'')}" placeholder="Not set — Share still works" style="margin:6px 0 12px">
   <label class="small mut">Friends relay (optional, wss://…)</label><input data-text="broker" aria-label="Friends relay address" autocomplete="off" value="${esc(s.broker||'')}" placeholder="Uses public relays by default" style="margin:6px 0 12px">
  </div>
  <div class="card"><h3>Discord</h3>${window.sniplitDesktop?`${tg('discordOn','Show what I’m playing on Discord','Appears as “Listening to …” on your profile')}<div class="set-row"><div>When this computer is idle, show<small>Link your phone as a friend, then pick it here</small></div><select data-sel="discordMirror" style="width:auto"><option value="">Nothing</option>${Object.values(me.friends).map(f=>`<option value="${f.id}" ${s.discordMirror===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}</select></div><p class="tiny mut" id="dstat"></p>`:`<p class="mut small">Discord shows your music through the sniplit desktop app (Windows, macOS, Linux). To show what’s playing on this phone: open the desktop app, add this phone as a friend from the Friends tab, then choose it under Settings → Discord.</p>`}</div>
  <div class="card"><h3>Your data</h3><div class="set-row"><div>Bring your library</div><a class="pill sm ghost" href="#import">Open</a></div><div class="set-row"><div>Export your library</div><a class="pill sm ghost" href="#export">Open</a></div>
   <div class="set-row"><div>Install the app</div><button class="pill sm ghost" id="inst">Install</button></div><div class="set-row"><div>Reset this device<small>Clears likes, history and playlists here</small></div><button class="pill sm ghost" id="rst">Reset</button></div></div>
  <div class="card"><h3>About</h3><div class="set-row"><div>sniplit ${esc((window.__latest&&window.SNIPLIT_BUILD===window.__latest.build&&window.__latest.version)||'3.0')}<small>Build ${esc(window.SNIPLIT_BUILD||'web')} · ${window.sniplitAndroid?'Android app':window.sniplitDesktop?'Desktop app':matchMedia('(display-mode: standalone)').matches?'Installed web app':'Web'}</small></div><button class="pill sm ghost" id="updchk">${I('refresh')} Check for updates</button></div>
   <div class="set-row"><div>Clear cached data<small>Frees space; keeps your library, likes and downloads</small></div><button class="pill sm ghost" id="cclr">Clear</button></div>
   <div class="set-row"><div>Contact<small>Questions, bugs and ideas — GitHub is the only way to reach us</small></div><a class="pill sm ghost" href="https://github.com/ayqshi" target="_blank" rel="noopener">${I('link')} ayqshi on GitHub</a></div>
   <div class="set-row"><div>Legal</div><div class="row" style="gap:8px"><a class="pill sm ghost" href="#terms">Terms</a><a class="pill sm ghost" href="#privacy">Privacy</a></div></div></div>
  <div class="card"><h3>Premium</h3><div class="set-row"><div>${Store.premium?'Premium is on'+(SL.state.exp?' · until '+new Date(SL.state.exp).toLocaleDateString():''):'Free'}<small>Full songs, unlimited downloads, 4K lyric videos, studio-grade exports</small></div><a class="pill sm" href="#premium">${Store.premium?'Manage':'See Premium'}</a></div></div></div>
  <p class="tiny mut" style="margin-top:18px"><a href="#terms">Terms of Use</a> · <a href="#privacy">Privacy Policy</a> · sniplit 3.0</p>`;
  if(sec==='connections')setTimeout(()=>$('#connections').scrollIntoView({behavior:'smooth'}),100);
  v.onclick=async e=>{const t=e.target.closest('[data-set]');if(t){s[t.dataset.set]=!s[t.dataset.set];t.classList.toggle('on');Store.save('settings');applyLayout()}
    const so=e.target.closest('[data-soc]');if(so){SSocial.setOpt(so.dataset.soc,!me[so.dataset.soc]);so.classList.toggle('on')}
    const th=e.target.closest('[data-theme]');if(th){s.theme=th.dataset.theme;Store.save('settings');applyLayout();route()}const ac=e.target.closest('[data-acc]');if(ac&&!Store.premium&&!FREE_ACC.includes(ac.dataset.acc)){go('premium');return}if(e.target.closest('.sw.any.locked')){go('premium');return}if(ac){s.accent=ac.dataset.acc;Store.save('settings');applyLayout();route()}
    const ck=e.target.closest('#chk');if(ck){ck.classList.add('busy');await SImport.Linked.checkAll();ck.classList.remove('busy');route()}
    if(e.target.closest('#inst')){if(window.__bip)__bip.prompt();else{const b=e.target.closest('#inst');b.textContent=/iP(hone|ad)/.test(navigator.userAgent)?'Share → Add to Home Screen':'Use your browser’s Install option'}}
    const uc=e.target.closest('#updchk');if(uc){uc.classList.add('busy');const r=await checkUpdate(true);uc.classList.remove('busy');uc.innerHTML={latest:I('check')+' Up to date',available:I('download')+' Update ready',offline:'You’re offline',error:'Couldn’t check — try later',skipped:'Up to date'}[r]||'Up to date'}
    const cc=e.target.closest('#cclr');if(cc){let n=0;for(const k of Object.keys(localStorage))if(/^sn\.x:/.test(k)){localStorage.removeItem(k);n++}['homeCache','genreCov','mixArt'].forEach(k=>SData.LS.set(k,{}));try{for(const k of await caches.keys())if(/img|api/i.test(k))await caches.delete(k)}catch(e){}cc.innerHTML=I('check')+' Cleared'}
    if(e.target.closest('#avroll')||e.target.closest('#avpick')){avatarPicker();return}
    const nf=e.target.closest('[data-notif]');if(nf){const k=nf.dataset.notif;const n=Store.settings.notify=Store.settings.notify||{};if(k==='on'){if(n.on){n.on=false;Store.save('settings')}else await enableNotifications()}else{n[k]=n[k]===false;Store.save('settings')}curDone=false;route();return}
    const ub=e.target.closest('[data-unblock]');if(ub){unblockArtist(ub.dataset.unblock);curDone=false;route();return}
    if(e.target.closest('#cpid')){navigator.clipboard.writeText(SSocial.code()).then(()=>toast('Recovery key copied — keep it somewhere safe')).catch(()=>{});return}
    if(e.target.closest('#rsid')){const k=prompt('Paste a sniplit recovery key to use that identity on this device. Your current friends list on this device will be cleared.');if(k&&SSocial.restore(k.trim())){toast('Identity restored');route();renderShell()}else if(k)toast('That key isn’t valid');return}
    const rs=e.target.closest('#rst');if(rs){if(rs.dataset.sure){localStorage.clear();location.reload()}else{rs.dataset.sure=1;rs.textContent='Tap again to reset'}}};
  v.onchange=e=>{const t=e.target;if(t.dataset.text!=null){s[t.dataset.text]=t.value.trim();Store.save('settings')}if(t.dataset.sel){s[t.dataset.sel]=t.value;Store.save('settings');applyLayout();renderShell();discordPush()}};
  if(window.sniplitDesktop)sniplitDesktop.discordStatus().then(st=>{const el=$('#dstat');if(el)el.textContent=!st.configured?'Discord isn’t configured in this build.':st.connected?'Connected to Discord.':'Waiting for the Discord app to open…'})};

/* ---------- boot ---------- */
addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.__bip=e});
document.addEventListener('gesturestart',e=>e.preventDefault());
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',()=>{if(Store.settings.theme==='system')applyLayout()});
if('serviceWorker'in navigator&&(/^(https|sniplit):$/.test(location.protocol)||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(()=>{});
/* updates: installed copies (Android, desktop, the downloaded file) compare their build with the published one and offer
   the new download; the website itself updates through its service worker and offers a one-tap restart */
const SITE_DIR=()=>SITE.replace(/[^/]*(#.*)?$/,'');
async function checkUpdate(manual){if(!navigator.onLine)return'offline';if(manual&&'serviceWorker'in navigator)navigator.serviceWorker.getRegistration().then(r=>r&&r.update()).catch(()=>{});try{const r=await fetch(SITE_DIR()+'version.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)return'error';const v=await r.json();window.__latest=v;
  const mine=window.SNIPLIT_BUILD;if(!mine||!v.build||v.build===mine)return'latest';if(!manual&&SData.LS.get('skipUpdate','')===v.build)return'skipped';if(manual)$('#updbar')?.remove();
  const A=window.sniplitAndroid,D=window.sniplitDesktop;const dl=A?'downloads/sniplit.apk':D?(D.platform==='darwin'?'downloads/sniplit.dmg':'downloads/sniplit-Setup.exe'):'sniplit.html';
  updateBar(`sniplit ${esc(v.version||'')} is available`,A||D||location.protocol==='file:'?`<a class="pill sm" href="${esc(SITE_DIR()+dl)}" download target="_blank" rel="noopener">${I('download')} Download update</a>`:`<button class="pill sm" data-upd="reload">Update now</button>`,v.build);return'available'}catch(e){return'error'}}
function updateBar(text,action,build){if($('#updbar'))return;const d=document.createElement('div');d.id='updbar';d.className='updbar';d.innerHTML=`${I('refresh')}<span class="grow">${text}</span>${action}<button class="icon-btn" data-upd="later" aria-label="Later">${I('close')}</button>`;document.body.appendChild(d);requestAnimationFrame(()=>d.classList.add('on'));
  d.onclick=e=>{const b=e.target.closest('[data-upd]');if(!b)return;if(b.dataset.upd==='reload')location.reload();if(b.dataset.upd==='later'){if(build)SData.LS.set('skipUpdate',build);d.classList.remove('on');setTimeout(()=>d.remove(),400)}}}
if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>{if(window.__swHadController)updateBar('A new version of sniplit is ready',`<button class="pill sm" data-upd="reload">Restart</button>`)});
window.__swHadController=!!(navigator.serviceWorker&&navigator.serviceWorker.controller);
setTimeout(checkUpdate,8000);setInterval(checkUpdate,6*36e5);
/* gentle reveal: sections and cards fade up the first time they scroll into view */
const RV_SEL='#view .sec,#view .card,#view .genre,#view .lib-row,#view .friend,#view .about,#view .coll-h,#view .top-hit,#view .list-h,#view .hero,#view .mix,#view .set-row';
const rvIO='IntersectionObserver'in window?new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){e.target.classList.add('in');rvIO.unobserve(e.target)}},{rootMargin:'0px 0px -6% 0px',threshold:.01}):null;
function reveal(){if(!rvIO||document.body.classList.contains('reduce'))return;let n=0;for(const el of document.querySelectorAll(RV_SEL)){if(el.dataset.rv)continue;el.dataset.rv=1;const r=el.getBoundingClientRect();if(r.top<innerHeight*.92)continue;el.classList.add('rv');el.style.setProperty('--rvd',Math.min(n++,6)*40+'ms');rvIO.observe(el)}}
new MutationObserver(()=>{clearTimeout(reveal.t);reveal.t=setTimeout(reveal,30)}).observe(document.getElementById('view')||document.body,{childList:true,subtree:true});
// iOS leaves the page shifted up after the keyboard closes, which shows as an empty strip at the bottom: put it back
document.addEventListener('focusout',e=>{if(!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;setTimeout(()=>{const a=document.activeElement;if(!a||!/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)){if(scrollY||document.documentElement.scrollTop)scrollTo(0,0);document.body.scrollTop=0}},120)});
/* settings: a glowing line threads through every card in reading order and draws itself in as you scroll, so the page
   reads as one connected path instead of a pile of boxes. Desktop and phone; still for reduced motion. */
function settingsSnake(v){if(!v.isConnected)return;v.classList.add('snaked');let svg=v.querySelector(':scope>svg.snake');if(!svg){v.insertAdjacentHTML('afterbegin','<svg class="snake" aria-hidden="true"><defs><linearGradient id="snkg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--acc)" stop-opacity=".9"/><stop offset="1" stop-color="var(--acc)" stop-opacity=".25"/></linearGradient><filter id="snkb"><feGaussianBlur stdDeviation="5"/></filter></defs><path class="sg" filter="url(#snkb)"/><path class="sl"/><g class="sd"></g></svg>');svg=v.querySelector(':scope>svg.snake')}
  const scroller=$('#main');let len=0,pts=[];
  const layout=()=>{if(!v.isConnected)return;const vr=v.getBoundingClientRect();const cards=$$('.card',v).filter(c=>c.offsetParent);if(cards.length<2)return;
    pts=cards.map(c=>{const r=c.getBoundingClientRect();return{x:r.left-vr.left+r.width/2,y:r.top-vr.top+Math.min(42,r.height/2),top:r.top-vr.top,bot:r.bottom-vr.top,l:r.left-vr.left,r:r.right-vr.left}}).sort((a,b)=>a.top-b.top||a.l-b.l);
    svg.setAttribute('width',v.scrollWidth);svg.setAttribute('height',v.scrollHeight);svg.setAttribute('viewBox',`0 0 ${v.scrollWidth} ${v.scrollHeight}`);
    // each step leaves a card from its side, curves through the gap, and enters the next card from above
    let d=`M${pts[0].x} ${pts[0].top-18}L${pts[0].x} ${pts[0].y}`;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];const side=b.x>=a.x?a.r+14:a.l-14;const midY=(Math.max(a.y,a.bot-30)+b.top)/2;
      d+=` C${side} ${a.y},${side} ${midY},${(side+b.x)/2} ${midY} S${b.x} ${b.top-30},${b.x} ${b.y}`}
    $('.sl',svg).setAttribute('d',d);$('.sg',svg).setAttribute('d',d);len=$('.sl',svg).getTotalLength();
    $('.sd',svg).innerHTML=pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4"/>`).join('');for(const el of[$('.sl',svg),$('.sg',svg)]){el.style.strokeDasharray=len;}draw()};
  const draw=()=>{if(!len||!v.isConnected)return;const vr=v.getBoundingClientRect(),view=innerHeight;const reach=view*.82-vr.top;// how far down the page the reader has got
    let k=0;const p=$('.sl',svg);let lo=0,hi=len;for(let i=0;i<18;i++){const m=(lo+hi)/2;if(p.getPointAtLength(m).y<reach)lo=m;else hi=m}k=document.body.classList.contains('reduce')?len:lo;
    for(const el of[p,$('.sg',svg)])el.style.strokeDashoffset=Math.max(0,len-k);$$('.sd circle',svg).forEach((c,i)=>c.classList.toggle('on',pts[i]&&pts[i].y<reach))};
  layout();setTimeout(layout,400);const ro=new ResizeObserver(()=>{if(!v.isConnected){ro.disconnect();return}layout()});ro.observe(v);
  const on=()=>{if(!v.isConnected){scroller&&scroller.removeEventListener('scroll',on);return}requestAnimationFrame(draw)};scroller&&scroller.addEventListener('scroll',on,{passive:true})}
{const _pref=V.preferences;V.preferences=(v,sec)=>{const r=_pref(v,sec);requestAnimationFrame(()=>settingsSnake(v));return r}}
/* ---------- notifications ----------
   Few and useful: a message, a friend's new note, a long download finishing. Silent (no sound or buzz), grouped per
   person, only when sniplit isn't on screen, never about what you're already looking at, and each kind can be switched off. */
const NOTE_KINDS=[['messages','Messages','Texts, photos, voice notes and songs from friends'],['notes','Friends’ notes','When a friend shares a new note'],['downloads','Downloads','When a big download finishes']];
function notifyOK(kind){const n=Store.settings.notify||{};return!!n.on&&n[kind]!==false}
window.sniplitNotify=(kind,tag,title,body,hash)=>{if(!notifyOK(kind))return;if(document.visibilityState==='visible'&&document.hasFocus())return;if(hash&&location.hash===hash&&document.visibilityState==='visible')return;
  const last=notifyLast[tag]||0;if(Date.now()-last<20000)return;notifyLast[tag]=Date.now();// at most one per person every 20 s
  if(window.sniplitAndroid&&sniplitAndroid.notify){try{sniplitAndroid.notify(tag,title,body)}catch(e){}return}
  if(!('Notification'in window)||Notification.permission!=='granted')return;const opts={body,tag,renotify:false,silent:true,icon:'icons/icon-192.png',badge:'icons/icon-192.png',data:{hash:hash||''}};
  if(navigator.serviceWorker&&navigator.serviceWorker.controller)navigator.serviceWorker.ready.then(r=>r.showNotification(title,opts)).catch(()=>{try{new Notification(title,opts)}catch(e){}});else try{const n=new Notification(title,opts);n.onclick=()=>{focus();if(hash)location.hash=hash;n.close()}}catch(e){}};
const notifyLast={};
async function enableNotifications(){const n=Store.settings.notify=Store.settings.notify||{};if(window.sniplitAndroid&&sniplitAndroid.notify){n.on=true;Store.save('settings');return true}
  if(!('Notification'in window)){note(/iP(hone|ad)/.test(navigator.userAgent)&&!navigator.standalone?'On iPhone, add sniplit to your Home Screen first, then turn this on there':'This browser can’t show notifications');return false}
  const p=Notification.permission==='granted'?'granted':await Notification.requestPermission().catch(()=>'denied');n.on=p==='granted';Store.save('settings');if(!n.on)note('Notifications are blocked — allow them for sniplit in your settings');return n.on}
navigator.serviceWorker&&navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.sniplitGo)location.hash=e.data.sniplitGo});
/* ---------- small touches ---------- */
// a light tap you can feel on the main controls (Android; other phones ignore it)
const buzz=(ms=8)=>{try{if(Store.settings.haptics!==false&&navigator.vibrate&&matchMedia('(pointer:coarse)').matches)navigator.vibrate(ms)}catch(e){}};
document.addEventListener('click',e=>{const b=e.target.closest('[data-act=toggle],[data-act=next],[data-act=prev],[data-act=like],[data-nav],.toggle');if(b)buzz(b.matches('.toggle')?5:8)},true);
// tapping the tab you're already on scrolls that page back to the top
document.addEventListener('click',e=>{const b=e.target.closest('#tabs [data-nav],#side [data-nav]');if(!b)return;const r=(location.hash||'#home').slice(1).split('-')[0];if(b.dataset.nav===r){const m=$('#main');if(m&&m.scrollTop>40){e.preventDefault();e.stopPropagation();m.scrollTo({top:0,behavior:'smooth'})}}},true);
// double-tap the artwork to like the song, with a heart that blooms where you tapped
let dblT=0;document.addEventListener('pointerup',e=>{const art=e.target.closest('#npart');if(!art||e.pointerType==='mouse'&&e.button)return;const n=performance.now();if(n-dblT<300){dblT=0;if(cur&&!Store.likes[cur.id])toggleLike(cur,$('#np [data-act=like]'));const h=document.createElement('span');h.className='heart-burst';h.innerHTML=I('heartF');const r=art.getBoundingClientRect();h.style.left=(e.clientX-r.left)+'px';h.style.top=(e.clientY-r.top)+'px';art.appendChild(h);buzz(14);setTimeout(()=>h.remove(),900)}else dblT=n});
// the window title shows what's playing
setInterval(()=>{const t=cur?`${eng.playing?'▶ ':''}${cur.title} · ${cur.artist}`:'sniplit';if(document.title!==t)document.title=t},1500);
// the phone's status bar takes the colour of the artwork while Now Playing is open
let tintFor='';function tint(){const np=$('#np.on');const meta=document.querySelector('meta[name=theme-color]:not([media])')||document.querySelector('meta[name=theme-color]');if(!meta)return;if(!np||!cur){if(tintFor){meta.content=getComputedStyle(document.body).getPropertyValue('--bg').trim()||'#050505';tintFor=''}return}
  if(tintFor===cur.id)return;tintFor=cur.id;const im=new Image();im.crossOrigin='anonymous';im.onload=()=>{try{const c=document.createElement('canvas');c.width=c.height=8;const x=c.getContext('2d');x.drawImage(im,0,0,8,8);const d=x.getImageData(0,0,8,2).data;let r=0,g=0,b=0;for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2]}const n=d.length/4;meta.content=`rgb(${Math.round(r/n*.45)},${Math.round(g/n*.45)},${Math.round(b/n*.45)})`}catch(e){}};im.src=cur.art||''}
setInterval(tint,700);
// pictures fade in as they arrive instead of popping
document.addEventListener('load',e=>{const t=e.target;if(t.tagName==='IMG'&&!t.classList.contains('in'))t.classList.add('in')},true);document.addEventListener('error',e=>{if(e.target.tagName==='IMG')e.target.classList.add('in')},true);setInterval(()=>{for(const i of document.querySelectorAll('img:not(.in)'))if(i.complete)i.classList.add('in')},700);
// a few seconds before the end, the mini player quietly says what's next
setInterval(()=>{const m=$('#mini .mut.small');if(!m||!cur)return;const d=eng.duration,left=d-eng.time,nx=Q.list[Q.i+1];const want=eng.playing&&d>30&&left<12&&left>0&&nx&&!Q.shuffle?`Next · ${nx.title}`:cur.artist;if(m.textContent!==want){m.textContent=want;m.classList.toggle('nexthint',want!==cur.artist)}},1000);
// going offline or coming back is said once, softly, at the top
function netPill(){let p=$('#netpill');const off=!navigator.onLine;if(!off&&!p)return;if(!p){p=document.createElement('div');p.id='netpill';document.body.appendChild(p)}p.textContent=off?'Offline — your downloads still play':'Back online';p.className=off?'on':'on ok';clearTimeout(p._t);if(!off)p._t=setTimeout(()=>p.remove(),2200)}
addEventListener('offline',netPill);addEventListener('online',netPill);
// pausing fades out in a blink instead of cutting mid-note
{const _p=eng.pause.bind(eng);eng.pause=function(){if(eng.kind==='yt'||!eng.playing||Store.settings.softPause===false)return _p();const el=eng.el,v0=el.volume;if(!eng.canFade&&eng.canFade!==undefined)return _p();let k=0;const iv=setInterval(()=>{k++;try{el.volume=Math.max(0,v0*(1-k/6))}catch(e){}if(k>=6){clearInterval(iv);_p();try{el.volume=v0}catch(e){}}},25)}}
async function boot(){if(Store.settings.offlineStash===undefined)Store.settings.offlineStash=true;
  // speed and studio effects live only for this session: they come back on route changes but reset on relaunch
  delete Store.settings.fx;try{const fx=JSON.parse(sessionStorage.getItem('sn.fxs')||'null');if(fx&&typeof fx==='object')Object.assign(eng.fx,fx,{eq:Array.isArray(fx.eq)?[...fx.eq]:eng.fx.eq})}catch(e){}
  applyLayout();renderShell();
  window.__restored=Store.restore().then(n=>{if(n){applyLayout();renderShell();refreshSide&&refreshSide();route()}}).catch(()=>{});
  const qs=new URLSearchParams(location.search);if(qs.get('code')&&qs.get('state')==='spotify'){try{await SImport.Linked.spotifyFinish(qs.get('code'));history.replaceState(null,'',location.pathname+'#import');setTimeout(async()=>{await SImport.applyImport(await SImport.Linked.spotifyPull());refreshSide()},500)}catch(e){}}
  // failure marks from an earlier session (or an older version) are cleared, so old songs get a fresh try
  const fresh=t=>{if(!t||typeof t!=='object')return null;const o={...t};delete o.ytBad;delete o.ytTried;delete o.ytCands;delete o.refreshed;if(!o.previewChosen)delete o.previewOnly;if(o.id!=null)o.id=String(o.id);if(!o.src&&/^yt:/.test(o.id))o.src='youtube';if(!o.src&&/^au:/.test(o.id))o.src='audius';return o};
  if(Store.queueState&&Store.queueState.list)Store.queueState.list=Store.queueState.list.map(fresh).filter(Boolean);
  if(Store.queueState&&Store.queueState.list&&Store.queueState.list.length){Q.list=Store.queueState.list;Q.i=Store.queueState.i;Q.ctx=Store.queueState.ctx;cur=Q.list[Q.i];renderMini()}
  IDB.keys('audio').then(async k=>{Store.cachedMeta=(await Promise.all(k.slice(0,300).map(x=>IDB.get('audio',x)))).filter(Boolean).map(x=>x.meta)});
  await route();window.__snBooted=true;document.documentElement.classList.add('booted');
  if(Object.keys(SSocial.me.friends).length||Object.keys(SSocial.me.out).length)SSocial.start();
  const last=Math.max(0,...Object.values(Store.linked).map(x=>x.lastSync||0));if(Object.keys(Store.linked).length&&Date.now()-last>216e5)SImport.Linked.checkAll().then(refreshSide);
}
window.sniplit={Flow,blockArtist,unblockArtist,cacheTrack,eng,Q,playList,openNP,closeNP,setPane,editorSheet,castSheet,exportSheet,shareSheet,createSheet,openStory,myDayStory,myYearStory,go,Lyr,API,Store,viz};
boot();
})();
;(window.__snParts=window.__snParts||{})["app.js"]={"id":"16d3ca144387","files":["lib/logo3d.js","lib/zip.js","lib/icons.js","lib/audio.js","lib/lyrics.js","lib/data.js","lib/sources.js","lib/genres.js","lib/avatars.js","lib/stats.js","lib/mp4mux.js","lib/lsync.js","lib/lpost.js","lib/lcompose.js","lib/lstudio.js","lib/import.js","lib/clean.js","lib/social.js","lib/license.js","lib/legal.js","app.js"]};
