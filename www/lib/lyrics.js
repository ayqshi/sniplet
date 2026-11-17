/* sniplit — synced lyrics: fetch, parse, and align full-song LRC timings to a 30-second preview.
   Alignment = vocal-activity "transcription estimate" (mid/side band energy onsets) cross-matched
   against LRC line starts, searched coarse→fine recursively, then verified by split-half agreement. */
(function(){
function parseLRC(txt){
  const lines=[];if(!txt)return lines;let off=0;
  for(const raw of txt.split(/\r?\n/)){
    const o=raw.match(/^\[offset:([+-]?\d+)\]/i);if(o){off=+o[1]/1000;continue}
    const tags=[...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];if(!tags.length)continue;
    const text=raw.replace(/\[[^\]]*\]/g,'').trim();
    for(const t of tags)lines.push({t:+t[1]*60+ +t[2]-off,text});
  }
  lines.sort((a,b)=>a.t-b.t);
  for(let i=0;i<lines.length;i++){const n=lines[i+1];lines[i].end=n?n.t:lines[i].t+5;if(!lines[i].text)lines[i].instr=true}
  return lines.map(l=>({...l,words:wordTimes(l)}));
}
function syll(w){w=w.toLowerCase().replace(/[^a-z']/g,'');if(!w)return 1;const m=w.replace(/e$/,'').match(/[aeiouy]+/g);return Math.max(1,m?m.length:1)}
function wordTimes(l){
  if(l.instr)return[];const ws=l.text.split(/\s+/).filter(Boolean);const sy=ws.map(syll),tot=sy.reduce((a,b)=>a+b,0);
  const span=Math.min(l.end-l.t,Math.max(.8,tot*.27+.35));let t=l.t;
  return ws.map((w,i)=>{const d=span*sy[i]/tot;const o={w,t,e:t+d};t+=d;return o});
}
function plainToLines(txt,dur){const ls=txt.split(/\r?\n/).filter(s=>s.trim());const step=dur/(ls.length+2);return ls.map((text,i)=>({t:step*(i+1),end:step*(i+2),text,words:[],unsynced:true}))}

const cache=new Map();
function fromCandidate(c,track){return c.lrc?{synced:true,lines:parseLRC(c.lrc),source:c.source||c.src,pick:c}:{synced:false,lines:plainToLines(c.plain||'',((track&&track.durationMs)||180000)/1000),source:c.source||c.src,pick:c}}
/** turn recognised words into timed lyric lines (used when no source has the song) */
function linesFromWords(words){const out=[];let cur=null;for(const w of words){if(!cur||w.t-cur.lastE>.6||cur.words.length>=9){cur={t:w.t,words:[],lastE:w.e};out.push(cur)}cur.words.push({w:w.w,t:w.t,e:w.e});cur.lastE=w.e}
  return out.map((l,i)=>({t:l.t,end:out[i+1]?out[i+1].t:l.lastE+1,text:l.words.map(x=>x.w).join(' '),words:l.words}))}
async function fetchLyrics(track){
  const key=track.artist+'|'+track.title;if(cache.has(key))return cache.get(key);
  if(window.SNIPLIT_FIXTURE&&window.SNIPLIT_FIXTURE.lyrics){const f=window.SNIPLIT_FIXTURE.lyrics(track);if(f){const o={synced:true,lines:parseLRC(f),source:'LRCLIB'};cache.set(key,o);return o}}
  // every lyric that has been found once is kept on the device: it shows offline, and when a source has a bad day
  const dk='lyr:'+String(key).toLowerCase();const IDB=window.SData&&SData.IDB;
  const saved=async()=>{try{const v=IDB&&await IDB.get('kv',dk);return v&&v.lines?v:null}catch(e){return null}};
  if(!navigator.onLine){const v=await saved();if(v){cache.set(key,v);return v}}
  let out=null;
  if(window.SSrc&&SSrc.Lyr2.best){const r=await SSrc.Lyr2.best(track).catch(()=>null);
    if(r)out=r.instrumental?{synced:false,lines:[],instrumental:true,source:r.source}:{...fromCandidate(r,track),candidates:r.candidates||[],confidence:r.confidence}}
  if(out&&!out.lines.length&&!out.instrumental)out=null;
  if(out){cache.set(key,out);try{IDB&&IDB.put('kv',dk,{...out,candidates:undefined,at:Date.now()})}catch(e){}}
  else{const v=await saved();if(v){cache.set(key,v);return v}}// failures are not remembered, so the next try asks again
  return out;
}

/* ---- vocal-activity envelope from an AudioBuffer ---- */
async function vocalEnvelope(buffer,hop=.04){
  // best: the separated vocal stem (handles layered, panned and pitched vocals far better than mid/side)
  try{if(window.SAudio&&SAudio.vocalStem){const pcm=await SAudio.vocalStem(buffer,0,buffer.duration);if(pcm&&pcm.length>16000){const sr=16000,H=Math.floor(sr*hop),F=Math.floor(pcm.length/H),v=new Float32Array(F);
    for(let f=0;f<F;f++){let m=0;for(let i=f*H;i<(f+1)*H;i++)m+=pcm[i]*pcm[i];v[f]=Math.sqrt(m/H)}return envFrom(v,hop,buffer.duration)}}}catch(e){}
  const sr=buffer.sampleRate,len=buffer.length;
  const run=async(sign)=>{const ctx=new OfflineAudioContext(1,len,sr);const s=ctx.createBufferSource();s.buffer=buffer;
    const sp=ctx.createChannelSplitter(2),g=ctx.createGain(),inv=ctx.createGain();inv.gain.value=sign;g.gain.value=.5;
    s.connect(sp);sp.connect(g,0);sp.connect(inv,buffer.numberOfChannels>1?1:0);inv.connect(g);
    const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=280;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=3600;
    const pk=ctx.createBiquadFilter();pk.type='peaking';pk.frequency.value=1800;pk.gain.value=6;
    g.connect(hp);hp.connect(lp);lp.connect(pk);pk.connect(ctx.destination);s.start();return(await ctx.startRendering()).getChannelData(0)};
  const mid=await run(1),side=await run(-1);
  const H=Math.floor(sr*hop),F=Math.floor(len/H),v=new Float32Array(F);
  for(let f=0;f<F;f++){let m=0,s=0;for(let i=f*H;i<(f+1)*H;i++){m+=mid[i]*mid[i];s+=side[i]*side[i]}v[f]=Math.max(0,Math.sqrt(m/H)-.85*Math.sqrt(s/H))}
  return envFrom(v,hop,buffer.duration)}
function envFrom(v,hop,dur){const F=v.length;
  // normalise + smooth
  let mx=0;for(const x of v)mx=Math.max(mx,x);if(mx>0)for(let i=0;i<F;i++)v[i]/=mx;
  const sm=new Float32Array(F);for(let i=0;i<F;i++){let a=0,n=0;for(let k=-2;k<=2;k++){const j=i+k;if(j>=0&&j<F){a+=v[j];n++}}sm[i]=a/n}
  const on=new Float32Array(F);for(let i=6;i<F;i++){let p=0;for(let k=1;k<=6;k++)p+=sm[i-k];on[i]=Math.max(0,sm[i]-p/6)}
  let mo=0;for(const x of on)mo=Math.max(mo,x);if(mo>0)for(let i=0;i<F;i++)on[i]/=mo;
  return{hop,pres:sm,onset:on,dur};
}
function scoreAt(env,lines,off,from=0,to=Infinity){
  const{hop,pres,onset,dur}=env;let sc=0,n=0,gap=0,gn=0;
  for(let i=0;i<lines.length;i++){const l=lines[i];const tt=l.t-off;if(tt<Math.max(from,.2)||tt>Math.min(to,dur-.3))continue;
    const f=Math.round(tt/hop);if(l.instr){continue}
    let o=0;for(let k=-2;k<=3;k++){const j=f+k;if(j>=0&&j<onset.length)o=Math.max(o,onset[j]*(1-Math.abs(k)*.12))}
    let p=0,pn=0;const fe=Math.min(pres.length,Math.round((Math.min(l.end,l.t+4)-off)/hop));for(let j=f;j<fe;j++){p+=pres[j];pn++}
    sc+=o*1.0+(pn?p/pn:0)*.6;n++}
  // penalise vocals inside instrumental gaps
  for(let i=0;i<lines.length;i++){const l=lines[i];if(!l.instr&&(l.end-l.t)<7)continue;const a=(l.instr?l.t:l.t+5)-off,b=l.end-off;if(b<from||a>Math.min(to,dur))continue;
    for(let j=Math.max(0,Math.round(a/hop));j<Math.min(pres.length,Math.round(b/hop));j++){gap+=pres[j];gn++}}
  if(n<1)return -1;return sc/n*Math.min(1,n/3)-(gn?gap/gn*.5:0);
}
function search(env,lines,lo,hi,step,from,to){let best=-1e9,bo=lo;for(let o=lo;o<=hi;o+=step){const s=scoreAt(env,lines,o,from,to);if(s>best){best=s;bo=o}}return{o:bo,s:best}}
function lookahead(env,lines,off){const{hop,onset,dur}=env;let n=0,h=0;const snaps={};
  lines.forEach((l,i)=>{if(l.instr)return;const tt=l.t-off;if(tt<.3||tt>dur-.4)return;n++;const f=Math.round(tt/hop);let bj=-1,bv=0;
    for(let k=-9;k<=9;k++){const j=f+k;if(j<0||j>=onset.length)continue;const v=onset[j]*(1-Math.abs(k)/12);if(v>bv){bv=v;bj=j}}
    if(bv>.32){h++;const d=bj*hop-tt;if(Math.abs(d)>.05)snaps[i]=+d.toFixed(2)}});return{hit:n?h/n:0,snaps}}
/** Estimate where the preview sits inside the full song. Returns {offset, confidence 0..1, verified, method} */
async function alignPreview(buffer,lines,songDur){
  const env=await vocalEnvelope(buffer);const D=env.dur;const maxOff=Math.max(0,(songDur||D)-D+1);
  if(maxOff<1.5)return{offset:0,confidence:.9,verified:true,method:'full'};
  // coarse pass → collect peaks
  const pts=[];for(let o=0;o<=maxOff;o+=.25)pts.push([o,scoreAt(env,lines,o)]);
  const vals=pts.map(p=>p[1]).filter(v=>v>-1).sort((a,b)=>a-b);if(!vals.length)return{offset:Math.max(0,songDur*.3),confidence:0,verified:false,method:'prior'};
  const med=vals[Math.floor(vals.length/2)],sd=Math.sqrt(vals.reduce((a,v)=>a+(v-med)**2,0)/vals.length)||1e-3;
  const peaks=pts.filter((p,i)=>p[1]>=(pts[i-1]?.[1]??-9)&&p[1]>=(pts[i+1]?.[1]??-9)).sort((a,b)=>b[1]-a[1]).slice(0,6);
  // constellation: line starts vs vocal-phrase starts — every pairing proposes an offset, the ones many lines agree on win
  const P=[];for(let i=1;i<env.onset.length-1;i++)if(env.onset[i]>.35&&env.onset[i]>=env.onset[i-1]&&env.onset[i]>=env.onset[i+1])P.push(i*env.hop);
  const Ls=lines.filter(l=>!l.instr).map(l=>l.t);const votes=new Map();
  for(const lt of Ls)for(const pt of P){const o=lt-pt;if(o<-.5||o>maxOff+.5)continue;const k=Math.round(o*10);votes.set(k,(votes.get(k)||0)+1)}
  const cons=[...votes.entries()].map(([k,n])=>[k/10,n+(votes.get(k-1)||0)*.5+(votes.get(k+1)||0)*.5]).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([o])=>[Math.max(0,Math.min(maxOff,o)),0]);
  // recursive refinement around each peak: .25 → .05 → .01
  let best={o:0,s:-1e9};
  for(const[p] of [...peaks,...cons]){let r={o:p,s:0},w=.3;for(const st of[.05,.01]){r=search(env,lines,Math.max(0,r.o-w),Math.min(maxOff,r.o+w),st);w=st*6}if(r.s>best.s)best=r}
  // verification: each half of the preview independently, constrained near best
  const h=D/2,a=search(env,lines,Math.max(0,best.o-1.5),best.o+1.5,.02,0,h),b=search(env,lines,Math.max(0,best.o-1.5),best.o+1.5,.02,h,D);
  const agree=Math.abs(a.o-b.o)<.35&&Math.abs(a.o-best.o)<.35;
  const z=(best.s-med)/sd;const off=best.o+.09;
  // look-ahead check: every upcoming sung line inside the preview should start on a vocal onset
  const la=lookahead(env,lines,off);const confidence=Math.max(0,Math.min(1,(z-1)/4))*(agree?1:.6)*(.5+.5*la.hit);
  return{offset:+off.toFixed(2),confidence,verified:agree&&la.hit>=.6&&confidence>.35,method:'vocal-onset',z:+z.toFixed(2),hit:+la.hit.toFixed(2),snaps:la.snaps};
}

/* ---- speech-to-text check (Whisper, runs in a worker, model fetched once from a public CDN) ----
   Transcribes the vocal band of a 30 s window, then matches the recognised words to the lyric lines in order.
   Lines are only trusted when the NEXT lines also match in sequence (look-ahead), so one lucky word can't move the sync. */
const WORKER=`let asr;self.onmessage=async e=>{const{id,pcm}=e.data;try{if(!asr){const T=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2');T.env.allowLocalModels=false;
  const gpu=!!(self.navigator&&navigator.gpu);asr=await T.pipeline('automatic-speech-recognition','onnx-community/whisper-base.en',{dtype:gpu?'fp32':'q8',device:gpu?'webgpu':'wasm'})}
  const r=await asr(pcm,{return_timestamps:'word',chunk_length_s:30,stride_length_s:4,no_repeat_ngram_size:3});self.postMessage({id,words:(r.chunks||[]).map(c=>({w:c.text.trim(),t:c.timestamp[0],e:c.timestamp[1]}))})}catch(err){self.postMessage({id,error:String(err&&err.message||err)})}}`;
let wk=null,wid=0;const pend=new Map();
function worker(){if(wk)return wk;wk=new Worker(URL.createObjectURL(new Blob([WORKER],{type:'text/javascript'})),{type:'module'});wk.onmessage=e=>{const p=pend.get(e.data.id);if(p){pend.delete(e.data.id);e.data.error?p.rej(new Error(e.data.error)):p.res(e.data.words)}};wk.onerror=e=>{for(const p of pend.values())p.rej(new Error('worker'));pend.clear();wk=null};return wk}
async function vocalPCM(buffer,from=0,len=30){const sr=16000,n=Math.floor(Math.min(len,buffer.duration-from)*sr);if(n<sr*3)return null;const ctx=new OfflineAudioContext(1,n,sr);const s=ctx.createBufferSource();s.buffer=buffer;
  const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=150;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=5000;const pk=ctx.createBiquadFilter();pk.type='peaking';pk.frequency.value=2500;pk.gain.value=5;
  s.connect(hp);hp.connect(lp);lp.connect(pk);pk.connect(ctx.destination);s.start(0,from);return(await ctx.startRendering()).getChannelData(0)}
const nw=w=>String(w).toLowerCase().replace(/[^a-z0-9']/g,'').replace(/'/g,'');
const sim=(a,b)=>{if(!a||!b)return 0;if(a===b)return 1;if(a.length>3&&b.length>3&&(a.startsWith(b.slice(0,4))||b.startsWith(a.slice(0,4))))return .7;let m=0;const A=new Set(a.match(/.{1,2}/g)),B=b.match(/.{1,2}/g)||[];for(const x of B)if(A.has(x))m++;return m/Math.max(A.size,B.length)>.6?.5:0};
/** windowStart: where the transcribed audio begins in player time. Returns {offset, matched, verified, words} or null */
async function transcribe(buffer,windowStart=0,len=30){if(!('Worker'in self))return[];const pcm=(window.SAudio&&SAudio.vocalStem?await SAudio.vocalStem(buffer,windowStart,len).catch(()=>null):null)||await vocalPCM(buffer,windowStart);if(!pcm)return[];
  const id=++wid;const words=await new Promise((res,rej)=>{pend.set(id,{res,rej});worker().postMessage({id,pcm},[pcm.buffer]);setTimeout(()=>{if(pend.has(id)){pend.delete(id);rej(new Error('timeout'))}},240000)});
  return words.filter(w=>w.w&&isFinite(w.t)).map(w=>({w:w.w,t:w.t+windowStart,e:(isFinite(w.e)?w.e:w.t+.3)+windowStart}))}
async function transcriptAlign(buffer,lines,{windowStart=0,words}={}){if(!words)words=await transcribe(buffer,windowStart);
  const T=words.map(w=>({...w,n:nw(w.w)})).filter(w=>w.n);if(T.length<4)return null;
  // for each lyric line, best in-order match of its first words in the transcript
  const cands=[];lines.forEach((l,i)=>{if(l.instr||!l.text)return;const lw=l.text.split(/\s+/).map(nw).filter(Boolean);if(lw.length<2)return;
    for(let j=0;j<T.length;j++){let sc=0,k=j;for(let q=0;q<Math.min(4,lw.length)&&k<T.length;q++){const s1=sim(lw[q],T[k].n);if(s1>=.5){sc+=s1;k++}else if(k+1<T.length&&sim(lw[q],T[k+1].n)>=.5){sc+=.6;k+=2}}
      if(sc>=1.6)cands.push({i,t:T[j].t,d:T[j].t-l.t,sc})}});
  if(cands.length<2)return null;
  // offsets (player time − lyric time) that agree across consecutive lines win; look-ahead: a line counts only if a later line agrees
  const ds=cands.map(c=>c.d).sort((a,b)=>a-b);let best=null;for(const d of ds){const sup=cands.filter(c=>Math.abs(c.d-d)<.6);const lineSet=new Set(sup.map(c=>c.i));const seq=[...lineSet].sort((a,b)=>a-b).filter((x,k,arr)=>arr[k+1]===x+1||arr[k-1]===x-1).length;
    const score=sup.reduce((a,c)=>a+c.sc,0)+seq*1.5;if(!best||score>best.score)best={d,score,lines:lineSet.size,seq,sup}}
  if(!best||best.lines<2)return null;const med=best.sup.map(c=>c.d).sort((a,b)=>a-b)[Math.floor(best.sup.length/2)];
  const snaps={};for(const c of best.sup){const r=c.d-med;if(Math.abs(r)>.08&&Math.abs(r)<.6)snaps[c.i]=+r.toFixed(2)}
  const hits={};for(const c of best.sup){if(!hits[c.i]||c.sc>hits[c.i].sc)hits[c.i]={t:c.t,sc:c.sc}}
  return{offset:+(-med).toFixed(2),matched:best.lines,verified:best.seq>=2,snaps,words:T,hits}}
/** any-lyrics anchoring: lines heard get their real time, the rest are spread between those anchors by length */
function anchorLines(lines,hits,dur){const L=lines.map(l=>({...l}));const n=L.length;
  const idx=Object.keys(hits).map(Number).sort((a,b)=>a-b).filter((i,k,a)=>k===0||hits[i].t>hits[a[k-1]].t);if(!idx.length)return L;
  const w=L.map(l=>l.instr?3:syl(l.text)+2.2);const per=k=>2.9;
  const lastT=dur||hits[idx[idx.length-1]].t+(n-idx[idx.length-1])*3.2;
  const pts=[[0,idx[0]===0?hits[idx[0]].t:Math.max(0,hits[idx[0]].t-w.slice(0,idx[0]).reduce((a,b)=>a+b,0)*.32)],...idx.filter(i=>i>0).map(i=>[i,hits[i].t]),[n,lastT]];
  for(let k=0;k<pts.length-1;k++){const[i0,t0]=pts[k],[i1,t1]=pts[k+1];const tot=w.slice(i0,i1).reduce((a,b)=>a+b,0)||1;let acc=0;
    for(let i=i0;i<i1;i++){L[i].t=t0+(t1-t0)*acc/tot;acc+=w[i]}}
  L.forEach((l,i)=>{l.end=L[i+1]?L[i+1].t:l.t+4;l.words=wordTimes(l)});return L}
/** first guess for lyrics that come without timestamps: intro, verses by syllable count, outro */
const syl=x=>Math.max(1,(String(x).toLowerCase().match(/[aeiouy]+/g)||[]).length);
function estimateLines(lines,dur){const L=lines.filter(l=>l.text&&l.text.trim());if(!dur||!L.length)return null;const intro=Math.min(18,Math.max(4,dur*.07)),outro=Math.min(14,dur*.05);const span=dur-intro-outro;
  const w=L.map(l=>syl(l.text)+2.2);const tot=w.reduce((a,b)=>a+b,0);let t=intro;return L.map((l,i)=>{const o={t,end:0,text:l.text,words:[]};t+=span*w[i]/tot;o.end=t;o.words=wordTimes(o);return o})}
window.SLyrics={parseLRC,fetchLyrics,alignPreview,transcriptAlign,transcribe,linesFromWords,fromCandidate,wordTimes,plainToLines,estimateLines,anchorLines};
})();
