/* sniplit — local file/folder import, platform importers, linked accounts, identity export */
(function(){
const{Store,IDB,API,jsonp}=SData;
const AUDIO_RE=/\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|webm|aif|aiff|alac|wma|mp4|caf)$/i;

/* ---------- ID3v2 / MP4 tag sniffing (title, artist, album, cover) ---------- */
async function readTags(file){
  const out={title:null,artist:null,album:null,art:null};
  try{const head=new Uint8Array(await file.slice(0,Math.min(file.size,512*1024)).arrayBuffer());
    if(head[0]===0x49&&head[1]===0x44&&head[2]===0x33){const ver=head[3];const size=(head[6]<<21)|(head[7]<<14)|(head[8]<<7)|head[9];let p=10;
      const dec=(b,enc)=>{try{return new TextDecoder(enc===1?'utf-16':enc===2?'utf-16be':enc===3?'utf-8':'latin1').decode(b).replace(/\0/g,'').trim()}catch(e){return''}};
      while(p<size&&p<head.length-10){const id=String.fromCharCode(...head.slice(p,p+4));if(!/^[A-Z0-9]{4}$/.test(id))break;
        const fs=ver===4?(head[p+4]<<21)|(head[p+5]<<14)|(head[p+6]<<7)|head[p+7]:(head[p+4]<<24)|(head[p+5]<<16)|(head[p+6]<<8)|head[p+7];const body=head.slice(p+10,p+10+fs);
        if(id==='TIT2')out.title=dec(body.slice(1),body[0]);if(id==='TPE1')out.artist=dec(body.slice(1),body[0]);if(id==='TALB')out.album=dec(body.slice(1),body[0]);
        if(id==='APIC'&&!out.art){let i=1;while(body[i])i++;const mime=dec(body.slice(1,i),0)||'image/jpeg';i+=2;const enc=body[0];if(enc===1||enc===2){while(i<body.length-1&&!(body[i]===0&&body[i+1]===0))i+=2;i+=2}else{while(body[i])i++;i++}
          out.art=URL.createObjectURL(new Blob([body.slice(i)],{type:mime}))}
        p+=10+fs}}
  }catch(e){}
  if(!out.title){const n=file.name.replace(AUDIO_RE,'').replace(/^\d+[\s._-]+/,'');const m=n.split(/\s+[-–]\s+/);if(m.length>1){out.artist=out.artist||m[0];out.title=m.slice(1).join(' - ')}else out.title=n}
  return out;
}
/** Import File[] (from <input webkitdirectory>, multi-select, or drag-drop recursion). */
async function importFiles(files,onProg){
  const list=[...files].filter(f=>AUDIO_RE.test(f.name)||(f.type||'').startsWith('audio/'));const added=[];let i=0;
  for(const f of list){const tags=await readTags(f);const id='lf:'+SFile.crc32(new TextEncoder().encode((f.webkitRelativePath||f.name)+f.size)).toString(36);
    const folder=(f.webkitRelativePath||f._path||'').split('/').slice(0,-1).join('/')||'Imported';
    let artData=null;if(tags.art){try{const b=await(await fetch(tags.art)).blob();artData=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(b)});if(artData.length>400000)artData=null}catch(e){}}
    const t={id,src:'local',title:tags.title,artist:tags.artist||'Unknown artist',album:tags.album||folder.split('/').pop(),art:artData||API.demoArt(tags.title||f.name,''),durationMs:0,genre:'Local',folder,fileName:f.name,size:f.size};
    try{await IDB.put('files',id,{blob:f,meta:t})}catch(e){}
    if(!Store.imports.some(x=>x.id===id))Store.imports.push(t);added.push(t);onProg&&onProg(++i/list.length,t)}
  Store.save('imports');return added;
}
/** Walk dropped folders recursively (DataTransferItem.webkitGetAsEntry). */
async function filesFromDrop(dt){
  const out=[];const walk=async(entry,path)=>{if(entry.isFile){await new Promise(r=>entry.file(f=>{f._path=path+f.name;out.push(f);r()},r))}
    else if(entry.isDirectory){const rd=entry.createReader();let batch;do{batch=await new Promise(r=>rd.readEntries(r,()=>r([])));for(const e of batch)await walk(e,path+entry.name+'/')}while(batch.length)}};
  const items=[...(dt.items||[])].map(i=>i.webkitGetAsEntry&&i.webkitGetAsEntry()).filter(Boolean);
  if(items.length){for(const e of items)await walk(e,'')}else out.push(...dt.files);return out;
}

/* ---------- normalised import model ---------- */
// {source, likes:[{artist,title,album}], playlists:[{name,items:[{artist,title}]}], history:[{artist,title,ms,at}]}
function csvParse(txt){const rows=[];let row=[],f='',q=false;for(let i=0;i<txt.length;i++){const c=txt[i];if(q){if(c==='"'){if(txt[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&txt[i+1]==='\n')i++;row.push(f);rows.push(row);row=[];f=''}else f+=c}if(f||row.length){row.push(f);rows.push(row)}
  const h=(rows.shift()||[]).map(x=>x.trim().toLowerCase());return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])))}
function pick(o,...ks){for(const k of ks){for(const kk of Object.keys(o)){if(kk.toLowerCase()===k.toLowerCase()&&o[kk])return String(o[kk])}}return''}
function parsePlist(xml){const doc=new DOMParser().parseFromString(xml,'text/xml');const val=n=>{if(!n)return null;switch(n.tagName){case'dict':{const o={};const c=[...n.children];for(let i=0;i<c.length;i+=2)o[c[i].textContent]=val(c[i+1]);return o}case'array':return[...n.children].map(val);case'integer':case'real':return+n.textContent;case'true':return true;case'false':return false;default:return n.textContent}};return val(doc.querySelector('plist>dict'))}

/** Detect and parse any supported export file. */
async function parseExport(file){
  const name=file.name.toLowerCase(),txt=await file.text();const out={source:'File',likes:[],playlists:[],history:[]};
  if(name.endsWith('.xml')&&txt.includes('<plist')){ // iTunes / Music Library.xml
    const p=parsePlist(txt);out.source='Apple Music / iTunes library';const tr=p.Tracks||{};const byId={};
    for(const t of Object.values(tr)){if(!t.Name)continue;const it={artist:t.Artist||'',title:t.Name,album:t.Album||''};byId[t['Track ID']]=it;if(t.Loved||t.Favorited||(t.Rating||0)>=80)out.likes.push(it);if(t['Play Count'])out.history.push({...it,ms:(t['Total Time']||0)*(t['Play Count']||1),at:t['Play Date UTC']})}
    for(const pl of p.Playlists||[]){if(pl.Master||pl['Distinguished Kind']||!pl['Playlist Items'])continue;out.playlists.push({name:pl.Name,items:pl['Playlist Items'].map(x=>byId[x['Track ID']]).filter(Boolean)})}
    return out}
  if(name.endsWith('.json')){let d;try{d=JSON.parse(txt)}catch(e){throw new Error('Unreadable JSON')}
    if(d&&d.format==='sniplit-identity')return{identity:d};
    if(Array.isArray(d)&&d[0]&&('msPlayed'in d[0]||'ms_played'in d[0])){out.source='Spotify listening history';out.history=d.map(x=>({artist:x.artistName||x.master_metadata_album_artist_name||'',title:x.trackName||x.master_metadata_track_name||'',ms:x.msPlayed||x.ms_played||0,at:x.endTime||x.ts})).filter(x=>x.title);return out}
    if(d&&d.tracks&&Array.isArray(d.tracks)&&d.tracks[0]&&'artist'in d.tracks[0]){out.source='Spotify library';out.likes=d.tracks.map(t=>({artist:t.artist,title:t.track,album:t.album}));return out}
    if(d&&Array.isArray(d.playlists)){out.source='Spotify playlists';out.playlists=d.playlists.map(p=>({name:p.name,items:(p.items||[]).map(i=>i.track||i).filter(t=>t&&t.trackName).map(t=>({artist:t.artistName,title:t.trackName,album:t.albumName}))}));return out}
    if(Array.isArray(d)&&d[0]&&('Title'in d[0]||'Song Name'in d[0])){out.source='Apple Music library';for(const t of d){const it={artist:t.Artist||t['Artist Name']||'',title:t.Title||t['Song Name'],album:t.Album||''};out.likes.push(it)}return out}
    if(Array.isArray(d)&&d[0]&&d[0].header&&d[0].title){out.source='YouTube / YouTube Music history';out.history=d.filter(x=>/music/i.test(x.header)||x.header==='YouTube').map(x=>({artist:((x.subtitles||[])[0]||{}).name?.replace(/ - Topic$/,'')||'',title:String(x.title).replace(/^Watched\s+/,''),ms:0,at:x.time,ytId:SData.YT.parseId(x.titleUrl||'')})).filter(x=>x.title);return out}
    throw new Error('Unrecognised JSON export')}
  if(name.endsWith('.csv')||name.endsWith('.tsv')){const rows=csvParse(name.endsWith('.tsv')?txt.replace(/\t/g,','):txt);out.source='CSV playlist';
    const items=rows.map(r=>({artist:pick(r,'artist name(s)','artist name','artist','artists','creator'),title:pick(r,'track name','track','title','song','name','song name'),album:pick(r,'album name','album'),ytId:SData.YT.parseId(pick(r,'video id','url','link'))})).filter(x=>x.title||x.ytId);
    out.playlists.push({name:file.name.replace(/\.(csv|tsv)$/i,''),items});return out}
  if(name.endsWith('.m3u')||name.endsWith('.m3u8')){out.source='M3U playlist';const items=[];for(const l of txt.split(/\r?\n/)){const m=l.match(/^#EXTINF:[^,]*,(.*)$/);if(m){const[a,...t]=m[1].split(' - ');items.push({artist:t.length?a:'',title:t.length?t.join(' - '):a})}}out.playlists.push({name:file.name.replace(/\.m3u8?$/i,''),items});return out}
  if(name.endsWith('.xspf')){const doc=new DOMParser().parseFromString(txt,'text/xml');out.source='XSPF';out.playlists.push({name:doc.querySelector('title')?.textContent||file.name,items:[...doc.querySelectorAll('track')].map(t=>({artist:t.querySelector('creator')?.textContent||'',title:t.querySelector('title')?.textContent||''}))});return out}
  return parseText(txt,file.name);
}
/* ---------- playlists from a link ----------
   Deezer, Audius, YouTube and Apple Music albums are read straight from their public APIs. Spotify, Apple Music
   playlists and SoundCloud don't let a web page read them, so those go through your sniplit server (/import),
   which reads the public page and returns the track list. Either way every song is then matched to a version
   sniplit can play. */
function linkKind(u){let x;try{x=new URL(u.trim())}catch(e){return null}const h=x.hostname.replace(/^www\.|^m\./,''),p=x.pathname;let m;
  if(/deezer\.com$/.test(h)&&(m=p.match(/\/(playlist|album)\/(\d+)/)))return{svc:'Deezer',src:m[1]==='album'?'dzal':'dz',id:m[2]};
  if(/deezer\.page\.link$|link\.deezer\.com$/.test(h))return{svc:'Deezer',server:true};
  if(/audius\.co$/.test(h)&&/\/(playlist|album)\//.test(p))return{svc:'Audius',audiusUrl:x.href};
  if(/youtube\.com$|youtu\.be$|music\.youtube\.com$/.test(h)&&x.searchParams.get('list'))return{svc:'YouTube',src:'yt',id:x.searchParams.get('list')};
  if(/music\.apple\.com$|itunes\.apple\.com$/.test(h)){if((m=p.match(/\/album\/[^/]*\/?(\d+)/))&&!x.searchParams.get('i'))return{svc:'Apple Music',album:m[1]};return{svc:'Apple Music',server:true}}
  if(/spotify\.com$|spotify\.link$/.test(h))return{svc:'Spotify',server:true};
  if(/soundcloud\.com$|on\.soundcloud\.com$|snd\.sc$/.test(h))return{svc:'SoundCloud',server:true};
  if(/tidal\.com$|amazon\.|bandcamp\.com$/.test(h))return{svc:h,server:true};
  return null}
async function fromLink(url,server){const k=linkKind(url);if(!k)throw new Error('That doesn’t look like a playlist or album link sniplit knows. Try Spotify, Apple Music, SoundCloud, YouTube, Deezer or Audius.');
  const S=window.SSrc;const asItems=l=>(l||[]).map(t=>({artist:t.artist,title:t.title,album:t.album||''}));
  if(k.src){const d=await S.Playlists.tracks(k.src,k.id);if(!d||!d.tracks||!d.tracks.length)throw new Error(`${k.svc} didn’t return that playlist — it may be private.`);return{source:k.svc,name:d.title||k.svc+' playlist',items:asItems(d.tracks),art:d.art}}
  if(k.audiusUrl){const r=await S.get('https://api.audius.co/v1/resolve?app_name=sniplit&url='+encodeURIComponent(k.audiusUrl));const id=r&&r.data&&r.data.id;if(!id)throw new Error('Audius couldn’t find that playlist.');const d=await S.Playlists.tracks('au',id);return{source:'Audius',name:d.title,items:asItems(d.tracks),art:d.art}}
  if(k.album){const r=await jsonp('https://itunes.apple.com/lookup?'+new URLSearchParams({id:k.album,entity:'song',limit:200}));const rs=(r.results||[]);const al=rs.find(x=>x.wrapperType==='collection');
    const items=rs.filter(x=>x.wrapperType==='track').map(x=>({artist:x.artistName,title:x.trackName,album:x.collectionName}));if(!items.length)throw new Error('Apple Music didn’t return that album.');return{source:'Apple Music',name:al?al.collectionName:'Apple Music album',items}}
  if(!server)throw new Error(`${k.svc} doesn’t let web pages read playlists directly. Add your sniplit server in Settings → Connections, or paste the song list instead.`);
  const r=await fetch(server.replace(/\/+$/,'')+'/import?url='+encodeURIComponent(url.trim()));const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('The server couldn’t read that link (HTTP '+r.status+')'));
  if(!j.items||!j.items.length)throw new Error('No songs were found at that link — it may be private.');return{source:j.source||k.svc,name:j.name||k.svc+' playlist',items:j.items.slice(0,1000)}}
function parseText(txt,name='Pasted list'){const items=txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>{const yt=SData.YT.parseId(l);if(yt)return{ytId:yt,title:'',artist:''};const sc=l.match(/soundcloud\.com\/([^/]+)\/([^/?#]+)/);if(sc)return{artist:sc[1].replace(/-/g,' '),title:sc[2].replace(/-/g,' ')};const m=l.split(/\s+[-–—]\s+|\t/);return m.length>1?{artist:m[0],title:m.slice(1).join(' ')}:{artist:'',title:l}});return{source:'Text list',likes:[],history:[],playlists:[{name,items}]}}

/** Resolve normalised import against the catalog; unmatched items are kept as "pending" and retried later. */
async function applyImport(data,onProg){
  const all=[...data.likes.map(x=>({...x,_k:'like'})),...data.playlists.flatMap((p,pi)=>p.items.map(x=>({...x,_k:'pl',_p:pi}))),...dedupeHist(data.history).map(x=>({...x,_k:'hist'}))];
  const memo=new Map();let done=0,matched=0;const pls=data.playlists.map(p=>({id:'pl'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:p.name||'Imported',tracks:[],source:data.source,created:Date.now()}));
  for(const it of all){const k=(it.artist+'|'+it.title).toLowerCase();let t=memo.get(k);
    if(t===undefined){if(it.ytId&&!it.title){const o=await SData.YT.oembed(it.ytId);t={id:'yt:'+it.ytId,src:'youtube',ytId:it.ytId,title:o?.title||it.ytId,artist:o?.author_name||'YouTube',album:'YouTube',art:o?.thumbnail_url||'',genre:'Video',durationMs:0}}
      else t=await API.resolve(it.artist,it.title);memo.set(k,t)}
    if(t){matched++;if(it._k==='like')Store.likes[t.id]={...t,likedAt:Date.now()};if(it._k==='pl'&&!pls[it._p].tracks.some(x=>x.id===t.id))pls[it._p].tracks.push(t);
      if(it._k==='hist')Store.history.push({track:t,at:Date.parse(it.at)||Date.now(),ms:it.ms||30000,full:(it.ms||0)>60000,imported:true})}
    else Store.pending.push({...it,source:data.source});
    onProg&&onProg(++done/all.length,matched,all.length)}
  Store.playlists.push(...pls.filter(p=>p.tracks.length));Store.history.sort((a,b)=>a.at-b.at);Store.history=Store.history.slice(-5000);
  Store.save('likes','playlists','history','pending');return{matched,total:all.length,playlists:pls.length};
}
function dedupeHist(h){const m=new Map();for(const x of h){const k=(x.artist+'|'+x.title).toLowerCase();const e=m.get(k);if(e){e.ms+=x.ms||0;e.at=x.at>e.at?x.at:e.at}else m.set(k,{...x})}return[...m.values()].sort((a,b)=>b.ms-a.ms).slice(0,300)}

/* ---------- linked accounts ---------- */
const Linked={
  // Spotify: PKCE (no secret needed). User supplies their own Client ID; redirect URI = this page.
  async spotifyStart(){const cid=Store.settings.spotifyClientId;if(!cid)throw new Error('Add your Spotify Client ID in Settings → Connections');
    const v=b64u(crypto.getRandomValues(new Uint8Array(48)));const ch=b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))));sessionStorage.setItem('sn.pkce',v);
    location.href='https://accounts.spotify.com/authorize?'+new URLSearchParams({client_id:cid,response_type:'code',redirect_uri:location.origin+location.pathname,code_challenge_method:'S256',code_challenge:ch,scope:'user-library-read playlist-read-private playlist-read-collaborative user-top-read user-read-recently-played',state:'spotify'})},
  async spotifyFinish(code){const v=sessionStorage.getItem('sn.pkce');const r=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:location.origin+location.pathname,client_id:Store.settings.spotifyClientId,code_verifier:v})});
    const d=await r.json();if(!d.access_token)throw new Error(d.error_description||'Spotify sign-in failed');Store.linked.spotify={token:d.access_token,refresh:d.refresh_token,exp:Date.now()+d.expires_in*1000,lastSync:0};Store.save('linked')},
  async spotifyToken(){const s=Store.linked.spotify;if(!s)return null;if(Date.now()<s.exp-60000)return s.token;
    const d=await(await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:s.refresh,client_id:Store.settings.spotifyClientId})})).json();
    if(!d.access_token)return null;Object.assign(s,{token:d.access_token,exp:Date.now()+d.expires_in*1000,refresh:d.refresh_token||s.refresh});Store.save('linked');return s.token},
  async spotifyPull(){const tk=await this.spotifyToken();if(!tk)throw new Error('Reconnect Spotify');const get=async u=>{const r=await fetch(u,{headers:{Authorization:'Bearer '+tk}});return r.json()};
    const out={source:'Spotify (linked)',likes:[],playlists:[],history:[]};let u='https://api.spotify.com/v1/me/tracks?limit=50';let n=0;
    while(u&&n++<40){const d=await get(u);(d.items||[]).forEach(i=>out.likes.push({artist:i.track.artists[0].name,title:i.track.name,album:i.track.album.name,addedAt:i.added_at}));u=d.next}
    const since=Store.linked.spotify.lastSync||0;out.likes=out.likes.filter(x=>Date.parse(x.addedAt)>since);
    const pls=await get('https://api.spotify.com/v1/me/playlists?limit=50');for(const p of pls.items||[]){if(Store.playlists.some(x=>x.extId==='sp:'+p.id&&x.snapshot===p.snapshot_id))continue;
      const items=[];let pu=p.tracks.href+'?limit=100';let k=0;while(pu&&k++<10){const d=await get(pu);(d.items||[]).forEach(i=>i.track&&items.push({artist:i.track.artists[0]?.name||'',title:i.track.name}));pu=d.next}
      out.playlists.push({name:p.name,items,extId:'sp:'+p.id,snapshot:p.snapshot_id})}
    Store.linked.spotify.lastSync=Date.now();Store.save('linked');return out},
  // Last.fm: public, CORS-enabled. Username + API key.
  async lastfmPull(user){const k=Store.settings.lastfmKey;if(!user)throw new Error('Enter your Last.fm username');
    if(!k)throw new Error('Add a Last.fm API key in Settings → Connections');const call=async(m,x={})=>(await fetch('https://ws.audioscrobbler.com/2.0/?'+new URLSearchParams({method:m,user,api_key:k,format:'json',limit:200,...x}))).json();
    const loved=await call('user.getlovedtracks'),top=await call('user.gettoptracks',{period:'12month'});
    Store.linked.lastfm={user,lastSync:Date.now()};Store.save('linked');
    return{source:'Last.fm',likes:(loved.lovedtracks?.track||[]).map(t=>({artist:t.artist.name,title:t.name})),playlists:[],history:(top.toptracks?.track||[]).map(t=>({artist:t.artist.name,title:t.name,ms:(+t.playcount||1)*(+t.duration||200)*1000}))}},
  // Deezer: public API with JSONP (no key). Public profile id or URL.
  async deezerPull(idOrUrl){const id=String(idOrUrl).match(/(\d{3,})/)?.[1];if(!id)throw new Error('Paste your Deezer profile URL or numeric user id');const j=u=>jsonp('https://api.deezer.com/'+u+(u.includes('?')?'&':'?')+'output=jsonp');
    const fav=await j(`user/${id}/tracks?limit=500`),pls=await j(`user/${id}/playlists?limit=100`);const out={source:'Deezer',likes:(fav.data||[]).map(t=>({artist:t.artist.name,title:t.title,album:t.album?.title})),playlists:[],history:[]};
    for(const p of(pls.data||[]).slice(0,30)){const tr=await j(`playlist/${p.id}/tracks?limit=500`);out.playlists.push({name:p.title,items:(tr.data||[]).map(t=>({artist:t.artist.name,title:t.title}))})}
    Store.linked.deezer={id,lastSync:Date.now()};Store.save('linked');return out},
  async checkAll(){const res=[];if(Store.linked.spotify)res.push(await this.spotifyPull().then(d=>applyImport(d)).catch(e=>({error:e.message,src:'Spotify'})));
    if(Store.linked.lastfm)res.push(await this.lastfmPull(Store.linked.lastfm.user).then(d=>applyImport({...d,history:[]})).catch(e=>({error:e.message,src:'Last.fm'})));
    if(Store.linked.deezer)res.push(await this.deezerPull(Store.linked.deezer.id).then(d=>applyImport(d)).catch(e=>({error:e.message,src:'Deezer'})));return res},
};
function b64u(u8){return btoa(String.fromCharCode(...u8)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}

/* ---------- identity export (switching platforms shouldn't mean starting over) ---------- */
function slim(t){if(!t)return t;const{versions,vtags,_score,...r}=t;if(r.art&&r.art.startsWith('data:')&&r.art.length>2000)r.art='';return r}
function identity(){return{format:'sniplit-identity',version:1,exportedAt:new Date().toISOString(),app:'sniplit',
  profile:{premium:Store.premium,settings:{...Store.settings,ytKey:undefined,lastfmKey:undefined,spotifyClientId:undefined},topGenres:SData.profile().genres.slice(0,10),topArtists:SData.profile().artists.slice(0,25).map(a=>a.name)},
  likes:Object.values(Store.likes).map(slim),ratings:Store.ratings,follows:Object.values(Store.follows),playlists:Store.playlists.map(p=>({...p,tracks:p.tracks.map(slim)})),
  history:Store.history.map(h=>({at:new Date(h.at).toISOString(),ms:Math.round(h.ms),full:!!h.full,track:slim(h.track)})),listening:Store.stats,lyricOffsets:Store.offsets,localFiles:Store.imports.map(slim),linkedAccounts:Object.keys(Store.linked)}}
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');const csvc=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
function toCSV(rows,cols){return cols.join(',')+'\n'+rows.map(r=>cols.map(c=>csvc(r[c])).join(',')).join('\n')}
function toM3U(p){return'#EXTM3U\n#PLAYLIST:'+p.name+'\n'+p.tracks.map(t=>`#EXTINF:${Math.round((t.durationMs||0)/1000)},${t.artist} - ${t.title}\n${t.url||t.preview||t.stream||('sniplit:'+t.id)}`).join('\n')+'\n'}
function toXSPF(p){return`<?xml version="1.0" encoding="UTF-8"?>\n<playlist version="1" xmlns="http://xspf.org/ns/0/"><title>${esc(p.name)}</title><trackList>\n${p.tracks.map(t=>`<track><title>${esc(t.title)}</title><creator>${esc(t.artist)}</creator><album>${esc(t.album)}</album><duration>${t.durationMs||0}</duration>${t.art&&!t.art.startsWith('data:')?`<image>${esc(t.art)}</image>`:''}${t.url?`<info>${esc(t.url)}</info>`:''}</track>`).join('\n')}\n</trackList></playlist>`}
async function exportIdentity(fmt,parts){
  const id=identity();const files=[];const sel=k=>!parts||parts.includes(k);
  if(fmt==='json'){const o={...id};if(!sel('history'))delete o.history;if(!sel('ratings'))delete o.ratings;if(!sel('likes'))delete o.likes;if(!sel('playlists'))delete o.playlists;return new Blob([JSON.stringify(o,null,2)],{type:'application/json'})}
  files.push({name:'sniplit-identity.json',data:JSON.stringify(id,null,2)});
  if(sel('likes'))files.push({name:'liked-songs.csv',data:toCSV(id.likes,['title','artist','album','genre','release','isrc','url'])});
  if(sel('history'))files.push({name:'listening-history.csv',data:toCSV(id.history.map(h=>({...h.track,at:h.at,ms:h.ms,full:h.full})),['at','title','artist','album','ms','full'])});
  if(sel('ratings'))files.push({name:'ratings.csv',data:toCSV(Object.entries(id.ratings).map(([k,v])=>({id:k,rating:v,title:(Store.likes[k]||{}).title||''})),['id','title','rating'])});
  if(sel('playlists'))for(const p of id.playlists){const n=SFile.safeName(p.name);files.push({name:`playlists/${n}.m3u8`,data:toM3U(p)},{name:`playlists/${n}.xspf`,data:toXSPF(p)},{name:`playlists/${n}.csv`,data:toCSV(p.tracks,['title','artist','album','url'])})}
  files.push({name:'README.txt',data:'sniplit identity export\n\nsniplit-identity.json — full machine-readable profile (re-import into sniplit)\n*.csv — opens in Excel/Sheets; importable by TuneMyMusic/Soundiiz\nplaylists/*.m3u8, *.xspf — standard playlist formats (VLC, foobar2000, Apple Music via file import)\n'});
  return SFile.makeZip(files);
}
function importIdentity(d){
  for(const t of d.likes||[])Store.likes[t.id]=t;Object.assign(Store.ratings,d.ratings||{});for(const f of d.follows||[])Store.follows[f.id]=f;
  for(const p of d.playlists||[])if(!Store.playlists.some(x=>x.id===p.id))Store.playlists.push(p);
  for(const h of d.history||[])Store.history.push({track:h.track,at:Date.parse(h.at),ms:h.ms,full:h.full});Store.history.sort((a,b)=>a.at-b.at);
  if(d.listening){Store.stats.ms+=d.listening.ms||0}Object.assign(Store.offsets,d.lyricOffsets||{});
  Store.save('likes','ratings','follows','playlists','history','stats','offsets');
}
window.SImport={fromLink,linkKind,importFiles,filesFromDrop,parseExport,parseText,applyImport,Linked,exportIdentity,importIdentity,identity,toM3U,toXSPF,AUDIO_RE};
})();
;(window.__snParts=window.__snParts||{})["lib/import.js"]="662870336b97";
