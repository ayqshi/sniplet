/* sniplit — data layer: local store, IndexedDB cache, iTunes catalog (JSONP), versions, recommendations, radio, podcasts, YouTube */
(function(){
/* ---------------- local store ---------------- */
const LS={get(k,d){try{const v=localStorage.getItem('sn.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},
  set(k,v){const s=JSON.stringify(v);try{localStorage.setItem('sn.'+k,s)}catch(e){// storage full: drop disposable caches first, never user data
    try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key&&(key.startsWith('sn.x:')||key.startsWith('sn.it:')||key==='sn.homeCache'||key==='sn.tt'))localStorage.removeItem(key)}localStorage.setItem('sn.'+k,s)}catch(e2){}}}};
const Store={
  likes:LS.get('likes',{}),follows:LS.get('follows',{}),playlists:LS.get('playlists',[]),history:LS.get('history',[]),ratings:LS.get('ratings',{}),
  offsets:LS.get('offsets',{}),settings:Object.assign({theme:'dark',accent:'#ffffff',layout:'auto',mono:true,reduceMotion:false,compact:false,keepAwake:true,lyricSize:1,autoFull:false,crossfade:0,ytKey:'',lastfmKey:'',spotifyClientId:'',dataSaver:false,explicit:true,playerStyle:'art'},LS.get('settings',{})),
  premium:LS.get('premium',false),stats:LS.get('stats',{ms:0,days:{},hours:Array(24).fill(0)}),linked:LS.get('linked',{}),imports:LS.get('imports',[]),pending:LS.get('pending',[]),
  queueState:LS.get('queue',null),searches:LS.get('searches',[]),
  save(...keys){for(const k of keys){LS.set(k==='queueState'?'queue':k,this[k]);KEEP.add(k)}clearTimeout(this._bt);this._bt=setTimeout(()=>this.backup(),1500)},
  // everything the user made is mirrored to IndexedDB, so a cleared or full localStorage never loses it
  async backup(){const ks=[...KEEP];KEEP.clear();for(const k of ks){try{await IDB.put('kv',k,JSON.parse(JSON.stringify(this[k])))}catch(e){}}},
  async restore(){let n=0;try{for(const k of USER_KEYS){const lsKey=k==='queueState'?'queue':k;if(localStorage.getItem('sn.'+lsKey)!=null)continue;const v=await IDB.get('kv',k);if(v==null)continue;
    if(k==='settings')Object.assign(this.settings,v);else this[k]=v;LS.set(lsKey,this[k]);n++}}catch(e){}
    try{if(navigator.storage&&navigator.storage.persist&&!(await navigator.storage.persisted()))navigator.storage.persist()}catch(e){}
    // first run after an update: seed the mirror with everything
    if(!LS.get('mirrored',false)){USER_KEYS.forEach(k=>KEEP.add(k));this.backup();LS.set('mirrored',true)}return n}
};
const KEEP=new Set(),USER_KEYS=['likes','follows','playlists','history','ratings','offsets','settings','premium','stats','linked','imports','queueState','searches'];
/* ---------------- IndexedDB (cached audio + imported files + mirror of user data) ---------------- */
const IDB={db:null,
  open(){if(this.db)return Promise.resolve(this.db);return new Promise((res,rej)=>{let r;try{r=indexedDB.open('sniplit',3)}catch(e){return rej(e)}
    r.onupgradeneeded=()=>{const d=r.result;for(const s of['audio','files','kv'])if(!d.objectStoreNames.contains(s))d.createObjectStore(s)};r.onsuccess=()=>res(this.db=r.result);r.onerror=()=>rej(r.error)})},
  async tx(store,mode,fn){const d=await this.open();return new Promise((res,rej)=>{const t=d.transaction(store,mode),s=t.objectStore(store);const q=fn(s);t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error)})},
  get(s,k){return this.tx(s,'readonly',st=>st.get(k)).catch(()=>null)},put(s,k,v){return this.tx(s,'readwrite',st=>st.put(v,k))},del(s,k){return this.tx(s,'readwrite',st=>st.delete(k))},
  keys(s){return this.tx(s,'readonly',st=>st.getAllKeys()).catch(()=>[])},
};
const cachedIds=new Set();IDB.keys('audio').then(k=>k.forEach(x=>cachedIds.add(x)));

/* ---------------- JSONP (iTunes & Deezer support it; works without CORS) ---------------- */
let jsonpN=0;let offline=false;
/* host health: a source that keeps failing is rested for a while instead of being hammered (keeps the console and network quiet) */
const Health={m:LS.get('down',{}),host(u){try{return new URL(u).host}catch(e){return''}},
  ok(u){const h=this.host(u);if(this.m[h]){delete this.m[h];LS.set('down',this.m)}},
  bad(u){const h=this.host(u);const e=this.m[h]||{n:0,until:0};e.n++;if(e.n>=2)e.until=Date.now()+(/itunes\.apple\.com/.test(h)?2e4:Math.min(36e5,6e4*Math.pow(2,e.n)));this.m[h]=e;LS.set('down',this.m)},
  up(u){const e=this.m[this.host(u)];return!e||!e.until||Date.now()>e.until}};
function jsonp(url,timeout=9000){if(!Health.up(url))return Promise.reject(new Error('resting'));return new Promise((res,rej)=>{const cb='__snj'+(++jsonpN);const s=document.createElement('script');let done=false;
  const clean=()=>{done=true;delete window[cb];s.remove()};window[cb]=d=>{clean();offline=false;Health.ok(url);res(d)};
  s.src=url+(url.includes('?')?'&':'?')+'callback='+cb;s.onerror=()=>{if(!done){clean();Health.bad(url);rej(new Error('network'))}};document.head.appendChild(s);
  setTimeout(()=>{if(!done){clean();Health.bad(url);rej(new Error('timeout'))}},timeout)})}
const country=(navigator.language||'en-US').split('-')[1]||'US';
const qcache=new Map();
// iTunes rate-limits (~20 req/min). Queue + memo.
let lastCall=0;async function throttle(ms){const w=lastCall+ms-Date.now();lastCall=Math.max(Date.now(),lastCall+ms);if(w>0)await new Promise(r=>setTimeout(r,w))}
async function itunes(path,params,{gap=0}={}){
  const u='https://itunes.apple.com/'+path+'?'+new URLSearchParams({country,...params});
  if(qcache.has(u))return qcache.get(u);
  const pk='c:'+SFile.crc32(new TextEncoder().encode(u)).toString(36);try{const hit=JSON.parse(sessionStorage.getItem(pk)||localStorage.getItem('sn.'+pk)||'null');if(hit&&Date.now()-hit.at<216e5){const p=Promise.resolve(hit.r);qcache.set(u,p);return p}}catch(e){}
  if(offline&&!params.force){try{const st=JSON.parse(localStorage.getItem('sn.'+pk)||'null');if(st)return st.r}catch(x){}throw new Error('offline')}
  if(gap)await throttle(gap);
  const fx=window.SNIPLIT_FIXTURE&&window.SNIPLIT_FIXTURE.itunes(path,params);if(fx)return Promise.resolve(fx);
  const p=jsonp(u).then(d=>{const r=d.results||[];try{localStorage.setItem('sn.'+pk,JSON.stringify({at:Date.now(),r}))}catch(e){try{Object.keys(localStorage).filter(k=>k.startsWith('sn.c:')).slice(0,60).forEach(k=>localStorage.removeItem(k))}catch(x){}}return r});qcache.set(u,p);const withStale=p.catch(e=>{qcache.delete(u);offline=true;setTimeout(()=>offline=false,30000);try{const st=JSON.parse(localStorage.getItem('sn.'+pk)||'null');if(st)return st.r}catch(x){}throw e});return withStale;
}
function art(url,size=600){return url?url.replace(/\/\d+x\d+(bb)?\.(jpg|png)/,`/${size}x${size}bb.jpg`):''}
function toTrack(r){
  return{id:'it:'+r.trackId,src:'itunes',itId:r.trackId,title:r.trackName,artist:r.artistName,artistId:r.artistId,album:r.collectionName,albumId:r.collectionId,
    art:art(r.artworkUrl100),preview:r.previewUrl,durationMs:r.trackTimeMillis||0,genre:r.primaryGenreName||'',explicit:r.trackExplicitness==='explicit',
    cleanAvail:r.trackExplicitness==='cleaned'||r.collectionExplicitness==='cleaned',release:r.releaseDate,trackNo:r.trackNumber,discNo:r.discNumber,url:r.trackViewUrl,isrc:r.isrc||null,collectionType:r.collectionType}
}
function toAlbum(r){return{id:'al:'+r.collectionId,albumId:r.collectionId,title:r.collectionName,artist:r.artistName,artistId:r.artistId,art:art(r.artworkUrl100),year:(r.releaseDate||'').slice(0,4),count:r.trackCount,genre:r.primaryGenreName,explicit:r.collectionExplicitness==='explicit',url:r.collectionViewUrl}}

/* ---------------- version detection ---------------- */
const VTAGS=[[/remaster(ed)?/i,'Remastered'],[/deluxe/i,'Deluxe'],[/extended/i,'Extended'],[/(alt(ernate)?|alternative)\s*(mix|version|take)?/i,'Alternate'],
  [/\bremix\b|\brmx\b/i,'Remix'],[/\blive\b/i,'Live'],[/acoustic/i,'Acoustic'],[/radio edit|single edit|\bedit\b/i,'Edit'],[/sped\s*up|speed\s*up/i,'Sped up'],
  [/slowed/i,'Slowed'],[/instrumental/i,'Instrumental'],[/a\s*cappella|acapella/i,'A cappella'],[/\bdemo\b/i,'Demo'],[/\bmono\b/i,'Mono'],[/anniversary/i,'Anniversary'],
  [/\bmix\b/i,'Mix'],[/version|ver\./i,'Version'],[/bonus/i,'Bonus'],[/clean/i,'Clean'],[/explicit/i,'Explicit']];
function baseTitle(t){
  let s=String(t||'').toLowerCase();
  s=s.replace(/\s*[\(\[]([^\)\]]*)[\)\]]/g,(m,inner)=>/feat|ft\.|with /i.test(inner)?'':' ');
  s=s.replace(/\s+-\s+.*$/,'');s=s.replace(/[’']/g,"'").replace(/[^a-z0-9' ]+/g,' ').replace(/\s+/g,' ').trim();return s;
}
function versionTags(tr){
  const tags=[];const hay=(tr.title.match(/[\(\[][^\)\]]*[\)\]]|\s-\s.*$/g)||[]).join(' ')+' '+(/(deluxe|anniversary|expanded|remaster)/i.test(tr.album||'')?tr.album:'');
  for(const[re,n]of VTAGS)if(re.test(hay)&&!tags.includes(n))tags.push(n);
  if(tr.explicit)tags.push('Explicit');else if(tr.cleanAvail)tags.push('Clean');
  if(!tags.some(t=>t!=='Explicit'&&t!=='Clean'))tags.unshift('Original');
  return tags;
}
const artistKey=a=>String(a||'').toLowerCase().split(/,|&| feat| x | with /)[0].trim();
/** Collapse versions: one entry per song, with .versions[] (best-first). */
function groupVersions(tracks){
  const map=new Map(),order=[];
  for(const t of tracks){if(!t)continue;const k=artistKey(t.artist)+'::'+baseTitle(t.title);t.vtags=versionTags(t);
    if(!map.has(k)){map.set(k,[]);order.push(k)}const g=map.get(k);if(!g.some(x=>x.id===t.id))g.push(t)}
  return order.map(k=>{const vs=map.get(k);const rank=t=>(t.vtags.includes('Original')?0:3)+(t.vtags.includes('Remastered')?1:0)+(t.vtags.some(x=>['Live','Remix','Sped up','Slowed','Instrumental','Demo'].includes(x))?5:0)+(Store.settings.explicit?(t.explicit?0:.5):(t.explicit?2:0));
    vs.sort((a,b)=>rank(a)-rank(b));const p={...vs[0]};p.versions=vs;return p});
}

/* ---------------- placeholder artwork (imports without covers, stations without logos) ---------------- */
function placeholderArt(seed){const h=[...String(seed)].reduce((a,c)=>a*31+c.charCodeAt(0)>>>0,7);const g1=14+h%22,g2=44+(h>>3)%70,ang=h%360,cx=20+(h>>5)%60,cy=20+(h>>7)%60;
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'><defs><linearGradient id='g' gradientTransform='rotate(${ang} .5 .5)'><stop offset='0' stop-color='rgb(${g1},${g1},${g1})'/><stop offset='1' stop-color='rgb(${g2},${g2},${g2})'/></linearGradient><radialGradient id='r' cx='${cx}%' cy='${cy}%' r='60%'><stop offset='0' stop-color='#fff' stop-opacity='.22'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient></defs><rect width='300' height='300' fill='url(#g)'/><rect width='300' height='300' fill='url(#r)'/><path d='M128 118v64a4 4 0 0 0 6 3.4l54-32a4 4 0 0 0 0-6.8l-54-32a4 4 0 0 0-6 3.4z' fill='none' stroke='#fff' stroke-opacity='.28' stroke-width='6' stroke-linejoin='round'/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}
/** everything already on this device — used for offline search & fallbacks */
function localLibrary(){const m=new Map();const add=t=>{if(t&&t.id&&!m.has(t.id))m.set(t.id,t)};
  Object.values(Store.likes).forEach(add);Store.playlists.forEach(p=>p.tracks.forEach(add));[...Store.history].reverse().forEach(h=>add(h.track));Store.imports.forEach(add);(Store.cachedMeta||[]).forEach(add);return[...m.values()]}

/* ---------------- catalog API ---------------- */
const API={
  get offline(){return offline},
  async search(term,{limit=40,entity='song'}={}){
    try{const r=await itunes('search',{term,media:'music',entity,limit});if(entity==='song'){const it=r.filter(x=>x.kind==='song').map(toTrack);const dz=window.SSrc&&!window.SNIPLIT_FIXTURE?await SSrc.Deezer.search(term,Math.min(25,limit)):[];return window.SSrc?SSrc.mergeTracks(it,dz):it}return entity==='album'?r.map(toAlbum):r.map(a=>({id:'ar:'+a.artistId,artistId:a.artistId,name:a.artistName,genre:a.primaryGenreName,url:a.artistLinkUrl}))}
    catch(e){if(entity!=='song')return[];if(window.SSrc&&!window.SNIPLIT_FIXTURE){const dz=await SSrc.Deezer.search(term,25);if(dz.length)return dz}const q=term.toLowerCase().split(/\s+/).filter(Boolean);return localLibrary().filter(t=>q.every(w=>(t.title+' '+t.artist+' '+(t.album||'')).toLowerCase().includes(w)))}
  },
  async lookupMany(ids){if(!ids.length)return[];try{return(await itunes('lookup',{id:ids.join(',')})).filter(r=>r.kind==='song').map(toTrack)}catch(e){return[]}},
  async lookupTrack(id){const loc=localLibrary().find(t=>t.id===id);try{const r=await itunes('lookup',{id:String(id).replace('it:','')});return r[0]?toTrack(r[0]):loc||null}catch(e){return loc||null}},
  async artist(artistId){
    const[info,songs,albums]=await Promise.all([itunes('lookup',{id:artistId}),itunes('lookup',{id:artistId,entity:'song',limit:200,sort:'recent'}),itunes('lookup',{id:artistId,entity:'album',limit:200})]);
    const a=info[0]||{};return{info:{name:a.artistName,genre:a.primaryGenreName,url:a.artistLinkUrl},songs:songs.filter(x=>x.wrapperType==='track').map(toTrack),albums:albums.filter(x=>x.wrapperType==='collection').map(toAlbum)}
  },
  async album(albumId){const r=await itunes('lookup',{id:albumId,entity:'song',limit:200});return{album:r[0]?toAlbum(r[0]):null,tracks:r.filter(x=>x.wrapperType==='track').map(toTrack)}},
  async popular(artistName){try{return(await itunes('search',{term:artistName,media:'music',entity:'song',attribute:'artistTerm',limit:50})).map(toTrack).filter(t=>artistKey(t.artist)===artistKey(artistName)||t.artist.toLowerCase().includes(artistName.toLowerCase()))}catch(e){return localLibrary().filter(t=>artistKey(t.artist)===artistKey(artistName))}},
  async genreTop(genre,limit=25){try{return(await itunes('search',{term:genre,media:'music',entity:'song',attribute:'genreIndex',limit})).map(toTrack)}catch(e){return localLibrary().filter(t=>t.genre===genre)}},
  async charts(){return[]},

  /** resolve a loose "artist – title" to the best catalog match */
  async resolve(artist,title,{gap=3100}={}){
    try{const r=(await itunes('search',{term:`${artist} ${title}`.slice(0,90),media:'music',entity:'song',limit:8},{gap})).map(toTrack);
      const bt=baseTitle(title),ak=artistKey(artist);return r.find(t=>baseTitle(t.title)===bt&&artistKey(t.artist).includes(ak.slice(0,6)))||r.find(t=>baseTitle(t.title)===bt)||r[0]||null}catch(e){return null}
  },
  placeholderArt,localLibrary,
};

/* ---------------- TikTok-viral picks (curated seed list; refreshable) ---------------- */
const VIRAL_SEED=[['APT.','ROSÉ'],['Espresso','Sabrina Carpenter'],['Birds of a Feather','Billie Eilish'],['Good Luck, Babe!','Chappell Roan'],['Messy','Lola Young'],['Abracadabra','Lady Gaga'],
 ['Ordinary','Alex Warren'],['Sports car','Tate McRae'],['Manchild','Sabrina Carpenter'],['Golden','HUNTR/X'],['Pink Pony Club','Chappell Roan'],['Die With A Smile','Lady Gaga'],
 ['luther','Kendrick Lamar'],['Not Like Us','Kendrick Lamar'],['A Bar Song (Tipsy)','Shaboozey'],['Lose Control','Teddy Swims'],['Timeless','The Weeknd'],['Nokia','Drake'],['Bad Dreams','Teddy Swims'],['Taste','Sabrina Carpenter']];

/* ---------------- recommendation engine ---------------- */
function profile(){
  const g={},a={},seen=new Set();
  const add=(t,w)=>{if(!t)return;if(t.genre)g[t.genre]=(g[t.genre]||0)+w;const k=artistKey(t.artist);a[k]={w:((a[k]||{}).w||0)+w,name:t.artist.split(/,|&| feat/i)[0].trim(),id:t.artistId}};
  Object.values(Store.likes).forEach(t=>add(t,3));
  Store.history.slice(-400).forEach(h=>{add(h.track,h.full?1.2:.4);seen.add(h.track.id)});
  Object.entries(Store.ratings).forEach(([id,r])=>{const t=Store.likes[id]||Store.history.find(h=>h.track.id===id)?.track;if(t)add(t,(r-3)*1.2)});
  Object.values(Store.follows).forEach(f=>{const k=artistKey(f.name);a[k]={w:((a[k]||{}).w||0)+5,name:f.name,id:f.id};if(f.genre)g[f.genre]=(g[f.genre]||0)+2});
  const genres=Object.entries(g).sort((x,y)=>y[1]-x[1]).map(x=>x[0]);const artists=Object.values(a).sort((x,y)=>y.w-x.w);
  return{genres,artists,seen,cold:artists.length===0};
}
/** collaborators parsed from credits = real "related artists" signal */
function collaborators(songs,mainName){const c={};for(const s of songs){const parts=(s.artist+' '+s.title).split(/,|&|feat\.?|ft\.|with|\bx\b|\(|\)/i).map(x=>x.trim()).filter(x=>x&&x.length>1&&x.length<40);
  for(const p of parts){if(artistKey(p)===artistKey(mainName)||baseTitle(p)===baseTitle(s.title))continue;if(/remix|version|edit|live|mix|deluxe|remaster/i.test(p))continue;if(s.artist.includes(p)||s.title.match(new RegExp('(feat|ft|with)[^)]*'+p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i')))c[p]=(c[p]||0)+1}}
  return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(x=>x[0]).slice(0,12)}
/** Vault: underrated / deep cuts / bonus & unreleased-labelled tracks from an artist's full catalog */
function vault(songs,popular){
  const popIds=new Set(popular.slice(0,10).map(t=>baseTitle(t.title)));const popAlbums={};popular.slice(0,25).forEach((t,i)=>popAlbums[t.albumId]=(popAlbums[t.albumId]||0)+(25-i));
  const groups=groupVersions(songs);const out={gems:[],rare:[],live:[]};
  for(const g of groupVersions(songs).flatMap(x=>x.versions)){const s=g;const b=baseTitle(s.title);
    const rareTag=/(demo|unreleased|outtake|bonus|b-side|session|alternate|early (version|take)|rough|leak|interlude|voice memo|previously)/i.test(s.title+' '+s.album);
    if(rareTag){out.rare.push(s);continue}if(/\blive\b/i.test(s.title)){out.live.push(s);continue}if(popIds.has(b)||s.vtags.some(v=>v!=='Original'&&v!=='Explicit'&&v!=='Clean'))continue;
    {s._score=(popAlbums[s.albumId]||0)+(s.trackNo>1&&s.trackNo<12?3:0)+(s.durationMs>150000?2:0)+(s.explicit===Store.settings.explicit?1:0);out.gems.push(s)}}
  out.gems.sort((a,b)=>b._score-a._score);return out;
}
/** Hook score: rank tracks most likely to hook a given user */
function hookRank(tracks,prof){const gi={};prof.genres.forEach((g,i)=>gi[g]=Math.max(0,10-i));const ai={};prof.artists.forEach((a,i)=>ai[artistKey(a.name)]=Math.max(0,14-i));
  return tracks.filter(t=>!prof.seen.has(t.id)).map(t=>({t,s:(gi[t.genre]||0)+(ai[artistKey(t.artist)]||0)*.6+(Store.likes[t.id]?-20:0)+Math.random()*2})).sort((a,b)=>b.s-a.s).map(x=>x.t)}

/* ---------------- radio & podcasts ---------------- */
const Radio={async search({tag='',name='',limit=40}={}){
  const hosts=['de1','nl1','at1','fi1'];for(const h of hosts){try{const q=new URLSearchParams({limit,hidebroken:'true',order:'clickcount',reverse:'true',...(tag?{tag}:{}),...(name?{name}:{})});
    const r=await fetch(`https://${h}.api.radio-browser.info/json/stations/search?`+q);if(!r.ok)continue;const d=await r.json();
    return d.filter(s=>(s.url_resolved||'').startsWith('https')).map(s=>({id:'rd:'+s.stationuuid,src:'radio',live:true,title:s.name.trim(),artist:[s.country,s.tags&&s.tags.split(',')[0]].filter(Boolean).join(' · '),album:'Live radio',art:s.favicon&&s.favicon.startsWith('https')?s.favicon:placeholderArt(s.name),stream:s.url_resolved,genre:'Radio',durationMs:0,homepage:s.homepage}))}catch(e){}}
  return[]}};
const Pod={async search(term){try{return(await itunes('search',{term,media:'podcast',limit:30})).map(p=>({id:'pc:'+p.collectionId,pid:p.collectionId,title:p.collectionName,artist:p.artistName,art:art(p.artworkUrl100),genre:p.primaryGenreName,feed:p.feedUrl}))}catch(e){return[]}},
  async episodes(pid){try{return(await itunes('lookup',{id:pid,entity:'podcastEpisode',limit:60})).filter(x=>x.wrapperType==='podcastEpisode').map(e=>({id:'ep:'+e.trackId,src:'podcast',title:e.trackName,artist:e.collectionName,album:'Podcast',art:e.artworkUrl600||art(e.artworkUrl160),stream:e.episodeUrl,durationMs:e.trackTimeMillis||0,genre:'Podcast',release:e.releaseDate,desc:e.shortDescription||e.description||''}))}catch(e){return[]}}};

/* ---------------- YouTube (Data API key optional; IFrame always visible) ---------------- */
const ALLOWED_CATS=new Set(['1','2','10','15','19','22','24','25','26','27','28','29','35']);// film, music, pets, travel, people/blogs(podcasts), ent., news, howto, edu, sci-tech, nonprofits, documentary
const BLOCK_RE=/\b(gameplay|let'?s play|walkthrough|speedrun|fortnite|minecraft|roblox|valorant|gta|call of duty|twitch|stream highlights|live ?stream|kick\.com|irl stream|reaction compilation)\b/i;
const YT={
  async search(q,{max=15,music=false}={}){
    const key=Store.settings.ytKey;if(!key||window.SSrc){const r=window.SSrc?await SSrc.Video.search(q,{music,max}):[];if(r.length||!key)return r}
    const p=new URLSearchParams({part:'snippet',type:'video',q,maxResults:String(max),key,safeSearch:'moderate',videoEmbeddable:'true'});if(music)p.set('videoCategoryId','10');
    const r=await fetch('https://www.googleapis.com/youtube/v3/search?'+p);const d=await r.json();if(d.error)throw new Error(d.error.message);
    const ids=d.items.map(i=>i.id.videoId).join(',');if(!ids)return[];
    const v=await(await fetch('https://www.googleapis.com/youtube/v3/videos?'+new URLSearchParams({part:'snippet,contentDetails,liveStreamingDetails',id:ids,key}))).json();
    return(v.items||[]).filter(x=>ALLOWED_CATS.has(x.snippet.categoryId)&&!x.liveStreamingDetails&&x.snippet.liveBroadcastContent==='none'&&!BLOCK_RE.test(x.snippet.title+' '+x.snippet.channelTitle))
      .map(x=>({id:'yt:'+x.id,src:'youtube',ytId:x.id,title:x.snippet.title.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"'),artist:x.snippet.channelTitle,album:'YouTube',art:(x.snippet.thumbnails.high||x.snippet.thumbnails.medium||{}).url,durationMs:isoDur(x.contentDetails.duration)*1000,genre:'Video',cat:x.snippet.categoryId}))
  },
  /** group YouTube results for one song into "sources" instead of separate results */
  async sourcesFor(track){const r=await this.search(`${track.artist.split(/,|&/)[0]} ${track.title.replace(/\(.*?\)/g,'')}`,{max:12,music:true});const bt=baseTitle(track.title);
    const kind=t=>/official (music )?video|\(official\)/i.test(t)?'Official video':/official audio|\baudio\b|topic/i.test(t)?'Audio':/lyric/i.test(t)?'Lyric video':/\blive\b/i.test(t)?'Live':/visuali[sz]er/i.test(t)?'Visualizer':/sped|slowed|nightcore|reverb/i.test(t)?'Edit':'Video';
    return r.filter(v=>baseTitle(v.title).includes(bt.split(' ').slice(0,3).join(' '))||v.title.toLowerCase().includes(bt)).map(v=>({...v,kind:kind(v.title+' '+v.artist)}))},
  parseId(s){const m=String(s).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)||String(s).match(/^([\w-]{11})$/);return m?m[1]:null},
  async oembed(id){if(window.SSrc){const v=await SSrc.Video.info(id);if(v)return v}try{const r=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+id));return await r.json()}catch(e){return null}},
};
function isoDur(s){const m=String(s).match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)||[];return(+m[1]||0)*86400+(+m[2]||0)*3600+(+m[3]||0)*60+(+m[4]||0)}

window.SData={Health,placeholderArt,localLibrary,Store,IDB,API,Radio,Pod,YT,jsonp,itunes,toTrack,groupVersions,versionTags,baseTitle,artistKey,profile,vault,hookRank,collaborators,VIRAL_SEED,cachedIds,LS};
})();
