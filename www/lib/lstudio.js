/* sniplit Lyric Studio — the screen: pick a song, sync, style, preview, export, publish.
   Rendering and export share one renderer (SLCompose.render). Export is frame-exact: every frame is drawn at its
   own timestamp and encoded with WebCodecs (H.264), audio with AAC (or Opus where the browser has no AAC encoder),
   then written to MP4 by SMP4. Nothing is captured in real time, so frames can't drop or repeat. */
(function(){
const C=window.SLCompose,LS=window.SLSync;
const RES={'720p':[720,1280],'1080p':[1080,1920],'1440p':[1440,2560],'2160p':[2160,3840]};
const ASPECTS={'9:16':16/9,'4:5':5/4,'1:1':1};
/** frame size: the resolution names the short side; the aspect sets the height (4K vertical = 2160 × 3840) */
const dims=(res,aspect='9:16')=>{const w=RES[res][0];return[w,Math.round(w*(ASPECTS[aspect]||16/9)/2)*2]};
const BITRATE={'720p':8e6,'1080p':14e6,'1440p':24e6,'2160p':42e6};
const fmt=t=>{t=Math.max(0,t||0);const m=Math.floor(t/60),s=t-m*60;return`${m}:${s.toFixed(2).padStart(5,'0')}`};
const parseT=v=>{const m=String(v).trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);return m?(+(m[1]||0))*60+ +m[2]:NaN};
const CONF={source:['Timed by the lyrics source','#4ade80'],heard:['Matched to the vocals','#4ade80'],estimated:['Estimated — check it','#fbbf24'],manual:['Set by you','#e5e7eb']};

/* ---------- H.264 level for a size and frame rate ---------- */
function avcCodecs(W,H,fps){const mbs=Math.ceil(W/16)*Math.ceil(H/16),rate=mbs*fps;
  const lv=[[31,3600,108000],[40,8192,245760],[42,8704,522240],[50,22080,589824],[51,36864,983040],[52,36864,2073600],[60,139264,4177920],[62,139264,16711680]].find(l=>mbs<=l[1]&&rate<=l[2])||[62];
  const h=lv[0].toString(16).padStart(2,'0');return[`avc1.6400${h}`,`avc1.4d00${h}`,`avc1.42e0${h}`]}
async function pickVideo(W,H,fps,bitrate){if(!('VideoEncoder'in window))return null;for(const codec of avcCodecs(W,H,fps)){for(const hw of['prefer-hardware','no-preference','prefer-software']){const cfg={codec,width:W,height:H,framerate:fps,bitrate,bitrateMode:'variable',latencyMode:'quality',avc:{format:'avc'},hardwareAcceleration:hw};
    try{const r=await VideoEncoder.isConfigSupported(cfg);if(r.supported)return r.config||cfg}catch(e){}}}return null}
async function pickAudio(){if(!('AudioEncoder'in window))return null;for(const[codec,kind]of[['mp4a.40.2','aac'],['opus','opus']]){const cfg={codec,sampleRate:48000,numberOfChannels:2,bitrate:192000,...(kind==='aac'?{aac:{format:'aac'}}:{})};
    try{const r=await AudioEncoder.isConfigSupported(cfg);if(r.supported)return{cfg,kind}}catch(e){}}return null}
/** what this device can export, checked before the person waits for a render */
async function capabilities(fps,aspect){const out={};for(const k of Object.keys(RES)){const[W,H]=dims(k,aspect);out[k]=!!(await pickVideo(W,H,fps,BITRATE[k]))}out.audio=await pickAudio();return out}

/* ---------- export ---------- */
async function exportVideo({buffer,range,res,fps,aspect,compArgs,onProgress,signal}){const[W,H]=dims(res,aspect);const br=Math.round(BITRATE[res]*(fps>30?1.4:1));
  const vcfg=await pickVideo(W,H,fps,br);if(!vcfg)throw new Error(`This device can’t encode ${res} H.264 video. Try a lower resolution, or export on a computer (Chrome, Edge or the sniplit desktop app).`);
  const acfg=buffer?await pickAudio():null;if(buffer&&!acfg)throw new Error('This browser can’t encode audio. Use Chrome, Edge or Safari, or the sniplit desktop app.');
  if(document.fonts&&document.fonts.ready)await document.fonts.ready;
  const[a,b]=range;const dur=b-a;const N=Math.round(dur*fps);
  const mux=new SMP4.Muxer({video:{width:W,height:H,fps},audio:acfg?{codec:acfg.kind,sampleRate:48000,channels:2,bitrate:192000}:null});
  // 1 — audio: the chosen range, resampled to 48 kHz stereo, encoded up front (it is small)
  if(acfg){onProgress(0,'Encoding audio');const len=Math.ceil(dur*48000);const oc=new OfflineAudioContext(2,len,48000);const src=oc.createBufferSource();src.buffer=buffer;src.connect(oc.destination);src.start(0,a,dur);const pcm=await oc.startRendering();
    const chunks=[];let err=null;const enc=new AudioEncoder({output:(ch,meta)=>{if(meta&&meta.decoderConfig&&meta.decoderConfig.description)mux.setAudioConfig(new Uint8Array(meta.decoderConfig.description));const d=new Uint8Array(ch.byteLength);ch.copyTo(d);chunks.push({d,dur:ch.duration})},error:e=>err=e});
    enc.configure(acfg.cfg);const F=acfg.kind==='aac'?1024:960;const L0=pcm.getChannelData(0),R0=pcm.getChannelData(1);
    for(let i=0;i<len;i+=F){const n=Math.min(F,len-i);const data=new Float32Array(n*2);data.set(L0.subarray(i,i+n),0);data.set(R0.subarray(i,i+n),n);
      const ad=new AudioData({format:'f32-planar',sampleRate:48000,numberOfFrames:n,numberOfChannels:2,timestamp:Math.round(i/48000*1e6),data});enc.encode(ad);ad.close();if(err)throw err;if(signal&&signal.aborted)throw new DOMException('Cancelled','AbortError')}
    await enc.flush();enc.close();if(err)throw err;
    for(const c of chunks)mux.addAudio(c.d,acfg.kind==='aac'?1024:Math.max(1,Math.round((c.dur||20000)*48000/1e6)))}
  // 2 — video: every frame drawn at its exact time, at the real output size
  const cv=new OffscreenCanvas(W,H);const x=cv.getContext('2d',{alpha:false});const comp=C.build({...compArgs,W,H,fps});
  let verr=null;const ve=new VideoEncoder({output:(ch,meta)=>{if(meta&&meta.decoderConfig&&meta.decoderConfig.description)mux.setVideoConfig(new Uint8Array(meta.decoderConfig.description));const d=new Uint8Array(ch.byteLength);ch.copyTo(d);mux.addVideo(d,{pts:ch.timestamp,key:ch.type==='key'})},error:e=>verr=e});
  ve.configure(vcfg);const t0=performance.now();
  for(let i=0;i<N;i++){if(signal&&signal.aborted){try{ve.close()}catch(e){}throw new DOMException('Cancelled','AbortError')}if(verr)throw verr;
    C.render(x,a+i/fps,comp);const vf=new VideoFrame(cv,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});ve.encode(vf,{keyFrame:i%(fps*2)===0});vf.close();
    while(ve.encodeQueueSize>3)await new Promise(r=>setTimeout(r,2));
    if(i%6===0){const el=(performance.now()-t0)/1000;onProgress(.04+.94*(i/N),`Frame ${i+1} of ${N}`,i>30?el/i*(N-i):null);await new Promise(r=>setTimeout(r,0))}}
  await ve.flush();ve.close();if(verr)throw verr;onProgress(.99,'Writing MP4');
  const blob=mux.finish();onProgress(1,'Done');return{blob,W,H,fps,frames:N,audio:acfg?acfg.kind:null,codec:vcfg.codec}}

/* ---------- audio playback for the editor ---------- */
class Deck{constructor(){this.buf=null;this.ctx=null;this.src=null;this.at=0;this.t0=0;this.playing=false;this.listeners=new Set()}
  load(buf){this.stop();this.buf=buf;this.at=0}
  ensure(){if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext;this.ctx=new AC();try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch(e){}}if(this.ctx.state!=='running')this.ctx.resume().catch(()=>{})}
  get time(){return this.playing?this.at+(this.ctx.currentTime-this.t0):this.at}
  play(from){if(!this.buf)return;this.ensure();this.stopNode();if(from!=null)this.at=Math.max(0,Math.min(from,this.buf.duration-.05));const s=this.ctx.createBufferSource();s.buffer=this.buf;s.connect(this.ctx.destination);s.start(0,this.at);this.t0=this.ctx.currentTime;this.src=s;this.playing=true;
    s.onended=()=>{if(this.src===s){this.at=Math.min(this.buf.duration,this.time);this.playing=false;this.src=null;this.emit()}};this.emit()}
  pause(){if(!this.playing)return;this.at=this.time;this.stopNode();this.playing=false;this.emit()}
  toggle(){this.playing?this.pause():this.play()}
  seek(t){const p=this.playing;if(p)this.play(t);else{this.at=Math.max(0,Math.min(t,this.buf?this.buf.duration:t));this.emit()}}
  stopNode(){if(this.src){this.src.onended=null;try{this.src.stop()}catch(e){}this.src=null}}
  stop(){this.stopNode();this.playing=false}
  emit(){this.listeners.forEach(f=>f())}}

/* ---------- the screen ---------- */
function mount(v,ctx){const{esc,I,toast}=ctx;const deck=new Deck();let alive=true;
  const S={aspect:'1:1',sfx:{rate:1,tape:true,reverb:0,bass:0},src:null,track:ctx.track||null,audio:null,buffer:null,lyrics:null,timing:null,analysis:null,style:'punch',opts:{},res:'1080p',fps:30,range:null,art:null,bg:null,comp:null,sel:-1,zoom:60,rights:false,listen:false,clip:null};
  try{const saved=JSON.parse(localStorage.getItem('sn.lvsOpts')||'{}');if(saved.style&&C.STYLES[saved.style])S.style=saved.style;if(saved.aspect)S.aspect=saved.aspect;if(saved.opts)S.opts=saved.opts;if(saved.res)S.res=saved.res;if((S.res==='1440p'||S.res==='2160p')&&!(ctx.premium&&ctx.premium()))S.res='1080p';if(saved.fps)S.fps=saved.fps}catch(e){}
  const save=()=>{try{localStorage.setItem('sn.lvsOpts',JSON.stringify({aspect:S.aspect,style:S.style,opts:{...S.opts,colors:S.opts.colors},res:S.res,fps:S.fps}))}catch(e){}};
  v.innerHTML=`<div class="lvs">
  <header class="lvs-h"><div><span class="kicker">Lyric Studio</span><h1>Make a lyric video</h1></div><div class="lvs-song" id="lv-song"></div></header>
  <div class="lvs-grid"><div class="lvs-main">
   <section class="lvs-step" id="lv-s1"><h2><span>1</span>Song</h2><div id="lv-src"></div></section>
   <section class="lvs-step" id="lv-s2"><h2><span>2</span>Sync lyrics</h2><div id="lv-sync"></div></section>
   <section class="lvs-step" id="lv-snd"><h2><span>♪</span>Sound</h2><div id="lv-sound"></div></section>
   <section class="lvs-step" id="lv-s3"><h2><span>3</span>Style</h2><div class="lvs-styles" id="lv-styles"></div></section>
   <section class="lvs-step" id="lv-s4"><h2><span>4</span>Customize</h2><div id="lv-cust"></div></section>
   <section class="lvs-step" id="lv-s6"><h2><span>6</span>Export or publish</h2><div id="lv-exp"></div></section>
  </div>
  <aside class="lvs-side"><section class="lvs-step lvs-prev" id="lv-s5"><h2><span>5</span>Preview</h2>
   <div class="lvs-frame"><canvas id="lv-cv" aria-label="Video preview"></canvas><div class="lvs-empty" id="lv-pempty">Your video appears here</div></div>
   <div class="lvs-tr"><button class="icon-btn lvs-pp" id="lv-pp" aria-label="Play">${I('play')}</button><input type="range" id="lv-scrub" min="0" max="1000" value="0" aria-label="Scrub"><span class="mut small" id="lv-time">0:00</span></div>
   <div class="row lvs-res"><label class="mut small">Shape</label><div class="seg" id="lv-asp">${Object.keys(ASPECTS).map(k=>`<button data-asp="${k}">${k==='9:16'?'9:16 TikTok':k==='1:1'?'1:1 Square':'4:5 Feed'}</button>`).join('')}</div></div>
   <div class="row lvs-res"><label class="mut small">Size</label><div class="seg" id="lv-res">${Object.keys(RES).map(k=>`<button data-res="${k}">${k==='2160p'?'4K':k}${(k==='1440p'||k==='2160p')&&!(ctx.premium&&ctx.premium())?' <span class="lock-dot" title="Premium">✦</span>':''}</button>`).join('')}</div><div class="seg" id="lv-fps">${[30,60].map(f=>`<button data-fps="${f}">${f}</button>`).join('')}</div></div>
   <p class="mut small" id="lv-resnote"></p></section></aside></div></div>`;
  const $=s=>v.querySelector(s),$$=s=>[...v.querySelectorAll(s)];
  const cv=$('#lv-cv'),cx=cv.getContext('2d');
  /* ---- step 1: song + audio + lyrics ---- */
  function songChip(){const t=S.track;$('#lv-song').innerHTML=t?`${t.art?`<img src="${esc(t.art)}" alt="">`:`<span class="lvs-noart">${I('music')}</span>`}<div><b class="ell">${esc(t.title)}</b><small class="ell">${esc(t.artist||'')}</small></div><button class="pill sm ghost" id="lv-change">Change</button>`:'';const ch=$('#lv-change');if(ch)ch.onclick=()=>{S.track=null;resetSong();drawSrc()}}
  function resetSong(){deck.stop();S.audio=S.buffer=S.src=S.lyrics=S.timing=S.analysis=S.clip=null;S.art=null;S.range=null;drawSync();drawExport();previewNow()}
  function drawSrc(){songChip();const el=$('#lv-src');
    if(!S.track){el.innerHTML=`<div class="lvs-pick"><input type="search" id="lv-q" placeholder="Search a song" autocomplete="off" aria-label="Search a song"><div id="lv-res-list" class="lvs-results"></div>
      <div class="row" style="gap:8px;flex-wrap:wrap">${ctx.current?`<button class="pill sm" id="lv-cur">${I('music')} Use what’s playing</button>`:''}<label class="pill sm ghost lvs-file">${I('import')} Import your own audio<input type="file" accept="audio/*,video/mp4" id="lv-file" hidden></label></div></div>`;
      const q=$('#lv-q');let tm;q.oninput=()=>{clearTimeout(tm);tm=setTimeout(async()=>{const r=q.value.trim()?await ctx.search(q.value.trim()).catch(()=>[]):[];if(!alive)return;$('#lv-res-list').innerHTML=r.slice(0,8).map((t,i)=>`<button class="lvs-r" data-i="${i}"><img src="${esc(t.art||'')}" alt=""><span><b class="ell">${esc(t.title)}</b><small class="ell">${esc(t.artist)}</small></span></button>`).join('');
        $$('.lvs-r').forEach(b=>b.onclick=()=>{S.track=r[+b.dataset.i];loadSong()})},300)};
      const cu=$('#lv-cur');if(cu)cu.onclick=()=>{S.track=ctx.current;loadSong()};$('#lv-file').onchange=e=>importAudio(e.target.files[0],true);return}
    const a=S.audio;el.innerHTML=`<div class="lvs-rows">
      <div class="lvs-row"><span class="lvs-dot ${a?(a.full?'ok':'warn'):'bad'}"></span><div class="grow"><b>Audio</b><small>${a?esc(a.label):'Looking for audio you can use…'}</small></div><label class="pill sm ghost lvs-file">${a?'Replace':'Import'}<input type="file" accept="audio/*,video/mp4" id="lv-file" hidden></label></div>
      <div class="lvs-row"><span class="lvs-dot ${S.lyrics?(S.lyrics.synced?'ok':'warn'):'bad'}"></span><div class="grow"><b>Lyrics</b><small>${S.lyrics?esc(S.lyrics.label):'Looking for lyrics…'}</small></div><button class="pill sm ghost" id="lv-edit">${S.lyrics?'Edit':'Paste'}</button></div></div>
      <div id="lv-paste" hidden><textarea id="lv-txt" rows="9" placeholder="Paste the lyrics, one line per line. Timestamps like [01:23.45] are kept."></textarea><div class="row" style="gap:8px;margin-top:8px"><button class="pill sm" id="lv-use">Use these lyrics</button><button class="pill sm ghost" id="lv-cancel">Cancel</button></div></div>`;
    $('#lv-file').onchange=e=>importAudio(e.target.files[0]);$('#lv-edit').onclick=()=>{$('#lv-paste').hidden=false;$('#lv-txt').value=S.lyrics?S.lyrics.raw:''};$('#lv-cancel').onclick=()=>$('#lv-paste').hidden=true;
    $('#lv-use').onclick=()=>{const raw=$('#lv-txt').value;if(!raw.trim())return;S.lyrics=parseLyricsText(raw,'Your lyrics');S.timing=null;$('#lv-paste').hidden=true;drawSrc();drawSync();previewNow();autoSync()}}
  function parseLyricsText(raw,src){const hasTs=/\[\d+:\d+(?:\.\d+)?\]/.test(raw);if(hasTs){const ls=SLyrics.parseLRC(raw).filter(l=>!l.instr);return{synced:true,lines:ls.map(l=>({text:l.text,t:l.t})),raw,label:`${src} · ${ls.length} lines with timestamps`}}
    const ls=raw.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!/^\[(verse|chorus|intro|outro|bridge|hook|pre-chorus)[^\]]*\]$/i.test(s));return{synced:false,lines:ls.map(text=>({text})),raw:ls.join('\n'),label:`${src} · ${ls.length} lines, no timestamps (sniplit will time them)`}}
  async function importAudio(file,asNew){if(!file)return;if(asNew)S.track={id:'file:'+file.name,title:file.name.replace(/\.[^.]+$/,''),artist:'',art:''};
    S.audio={label:`Your file · ${file.name}`,full:true,kind:'file'};drawSrc();try{S.src=S.buffer=await decode(await file.arrayBuffer());S.rate=1;S.sfx={rate:1,tape:true,reverb:0,bass:0};drawSound();S.audio.label+=` · ${fmt(S.buffer.duration).replace(/\.\d+$/,'')}`;S.range=[0,S.buffer.duration];S.clip=null;await afterAudio()}catch(e){S.audio={label:'That file couldn’t be read as audio.',full:false,kind:'none'};S.buffer=null}drawSrc()}
  async function decode(ab){const AC=window.OfflineAudioContext||window.webkitOfflineAudioContext;return new AC(2,44100,44100).decodeAudioData(ab)}
  async function loadSong(){const t=S.track;resetSong();drawSrc();
    const artP=t.art?loadImage((t.art||'').replace(/\d+x\d+bb/,'1200x1200bb')).catch(()=>loadImage(t.art).catch(()=>null)):Promise.resolve(null);
    const[aud,lyr,art]=await Promise.all([ctx.audioFor(t).catch(e=>({error:e.message})),SLyrics.fetchLyrics(t).catch(()=>null),artP]);if(!alive||S.track!==t)return;S.art=art;
    if(aud&&aud.blob){S.audio={label:aud.label,full:aud.full,kind:aud.kind,note:aud.note};try{S.src=S.buffer=await decode(await aud.blob.arrayBuffer());S.rate=1;S.sfx={rate:1,tape:true,reverb:0,bass:0};drawSound()}catch(e){S.buffer=S.src=null;S.audio={label:'The audio couldn’t be decoded. Import your own copy.',full:false,kind:'none'}}}
    else S.audio={label:(aud&&aud.error)||'No audio sniplit can use for this song. Import your own copy.',full:false,kind:'none'};
    if(lyr&&lyr.instrumental)S.lyrics={synced:true,lines:[],raw:'',label:'This song is marked instrumental — the video will run without lyrics.'};
    else if(lyr&&lyr.lines&&lyr.lines.length){const synced=!!lyr.synced;S.lyrics={synced,lines:lyr.lines.filter(l=>!l.instr&&l.text).map(l=>synced?{text:l.text,t:l.t}:{text:l.text}),raw:lyr.lines.filter(l=>l.text).map(l=>synced?`[${fmtLrc(l.t)}]${l.text}`:l.text).join('\n'),label:`${lyr.source||'Lyrics'} · ${lyr.lines.filter(l=>l.text).length} lines${synced?' with timestamps':', no timestamps (sniplit will time them)'}`}}
    else S.lyrics=null;
    if(S.buffer){if(!S.audio.full&&S.lyrics&&S.lyrics.synced){// a preview clip: find where it sits in the full song so the right lines show
        const al=await SLyrics.alignPreview(S.buffer,S.lyrics.lines.map(l=>({...l})),(t.durationMs||0)/1000).catch(()=>null);S.clip={offset:al?al.offset:0,confidence:al?al.confidence:0};if(al&&al.confidence<.5)S.audio.label+=' · clip position uncertain'}
      S.range=[0,S.buffer.duration];await afterAudio()}
    drawSrc();drawSync();drawExport();previewNow()}
  const fmtLrc=t=>{const m=Math.floor(t/60),s=t-m*60;return`${String(m).padStart(2,'0')}:${s.toFixed(2).padStart(5,'0')}`};
  function loadImage(u){return new Promise((res,rej)=>{if(!u)return rej();const im=new Image();im.crossOrigin='anonymous';im.onload=async()=>{try{res(window.createImageBitmap?await createImageBitmap(im):im)}catch(e){res(im)}};im.onerror=rej;im.src=u})}
  async function afterAudio(){deck.load(S.buffer);const box=$('#lv-sync');if(box)box.innerHTML=`<p class="mut small">Studying the song…</p><div class="lvs-bar"><i style="width:2%"></i></div>`;
    S.analysis=await LS.analyse(S.buffer,{onProgress:p=>{const i=v.querySelector('#lv-sync .lvs-bar i');if(i)i.style.width=Math.round(p*100)+'%'}});drawSync();drawExport();thumbs();previewNow();autoSync()}
  /* lyrics are timed automatically the moment there is audio and text — no button to find */
  function autoSync(){if(S.buffer&&S.analysis&&S.lyrics&&S.lyrics.lines.length&&!S.timing&&!S.syncing&&$('#lv-dosync'))runSync()}
  /* ---- step 2: sync + timeline ---- */
  function drawSync(){const el=$('#lv-sync');if(!el)return;
    if(!S.buffer){el.innerHTML=`<p class="mut small">Add audio first.</p>`;return}if(!S.analysis)return;
    const A=S.analysis;const facts=`<div class="lvs-facts"><span><b>${Math.round(A.bpm)}</b> BPM</span><span><b>${A.sections.length}</b> sections</span><span><b>${fmt(A.duration).replace(/\.\d+$/,'')}</b></span>${S.timing?`<span><b>${S.timing.instrumentals.length}</b> instrumental parts</span>`:''}</div>`;
    if(!S.lyrics){el.innerHTML=facts+`<p class="mut small">No lyrics yet. Paste them in step 1 — sniplit never makes lyrics up.</p>`;return}
    if(!S.timing){el.innerHTML=facts+`<label class="lvs-chk"><input type="checkbox" id="lv-listen" ${S.listen?'checked':''}><span>Listen to the vocals for timing<small>More accurate for lyrics without timestamps. Downloads a speech model (about 75 MB) the first time.</small></span></label>
      <button class="pill" id="lv-dosync">${I('lyrics')} ${S.lyrics.synced?'Sync to this audio':'Time the lyrics'}</button><div id="lv-sprog"></div>`;
      $('#lv-listen').onchange=e=>S.listen=e.target.checked;$('#lv-dosync').onclick=runSync;return}
    const est=S.timing.lines.filter(l=>l.conf==='estimated').length;
    el.innerHTML=facts+(S.timing.notes.length?`<p class="lvs-note">${S.timing.notes.map(esc).join(' ')}</p>`:'')+`<div class="lvs-legend">${Object.entries(CONF).map(([k,[l,c]])=>`<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>
      <div class="lvs-tl" id="lv-tl"><div class="lvs-tl-in" id="lv-tlin"><canvas class="lvs-wave" id="lv-wave"></canvas><div class="lvs-lane" id="lv-lane"></div><div class="lvs-ph" id="lv-ph"></div></div></div>
      <div class="row lvs-tlbar"><button class="icon-btn" id="lv-zo" aria-label="Zoom out">−</button><button class="icon-btn" id="lv-zi" aria-label="Zoom in">+</button><button class="pill sm ghost" id="lv-stamp" title="Shortcut: S">Start selected line here</button><span class="grow"></span>${est?`<span class="mut small">${est} to check</span>`:''}<button class="pill sm ghost" id="lv-resync">Re-sync</button></div>
      <div class="lvs-shift"><span class="small">Line up all lyrics</span><button class="icon-btn" data-nudge="-0.1" aria-label="Lyrics earlier">‹</button><input type="range" id="lv-shift" min="-4" max="4" step="0.01" value="${S.shift||0}" aria-label="Lyrics offset"><button class="icon-btn" data-nudge="0.1" aria-label="Lyrics later">›</button><b id="lv-shiftv">${((S.shift||0)>=0?'+':'')+(S.shift||0).toFixed(2)}s</b></div>
      <div class="lvs-words" id="lv-words"></div><div class="lvs-lines" id="lv-lines"></div>`;
    $('#lv-zo').onclick=()=>{S.zoom=Math.max(8,S.zoom/1.5);drawTimeline()};$('#lv-zi').onclick=()=>{S.zoom=Math.min(400,S.zoom*1.5);drawTimeline()};$('#lv-stamp').onclick=stamp;$('#lv-resync').onclick=()=>{S.timing=null;S.shift=0;drawSync()};
    $('#lv-tl').addEventListener('scroll',drawWave,{passive:true});
    // drag along the waveform to scrub: you hear the audio under your finger, so a word can be lined up by ear
    $('#lv-wave').parentElement.addEventListener('pointerdown',e=>{if(e.target.closest('.lvs-seg'))return;const host=e.currentTarget;const at=ev=>{const r=$('#lv-tlin').getBoundingClientRect();return Math.max(0,(ev.clientX-r.left)/S.zoom)};
      const was=deck.playing;let blip=0;const hear=t=>{deck.play(t);clearTimeout(blip);blip=setTimeout(()=>{if(!was)deck.pause()},140)};deck.seek(at(e));tick();
      try{host.setPointerCapture(e.pointerId)}catch(x){}let lastX=e.clientX;const mv=ev=>{if(Math.abs(ev.clientX-lastX)<2)return;lastX=ev.clientX;const t=at(ev);if(was)deck.seek(t);else hear(t);tick()};
      const up=()=>{host.removeEventListener('pointermove',mv);host.removeEventListener('pointerup',up);host.removeEventListener('pointercancel',up);if(!was){clearTimeout(blip);deck.pause()}};
      host.addEventListener('pointermove',mv);host.addEventListener('pointerup',up);host.addEventListener('pointercancel',up)});
    const shiftTo=v=>{v=Math.max(-4,Math.min(4,Math.round(v*100)/100));const d=v-(S.shift||0);if(!d)return;S.shift=v;const D=S.buffer.duration;
      for(const l of S.timing.lines){l.t=Math.max(0,Math.min(D-.1,l.t+d));l.end=Math.max(l.t+.1,Math.min(D,l.end+d));for(const w of l.words){w.t=Math.max(0,w.t+d);if(w.e!=null)w.e=Math.max(w.t,w.e+d)}}
      for(const r of S.timing.instrumentals){r.t=Math.max(0,r.t+d);r.end=Math.max(r.t,r.end+d)}
      $('#lv-shift').value=v;$('#lv-shiftv').textContent=(v>=0?'+':'')+v.toFixed(2)+'s';S.comp=null;drawTimeline();drawLines();previewNow()};
    $('#lv-shift').oninput=e=>shiftTo(+e.target.value);$$('[data-nudge]').forEach(b=>b.onclick=()=>shiftTo((S.shift||0)+(+b.dataset.nudge)));
    drawTimeline();drawLines()}
  async function runSync(){if(S.syncing)return;S.syncing=true;try{await runSync0()}finally{S.syncing=false}}
  async function runSync0(){const p=$('#lv-sprog');const say=(f,m)=>{if(p)p.innerHTML=`<p class="mut small">${esc(m||'')}</p><div class="lvs-bar"><i style="width:${Math.round(f*100)}%"></i></div>`};const db=$('#lv-dosync');if(db)db.disabled=true;
    try{let words=null;if(S.listen&&!S.lyrics.synced){say(.05,'Loading the speech model (first time only)…');words=[];const D=S.buffer.duration;for(let w=0;w<D;w+=28){say(.05+.4*w/D,`Listening… ${fmt(w).replace(/\.\d+$/,'')} of ${fmt(D).replace(/\.\d+$/,'')}`);const r=await SLyrics.transcribe(S.buffer,w,Math.min(30,D-w)).catch(()=>[]);words.push(...r.filter(x=>x.t>=w-.1&&x.t<w+28))}}
      let lines=S.lyrics.lines;if(S.clip&&S.lyrics.synced)lines=lines.map(l=>({...l,t:l.t-S.clip.offset}));
      const R=S.sfx.rate||1;if(R!==1)lines=lines.map(l=>l.t!=null?{...l,t:l.t/R}:l);
      S.timing=await LS.sync(lines,S.buffer,{synced:S.lyrics.synced,words,duration:S.buffer.duration,onProgress:(f,m)=>say(.5+f*.5,m),window:S.clip?[0,S.buffer.duration]:null});
      if(S.listen&&words&&!words.length)S.timing.notes.unshift('The speech model couldn’t run here, so timing comes from the vocal activity alone.')}
    catch(e){say(0,'Sync failed: '+(e.message||e));const d2=$('#lv-dosync');if(d2)d2.disabled=false;return}drawSync();drawExport();thumbs();previewNow()}
  function drawTimeline(){const tl=$('#lv-tl');if(!tl||!S.timing)return;const W=S.buffer.duration*S.zoom;$('#lv-tlin').style.width=W+'px';
    $('#lv-lane').innerHTML=S.timing.lines.map((l,i)=>`<div class="lvs-seg ${S.sel===i?'on':''}" data-i="${i}" style="left:${l.t*S.zoom}px;width:${Math.max(6,(l.end-l.t)*S.zoom)}px;--c:${CONF[l.conf][1]}"><span>${esc(l.text)}</span>${S.sel===i&&S.zoom>=40?l.words.map((w,k)=>k?`<b class="lvs-wt" data-k="${k}" style="left:${(w.t-l.t)*S.zoom}px"></b>`:'').join(''):''}<i class="h l"></i><i class="h r"></i></div>`).join('')+S.timing.instrumentals.map(r=>`<div class="lvs-instr" style="left:${r.t*S.zoom}px;width:${(r.end-r.t)*S.zoom}px">${r.kind==='intro'?'Intro':r.kind==='outro'?'Outro':'Instrumental'}</div>`).join('');
    $$('#lv-lane .lvs-seg').forEach(seg=>seg.addEventListener('pointerdown',segDrag));drawWave()}
  function drawWave(){const tl=$('#lv-tl'),c=$('#lv-wave');if(!tl||!c||!S.buffer)return;const dpr=Math.min(2,devicePixelRatio||1);const w=tl.clientWidth,h=72;c.width=w*dpr;c.height=h*dpr;c.style.width=w+'px';c.style.left=tl.scrollLeft+'px';
    const x=c.getContext('2d');x.scale(dpr,dpr);x.clearRect(0,0,w,h);const d=S.buffer.getChannelData(0),sr=S.buffer.sampleRate;const t0=tl.scrollLeft/S.zoom;x.fillStyle=getComputedStyle(v).getPropertyValue('--mut')||'#888';
    for(let px=0;px<w;px++){const a=Math.floor((t0+px/S.zoom)*sr),b=Math.floor((t0+(px+1)/S.zoom)*sr);let mx=0;for(let i=a;i<b&&i<d.length;i+=Math.max(1,Math.floor((b-a)/64)))mx=Math.max(mx,Math.abs(d[i]));const hh=Math.max(1,mx*h*.9);x.fillRect(px,(h-hh)/2,1,hh)}
    if(S.analysis){x.fillStyle='rgba(255,255,255,.18)';for(const b of S.analysis.beats){const X=(b-t0)*S.zoom;if(X>=0&&X<w)x.fillRect(X,h-6,1,6)}}}
  function segDrag(e){const seg=e.currentTarget,i=+seg.dataset.i;const l=S.timing.lines[i];const wt=e.target.closest('.lvs-wt');S.sel=i;
    const mode=wt?'word':e.target.classList.contains('l')?'l':e.target.classList.contains('r')?'r':'move';const x0=e.clientX,t0=l.t,e0=l.end,wk=wt?+wt.dataset.k:0,w0=wt?l.words[wk].t:0;let moved=false;seg.setPointerCapture(e.pointerId);
    const mv=ev=>{const dt=(ev.clientX-x0)/S.zoom;if(Math.abs(ev.clientX-x0)>3)moved=true;if(!moved)return;
      if(mode==='move'){l.t=t0+dt;l.end=e0+dt}else if(mode==='l')l.t=Math.min(e0-.2,t0+dt);else if(mode==='r')l.end=Math.max(t0+.2,e0+dt);
      else{const lo=l.words[wk-1].t+.04,hi=(l.words[wk+1]?l.words[wk+1].t:l.end)-.04;l.words[wk].t=Math.max(lo,Math.min(hi,w0+dt));l.words[wk-1].e=l.words[wk].t}
      seg.style.left=l.t*S.zoom+'px';seg.style.width=Math.max(6,(l.end-l.t)*S.zoom)+'px';previewAt(l.t+.05)};
    const up=()=>{seg.removeEventListener('pointermove',mv);seg.removeEventListener('pointerup',up);seg.removeEventListener('pointercancel',up);
      if(moved){if(mode==='word'){l.conf='manual';l.words[wk].conf='manual'}else{const ws=l.words.map(w=>({...w}));LS.retime(S.timing,i,l.t,l.end,S.buffer.duration);if(mode==='move'){const d=l.t-t0;l.words=ws.map(w=>({...w,t:w.t+d,e:w.e+d}))}}S.comp=null}
      else deck.seek(l.t);drawTimeline();drawLines();previewNow()};
    seg.addEventListener('pointermove',mv);seg.addEventListener('pointerup',up);seg.addEventListener('pointercancel',up)}
  function stamp(){if(!S.timing)return;const i=S.sel<0?0:S.sel;const l=S.timing.lines[i];if(!l)return;const len=l.end-l.t;LS.retime(S.timing,i,deck.time,deck.time+len,S.buffer.duration);S.sel=Math.min(S.timing.lines.length-1,i+1);S.comp=null;drawTimeline();drawLines();previewNow()}
  function drawLines(){const el=$('#lv-lines');if(!el)return;el.innerHTML=S.timing.lines.map((l,i)=>`<div class="lvs-line ${S.sel===i?'on':''}" data-i="${i}"><i style="background:${CONF[l.conf][1]}" title="${CONF[l.conf][0]}"></i><input value="${fmt(l.t)}" aria-label="Start of line ${i+1}" data-ti="${i}"><span class="grow">${esc(l.text)}</span></div>`).join('');
    $$('#lv-lines .lvs-line').forEach(r=>r.onclick=e=>{if(e.target.tagName==='INPUT')return;S.sel=+r.dataset.i;deck.seek(S.timing.lines[S.sel].t);drawTimeline();drawLines();drawWords();scrollTo(S.timing.lines[S.sel].t);previewNow()});
    $$('#lv-lines input').forEach(inp=>inp.onchange=()=>{const i=+inp.dataset.ti,t=parseT(inp.value);if(!isFinite(t)){inp.value=fmt(S.timing.lines[i].t);return}const l=S.timing.lines[i];LS.retime(S.timing,i,t,t+(l.end-l.t),S.buffer.duration);S.comp=null;drawTimeline();drawLines();previewNow()});drawWords()}
  function drawWords(){const el=$('#lv-words');if(!el)return;const l=S.timing&&S.timing.lines[S.sel];if(!l){el.innerHTML='';return}
    el.innerHTML=`<small class="mut">Words in the selected line — drag the ticks on the timeline, or nudge here</small><div class="lvs-wchips">${l.words.map((w,k)=>`<span class="lvs-wc" style="--c:${CONF[w.conf||'estimated'][1]}">${esc(w.w)}<small>${fmt(w.t)}</small>${k?`<button data-n="${k}" data-d="-0.05" aria-label="Earlier">‹</button><button data-n="${k}" data-d="0.05" aria-label="Later">›</button>`:''}</span>`).join('')}</div>`;
    $$('#lv-words button').forEach(b=>b.onclick=()=>{const k=+b.dataset.n,d=+b.dataset.d;const lo=l.words[k-1].t+.04,hi=(l.words[k+1]?l.words[k+1].t:l.end)-.04;l.words[k].t=Math.max(lo,Math.min(hi,l.words[k].t+d));l.words[k-1].e=l.words[k].t;l.words[k].conf='manual';l.conf='manual';S.comp=null;drawWords();drawTimeline();previewAt(l.words[k].t)})}
  function scrollTo(t){const tl=$('#lv-tl');if(tl)tl.scrollLeft=Math.max(0,t*S.zoom-tl.clientWidth/3)}
  /* ---- sound: speed, slowed + reverb, bass — baked into the video's audio, and the lyrics follow ---- */
  const SND_PRESETS=[['Original',{rate:1,tape:true,reverb:0,bass:0}],['Slowed + reverb',{rate:.82,tape:true,reverb:.42,bass:3}],['Slowed',{rate:.85,tape:true,reverb:0,bass:0}],['Sped up',{rate:1.25,tape:true,reverb:0,bass:0}],['Nightcore',{rate:1.3,tape:true,reverb:0,bass:0}],['Bass boost',{rate:1,tape:true,reverb:0,bass:12}]];
  function drawSound(){const el=$('#lv-sound');if(!el)return;const f=S.sfx;const cur=SND_PRESETS.find(([,p])=>Object.keys(p).every(k=>p[k]===f[k]));
    el.innerHTML=!S.src?`<p class="mut small">Add a song first.</p>`:`<div class="chips wrap">${SND_PRESETS.map(([n],i)=>`<button class="chip ${cur&&cur[0]===n?'on':''}" data-snd="${i}">${n}</button>`).join('')}</div>
      <div class="lvs-cust" style="margin-top:12px"><label class="lvs-sl"><span>Speed <b id="lv-rv">${f.rate.toFixed(2)}×</b></span><input type="range" min=".5" max="1.5" step=".01" value="${f.rate}" data-sf="rate"></label>
      <label class="lvs-sl"><span>Reverb</span><input type="range" min="0" max=".8" step=".01" value="${f.reverb}" data-sf="reverb"></label><label class="lvs-sl"><span>Bass</span><input type="range" min="-6" max="20" step="1" value="${f.bass}" data-sf="bass"></label>
      <label class="lvs-chk sm"><input type="checkbox" id="lv-tape" ${f.tape?'checked':''}><span>Pitch follows speed<small>On: classic slowed / sped-up sound. Off: same key at any speed.</small></span></label></div><p class="mut small" id="lv-sndst"></p>`;
    $$('[data-snd]',el).forEach(b=>b.onclick=()=>{S.sfx={...SND_PRESETS[+b.dataset.snd][1]};drawSound();applySound()});
    $$('[data-sf]',el).forEach(r=>{r.oninput=()=>{S.sfx[r.dataset.sf]=+r.value;if(r.dataset.sf==='rate')$('#lv-rv').textContent=(+r.value).toFixed(2)+'×'};r.onchange=()=>{drawSound();applySound()}});
    const tp=$('#lv-tape');if(tp)tp.onchange=()=>{S.sfx.tape=tp.checked;applySound()}}
  let sndJob=0;async function applySound(){if(!S.src)return;const job=++sndJob;const st=$('#lv-sndst');if(st)st.textContent='Applying…';deck.pause();const f=S.sfx;const oldRate=S.rate||1;
    try{const fx={...SAudio.Engine.DEFAULT_FX,eq:[...SAudio.Engine.DEFAULT_FX.eq],rate:f.rate,pitch:f.tape?12*Math.log2(f.rate):0,reverb:f.reverb,bass:f.bass};
      const neutral=f.rate===1&&!f.reverb&&!f.bass;const buf=neutral?S.src:await SAudio.Engine.render(S.src,fx);if(job!==sndJob)return;
      S.buffer=buf;S.rate=f.rate;deck.load(buf);
      // keep the lyric timing: everything moves by the speed change
      if(S.timing){const k=oldRate/f.rate;for(const l of S.timing.lines){l.t*=k;l.end*=k;for(const w of l.words){w.t*=k;w.e*=k}}S.timing.instrumentals=LS.instrumentals(S.timing.lines,buf.duration)}
      S.range=[0,buf.duration];S.analysis=await LS.analyse(buf);if(job!==sndJob)return;S.comp=null;if(st)st.textContent=neutral?'':`${f.rate!==1?(f.rate<1?'Slowed':'Sped up')+' to '+f.rate.toFixed(2)+'× · ':''}${f.reverb?'reverb · ':''}${f.bass?'bass '+(f.bass>0?'+':'')+f.bass+' dB · ':''}new length ${fmt(buf.duration).replace(/\.\d+$/,'')}`;
      drawSync();drawExport();previewNow();thumbs();if(!S.timing)autoSync()}catch(e){if(st)st.textContent='Couldn’t apply that: '+(e.message||e)}}
  /* ---- step 3/4: style + customize ---- */
  function drawStyles(){const[tw,th]=dims('720p',S.aspect);$('#lv-styles').innerHTML=Object.entries(C.STYLES).map(([k,st])=>`<button class="lvs-style ${S.style===k?'on':''}" data-st="${k}"><canvas width="${Math.round(tw/6)}" height="${Math.round(th/6)}" data-thumb="${k}" style="aspect-ratio:${tw}/${th}"></canvas><b>${st.label}</b><small>${st.blurb}</small></button>`).join('');
    $$('.lvs-style').forEach(b=>b.onclick=()=>{S.style=b.dataset.st;S.opts={colors:S.opts.colors};S.comp=null;save();drawStyles();drawCust();previewNow()});thumbs()}
  function thumbs(){$$('[data-thumb]').forEach(c=>{const st=c.dataset.thumb;try{const comp=C.build({W:c.width,H:c.height,style:st,opts:{colors:S.opts.colors},track:S.track||{title:'Your song',artist:'Artist'},timing:S.timing||demoTiming(),analysis:S.analysis,art:S.art});const t=pickThumbTime(comp);C.render(c.getContext('2d'),t,comp)}catch(e){}})}
  function demoTiming(){const words='every word lands on the beat'.split(' ');return{lines:[{t:1,end:6,text:words.join(' '),words:words.map((w,i)=>({w,t:1+i*.4,e:1.4+i*.4}))}],instrumentals:[]}}
  function pickThumbTime(comp){const l=comp.lines.find(l=>l.words.length>=3)||comp.lines[0];return l?Math.min(l.end-.1,l.t+Math.min(1.6,(l.end-l.t)*.7)):2}
  function opt(k){return S.opts[k]??C.STYLES[S.style][k]}
  function drawCust(){const st=C.STYLES[S.style];const col=S.opts.colors||{};const pal=C.palette(S.art,C.hash((S.track&&S.track.artist||'')+'|'+(S.track&&S.track.title||'')));const hx=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
    const slider=(k,l,min,max,step)=>`<label class="lvs-sl"><span>${l}</span><input type="range" data-o="${k}" min="${min}" max="${max}" step="${step}" value="${opt(k)}"></label>`;
    $('#lv-cust').innerHTML=`<div class="lvs-cust">
      <div class="lvs-cg"><span class="lvs-cl">Colours</span><div class="row" style="gap:10px;flex-wrap:wrap">${[['bg','Background',pal.vivid],['fg','Text',[255,255,255]],['accent','Accent',pal.light]].map(([k,l,d])=>`<label class="lvs-color"><input type="color" data-c="${k}" value="${col[k]||hx(d)}"><span>${l}${col[k]?'':' · auto'}</span></label>`).join('')}<button class="pill sm ghost" id="lv-cauto">From artwork</button></div></div>
      <div class="lvs-cg"><span class="lvs-cl">Typeface</span><div class="chips wrap">${Object.entries(C.FONTS).map(([k,f])=>`<button class="chip ${opt('font')===k?'on':''}" data-font="${k}">${f.label}</button>`).join('')}</div></div>
      <div class="lvs-cg"><span class="lvs-cl">Lyrics position</span><div class="seg" id="lv-pos">${[...(S.style==='punch'?[['auto','Moves']]:[]),['upper','Top'],['center','Middle'],['lower','Bottom']].map(([k,l])=>`<button data-pos="${k}" class="${opt('pos')===k?'on':''}">${l}</button>`).join('')}</div></div>
      <div class="lvs-cg"><span class="lvs-cl">Background image</span><div class="seg" id="lv-bgi">${[['art','Artwork'],['custom','Your image'],['none','None']].map(([k,l])=>`<button data-bgi="${k}" class="${opt('bgImage')===k?'on':''}">${l}</button>`).join('')}</div><input type="file" accept="image/*" id="lv-bgfile" hidden></div>
      ${slider('fish','Fisheye',0,1,.02)}${slider('ca','Colour fringe',0,1,.02)}${slider('glow','Glow',0,1,.02)}${slider('vig','Vignette',0,1,.02)}${slider('size','Text size',.6,1.5,.05)}${slider('intensity','Motion',0,1,.05)}${slider('speed','Transition speed',.4,2,.05)}${slider('viz','Visualizer',0,1,.05)}${slider('grain','Grain',0,1,.05)}${slider('scan','Scanlines',0,1,.05)}${slider('glitch','Glitch',0,1,.05)}
      <button class="pill sm ghost" id="lv-reset" style="justify-self:start">Reset ${st.label}</button></div>`;
    $$('[data-o]').forEach(r=>r.oninput=()=>{S.opts[r.dataset.o]=+r.value;S.comp=null;save();previewNow()});
    $$('[data-c]').forEach(r=>r.oninput=()=>{S.opts.colors={...(S.opts.colors||{}),[r.dataset.c]:r.value};S.comp=null;save();previewNow();thumbs()});
    $('#lv-cauto').onclick=()=>{delete S.opts.colors;S.comp=null;save();drawCust();previewNow();thumbs()};
    $$('[data-font]').forEach(b=>b.onclick=()=>{S.opts.font=b.dataset.font;S.comp=null;save();drawCust();previewNow()});
    $$('[data-pos]').forEach(b=>b.onclick=()=>{S.opts.pos=b.dataset.pos;S.comp=null;save();drawCust();previewNow()});
    $$('[data-bgi]').forEach(b=>b.onclick=()=>{if(b.dataset.bgi==='custom'){$('#lv-bgfile').click();return}S.opts.bgImage=b.dataset.bgi;S.comp=null;save();drawCust();previewNow()});
    $('#lv-bgfile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{S.bg=await createImageBitmap(f);S.opts.bgImage='custom';S.comp=null;drawCust();previewNow()}catch(err){toast('That image couldn’t be opened')}};
    $('#lv-reset').onclick=()=>{S.opts={};S.comp=null;save();drawCust();previewNow();thumbs()}}
  /* ---- preview ---- */
  function compArgs(){return{style:S.style,opts:S.opts,track:S.track||{},timing:S.timing||(S.lyrics?null:null),analysis:S.analysis,art:S.art,bg:S.bg}}
  function sizeCanvas(){const fr=cv.parentElement;const[W,H]=dims(S.res,S.aspect);fr.style.aspectRatio=`${W}/${H}`;const box=fr.getBoundingClientRect();const dpr=Math.min(2,devicePixelRatio||1);const pw=Math.round(Math.min(W,(box.width||300)*dpr)),ph=Math.round(pw*H/W);if(cv.width!==pw||cv.height!==ph){cv.width=pw;cv.height=ph;S.comp=null}}
  function previewAt(t){if(!alive||!cv.isConnected||!$('#lv-pempty'))return;if(!S.analysis&&!S.timing){$('#lv-pempty').hidden=false;cx.clearRect(0,0,cv.width,cv.height);return}$('#lv-pempty').hidden=true;sizeCanvas();
    if(!S.comp)S.comp=C.build({...compArgs(),W:cv.width,H:cv.height,fps:S.fps});C.render(cx,t,S.comp);const d=S.buffer?S.buffer.duration:S.comp.dur;$('#lv-time').textContent=fmt(t).replace(/\.\d+$/,'')+' / '+fmt(d).replace(/\.\d+$/,'');if(!scrubbing)$('#lv-scrub').value=Math.round(t/d*1000)}
  function previewNow(){previewAt(deck.time)}
  let scrubbing=false,raf=0;function tick(){cancelAnimationFrame(raf);const loop=()=>{if(!alive)return;previewAt(deck.time);const ph=$('#lv-ph');if(ph){ph.style.left=deck.time*S.zoom+'px';if(deck.playing){const tl=$('#lv-tl');if(tl&&(deck.time*S.zoom>tl.scrollLeft+tl.clientWidth*.85))tl.scrollLeft=deck.time*S.zoom-tl.clientWidth*.15}}
      // highlight the line under the playhead in the list
      if(deck.playing)raf=requestAnimationFrame(loop)};loop()}
  deck.listeners.add(()=>{$('#lv-pp').innerHTML=I(deck.playing?'pause':'play');$('#lv-pp').setAttribute('aria-label',deck.playing?'Pause':'Play');tick()});
  $('#lv-pp').onclick=()=>{if(!S.buffer){toast('Add a song or your own audio first');return}if(ctx.pauseMain)ctx.pauseMain();deck.toggle()};
  $('#lv-scrub').addEventListener('input',e=>{scrubbing=true;const d=S.buffer?S.buffer.duration:(S.comp?S.comp.dur:0);deck.seek(e.target.value/1000*d);previewAt(deck.time);scrubbing=false});
  $$('#lv-asp button').forEach(b=>b.onclick=()=>{S.aspect=b.dataset.asp;save();marks();S.comp=null;previewNow();thumbs();drawExport()});
  $$('#lv-res button').forEach(b=>b.onclick=()=>{if((b.dataset.res==='1440p'||b.dataset.res==='2160p')&&!(ctx.premium&&ctx.premium())){ctx.upsell&&ctx.upsell('1440p and 4K lyric videos are part of Premium');return}S.res=b.dataset.res;save();marks();S.comp=null;previewNow();drawExport()});$$('#lv-fps button').forEach(b=>b.onclick=()=>{S.fps=+b.dataset.fps;save();marks();drawExport()});
  function marks(){$$('#lv-asp button').forEach(b=>b.classList.toggle('on',b.dataset.asp===S.aspect));$$('#lv-res button').forEach(b=>b.classList.toggle('on',b.dataset.res===S.res));$$('#lv-fps button').forEach(b=>b.classList.toggle('on',+b.dataset.fps===S.fps));const[W,H]=dims(S.res,S.aspect);$('#lv-resnote').textContent=`Exports at ${W} × ${H}, ${S.fps} fps, H.264 MP4. The preview is the same picture at screen size.`}
  /* ---- export + publish ---- */
  let lastExport=null,abort=null;
  function drawExport(){const el=$('#lv-exp');if(!el)return;const ready=S.buffer&&S.analysis;const d=S.buffer?S.buffer.duration:0;const r=S.range||[0,d];
    el.innerHTML=!ready?`<p class="mut small">Pick a song and sync it first.</p>`:`<div class="lvs-rows">
      <div class="lvs-row"><div class="grow"><b>Range</b><small>${S.audio&&!S.audio.full?'Only the preview clip is available for this song.':'Export the whole song or a part — TikTok takes up to 10 minutes.'}</small></div><input class="lvs-t" id="lv-ra" value="${fmt(r[0])}" aria-label="Start"><span class="mut">–</span><input class="lvs-t" id="lv-rb" value="${fmt(r[1])}" aria-label="End"></div>
      ${S.audio&&S.audio.note?`<p class="lvs-note">${esc(S.audio.note)}</p>`:''}
      <label class="lvs-chk"><input type="checkbox" id="lv-rights" ${S.rights?'checked':''}><span>I own this audio or have permission to use it, and the lyrics, in a video<small>Lyric videos of other people’s songs usually need the rights holder’s permission. sniplit doesn’t add a watermark.</small></span></label>
      <div class="row" style="gap:10px;flex-wrap:wrap"><button class="pill" id="lv-go" ${S.rights?'':'disabled'}>${I('video')} Export ${S.res==='2160p'?'4K':S.res} · ${S.fps} fps</button><span class="mut small" id="lv-cap"></span></div>
      <div id="lv-eprog"></div><div id="lv-out"></div></div>
      <div id="lv-tt"></div>`;if(!ready)return;
    const setR=()=>{const a=parseT($('#lv-ra').value),b=parseT($('#lv-rb').value);if(isFinite(a)&&isFinite(b)&&b-a>=1){S.range=[Math.max(0,a),Math.min(d,b)]}$('#lv-ra').value=fmt(S.range?S.range[0]:0);$('#lv-rb').value=fmt(S.range?S.range[1]:d)};
    $('#lv-ra').onchange=setR;$('#lv-rb').onchange=setR;$('#lv-rights').onchange=e=>{S.rights=e.target.checked;$('#lv-go').disabled=!S.rights};$('#lv-go').onclick=doExport;
    capabilities(S.fps,S.aspect).then(cap=>{const el2=$('#lv-cap');if(!el2)return;const bad=Object.keys(RES).filter(k=>!cap[k]);el2.textContent=(!cap[S.res]?`This device can’t encode ${S.res} — pick a smaller size or use a computer. `:bad.length?`Not on this device: ${bad.join(', ')}. `:'')+(!cap.audio?'This browser has no audio encoder.':cap.audio.kind==='opus'?'Audio will be Opus (no AAC encoder in this browser) — some apps prefer AAC.':'')});
    if(lastExport)showOut();drawTikTok()}
  async function doExport(){if(!S.rights)return;deck.pause();const go=$('#lv-go');go.disabled=true;abort=new AbortController();const pr=$('#lv-eprog');
    pr.innerHTML=`<div class="lvs-bar"><i style="width:0%"></i></div><div class="row" style="justify-content:space-between"><small class="mut" id="lv-emsg">Starting…</small><button class="pill sm ghost" id="lv-ecancel">Cancel</button></div>`;$('#lv-ecancel').onclick=()=>abort.abort();
    const range=S.range||[0,S.buffer.duration];
    try{lastExport=await exportVideo({buffer:S.buffer,range,res:S.res,fps:S.fps,aspect:S.aspect,compArgs:compArgs(),signal:abort.signal,onProgress:(f,m,eta)=>{const i=pr.querySelector('.lvs-bar i');if(i)i.style.width=Math.round(f*100)+'%';const e=$('#lv-emsg');if(e)e.textContent=m+(eta?` · about ${eta>90?Math.round(eta/60)+' min':Math.round(eta)+' s'} left`:'')}});
      lastExport.name=`${(S.track&&(S.track.artist?S.track.artist+' - ':'')+S.track.title||'lyric video').replace(/[\\/:*?"<>|]+/g,'')}${S.sfx.rate!==1?(S.sfx.rate<1?' (slowed)':' (sped up)'):''} (${S.aspect.replace(':','x')} ${S.res} ${S.fps}fps).mp4`;pr.innerHTML='';showOut()}
    catch(e){pr.innerHTML=`<p class="lvs-note bad">${e.name==='AbortError'?'Export cancelled.':esc(e.message||String(e))}</p>`}go.disabled=!S.rights}
  function showOut(){const o=lastExport;const el=$('#lv-out');if(!el||!o)return;if(o.url)URL.revokeObjectURL(o.url);o.url=URL.createObjectURL(o.blob);const mb=(o.blob.size/1048576).toFixed(1);
    el.innerHTML=`<div class="lvs-done"><video src="${o.url}" controls playsinline muted></video><div><b>Ready</b><small>${o.W} × ${o.H} · ${o.fps} fps · ${o.frames} frames · H.264${o.audio?' + '+o.audio.toUpperCase():''} · ${mb} MB</small>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px"><a class="pill sm" href="${o.url}" download="${esc(o.name)}">${I('download')} Download</a>${navigator.canShare&&navigator.canShare({files:[new File([new Blob()],'x.mp4',{type:'video/mp4'})]})?`<button class="pill sm ghost" id="lv-share">${I('share')} Share…</button>`:''}</div></div></div>`;
    const sh=$('#lv-share');if(sh)sh.onclick=async()=>{try{await navigator.share({files:[new File([o.blob],o.name,{type:'video/mp4'})],title:S.track?S.track.title:'Lyric video'})}catch(e){}};drawTikTok()}
  /* ---- TikTok ---- */
  function drawTikTok(){const el=$('#lv-tt');if(!el)return;const server=ctx.server();const sess=localStorage.getItem('sn.ttSession')||'';
    if(!server){el.innerHTML=`<div class="lvs-tt"><b>TikTok</b><small>Publishing needs your sniplit server (it keeps TikTok sign-ins off this device). Add its address in Settings → Connections. Until then, use Share… to send the video to the TikTok app.</small></div>`;return}
    el.innerHTML=`<div class="lvs-tt"><b>TikTok</b><small id="lv-ttst">Checking…</small><div id="lv-ttb"></div></div>`;
    ttCall('/tiktok/status').then(st=>{if(!alive)return;if(!st.connected){$('#lv-ttst').textContent=sess?'Your TikTok sign-in expired. Connect again.':'Not connected.';$('#lv-ttb').innerHTML=`<button class="pill sm" id="lv-ttc">Connect TikTok</button>`;$('#lv-ttc').onclick=connect;if(sess&&!st.connected)localStorage.removeItem('sn.ttSession');return}
      $('#lv-ttst').innerHTML=`Connected as <b>${esc(st.user&&st.user.name||'your account')}</b>${st.directPost?'':' · drafts only (direct posting needs TikTok’s app review)'}`;
      $('#lv-ttb').innerHTML=`<button class="pill sm ghost" id="lv-ttd">Disconnect</button>${lastExport?publishForm(st):'<p class="mut small">Export a video to post it.</p>'}`;$('#lv-ttd').onclick=async()=>{await ttCall('/tiktok/disconnect',{method:'POST'}).catch(()=>{});localStorage.removeItem('sn.ttSession');drawTikTok()};if(lastExport)wirePublish(st)})
      .catch(e=>{$('#lv-ttst').textContent='Your sniplit server didn’t answer: '+(e.message||e)})}
  async function ttCall(path,init={}){const r=await fetch(ctx.server()+path,{...init,headers:{...(init.headers||{}),Authorization:'Bearer '+(localStorage.getItem('sn.ttSession')||'')}});const j=await r.json().catch(()=>({}));if(!r.ok&&r.status!==401)throw new Error(j.error||('HTTP '+r.status));return r.status===401?{connected:false}:j}
  function connect(){const ret=location.href.split('#')[0]+'#lyricvideo';location.href=ctx.server()+'/tiktok/login?return='+encodeURIComponent(ret)}
  function publishForm(st){const tags=(S.track?[S.track.artist,'lyrics','lyricvideo']:['lyrics']).filter(Boolean).map(t=>t.replace(/[^\p{L}\p{N}_]/gu,'').toLowerCase()).filter(Boolean);const pr=st.creator&&st.creator.privacy_level_options||[];
    return`<div class="lvs-pub"><label class="lvs-fl">Caption<textarea id="lv-cap2" rows="2" maxlength="2000">${esc((S.track?`${S.track.title}${S.track.artist?' — '+S.track.artist:''}`:''))}</textarea></label>
      <label class="lvs-fl">Hashtags<input id="lv-tags" value="${esc(tags.map(t=>'#'+t).join(' '))}"></label>
      <div class="seg" id="lv-mode"><button data-mode="draft" class="on">Send as draft</button>${st.directPost?'<button data-mode="direct">Post now</button>':''}</div>
      <div id="lv-direct" hidden><label class="lvs-fl">Who can watch<select id="lv-priv"><option value="" selected disabled>Choose who can watch</option>${pr.map(p=>`<option value="${esc(p)}">${esc({PUBLIC_TO_EVERYONE:'Everyone',MUTUAL_FOLLOW_FRIENDS:'Friends',FOLLOWER_OF_CREATOR:'Followers',SELF_ONLY:'Only me'}[p]||p)}</option>`).join('')}</select></label>
        <div class="row" style="gap:14px;flex-wrap:wrap">${['comment','duet','stitch'].map(k=>`<label class="lvs-chk sm"><input type="checkbox" data-allow="${k}" ${st.creator&&st.creator[k+'_disabled']?'disabled':'checked'}><span>Allow ${k}s</span></label>`).join('')}</div>
        <p class="mut small">By posting, you agree to TikTok’s <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener">Music Usage Confirmation</a>.</p></div>
      <button class="pill" id="lv-pub">Send to TikTok</button><div id="lv-pprog"></div></div>`}
  function wirePublish(st){let mode='draft';$$('#lv-mode button').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;$$('#lv-mode button').forEach(x=>x.classList.toggle('on',x===b));$('#lv-direct').hidden=mode!=='direct';$('#lv-pub').textContent=mode==='direct'?'Post to TikTok':'Send to TikTok'});
    $('#lv-pub').onclick=async()=>{const o=lastExport;const caption=($('#lv-cap2').value.trim()+' '+$('#lv-tags').value.trim().split(/\s+/).filter(Boolean).map(t=>t.startsWith('#')?t:'#'+t).join(' ')).trim();
      const info={mode,title:caption,privacy_level:mode==='direct'?$('#lv-priv').value:undefined,disable_comment:mode==='direct'?!(v.querySelector('[data-allow=comment]')||{}).checked:undefined,disable_duet:mode==='direct'?!(v.querySelector('[data-allow=duet]')||{}).checked:undefined,disable_stitch:mode==='direct'?!(v.querySelector('[data-allow=stitch]')||{}).checked:undefined};
      if(mode==='direct'&&!$('#lv-priv').value){toast('Choose who can watch first');return}
      const ok=confirm(mode==='direct'?`Post this video to TikTok now?\n\nWho can watch: ${$('#lv-priv').selectedOptions[0].textContent}\nCaption: ${caption}`:`Send this video to your TikTok inbox as a draft?\nYou’ll finish and post it in the TikTok app.`);if(!ok)return;
      const pp=$('#lv-pprog');const say=(f,m,bad)=>pp.innerHTML=`<div class="lvs-bar"><i style="width:${Math.round(f*100)}%"></i></div><small class="${bad?'lvs-note bad':'mut'}">${esc(m)}</small>`;$('#lv-pub').disabled=true;
      try{say(0,'Uploading to your sniplit server…');const job=await new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open('POST',ctx.server()+'/tiktok/publish');x.setRequestHeader('Authorization','Bearer '+localStorage.getItem('sn.ttSession'));x.setRequestHeader('Content-Type','video/mp4');x.setRequestHeader('X-Post-Info',btoa(unescape(encodeURIComponent(JSON.stringify({...info,confirmed:true})))));
          x.upload.onprogress=e=>e.lengthComputable&&say(e.loaded/e.total*.5,`Uploading… ${Math.round(e.loaded/e.total*100)}%`);x.onload=()=>{let j={};try{j=JSON.parse(x.responseText)}catch(e){}x.status<300?res(j):rej(new Error(j.error||('HTTP '+x.status)))};x.onerror=()=>rej(new Error('Upload failed'));x.send(o.blob)});
        for(;;){await new Promise(r=>setTimeout(r,2000));if(!alive)return;const s=await ttCall('/tiktok/job/'+encodeURIComponent(job.job));
          if(s.stage==='failed')throw new Error(s.error||'TikTok rejected the video');if(s.stage==='done'){say(1,mode==='direct'?'Posted to TikTok. It may take a few minutes to appear.':'Sent. Open TikTok and check your inbox notifications to finish the post.');break}
          say(.5+.5*(s.progress||0),{transfer:'Sending to TikTok…',processing:'TikTok is processing the video…',queued:'Queued…'}[s.stage]||'Working…')}}
      catch(e){say(0,'Couldn’t send to TikTok: '+(e.message||e),true)}$('#lv-pub').disabled=false}}
  /* ---- keyboard ---- */
  const key=e=>{if(!alive||!v.isConnected||/INPUT|TEXTAREA|SELECT/.test((document.activeElement||{}).tagName||''))return;if(e.key==='s'||e.key==='S'){stamp();e.preventDefault()}else if(e.code==='Space'&&v.contains(document.activeElement)){deck.toggle();e.preventDefault()}};addEventListener('keydown',key);
  const ro=new ResizeObserver(()=>{S.comp=null;previewNow();drawWave()});ro.observe(cv.parentElement);
  marks();drawSrc();drawSound();drawSync();drawStyles();drawCust();drawExport();previewNow();if(S.track)loadSong();
  return{pause(){deck.pause()},destroy(){alive=false;deck.stop();ro.disconnect();removeEventListener('keydown',key);if(lastExport&&lastExport.url)URL.revokeObjectURL(lastExport.url)},state:S,exportVideo:(o)=>exportVideo({buffer:S.buffer,compArgs:compArgs(),...o})}}

window.SLStudio={mount,exportVideo,capabilities,avcCodecs,RES};
})();
;(window.__snParts=window.__snParts||{})["lib/lstudio.js"]="662870336b97";
