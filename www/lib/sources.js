/* sniplit sources — every free, keyless music service worth having, queried together and merged.
   Each call fails soft (returns empty) so any service can disappear without the app noticing. */
(function(){
const{jsonp,toTrack,baseTitle,artistKey}=SData;
const MEM=new Map();
const ckey=u=>'sn.x:'+SFile.crc32(new TextEncoder().encode(u)).toString(36);
async function get(url,{ttl=216e5,type='json',timeout=9000,headers}={}){
  if(MEM.has(url))return MEM.get(url);
  try{const hit=JSON.parse(localStorage.getItem(ckey(url))||'null');if(hit&&Date.now()-hit.at<ttl){MEM.set(url,Promise.resolve(hit.v));return hit.v}}catch(e){}
  const H=SData.Health;if(!H.up(url))return Promise.reject(new Error('resting'));
  const p=(async()=>{const ac=new AbortController();const t=setTimeout(()=>ac.abort(),timeout);try{let r;try{r=await fetch(url,{signal:ac.signal,headers})}catch(e){H.bad(url);throw e}if(!r.ok){if(r.status>=500||r.status===403||r.status===429)H.bad(url);throw new Error(r.status)}H.ok(url);const v=type==='json'?await r.json():await r.text();
    try{const s=JSON.stringify({at:Date.now(),v});if(s.length<180000)localStorage.setItem(ckey(url),s)}catch(e){}return v}finally{clearTimeout(t)}})();
  MEM.set(url,p);p.catch(()=>MEM.delete(url));return p}
const soft=async(f,d=[])=>{try{const v=await f();return v??d}catch(e){return d}};
let mbLast=0;const mbWait=async()=>{const w=mbLast+1100-Date.now();mbLast=Math.max(Date.now(),mbLast+1100);if(w>0)await new Promise(r=>setTimeout(r,w))};
const enc=encodeURIComponent;

/* ---------- Deezer (JSONP) : catalog, previews, charts, related artists ---------- */
const dz=(path,ttl)=>{const fx=window.SNIPLIT_FIXTURE&&window.SNIPLIT_FIXTURE.deezer&&window.SNIPLIT_FIXTURE.deezer(path);if(fx)return Promise.resolve(fx);const u='https://api.deezer.com/'+path+(path.includes('?')?'&':'?')+'output=jsonp';const m=MEM.get(u);if(m)return m;const p=jsonp(u,8000);MEM.set(u,p);p.catch(()=>MEM.delete(u));return p};
const dzTrack=x=>({bpm:x.bpm||0,gain:x.gain||0,id:'dz:'+x.id,src:'deezer',dzId:x.id,title:x.title_short&&x.title_version?`${x.title_short} ${x.title_version}`:x.title,artist:x.artist&&x.artist.name,artistDz:x.artist&&x.artist.id,album:x.album&&x.album.title,
  art:(x.album&&(x.album.cover_xl||x.album.cover_big))||'',preview:x.preview||null,durationMs:(x.duration||0)*1000,explicit:!!x.explicit_lyrics,genre:'',isrc:x.isrc||null,url:x.link});
const Deezer={
  search:(q,limit=25)=>soft(async()=>(await dz(`search?q=${enc(q)}&limit=${limit}`)).data.map(dzTrack)),
  chart:(limit=50,genre=0)=>soft(async()=>(await dz(`chart/${genre}/tracks?limit=${limit}`)).data.map(dzTrack)),
  chartArtists:(genre=0,limit=20)=>soft(async()=>(await dz(`chart/${genre}/artists?limit=${limit}`)).data.map(a=>({name:a.name,dzId:a.id,art:a.picture_xl||a.picture_big}))),
  chartPlaylists:(genre=0,limit=20)=>soft(async()=>(await dz(`chart/${genre}/playlists?limit=${limit}`)).data.map(p=>({id:p.id,title:p.title,owner:(p.user&&p.user.name)||'Deezer',art:p.picture_xl||p.picture_big,n:p.nb_tracks}))),
  releases:(genre=0,limit=20)=>soft(async()=>(await dz(`editorial/${genre}/releases?limit=${limit}`)).data.map(a=>({id:a.id,title:a.title,artist:a.artist&&a.artist.name,art:a.cover_xl||a.cover_big,date:a.release_date||''}))),
  genres:()=>soft(async()=>(await dz('genre')).data.filter(g=>g.id).map(g=>({id:g.id,name:g.name,art:g.picture_xl||g.picture_big}))),
  /** Deezer's genre id for an iTunes genre name */
  genreId(n){n=String(n||'').toLowerCase();const M=[[/hip.?hop|rap/,116],[/r&b|soul/,165],[/pop/,132],[/rock|metal/,152],[/alternative|indie/,85],[/dance|house/,113],[/electro/,106],[/latin|reggaeton|urbano/,197],[/country/,84],[/jazz/,129],[/classical/,98],[/k-?pop|asian/,16],[/afro|african/,2],[/reggae/,144],[/christian|gospel/,186],[/soundtrack|film/,173],[/blues/,153],[/folk/,466]];for(const[r,id]of M)if(r.test(n))return id;return 0},
  artist:name=>soft(async()=>((await dz(`search/artist?q=${enc(name)}&limit=1`)).data||[])[0]||null,null),
  related:id=>soft(async()=>(await dz(`artist/${id}/related?limit=20`)).data.map(a=>({name:a.name,dzId:a.id,art:a.picture_xl||a.picture_big,fans:a.nb_fan}))),
  top:id=>soft(async()=>(await dz(`artist/${id}/top?limit=50`)).data.map(dzTrack)),
  /** Deezer's artist radio: the artist plus the music around them, a good well for discovery */
  radio:id=>soft(async()=>(await dz(`artist/${id}/radio?limit=60`)).data.map(dzTrack)),
  track:id=>soft(async()=>dzTrack(await dz(`track/${id}`)),null),
  albums:id=>soft(async()=>(await dz(`artist/${id}/albums?limit=300`)).data.map(a=>({id:'dzal:'+a.id,dzAlbum:a.id,title:a.title,art:a.cover_xl||a.cover_big,year:(a.release_date||'').slice(0,4),date:a.release_date||'',type:a.record_type||'album',fans:a.fans}))),
  album:id=>soft(async()=>{const d=await dz(`album/${id}`);return{title:d.title,owner:(d.artist&&d.artist.name)||'',art:d.cover_xl,desc:(d.release_date||'').slice(0,4),tracks:(d.tracks&&d.tracks.data||[]).map(x=>({...dzTrack(x),album:d.title,art:d.cover_xl}))}},null)};

/* ---------- Audius : full-length independent music, trending ---------- */
let auHost=null;const au=async path=>{if(!auHost){const d=await get('https://api.audius.co',{ttl:36e5});const hs=d.data||[];auHost=hs[Math.floor(Math.random()*hs.length)]}return get(`${auHost}/v1/${path}${path.includes('?')?'&':'?'}app_name=sniplit`,{ttl:18e5})};
const own=x=>!/\b(edit|bootleg|flip|mash ?up|remix|cover|sped|slowed|nightcore|type beat)\b|\(feat\.|\bft\./i.test(x.title||'')||(x.user&&x.user.is_verified&&/remix/i.test(x.title)&&!/\(feat\./i.test(x.title));
const auTrack=x=>({id:'au:'+x.id,src:'audius',auId:x.id,title:x.title,artist:x.user&&x.user.name,album:'',art:x.artwork&&(x.artwork['1000x1000']||x.artwork['480x480'])||'',stream:null,durationMs:(x.duration||0)*1000,genre:x.genre||'',full:true,plays:x.play_count});
const Audius={
  // independent uploads only: fan edits/bootlegs of other artists' songs (often with unrelated artwork) are left out
  trending:(genre='')=>soft(async()=>(await au(`tracks/trending?time=week${genre?'&genre='+enc(genre):''}`)).data.filter(own).slice(0,30).map(auTrack)),
  search:q=>soft(async()=>(await au(`tracks/search?query=${enc(q)}`)).data.filter(own).slice(0,20).map(auTrack)),
  async streamUrl(id){if(!auHost)await soft(()=>au('tracks/trending'));return auHost?`${auHost}/v1/tracks/${id}/stream?app_name=sniplit`:null}};

/* ---------- Internet Archive : live recordings & public-domain audio ---------- */
const IA={
  shows:artist=>soft(async()=>{const q=`creator:("${artist.replace(/"/g,'')}") AND mediatype:(etree OR audio)`;const d=await get(`https://archive.org/advancedsearch.php?q=${enc(q)}&fl[]=identifier&fl[]=title&fl[]=date&fl[]=creator&fl[]=downloads&sort[]=downloads+desc&rows=24&output=json`);
    return(d.response.docs||[]).map(x=>({id:'ia:'+x.identifier,ident:x.identifier,title:x.title,artist:Array.isArray(x.creator)?x.creator[0]:x.creator,date:(x.date||'').slice(0,10),art:`https://archive.org/services/img/${x.identifier}`,kind:'iashow'}))}),
  tracks:ident=>soft(async()=>{const d=await get(`https://archive.org/metadata/${enc(ident)}`,{ttl:864e5});const md=d.metadata||{};
    return(d.files||[]).filter(f=>/VBR MP3|MP3/i.test(f.format||'')&&!/_64kb/i.test(f.name)).map((f,i)=>({id:'ia:'+ident+':'+i,src:'archive',title:f.title||f.name.replace(/\.mp3$/i,''),artist:Array.isArray(md.creator)?md.creator[0]:md.creator,album:md.title,art:`https://archive.org/services/img/${ident}`,stream:`https://archive.org/download/${enc(ident)}/${f.name.split('/').map(enc).join('/')}`,durationMs:f.length?parseLen(f.length)*1000:0,full:true,genre:'Live'}))})};
function parseLen(s){if(!s)return 0;if(String(s).includes(':')){return String(s).split(':').reduce((a,b)=>a*60+(+b),0)}return+s}

/* ---------- MusicBrainz + Cover Art Archive : credits, first release, ISRCs ---------- */
const MB={
  async recording(t){return soft(async()=>{await mbWait();const q=`recording:"${baseTitle(t.title)}" AND artist:"${artistKey(t.artist)}"`;const d=await get(`https://musicbrainz.org/ws/2/recording?query=${enc(q)}&fmt=json&limit=5`,{ttl:864e5*7});
    const r=(d.recordings||[]).sort((a,b)=>(b.score||0)-(a.score||0))[0];if(!r)return null;
    return{mbid:r.id,first:r['first-release-date']||'',isrc:(r.isrcs||[])[0]||t.isrc||'',releases:(r.releases||[]).length,release:(r.releases||[])[0]&&(r.releases||[])[0].title,releaseId:(r.releases||[])[0]&&(r.releases||[])[0].id,length:r.length,tags:(r.tags||[]).map(x=>x.name).slice(0,5)}},null)},
  async artist(name){return soft(async()=>{await mbWait();const d=await get(`https://musicbrainz.org/ws/2/artist?query=${enc('artist:"'+name+'"')}&fmt=json&limit=1`,{ttl:864e5*7});const a=(d.artists||[])[0];if(!a)return null;
    return{mbid:a.id,country:a.country||(a.area&&a.area.name)||'',type:a.type||'',begin:a['life-span']&&a['life-span'].begin||'',tags:(a.tags||[]).sort((x,y)=>y.count-x.count).map(x=>x.name).slice(0,6)}},null)},
  cover:releaseId=>releaseId?`https://coverartarchive.org/release/${releaseId}/front-500`:''};

/* ---------- ListenBrainz : listener-based similar artists ---------- */
const LB={similar:mbid=>soft(async()=>{const d=await get(`https://labs.api.listenbrainz.org/similar-artists/json?artist_mbids=${mbid}&algorithm=session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30`,{ttl:864e5*3});
  const arr=Array.isArray(d)?d.flatMap(x=>x.data||x):[];return arr.filter(x=>x&&x.name).slice(0,20).map(x=>({name:x.name,mbid:x.artist_mbid,score:x.score}))})};

/* ---------- Wikipedia + TheAudioDB : bios & real artist photography ---------- */
const Wiki={summary:name=>soft(async()=>{for(const t of[name,name+' (musician)',name+' (band)',name+' (singer)',name+' (rapper)']){try{const d=await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc(t.replace(/ /g,'_'))}`,{ttl:864e5*7});
  if(d.type==='standard'&&/(sing|rapp|band|music|songwrit|producer|DJ|group|duo|composer)/i.test((d.description||'')+' '+(d.extract||'').slice(0,300)))return{bio:d.extract,image:(d.originalimage||d.thumbnail||{}).source||'',url:d.content_urls&&d.content_urls.desktop.page}}catch(e){}}return null},null)};
const ADB={artist:name=>soft(async()=>{const d=await get(`https://www.theaudiodb.com/api/v1/json/2/search.php?s=${enc(name)}`,{ttl:864e5*7});const a=(d.artists||[])[0];if(!a)return null;
  return{bio:a.strBiographyEN||'',thumb:a.strArtistThumb||'',fanart:a.strArtistFanart||a.strArtistFanart2||'',banner:a.strArtistBanner||'',style:a.strStyle||'',mood:a.strMood||'',formed:a.intFormedYear||a.intBornYear||'',country:a.strCountry||'',site:a.strWebsite||''}},null)};

/* ---------- Bandsintown : upcoming shows ---------- */
const Tour={events:name=>soft(async()=>(await get(`https://rest.bandsintown.com/artists/${enc(name)}/events?app_id=sniplit&date=upcoming`,{ttl:432e5})).slice(0,12).map(e=>({when:e.datetime,venue:e.venue&&e.venue.name,city:[e.venue&&e.venue.city,e.venue&&e.venue.country].filter(Boolean).join(', '),url:e.url||(e.offers&&e.offers[0]&&e.offers[0].url)})))};

/* ---------- lyrics: every free source, several spellings each; candidates are cross-checked before one is chosen ---------- */
const norm=x=>String(x||'').toLowerCase().replace(/\$/g,'s').normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/\(.*?\)|\[.*?\]|\b(feat|ft|with)\b\.?.*$/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const toks=x=>norm(x).split(' ').filter(Boolean);
function lev(a,b){if(a===b)return 0;const m=a.length,n=b.length;if(!m||!n)return Math.max(m,n);let p=Array.from({length:n+1},(_,j)=>j);for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]}
function sim(a,b){a=norm(a);b=norm(b);if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return .9;const ta=new Set(a.split(' ')),tb=b.split(' ');let hit=0;for(const t of tb)if(ta.has(t)||[...ta].some(x=>x.length>3&&lev(x,t)<=1))hit++;
  const j=hit/Math.max(ta.size,tb.length);return Math.max(j,1-lev(a,b)/Math.max(a.length,b.length))}
const near=(a,b)=>sim(a,b)>=.6;
const lrcEnd=l=>{const m=[...String(l).matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];return m.length?(+m[m.length-1][1])*60+(+m[m.length-1][2]):0};
const goodLRC=(l,dur)=>!!l&&/\[\d+:\d+/.test(l)&&(!dur||lrcEnd(l)<dur+12)&&l.split('\n').filter(x=>/\]\s*\S/.test(x)).length>=4;
const plainOf=l=>String(l||'').replace(/\[[^\]]*\]/g,'').replace(/^\s*(\[.*?\]|\(.*?\))\s*$/gm,'').trim();
/** spellings to try: as written, without (feat./remaster/…), main artist only, $→s, punctuation stripped */
/* titles often carry extra words that aren't the song's name: "(feat. X)", "[Prod. Y]", "(Official Video)", "| check description",
   "DJ Z presents", "- Remastered 2011". Each layer is peeled off in turn, so a search can fall back to just the real title. */
const FLUFF=/\b(feat\.?|ft\.?|featuring|prod\.?|produced by|prod by|official|music video|video|audio|lyrics?|lyric video|visuali[sz]er|explicit|clean|remaster(ed)?|hq|hd|4k|mv|m\/v|check (the )?desc(ription)?|link in bio|out now|free download|unreleased|leak(ed)?|snippet|cdq|og|full song|extended|version|edit|bass ?boosted|sped up|slowed( \+ reverb)?|reverb|nightcore|8d)\b/i;
function peel(t){const out=[];let x=String(t||'');const push=v=>{v=v.replace(/\s{2,}/g,' ').replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g,'').trim();if(v&&v.length>1&&!out.includes(v))out.push(v)};push(x);
  x=x.replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu,'');push(x);
  x=x.replace(/\s*[\(\[\{]([^\)\]\}]*)[\)\]\}]/g,(m,inner)=>FLUFF.test(inner)?'':m);push(x);
  x=x.replace(/\s*[|｜•].*$/,'');push(x);
  x=x.replace(/\s+(feat\.?|ft\.?|featuring|prod\.?|prod by|produced by)\s.*$/i,'');push(x);
  x=x.replace(/^(dj|mc)\s+\S+\s+(presents|-)\s+/i,'');push(x);
  x=x.replace(/\s+[-–—]\s+(\d{4}\s+)?(remaster|live|mono|stereo|single|radio|acoustic|demo|bonus|mix|version|edit)\w*(\s+\d{4})?\b.*$/i,'');push(x);
  x=x.replace(/\s*[\(\[][^\)\]]*[\)\]]/g,'');push(x);
  const dash=x.split(/\s+[-–—]\s+/);if(dash.length>1){push(dash[1]);push(dash[0])}// "Artist - Title" uploads
  x=x.replace(/["“”]/g,'');push(x);return out}
function variants(track){const T=new Set(),A=new Set();const t=String(track.title||''),a=String(track.artist||'');
  [...peel(t),baseTitle(t),norm(t)].forEach(x=>{x=String(x||'').trim();if(x)T.add(x)});
  const main=a.split(/,|&|\bfeat\.?|\bft\.?|\bx\b|\bwith\b/i)[0].trim();[a,main,artistKey(a),main.replace(/\$/g,'s'),norm(main),main.replace(/[^\w\s]/g,'')].forEach(x=>{x=String(x||'').trim();if(x)A.add(x)});
  return{titles:[...T].slice(0,7),artists:[...A].slice(0,4)}}
const LyrSrc={
  // LRCLIB search answers in one request with every version it has (no 404s, unlike /get)
  async lrclib(v,dur){const out=[];const add=r=>{if(r&&(r.syncedLyrics||r.plainLyrics))out.push({src:'lrclib',title:r.trackName,artist:r.artistName,dur:r.duration,lrc:goodLRC(r.syncedLyrics,dur)?r.syncedLyrics:null,plain:r.plainLyrics||plainOf(r.syncedLyrics),instrumental:!!r.instrumental})};
    // the cleanest form of the title (no feat./prod./brackets) does most of the work; the exact lookup with the song's length goes first
    const clean=v.titles.find(x=>!/[\(\[]|\bfeat|\bft\.|\bprod|official|lyric/i.test(x))||v.titles[1]||v.titles[0],art=v.artists[1]||v.artists[0];
    if(dur>30){const one=await get('https://lrclib.net/api/get?'+new URLSearchParams({track_name:clean,artist_name:art,duration:String(Math.round(dur))}),{ttl:864e5*7,timeout:5000}).catch(()=>null);if(one&&one.syncedLyrics&&goodLRC(one.syncedLyrics,dur)){add(one);return out}}
    const tries=[{track_name:clean,artist_name:art},{q:`${norm(art)} ${norm(clean)}`},...v.titles.filter(x=>x!==clean).slice(0,2).map(x=>({track_name:norm(x),artist_name:art})),{track_name:norm(clean)}];
    for(const q of tries){const arr=await get('https://lrclib.net/api/search?'+new URLSearchParams(q),{ttl:864e5*7,timeout:6000}).catch(()=>[]);(arr||[]).slice(0,10).forEach(add);if(out.some(c=>c.lrc&&sim(c.title,v.titles[0])>.7&&sim(c.artist,v.artists[0])>.5))break}
    return out},
  async ovh(v){for(const a of v.artists.slice(1,3))for(const t of v.titles.slice(1,2)){const d=await get(`https://api.lyrics.ovh/v1/${enc(a)}/${enc(t)}`,{ttl:864e5*7,timeout:5000}).catch(()=>null);if(d&&d.lyrics)return[{src:'lyrics.ovh',title:t,artist:a,plain:d.lyrics.replace(/^Paroles de la chanson.*\n/,'')}]}return[]}};
/* extra fallbacks, tried only when the main sources come up short; each one rests itself after failures */
const pad2=n=>String(n).padStart(2,'0');
Object.assign(LyrSrc,{
  async textyl(v){const a=v.artists[1]||v.artists[0],t=v.titles[1]||v.titles[0];const d=await get('https://api.textyl.co/api/lyrics?q='+enc(`${a} ${t}`),{ttl:864e5*7,timeout:6000}).catch(()=>null);
    if(!Array.isArray(d)||d.length<4)return[];const lrc=d.map(x=>`[${pad2(Math.floor(x.seconds/60))}:${pad2(x.seconds%60)}.00]${x.lyrics}`).join('\n');return[{src:'textyl',title:t,artist:a,lrc,plain:d.map(x=>x.lyrics).join('\n')}]}});
const LYR_ORDER=['lrclib','textyl','ovh'];
const grams=(text,n=3)=>{const w=toks(text);const g=new Set();for(let i=0;i+n<=w.length;i++)g.add(w.slice(i,i+n).join(' '));return g};
function overlap(a,b){if(!a.size||!b.size)return 0;let h=0;for(const x of a)if(b.has(x))h++;return h/Math.min(a.size,b.size)}
/** score every candidate: identity (title/artist), length, timing, agreement with the other sources, and (optionally) what was actually heard */
function rank(cands,track,heard){const dur=(track.durationMs||0)/1000;const G=cands.map(c=>grams(c.plain||plainOf(c.lrc)));const H=heard?grams(heard,2):null;
  return cands.map((c,i)=>{const ts=sim(c.title,track.title),as=c.artist?sim(c.artist,track.artist):.6;if(ts<.55||as<.35)return{...c,score:-1};
    let agree=0,n=0;cands.forEach((o,j)=>{if(j===i||o.src===c.src)return;agree+=overlap(G[i],G[j]);n++});agree=n?agree/n:.5;
    const dpen=c.dur&&dur?Math.min(1,Math.abs(c.dur-dur)/25):0;const end=c.lrc?lrcEnd(c.lrc):0;const fits=!c.lrc||!dur||end<=dur+8;
    const heardFit=H&&H.size>3?overlap(grams(c.plain||plainOf(c.lrc),2),H):null;
    const score=ts*2+as*1.5+(c.lrc?1.2:0)+(fits?0:-2)-dpen*1.5+agree*2.5+(heardFit!=null?heardFit*5:0)+(G[i].size>20?.3:-.5);return{...c,score,agree,heardFit}}).filter(c=>c.score>0).sort((a,b)=>b.score-a.score)}
const lyrMem=new Map();
/** gather candidates from every source (each tries several spellings), then pick the best-verified one */
async function bestLyrics(track,{heard}={}){const key=norm(track.artist)+'|'+norm(track.title);let cands=lyrMem.get(key);
  if(!cands){const v=variants(track),dur=(track.durationMs||0)/1000;cands=await LyrSrc.lrclib(v,dur).catch(()=>[]);
    // a second source only when LRCLIB has nothing timed that matches
    if(!rank(cands,track).some(c=>c.lrc))cands=cands.concat(await LyrSrc.textyl(v).catch(()=>[]));
    if(!rank(cands,track).length)cands=cands.concat(...await Promise.all([LyrSrc.ovh(v)].map(p=>p.catch(()=>[]))));
    else if(!rank(cands,track).some(c=>c.lrc))cands=cands.concat(await LyrSrc.ovh(v).catch(()=>[]));
    if(cands.length)lyrMem.set(key,cands)}
  if(cands.some(c=>c.instrumental)&&!cands.some(c=>(c.plain||'').length>40))return{instrumental:true,source:'lrclib',candidates:[]};
  const ranked=rank(cands,track,heard);if(!ranked.length)return null;
  let best=ranked[0];if(!best.lrc){const g=grams(best.plain);const t=ranked.find(c=>c.lrc&&overlap(grams(plainOf(c.lrc)),g)>.5);if(t)best=t}
  return{synced:!!best.lrc,lrc:best.lrc,plain:best.plain||plainOf(best.lrc),source:best.src,confidence:Math.min(1,best.score/8),candidates:ranked.slice(0,6)}}
const Lyr2={plain:(artist,title)=>soft(async()=>{const r=await LyrSrc.ovh(variants({artist,title}));return r[0]&&r[0].plain},null),best:bestLyrics,rank,variants,sources:LyrSrc};

/* ---------- Odesli (song.link) : the same song on every platform ---------- */
const ytMem=JSON.parse(localStorage.getItem('sn.ytmap')||'{}');
async function youtubeFor(t){const k=t.itId||t.dzId||t.id;if(k in ytMem){const v=ytMem[k];return Array.isArray(v)?v:v?[v]:[]}
  const plat=t.itId?['itunes',t.itId]:t.dzId?['deezer',t.dzId]:null;if(!plat)return[];
  if(Date.now()<slBack)return[];
  try{const d=await get(`https://api.song.link/v1-alpha.1/links?platform=${plat[0]}&type=song&id=${plat[1]}&userCountry=US${window.SNIPLIT_ODESLI_KEY?'&key='+enc(window.SNIPLIT_ODESLI_KEY):''}`,{ttl:864e5*30,timeout:5000});const L=d.linksByPlatform||{};
    // regular YouTube upload first (embeds more reliably), YouTube Music's copy second
    const ids=[L.youtube,L.youtubeMusic].map(x=>x&&((x.url.match(/[?&]v=([\w-]{11})/)||[])[1])).filter((x,i,a)=>x&&a.indexOf(x)===i);ytMem[k]=ids;try{localStorage.setItem('sn.ytmap',JSON.stringify(ytMem))}catch(e){}return ids}catch(e){slBack=Date.now()+6e5;return[]}}
let slBack=0;// song.link limits how often it's asked; when it says no, YouTube search carries the load for a while
const Links={of:t=>soft(async()=>{const src=t.url||(t.dzId?`https://www.deezer.com/track/${t.dzId}`:'');if(!src)return null;const d=await get(`https://api.song.link/v1-alpha.1/links?url=${enc(src)}&userCountry=US`,{ttl:864e5*7});
  const L=d.linksByPlatform||{};const names={spotify:'Spotify',appleMusic:'Apple Music',youtubeMusic:'YouTube Music',youtube:'YouTube',tidal:'TIDAL',amazonMusic:'Amazon Music',soundcloud:'SoundCloud',deezer:'Deezer',pandora:'Pandora',audiomack:'Audiomack',anghami:'Anghami',boomplay:'Boomplay',napster:'Napster'};
  return{page:d.pageUrl,links:Object.keys(names).filter(k=>L[k]).map(k=>({name:names[k],url:L[k].url}))}},null)};

/* ---------- Piped / Invidious : keyless video search (plays through YouTube's own player) ---------- */
const PIPED=['https://pipedapi.kavin.rocks','https://pipedapi.adminforge.de','https://api.piped.private.coffee','https://pipedapi.r4fo.com','https://pipedapi.leptons.xyz'];
const INV=['https://inv.nadeko.net','https://invidious.nerdvpn.de','https://yewtu.be','https://invidious.f5.si'];
let pipedOk=0,invOk=0;const rot=(arr,i)=>[...arr.slice(i),...arr.slice(0,i)];
/* the public YouTube front-ends come and go, so the live lists of healthy ones are read (twice a day at most) and the
   healthiest are tried first; the built-in lists are only the starting point */
let liveHosts=null;async function hosts(){if(liveHosts)return liveHosts;let mem=null;try{mem=JSON.parse(localStorage.getItem('sn.vhosts')||'null')}catch(e){}
  if(mem&&Date.now()-mem.at<432e5){liveHosts=mem;return mem}
  const out={piped:[...PIPED],inv:[...INV],at:Date.now()};
  await Promise.all([
    get('https://piped-instances.kavin.rocks/',{ttl:432e5,timeout:5000}).then(d=>{if(Array.isArray(d)){const ok=d.filter(x=>x.api_url&&(x.uptime_24h==null||x.uptime_24h>80)).sort((a,b)=>(b.uptime_24h||0)-(a.uptime_24h||0)).map(x=>x.api_url.replace(/\/$/,''));out.piped=[...new Set([...ok.slice(0,6),...PIPED])]}}).catch(()=>{}),
    get('https://api.invidious.io/instances.json?sort_by=health',{ttl:432e5,timeout:5000}).then(d=>{if(Array.isArray(d)){const ok=d.map(x=>x[1]).filter(x=>x&&x.api&&x.type==='https'&&x.uri).map(x=>x.uri.replace(/\/$/,''));if(ok.length)out.inv=[...new Set([...ok.slice(0,5),...INV])]}}).catch(()=>{})]);
  liveHosts=out;try{localStorage.setItem('sn.vhosts',JSON.stringify(out))}catch(e){}return out}
// two hosts at once, first good answer wins: one slow front-end no longer stalls a search
async function firstOf(list,fn){const L=[...list];let err;while(L.length){const pair=L.splice(0,2);try{return await Promise.any(pair.map(h=>fn(h).then(r=>{if(r==null)throw new Error('empty');return r})))}catch(e){err=e}}throw err||new Error('none')}
/* optional: an official YouTube Data API key in sniplit.config.json ("youtubeKey") is used only when every public
   front-end fails — the free quota is about 100 searches a day, so it stays the last resort */
async function ytOfficial(q,max){const k=window.SNIPLIT_YOUTUBE_KEY;if(!k)return null;try{const d=await get(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=${Math.min(max,25)}&q=${enc(q)}&key=${enc(k)}`,{ttl:864e5,timeout:7000});
  const ids=(d.items||[]).map(x=>x.id&&x.id.videoId).filter(Boolean);if(!ids.length)return null;const v=await get(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${ids.join(',')}&key=${enc(k)}`,{ttl:864e5,timeout:7000});
  return(v.items||[]).map(x=>ytItem(x.id,x.snippet.title,x.snippet.channelTitle,isoSecs(x.contentDetails.duration)))}catch(e){return null}}
const isoSecs=s=>{const m=String(s).match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)||[];return(+m[1]||0)*86400+(+m[2]||0)*3600+(+m[3]||0)*60+(+m[4]||0)};
const BLOCK=/\b(gameplay|let'?s play|walkthrough|speedrun|fortnite|minecraft|roblox|valorant|gta|call of duty|twitch|live ?stream|stream highlights|irl stream)\b/i;
const ytItem=(id,title,author,secs)=>({id:'yt:'+id,src:'youtube',ytId:id,title,artist:(author||'').replace(/ - Topic$/,''),album:'Video',art:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,durationMs:(secs||0)*1000,genre:'Video'});
const hms=s=>String(s||'').split(':').reduce((a,b)=>a*60+(+b||0),0);
const Video={async search(q,{music=false,max=15}={}){const fin=list=>list.filter(v=>v.durationMs>0&&v.durationMs<7200000&&!BLOCK.test(v.title+' '+v.artist)).slice(0,max);
  const H=await hosts();
  try{return await firstOf(rot(H.piped,pipedOk),async h=>{const d=await get(`${h}/search?q=${enc(q)}&filter=${music?'music_songs':'videos'}`,{ttl:36e5,timeout:6000});const items=(d.items||[]).filter(x=>x.url&&x.url.includes('watch'));
    if(!items.length)return null;pipedOk=Math.max(0,H.piped.indexOf(h));return fin(items.map(x=>({...ytItem(x.url.split('v=')[1],x.title,x.uploaderName,x.duration),art:x.thumbnail})))})}catch(e){}
  try{return await firstOf(rot(H.inv,invOk),async h=>{const d=await get(`${h}/api/v1/search?q=${enc(q)}&type=video`,{ttl:36e5,timeout:6000});if(!Array.isArray(d)||!d.length)return null;invOk=Math.max(0,H.inv.indexOf(h));return fin(d.filter(x=>x.videoId&&!x.liveNow).map(x=>ytItem(x.videoId,x.title,x.author,x.lengthSeconds)))})}catch(e){}
  const off=await ytOfficial(q,max);return off?fin(off):[]},
  async playlists(q){for(const h of rot(PIPED,pipedOk)){try{const d=await get(`${h}/search?q=${enc(q)}&filter=playlists`,{ttl:36e5,timeout:7000});const it=(d.items||[]).filter(x=>x.url&&x.url.includes('list='));if(it.length)return it.slice(0,8).map(x=>plTile('yt',x.url.split('list=')[1],x.name,x.uploaderName||'YouTube',x.thumbnail,x.videos))}catch(e){}}return[]},
  async playlist(id){for(const h of rot(PIPED,pipedOk)){try{const d=await get(`${h}/playlists/${enc(id)}`,{ttl:36e5,timeout:8000});if(d.relatedStreams)return{title:d.name,owner:d.uploader,art:d.thumbnailUrl,desc:d.description,tracks:d.relatedStreams.filter(x=>x.url).map(x=>({...ytItem(x.url.split('v=')[1],x.title,x.uploaderName,x.duration),art:x.thumbnail}))}}catch(e){}}
    for(const h of rot(INV,invOk)){try{const d=await get(`${h}/api/v1/playlists/${enc(id)}`,{ttl:36e5,timeout:8000});if(d.videos)return{title:d.title,owner:d.author,art:d.videos[0]&&`https://i.ytimg.com/vi/${d.videos[0].videoId}/hqdefault.jpg`,tracks:d.videos.map(x=>ytItem(x.videoId,x.title,x.author,x.lengthSeconds))}}catch(e){}}return null},
  async info(id){for(const u of[`https://noembed.com/embed?url=${enc('https://www.youtube.com/watch?v='+id)}`]){try{const d=await get(u,{ttl:864e5});if(d&&d.title)return{title:d.title,author_name:d.author_name,thumbnail_url:d.thumbnail_url}}catch(e){}}return null}};

/* ---------- playlists from Deezer, Audius and YouTube ---------- */
const plTile=(src,id,title,owner,art,n)=>({id:'xpl:'+src+':'+id,kind:'xpl',xsrc:src,xid:id,title,artist:owner+(n?` · ${n} songs`:''),art});
const Playlists={
  top:()=>soft(async()=>{const[dzp,aup]=await Promise.all([soft(async()=>(await dz('chart/0/playlists?limit=20')).data.map(p=>plTile('dz',p.id,p.title,(p.user&&p.user.name)||'Deezer',p.picture_xl||p.picture_big,p.nb_tracks))),
    soft(async()=>(await au('playlists/trending?time=week')).data.slice(0,12).map(p=>plTile('au',p.id,p.playlist_name,p.user&&p.user.name,p.artwork&&(p.artwork['480x480']||p.artwork['1000x1000']),p.track_count)))]);const out=[];for(let i=0;i<Math.max(dzp.length,aup.length);i++){if(dzp[i])out.push(dzp[i]);if(aup[i])out.push(aup[i])}
    // many chart playlists share the same template artwork: give those a collage of their own songs' covers instead
    const cnt={};out.forEach(p=>{cnt[p.art]=(cnt[p.art]||0)+1});const dup=out.filter(p=>p.xsrc==='dz'&&(cnt[p.art]>1||/\/images\/playlist\/|misc/.test(p.art||''))).slice(0,14);
    await Promise.all(dup.map(p=>Promise.race([dz(`playlist/${p.xid}/tracks?limit=12`).then(d=>{const a=[...new Set((d.data||[]).map(t=>t.album&&(t.album.cover_big||t.album.cover_medium)).filter(Boolean))].slice(0,4);if(a.length>=4)p.arts=a}).catch(()=>{}),new Promise(r=>setTimeout(r,5000))])));
    const seenA=new Set();return out.filter(p=>{const k=p.arts?p.arts.join():p.art;if(seenA.has(k)&&!p.arts)return false;seenA.add(k);return true})}),
  search:q=>soft(async()=>{const[dzp,aup,ytp]=await Promise.all([soft(async()=>(await dz(`search/playlist?q=${enc(q)}&limit=12`)).data.map(p=>plTile('dz',p.id,p.title,(p.user&&p.user.name)||'Deezer',p.picture_xl||p.picture_big,p.nb_tracks))),
    soft(async()=>(await au(`playlists/search?query=${enc(q)}`)).data.slice(0,8).map(p=>plTile('au',p.id,p.playlist_name,p.user&&p.user.name,p.artwork&&p.artwork['480x480'],p.track_count))),Video.playlists(q)]);return[...dzp,...aup,...ytp]}),
  async tracks(src,id){if(src==='dz')return soft(async()=>{const d=await dz(`playlist/${id}`);return{title:d.title,owner:d.creator&&d.creator.name,art:d.picture_xl,desc:d.description,tracks:(d.tracks&&d.tracks.data||[]).map(dzTrack)}},null);
    if(src==='au')return soft(async()=>{const[m,t]=await Promise.all([au(`playlists/${id}`),au(`playlists/${id}/tracks`)]);const p=(m.data||[])[0]||{};return{title:p.playlist_name,owner:p.user&&p.user.name,art:p.artwork&&p.artwork['1000x1000'],desc:p.description,tracks:(t.data||[]).map(auTrack)}},null);
    if(src==='yt')return Video.playlist(id);if(src==='dzal')return Deezer.album(id);return null}};

/* ---------- Apple Music charts (JSON feed) ---------- */
const Charts={apple:async()=>[]};

/* ---------- merging helpers ---------- */
function mergeTracks(primary,extra){const seen=new Map(primary.map(t=>[artistKey(t.artist)+'::'+baseTitle(t.title),t]));
  for(const x of extra){const k=artistKey(x.artist)+'::'+baseTitle(x.title);const p=seen.get(k);if(p){if(!p.preview&&x.preview)p.preview=x.preview;if(!p.dzId&&x.dzId)p.dzId=x.dzId;if(!p.isrc&&x.isrc)p.isrc=x.isrc}else{seen.set(k,x);primary.push(x)}}return primary}
window.SSrc={peel,get,youtubeFor,Deezer,Audius,IA,MB,LB,Wiki,ADB,Tour,Lyr2,Links,Video,Charts,Playlists,mergeTracks};
})();
;(window.__snParts=window.__snParts||{})["lib/sources.js"]="662870336b97";
