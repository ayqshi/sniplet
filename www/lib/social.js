/* sniplit social — accountless friends over end-to-end-encrypted signaling + WebRTC data channels.
   • Identity: random id + inbox key, kept on device. Your friend link carries both.
   • Signaling/mailbox: MQTT over WebSocket (public brokers or your own); every payload is AES-GCM encrypted,
     topics are hashes, so brokers only ever see opaque bytes.
   • Live: once both friends are online a WebRTC data channel opens and presence, now-playing, stories and
     playlists flow peer-to-peer. Retained encrypted presence lets friends see "last active" while you're away. */
(function(){
const{Store,LS}=SData;
const enc=new TextEncoder(),dec=new TextDecoder();
const b64u=u8=>btoa(String.fromCharCode(...u8)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const ub64u=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
const hex=u8=>[...u8].map(b=>b.toString(16).padStart(2,'0')).join('');
const rnd=n=>crypto.getRandomValues(new Uint8Array(n));
async function sha(s){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof s==='string'?enc.encode(s):s))).slice(0,24)}
const keyCache=new Map();
async function aesKey(raw){const k=typeof raw==='string'?raw:b64u(raw);if(!keyCache.has(k))keyCache.set(k,await crypto.subtle.importKey('raw',typeof raw==='string'?ub64u(raw):raw,'AES-GCM',false,['encrypt','decrypt']));return keyCache.get(k)}
async function seal(keyB64,obj){const iv=rnd(12);const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey(keyB64),enc.encode(JSON.stringify(obj))));const out=new Uint8Array(12+ct.length);out.set(iv);out.set(ct,12);return out}
async function open(keyB64,u8){try{const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:u8.slice(0,12)},await aesKey(keyB64),u8.slice(12));return JSON.parse(dec.decode(pt))}catch(e){return null}}

/* ---------------- minimal MQTT 3.1.1 client over WebSocket ---------------- */
class MQTT{
  constructor(urls,onMsg,onState){this.urls=urls;this.onMsg=onMsg;this.onState=onState||(()=>{});this.subs=new Set();this.buf=new Uint8Array(0);this.ui=0;this.pid=1;this.up=false;this.queue=[]}
  connect(){const url=this.urls[this.ui%this.urls.length];let ws;try{ws=new WebSocket(url,'mqtt')}catch(e){return this.retry()}
    ws.binaryType='arraybuffer';this.ws=ws;
    ws.onopen=()=>{const cid=enc.encode('sn'+hex(rnd(8)));const vh=[0,4,77,81,84,84,4,2,0,60];this.raw(0x10,[...vh,cid.length>>8,cid.length&255,...cid])};
    ws.onmessage=e=>this.feed(new Uint8Array(e.data));
    ws.onclose=()=>{this.up=false;this.onState(false,url);clearInterval(this.ping);this.retry()};ws.onerror=()=>{try{ws.close()}catch(e){}}}
  retry(){clearTimeout(this.rt);this.ui++;this.rt=setTimeout(()=>this.connect(),Math.min(30000,1500*Math.max(1,this.ui)))}
  raw(type,body){const len=[];let n=body.length;do{let b=n%128;n=Math.floor(n/128);if(n>0)b|=128;len.push(b)}while(n>0);const pkt=new Uint8Array(1+len.length+body.length);pkt[0]=type;pkt.set(len,1);pkt.set(body,1+len.length);if(this.ws&&this.ws.readyState===1)this.ws.send(pkt)}
  str(s){const b=enc.encode(s);return[b.length>>8,b.length&255,...b]}
  subscribe(topic){this.subs.add(topic);if(this.up){const id=this.pid++&0xffff||1;this.raw(0x82,[id>>8,id&255,...this.str(topic),0])}}
  unsubscribe(topic){this.subs.delete(topic);if(this.up){const id=this.pid++&0xffff||1;this.raw(0xA2,[id>>8,id&255,...this.str(topic)])}}
  publish(topic,payload,retain=false){if(!this.up){this.queue.push([topic,payload,retain]);return}const p=payload instanceof Uint8Array?payload:enc.encode(payload);this.raw(0x30|(retain?1:0),[...this.str(topic),...p])}
  feed(chunk){const b=new Uint8Array(this.buf.length+chunk.length);b.set(this.buf);b.set(chunk,this.buf.length);this.buf=b;
    for(;;){if(this.buf.length<2)return;let mul=1,len=0,i=1,byte;do{if(i>=this.buf.length)return;byte=this.buf[i++];len+=(byte&127)*mul;mul*=128}while(byte&128);
      if(this.buf.length<i+len)return;const type=this.buf[0]>>4,flags=this.buf[0]&15,body=this.buf.slice(i,i+len);this.buf=this.buf.slice(i+len);this.handle(type,flags,body)}}
  handle(type,flags,body){
    if(type===2){if(body[1]!==0){this.ws.close();return}this.up=true;this.ui=0;this.onState(true);for(const t of this.subs){const id=this.pid++&0xffff||1;this.raw(0x82,[id>>8,id&255,...this.str(t),0])}
      const q=this.queue.splice(0);q.forEach(a=>this.publish(...a));clearInterval(this.ping);this.ping=setInterval(()=>this.raw(0xC0,[]),30000)}
    if(type===3){const tl=(body[0]<<8)|body[1];const topic=dec.decode(body.slice(2,2+tl));let p=2+tl;if((flags>>1)&3)p+=2;this.onMsg(topic,body.slice(p))}}
}

/* ---------------- social state ---------------- */
const S=LS.get('social',null)||{};
if(!S.id){S.id=hex(rnd(8));S.inbox=b64u(rnd(16));S.name='';S.created=Date.now();S.share=true;S.sharePlaylists=true}
if(S.shareLikes===undefined)S.shareLikes=true;
// new listeners start as a guest with a name they can change
if(!S.name)S.name='guest_'+S.id.slice(0,8);
S.friends=S.friends||{};S.out=S.out||{};S.inReq=S.inReq||{};if(S.discoverable===undefined)S.discoverable=true;
const save=()=>LS.set('social',S);save();
const listeners=new Set();const emit=()=>listeners.forEach(f=>{try{f()}catch(e){}});
// names are always filtered for swearing and slurs, whoever chose them
const cleanName=n=>n==null?n:(window.SClean?SClean.clean(String(n),true):String(n));
const DEFAULT_BROKERS=['wss://broker.hivemq.com:8884/mqtt','wss://broker.emqx.io:8084/mqtt','wss://test.mosquitto.org:8081/mqtt'];
let mq=null,online=false,myTopicHash=null;const peers={};// friendId -> {pc,dc,state}
const T={mb:(ph,ih)=>`sniplit/v1/p/${ph}/mb/${ih}`,inbox:h=>`sniplit/v1/i/${h}`,pres:(ph,ih)=>`sniplit/v1/p/${ph}/pr/${ih}`,sig:(ph,ih)=>`sniplit/v1/p/${ph}/sg/${ih}`};
const code=()=>b64u(new Uint8Array([...Uint8Array.from(S.id.match(/../g),h=>parseInt(h,16)),...ub64u(S.inbox)]));
function parseCode(c){c=String(c).trim().replace(/^.*#add-/,'');try{const u=ub64u(c);if(u.length!==24)return null;return{id:hex(u.slice(0,8)),inbox:b64u(u.slice(8))}}catch(e){return null}}
function link(){const base=/^https?:$/.test(location.protocol)&&!/^(localhost|127\.)/.test(location.hostname)?location.origin+location.pathname:(window.SNIPLIT_SITE||'https://ayqshi.github.io/sniplet/www/index.html');return base+'#add-'+code()}

async function start(){
  if(mq)return;const brokers=(Store.settings.broker?[Store.settings.broker]:[]).concat(DEFAULT_BROKERS);
  mq=new MQTT(brokers,onMqtt,(up)=>{online=up;emit();if(up)announce()});
  myTopicHash=await sha(S.inbox);mq.subscribe(T.inbox(myTopicHash)+'/#');
  for(const f of Object.values(S.friends))await watchFriend(f);
  mq.subscribe(DIR+'+');mq.connect();
  setInterval(()=>{if(online)publishPresence()},60000);setInterval(()=>{if(online)publishDir()},6e5);
  document.addEventListener('visibilitychange',()=>{publishPresence();broadcast()});
  addEventListener('pagehide',()=>{S._leaving=true;publishPresence(true)});
}
async function watchFriend(f){f.ph=f.ph||await sha(f.pair);f.myh=f.myh||await sha(S.id+f.pair);f.th=f.th||await sha(f.id+f.pair);
  mq.subscribe(T.pres(f.ph,f.th));mq.subscribe(T.sig(f.ph,f.myh));mq.subscribe(T.mb(f.ph,f.myh)+'/#')}
/* ---- Find friends: an opt-in public listing (name, invite code, a few favourite artists — nothing else) ---- */
const DIR='sniplit/v1/dir/';const dir=new Map();let dirT=0;
function publishDir(){if(!mq)return;if(!S.discoverable){mq.publish(DIR+S.id,new Uint8Array(0),true);return}const d=provider()||{};const ta=d.taste||{};
  mq.publish(DIR+S.id,JSON.stringify({v:1,id:S.id,name:(S.name||'').slice(0,40),code:code(),artists:(ta.artists||[]).slice(0,8),genres:(ta.genres||[]).slice(0,4),now:S.share&&d.now?{title:d.now.title,artist:d.now.artist,art:d.now.art&&/^https:/.test(d.now.art)?d.now.art:''}:null,at:Date.now()}),true)}
function onDir(id,payload){if(id===S.id)return;if(!payload.length){dir.delete(id);return}try{const m=JSON.parse(dec.decode(payload));if(m.v!==1||m.id!==id||!parseCode(m.code)||Date.now()-m.at>14*864e5)return;
  dir.set(id,{id,name:String(m.name||'').slice(0,40),code:m.code,artists:(m.artists||[]).slice(0,8).map(String),genres:(m.genres||[]).slice(0,4).map(String),now:m.now&&m.now.title?m.now:null,at:+m.at});if(dir.size>800){const old=[...dir.values()].sort((a,b)=>a.at-b.at)[0];dir.delete(old.id)}
  clearTimeout(dirT);dirT=setTimeout(emit,400)}catch(e){}}
async function onMqtt(topic,payload){
  if(topic.startsWith(DIR)){onDir(topic.slice(DIR.length),payload);return}
  if(!payload.length)return;
  if(topic.startsWith(T.inbox(myTopicHash)+'/')){const m=await open(S.inbox,payload);if(!m)return;
    if(m.t==='req'){if(S.friends[m.from.id]){mq.publish(topic,new Uint8Array(0),true);return}S.inReq[m.from.id]={...m.from,name:cleanName(m.from.name),pair:m.pair,at:m.at,topic};save();emit()}
    if(m.t==='acc'){const o=S.out[m.from.id];if(!o||o.pair!==m.pair)return;delete S.out[m.from.id];const f=S.friends[m.from.id]={id:m.from.id,name:m.from.name,pair:m.pair,since:Date.now()};mq.publish(topic,new Uint8Array(0),true);save();await watchFriend(f);publishPresence();hello(f);emit()}
    if(m.t==='dec'){delete S.out[m.from.id];mq.publish(topic,new Uint8Array(0),true);save();emit()}
    return}
  for(const f of Object.values(S.friends)){if(!f.ph)continue;
    if(topic===T.pres(f.ph,f.th)){const m=await open(f.pair,payload);if(!m)return;applyPresence(f,m);if(m.active&&Date.now()-m.at<120000&&!(peers[f.id]&&peers[f.id].dc&&peers[f.id].dc.readyState==='open'))hello(f);return}
    if(topic.startsWith(T.mb(f.ph,f.myh)+'/')){const m=await open(f.pair,payload);mq.publish(topic,new Uint8Array(0),true);if(m&&m.t==='track')gotTrack(f,m.track,m.at);if(m)onChat(f,m);return}
    if(topic===T.sig(f.ph,f.myh)){const m=await open(f.pair,payload);if(!m)return;onSignal(f,m);return}}
}
function applyPresence(f,m){if(m.removed){delete S.friends[f.id];save();emit();return}
  f.name=cleanName(m.name)||f.name;{const nn=m.note&&typeof m.note==='object'&&Date.now()-(+m.note.at||0)<864e5?m.note:null;const old=f.p&&f.p.note;if(nn&&(!old||old.at!==nn.at)&&Date.now()-nn.at<36e5){try{window.sniplitNotify&&sniplitNotify('notes','note-'+f.id,f.name+' left a note',(nn.line?'“'+String(nn.line.text).slice(0,80)+'” — ':'')+((nn.track&&nn.track.title)||''),'#friends')}catch(e){}}}
  f.p={note:m.note&&typeof m.note==='object'&&Date.now()-(+m.note.at||0)<864e5?m.note:null,pro:!!m.pro,active:!!m.active,now:m.now||null,at:m.at,story:m.story||null,year:m.year||null,avatar:m.avatar||null};save();emit()}

/* ---------------- presence ---------------- */
let provider=()=>({});// app supplies {now, story, year, playlists}
function myPresence(leaving){const d=provider();return{pro:!!d.pro,name:S.name||'sniplit listener',active:!leaving&&document.visibilityState==='visible',now:S.share?d.now||null:null,at:Date.now(),story:S.share?d.story||null:null,year:S.share?d.year||null:null,note:d.note&&Date.now()-d.note.at<864e5?d.note:null}}
async function publishPresence(leaving){if(!mq)return;const pr=myPresence(leaving);for(const f of Object.values(S.friends)){if(!f.ph)continue;mq.publish(T.pres(f.ph,f.myh),await seal(f.pair,pr),true)}}
function announce(){publishPresence();publishDir();for(const f of Object.values(S.friends))hello(f)}
async function sig(f,m){mq.publish(T.sig(f.ph,f.th),await seal(f.pair,m))}

/* ---------------- WebRTC ---------------- */
const ICE=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']},{urls:'stun:stun.cloudflare.com:3478'}];
function hello(f){const p=peers[f.id];if(p&&p.dc&&p.dc.readyState==='open')return;if(p&&Date.now()-p.t<8000)return;sig(f,{t:'hello',from:S.id})}
async function gather(pc){if(pc.iceGatheringState==='complete')return;await new Promise(r=>{const to=setTimeout(r,2500);pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(to);r()}})})}
function newPeer(f){const old=peers[f.id];if(old){try{old.pc.close()}catch(e){}}const pc=new RTCPeerConnection({iceServers:ICE});const p=peers[f.id]={pc,dc:null,t:Date.now()};
  pc.onconnectionstatechange=()=>{if(['failed','closed','disconnected'].includes(pc.connectionState)){if(f.p){f.p.live=false}emit()}};
  pc.ondatachannel=e=>bindDC(f,e.channel);return p}
function bindDC(f,dc){const p=peers[f.id];p.dc=dc;dc.onopen=()=>{f.p=f.p||{};f.p.live=true;send(f,{t:'presence',...myPresence()});sendPlaylists(f);emit()};
  dc.onclose=()=>{if(f.p){f.p.live=false;f.p.active=false;f.p.at=Date.now()}save();emit()};
  dc.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(x){return}
    if(m.t==='presence'){applyPresence(f,m);f.p.live=true}
    if(m.t==='playlists'){f.playlists=m.list;f.likes=Array.isArray(m.likes)?m.likes:null;f.follows=Array.isArray(m.follows)?m.follows:null;f.plAt=Date.now();save();emit()}
    if(m.t==='getPlaylists')sendPlaylists(f);if(m.t==='track')gotTrack(f,m.track,m.at);onChat(f,m)}}
function gotTrack(f,track,at){S.gifts=S.gifts||[];if(S.gifts.some(g=>g.track.id===track.id&&g.from===f.id))return;S.gifts.unshift({from:f.id,name:f.name,track,at:at||Date.now()});S.gifts=S.gifts.slice(0,50);save();emit()}
async function sendTrack(id,track){const f=S.friends[id];if(!f)return;const t={id:track.id,title:track.title,artist:track.artist,album:track.album,art:track.art&&!track.art.startsWith('data:')?track.art:'',preview:track.preview,durationMs:track.durationMs,artistId:track.artistId,src:track.src==='local'?'itunes':track.src,ytId:track.ytId};
  const m={t:'track',track:t,at:Date.now()};if(SSocial.isLive(id))return send(f,m);await start();mq.publish(T.mb(f.ph,f.th)+'/'+hex(rnd(6)),await seal(f.pair,m),true)}
/* ---------------- messages ----------------
   Texts, photos, voice notes and songs between friends. End-to-end sealed with the pair key like everything else.
   Delivered straight over the WebRTC channel when both are online, otherwise left (in pieces, for big media) in
   the friend's mailbox on the public relays until they come online. Kept on this device in IndexedDB. */
const CH={db:null,mem:{},ready:null};
function chDB(){return CH.ready||(CH.ready=new Promise(res=>{try{const r=indexedDB.open('sniplit-chat',1);r.onupgradeneeded=()=>r.result.createObjectStore('c');r.onsuccess=()=>{CH.db=r.result;res(CH.db)};r.onerror=()=>res(null)}catch(e){res(null)}}))}
async function chLoad(fid){if(CH.mem[fid])return CH.mem[fid];const db=await chDB();let v=[];if(db)v=await new Promise(r=>{const q=db.transaction('c').objectStore('c').get(fid);q.onsuccess=()=>r(q.result||[]);q.onerror=()=>r([])});return CH.mem[fid]=CH.mem[fid]||v}
async function chSave(fid){const db=await chDB();if(!db)return;try{db.transaction('c','readwrite').objectStore('c').put(CH.mem[fid].slice(-800),fid)}catch(e){}}
const parts={};// mid -> {n, got:[]}
const PART=40000;// pieces small enough for every public relay and a WebRTC channel
async function deliver(f,m){const json=JSON.stringify(m);if(SSocial.isLive(f.id)&&json.length<PART*4){const p=peers[f.id];if(p&&p.dc&&p.dc.bufferedAmount<4e6){if(json.length<PART){send(f,m);return 'live'}}}
  if(json.length>=PART){const n=Math.ceil(json.length/PART);for(let i=0;i<n;i++){const piece={t:'part',mid:m.id,i,n,d:json.slice(i*PART,(i+1)*PART)};if(SSocial.isLive(f.id))send(f,piece);else{await start();mq.publish(T.mb(f.ph,f.th)+'/'+hex(rnd(6)),await seal(f.pair,piece),true)}}return SSocial.isLive(f.id)?'live':'box'}
  await start();mq.publish(T.mb(f.ph,f.th)+'/'+hex(rnd(6)),await seal(f.pair,m),true);return 'box'}
async function onChat(f,m){
  if(m.t==='part'){const P=parts[m.mid]=parts[m.mid]||{n:m.n,got:[],at:Date.now()};P.got[m.i]=m.d;if(P.got.filter(x=>x!=null).length===P.n){delete parts[m.mid];let full;try{full=JSON.parse(P.got.join(''))}catch(e){return}return onChat(f,full)}return}
  if(m.t==='msg'){const L=await chLoad(f.id);if(L.some(x=>x.id===m.id))return;L.push({id:m.id,me:false,kind:m.kind,text:m.text||'',data:m.data||null,mime:m.mime||'',dur:m.dur||0,name:m.name||'',track:m.track||null,at:m.at||Date.now(),got:Date.now(),read:false});L.sort((a,b)=>a.at-b.at);chSave(f.id);
    deliver(f,{t:'ack',id:m.id}).catch(()=>{});emit();try{window.sniplitNotify&&sniplitNotify('messages','chat-'+f.id,f.name,m.kind==='text'?(window.SClean?SClean.clean(m.text):m.text).slice(0,140):m.kind==='image'?'📷 Photo':m.kind==='voice'?'🎙 Voice note'+(m.dur?' · '+Math.round(m.dur)+'s':''):'🎵 '+((m.track&&m.track.title)||'A song')+(m.track&&m.track.artist?' — '+m.track.artist:''),'#chat-'+f.id)}catch(e){}return}
  if(m.t==='ack'){const L=await chLoad(f.id);const x=L.find(y=>y.id===m.id);if(x&&x.me&&x.state!=='seen'){x.state='delivered';chSave(f.id);emit()}return}
  if(m.t==='seen'){const L=await chLoad(f.id);let ch=false;for(const x of L)if(x.me&&x.at<=m.upTo&&x.state!=='seen'){x.state='seen';ch=true}if(ch){chSave(f.id);emit()}return}
  if(m.t==='unsend'){const L=await chLoad(f.id);const i=L.findIndex(x=>x.id===m.id&&!x.me);if(i>=0){L.splice(i,1);chSave(f.id);emit()}return}
  if(m.t==='typing'){f.typing=Date.now();emit();setTimeout(emit,4500)}}
async function sendMsg(fid,body){const f=S.friends[fid];if(!f)throw new Error('Not a friend');const m={t:'msg',id:hex(rnd(8)),at:Date.now(),...body};
  if(m.track){const t=m.track;m.track={id:t.id,title:t.title,artist:t.artist,album:t.album,art:t.art&&!String(t.art).startsWith('data:')?t.art:'',preview:t.preview,durationMs:t.durationMs,artistId:t.artistId,src:t.src==='local'?'itunes':t.src,ytId:t.ytId,dzId:t.dzId,itId:t.itId,auId:t.auId}}
  const L=await chLoad(fid);const rec={id:m.id,me:true,kind:m.kind,text:m.text||'',data:m.data||null,mime:m.mime||'',dur:m.dur||0,name:m.name||'',track:m.track||null,at:m.at,state:'sending'};L.push(rec);chSave(fid);emit();
  try{const how=await deliver(f,m);rec.state=how==='live'?'sent':'waiting';}catch(e){rec.state='failed'}chSave(fid);emit();return rec}
async function deleteMsg(fid,mid,everyone){const L=await chLoad(fid);const i=L.findIndex(x=>x.id===mid);if(i<0)return;const x=L[i];L.splice(i,1);chSave(fid);emit();if(everyone&&x.me){const f=S.friends[fid];if(f)deliver(f,{t:'unsend',id:mid}).catch(()=>{})}}
async function markRead(fid){const L=await chLoad(fid);let last=0,ch=false;for(const x of L)if(!x.me){if(!x.read){x.read=true;ch=true}last=Math.max(last,x.at)}if(ch){chSave(fid);emit();const f=S.friends[fid];if(f&&last)deliver(f,{t:'seen',upTo:last}).catch(()=>{})}}
async function patchMsg(fid,mid,patch){const L=await chLoad(fid);const x=L.find(y=>y.id===mid);if(!x)return;Object.assign(x,patch);chSave(fid);emit()}
function unread(fid){const L=CH.mem[fid];return L?L.filter(x=>!x.me&&!x.read).length:0}
let typT=0;function typing(fid){if(Date.now()-typT<3000)return;typT=Date.now();const f=S.friends[fid];if(f&&SSocial.isLive(fid))send(f,{t:'typing'})}
// load every conversation once so unread counts are right from the start; drop half-arrived pieces after a day
chDB().then(()=>Promise.all(Object.keys(S.friends).map(chLoad))).then(emit);setInterval(()=>{for(const k in parts)if(Date.now()-parts[k].at>864e5)delete parts[k]},36e5);
async function onSignal(f,m){
  if(m.t==='hello'){if(S.id<f.id){const p=newPeer(f);bindDC(f,p.pc.createDataChannel('sniplit'));await p.pc.setLocalDescription(await p.pc.createOffer());await gather(p.pc);sig(f,{t:'offer',sdp:p.pc.localDescription.sdp})}else sig(f,{t:'hello2'})}
  if(m.t==='hello2'&&S.id<f.id)onSignal(f,{t:'hello'});
  if(m.t==='offer'){const p=newPeer(f);await p.pc.setRemoteDescription({type:'offer',sdp:m.sdp});await p.pc.setLocalDescription(await p.pc.createAnswer());await gather(p.pc);sig(f,{t:'answer',sdp:p.pc.localDescription.sdp})}
  if(m.t==='answer'){const p=peers[f.id];if(p&&p.pc.signalingState==='have-local-offer')await p.pc.setRemoteDescription({type:'answer',sdp:m.sdp})}
}
function send(f,m){const p=peers[f.id];if(p&&p.dc&&p.dc.readyState==='open'){try{p.dc.send(JSON.stringify(m))}catch(e){}}}
function sendPlaylists(f){const d=provider();const likes=S.shareLikes===false?[]:(d.likes||[]).slice(0,300);const follows=S.shareLikes===false?[]:(d.follows||[]).slice(0,60);if(!S.sharePlaylists)return send(f,{t:'playlists',list:[],likes,follows});send(f,{t:'playlists',list:(d.playlists||[]).slice(0,40),likes,follows})}
function broadcast(){const pr={t:'presence',...myPresence()};for(const f of Object.values(S.friends))send(f,pr)}

/* ---------------- friend actions ---------------- */
async function request(c){const t=parseCode(c);if(!t)throw new Error('That link or code isn’t valid');if(t.id===S.id)throw new Error('That’s your own link');if(S.friends[t.id])throw new Error('Already friends');
  const pair=b64u(rnd(32));S.out[t.id]={id:t.id,inbox:t.inbox,pair,at:Date.now()};save();
  const h=await sha(t.inbox);await start();mq.publish(T.inbox(h)+'/'+(await sha(S.id+t.id)),await seal(t.inbox,{t:'req',from:{id:S.id,name:S.name||'sniplit listener',code:code()},pair,at:Date.now()}),true);emit()}
async function accept(id){const r=S.inReq[id];if(!r)return;const them=parseCode(r.code);delete S.inReq[id];const f=S.friends[id]={id,name:cleanName(r.name),pair:r.pair,since:Date.now()};save();
  mq.publish(r.topic,new Uint8Array(0),true);await watchFriend(f);const h=await sha(them.inbox);mq.publish(T.inbox(h)+'/'+(await sha(S.id+id)),await seal(them.inbox,{t:'acc',from:{id:S.id,name:S.name||'sniplit listener'},pair:r.pair}),true);publishPresence();hello(f);emit()}
async function decline(id){const r=S.inReq[id];if(!r)return;delete S.inReq[id];save();mq.publish(r.topic,new Uint8Array(0),true);const them=parseCode(r.code);if(them){const h=await sha(them.inbox);mq.publish(T.inbox(h)+'/'+(await sha(S.id+id)),await seal(them.inbox,{t:'dec',from:{id:S.id}}),true)}emit()}
async function remove(id){const f=S.friends[id];if(!f)return;if(f.ph)mq.publish(T.pres(f.ph,f.myh),await seal(f.pair,{removed:true,at:Date.now()}),true);try{peers[id]&&peers[id].pc.close()}catch(e){}delete peers[id];delete S.friends[id];save();emit()}
function cancel(id){delete S.out[id];save();emit()}
function requestPlaylists(id){const f=S.friends[id];if(f)send(f,{t:'getPlaylists'})}
function setName(n){S.name=cleanName(String(n||'').slice(0,40))||('guest_'+S.id.slice(0,8));save();publishPresence();publishDir();broadcast();emit()}
function setOpt(k,v){S[k]=v;save();publishPresence();if(k==='discoverable'||k==='share')publishDir();broadcast();for(const f of Object.values(S.friends))sendPlaylists(f);emit()}

/** move this identity to another device: the recovery key is the friend code (id + inbox) */
function restore(key){const p=parseCode(key);if(!p)return false;S.id=p.id;S.inbox=p.inbox;S.friends={};S.out={};S.inReq={};if(/^guest_/.test(S.name||''))S.name='guest_'+S.id.slice(0,8);save();try{publishPresence();publishDir()}catch(e){}emit();return true}
const uuid=()=>S.id.replace(/^(.{8})(.{4})(.{4})$/,'$1-$2-$3');
window.SSocial={patchMsg,restore,uuid,chat:chLoad,sendMsg,deleteMsg,markRead,unread,typing,unreadTotal:()=>Object.keys(S.friends).reduce((n,k)=>n+unread(k),0),directory:()=>[...dir.values()].filter(x=>!S.friends[x.id]&&!S.out[x.id]&&!S.inReq[x.id]),sendTrack,start,request,accept,decline,remove,cancel,requestPlaylists,setName,setOpt,link,code,parseCode,
  update(){publishPresence();broadcast()},setProvider(f){provider=f},on(f){listeners.add(f);return()=>listeners.delete(f)},
  get me(){return S},get online(){return online},isLive(id){const p=peers[id];return!!(p&&p.dc&&p.dc.readyState==='open')},MQTT};
})();
;(window.__snParts=window.__snParts||{})["lib/social.js"]="662870336b97";
