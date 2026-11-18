/* sniplit Lyric Studio — song analysis and lyric synchronisation.
   analyse(buffer): tempo, beat grid, energy, 24-band spectrum (for visualisers), brightness, sections.
   sync(lines, buffer, opts): line + word timing with a confidence for every line:
     'source'    timestamps came with the lyrics (LRC)          'heard'  matched to the vocals by speech recognition
     'estimated' placed from vocal activity — needs a look       'manual' set by the person
   Lyrics are never invented: text only ever comes from the lyric source or from the person. */
(function(){
/* ---------- FFT (radix-2, in place) ---------- */
function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}}
  for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let k=0;k<len/2;k++){const p=i+k,q=p+len/2;const tr=re[q]*cr-im[q]*ci,ti=re[q]*ci+im[q]*cr;re[q]=re[p]-tr;im[q]=im[p]-ti;re[p]+=tr;im[p]+=ti;const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr}}}}
function mono(buffer){const n=buffer.length,c=buffer.numberOfChannels,o=new Float32Array(n);for(let ch=0;ch<c;ch++){const d=buffer.getChannelData(ch);for(let i=0;i<n;i++)o[i]+=d[i]/c}return o}
const pct=(arr,p)=>{const s=Float32Array.from(arr).sort();return s[Math.min(s.length-1,Math.floor(p*s.length))]||0};
function smooth(a,r){const o=new Float32Array(a.length);let s=0;const q=[];for(let i=0;i<a.length;i++){s+=a[i];q.push(a[i]);if(q.length>2*r+1)s-=q.shift();o[Math.max(0,i-r)]=s/q.length}for(let i=a.length-r;i<a.length;i++)if(i>=0)o[i]=o[i]||a[i];return o}

/* ---------- analysis ---------- */
async function analyse(buffer,{onProgress}={}){
  const sr=buffer.sampleRate,x=mono(buffer),N=2048,H=Math.round(sr/86.13);// ~86 frames/s
  const frames=Math.max(1,Math.floor((x.length-N)/H));const NB=24;
  const fps=sr/H;const win=new Float32Array(N).map((_,i)=>.5-.5*Math.cos(2*Math.PI*i/N));
  const edges=[...Array(NB+1)].map((_,i)=>Math.round(40*Math.pow(16000/40,i/NB)/(sr/N)));
  const bands=new Float32Array(frames*NB),flux=new Float32Array(frames),rms=new Float32Array(frames),cent=new Float32Array(frames);
  let prev=new Float32Array(N/2);const re=new Float32Array(N),im=new Float32Array(N);
  for(let f=0;f<frames;f++){const o=f*H;let e=0;for(let i=0;i<N;i++){const v=x[o+i];re[i]=v*win[i];im[i]=0;e+=v*v}rms[f]=Math.sqrt(e/N);fft(re,im);
    let fl=0,cs=0,ms=0;const mag=new Float32Array(N/2);for(let k=1;k<N/2;k++){const m=Math.sqrt(re[k]*re[k]+im[k]*im[k]);mag[k]=m;const d=Math.log1p(m)-Math.log1p(prev[k]);if(d>0)fl+=d;cs+=k*m;ms+=m}
    flux[f]=fl;cent[f]=ms?cs/ms*(sr/N):0;prev=mag;
    for(let b=0;b<NB;b++){let s=0;const a=Math.max(1,edges[b]),z=Math.max(a+1,edges[b+1]);for(let k=a;k<z&&k<N/2;k++)s+=mag[k];bands[f*NB+b]=Math.log1p(s/(z-a))}
    if(f%2000===0){onProgress&&onProgress(f/frames);await new Promise(r=>setTimeout(r,0))}}
  // normalise bands per band to 0..1 using robust ranges
  for(let b=0;b<NB;b++){const col=new Float32Array(frames);for(let f=0;f<frames;f++)col[f]=bands[f*NB+b];const lo=pct(col,.05),hi=pct(col,.98)||1;for(let f=0;f<frames;f++)bands[f*NB+b]=Math.max(0,Math.min(1,(bands[f*NB+b]-lo)/(hi-lo||1)))}
  // onset strength: flux minus local mean, half-wave rectified
  const loc=smooth(flux,Math.round(fps*.25));const onset=new Float32Array(frames);for(let f=0;f<frames;f++)onset[f]=Math.max(0,flux[f]-loc[f]);
  // tempo by autocorrelation (60–190 BPM), weighted toward the 90–140 range people tap along to
  let best=0,bestLag=Math.round(fps*.5);const minL=Math.round(fps*60/190),maxL=Math.round(fps*60/60);
  for(let L=minL;L<=maxL;L++){let s=0;for(let f=L;f<frames;f++)s+=onset[f]*onset[f-L];const bpm=60*fps/L;const w=Math.exp(-.5*Math.pow(Math.log2(bpm/118)/.9,2));s*=w;if(s>best){best=s;bestLag=L}}
  // refine lag to a fraction for long songs
  const bpm=+(60*fps/bestLag).toFixed(1);const period=60/bpm;
  // beat phase: offset that lines the grid up with the strongest onsets, then let each beat snap to a nearby peak
  let bp=0,bs=-1;const pf=Math.round(period*fps);for(let p=0;p<pf;p++){let s=0;for(let f=p;f<frames;f+=pf)s+=onset[Math.round(f)];if(s>bs){bs=s;bp=p}}
  const beats=[];for(let t=bp/fps;t<buffer.duration;t+=period){const c=Math.round(t*fps);let m=c,mv=-1;for(let f=Math.max(0,c-Math.round(pf*.08));f<=Math.min(frames-1,c+Math.round(pf*.08));f++)if(onset[f]>mv){mv=onset[f];m=f}beats.push(m/fps)}
  // energy 0..1
  const sm=smooth(rms,Math.round(fps*.12));const lo=pct(sm,.05),hi=pct(sm,.97)||1;const energy=new Float32Array(frames);for(let f=0;f<frames;f++)energy[f]=Math.max(0,Math.min(1,(sm[f]-lo)/(hi-lo||1)));
  const cs=smooth(cent,Math.round(fps*.5));const clo=pct(cs,.05),chi=pct(cs,.95)||1;const bright=new Float32Array(frames);for(let f=0;f<frames;f++)bright[f]=Math.max(0,Math.min(1,(cs[f]-clo)/(chi-clo||1)));
  // sections: novelty between the 6 s before and after each half-second, peaks at least 8 s apart
  const hop=Math.round(fps*.5),wl=12;const feat=[];for(let f=0;f<frames;f+=hop){const v=new Float32Array(NB+1);for(let k=f;k<Math.min(frames,f+hop);k++){for(let b=0;b<NB;b++)v[b]+=bands[k*NB+b];v[NB]+=energy[k]*3}feat.push(v)}
  const nov=feat.map((_,i)=>{if(i<wl||i>=feat.length-wl)return 0;let d=0;for(let b=0;b<=NB;b++){let a=0,c=0;for(let k=i-wl;k<i;k++)a+=feat[k][b];for(let k=i;k<i+wl;k++)c+=feat[k][b];d+=Math.abs(a-c)/wl/hop}return d});
  const nThr=pct(nov,.85);const bounds=[0];nov.forEach((v,i)=>{const t=i*.5;if(v>nThr&&v>=(nov[i-1]||0)&&v>=(nov[i+1]||0)&&t-bounds[bounds.length-1]>=8&&buffer.duration-t>=6)bounds.push(t)});
  const snapBeat=t=>{let b=t,d=1e9;for(const x of beats){const e=Math.abs(x-t);if(e<d){d=e;b=x}}return d<period?b:t};
  const sections=bounds.map((t,i)=>{const s=i?snapBeat(t):0,e=bounds[i+1]?snapBeat(bounds[i+1]):buffer.duration;let m=0,c=0;for(let f=Math.floor(s*fps);f<Math.min(frames,e*fps);f++){m+=energy[f];c++}return{t:s,end:e,energy:c?m/c:0}});
  onProgress&&onProgress(1);
  return{duration:buffer.duration,bpm,period,beats,fps,NB,bands,energy,bright,onset,sections,frames}
}
/* readers used by the renderer (all safe outside the song) */
function at(A,arr,t){if(!A)return 0;const f=Math.max(0,Math.min(A.frames-1,Math.round(t*A.fps)));return arr[f]||0}
function band(A,t,b){if(!A)return 0;const f=Math.max(0,Math.min(A.frames-1,Math.round(t*A.fps)));return A.bands[f*A.NB+b]||0}
function beatInfo(A,t){if(!A||!A.beats.length)return{i:0,phase:0,pulse:0};let lo=0,hi=A.beats.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(A.beats[m]<=t)lo=m;else hi=m-1}
  const b=A.beats[lo],nb=A.beats[lo+1]||b+A.period;const ph=t<b?0:Math.min(1,(t-b)/(nb-b));return{i:lo,phase:ph,pulse:t<b?0:Math.exp(-ph*5)}}
function sectionAt(A,t){if(!A)return{i:0,p:0,s:{t:0,end:1,energy:.5}};let i=0;for(let k=0;k<A.sections.length;k++)if(A.sections[k].t<=t)i=k;const s=A.sections[i];return{i,s,p:Math.min(1,(t-s.t)/Math.max(.01,s.end-s.t))}}

/* ---------- vocal activity ---------- */
async function vocalActivity(buffer,{onProgress}={}){let pcm=null;
  try{if(window.SAudio&&SAudio.vocalStem)pcm=await SAudio.vocalStem(buffer,0,buffer.duration)}catch(e){}
  if(!pcm){const sr=16000,n=Math.floor(buffer.duration*sr);const ctx=new OfflineAudioContext(1,n,sr);const s=ctx.createBufferSource();s.buffer=buffer;
    // centre channel, vocal band: L+R minus a share of the side signal
    const sp=ctx.createChannelSplitter(2),mid=ctx.createGain();mid.gain.value=.5;s.connect(sp);sp.connect(mid,0);sp.connect(mid,1);
    const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=180;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=4200;const pk=ctx.createBiquadFilter();pk.type='peaking';pk.frequency.value=1800;pk.gain.value=6;
    mid.connect(hp);hp.connect(lp);lp.connect(pk);pk.connect(ctx.destination);s.start();pcm=(await ctx.startRendering()).getChannelData(0)}
  const sr=16000,hop=320;const n=Math.floor(pcm.length/hop);const env=new Float32Array(n);for(let f=0;f<n;f++){let e=0;for(let i=0;i<hop;i++){const v=pcm[f*hop+i]||0;e+=v*v}env[f]=Math.sqrt(e/hop)}
  const sm=smooth(env,3);const floor=pct(sm,.2),top=pct(sm,.95);const on=floor+(top-floor)*.28,off=floor+(top-floor)*.16;
  const act=new Uint8Array(n);let st=0;for(let f=0;f<n;f++){if(!st&&sm[f]>on)st=1;else if(st&&sm[f]<off)st=0;act[f]=st}
  // regions, small gaps merged
  const regs=[];let a=-1;for(let f=0;f<=n;f++){if(act[f]&&a<0)a=f;if((!act[f]||f===n)&&a>=0){regs.push([a*hop/sr,f*hop/sr]);a=-1}}
  const merged=[];for(const r of regs){const m=merged[merged.length-1];if(m&&r[0]-m[1]<.35)m[1]=r[1];else if(r[1]-r[0]>.12)merged.push([...r])}
  // vocal onsets (for word snapping): rises in the envelope
  const onsets=[];for(let f=2;f<n-1;f++){const d=sm[f]-sm[f-2];if(d>(top-floor)*.06&&sm[f]>=sm[f-1]&&sm[f]>=sm[f+1]&&act[f])onsets.push(f*hop/sr)}
  onProgress&&onProgress(1);return{regions:merged,onsets,env:sm,rate:sr/hop,floor,top}}

/* ---------- text helpers ---------- */
const syl=w=>{w=String(w).toLowerCase().replace(/[^a-z']/g,'');if(!w)return 1;const m=w.replace(/e$/,'').match(/[aeiouy]+/g);return Math.max(1,m?m.length:1)};
const nw=w=>String(w).toLowerCase().normalize('NFKD').replace(/[^a-z0-9']/g,'').replace(/'/g,'');
function sim(a,b){if(!a||!b)return 0;if(a===b)return 1;const L=Math.max(a.length,b.length);let d=0;const dp=[...Array(b.length+1).keys()];for(let i=1;i<=a.length;i++){let p=dp[0];dp[0]=i;for(let j=1;j<=b.length;j++){const t=dp[j];dp[j]=Math.min(dp[j]+1,dp[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=t}}d=dp[b.length];return Math.max(0,1-d/L)}
/** enhanced LRC: <mm:ss.xx>word tags inside a line give real word times */
function parseEnhanced(text){const m=[...String(text).matchAll(/<(\d+):(\d+(?:\.\d+)?)>\s*([^<]*)/g)];if(m.length<2)return null;return m.map(x=>({w:x[3].trim(),t:+x[1]*60+ +x[2]})).filter(x=>x.w)}
function cleanText(t){return String(t||'').replace(/<\d+:\d+(?:\.\d+)?>/g,'').replace(/\s+/g,' ').trim()}

/* word timing inside a line: syllable-weighted, then nudged onto vocal onsets within the line */
function placeWords(line,va,conf){const ws=line.text.split(/\s+/).filter(Boolean);if(!ws.length)return[];
  const sy=ws.map(syl),tot=sy.reduce((a,b)=>a+b,0);const sung=Math.max(.5,Math.min(line.end-line.t,tot*.32+.4));let t=line.t;
  const out=ws.map((w,i)=>{const d=sung*sy[i]/tot;const o={w,t,e:t+d,conf};t+=d;return o});
  if(va&&va.onsets.length>2){const on=va.onsets.filter(x=>x>line.t-.05&&x<line.t+sung+.1);
    for(let i=1;i<out.length;i++){let best=null,bd=.14;for(const x of on){const d=Math.abs(x-out[i].t);if(d<bd&&x>out[i-1].t+.06){bd=d;best=x}}if(best!=null){out[i-1].e=Math.min(out[i-1].e,best);out[i].t=best}}
    for(let i=0;i<out.length-1;i++)out[i].e=Math.max(out[i].t+.06,Math.min(out[i].e,out[i+1].t))}
  return out}
/* the moment a line's singing actually stops: last vocal activity before the next line (so breaks clear the screen) */
function vocalEnd(t,next,va,maxLen){if(!va)return Math.min(next,t+maxLen);let e=t+.6;for(const[a,b]of va.regions){if(b<=t)continue;if(a>=next-.05)break;e=Math.max(e,Math.min(b,next))}return Math.min(next,Math.max(t+.6,Math.min(e+.25,t+maxLen)))}

/* ---------- transcript alignment (Needleman–Wunsch over words; order keeps repeated choruses apart) ---------- */
function alignWords(lyr,heard){const n=lyr.length,m=heard.length;if(!n||!m)return[];const G=-.45;const S=new Float32Array((n+1)*(m+1)),B=new Uint8Array((n+1)*(m+1));const W=m+1;
  for(let i=1;i<=n;i++){S[i*W]=i*G;B[i*W]=1}for(let j=1;j<=m;j++){S[j]=j*G*.4;B[j]=2}// skipping heard words is cheap (ad-libs, backing vocals)
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){const s=sim(lyr[i-1].n,heard[j-1].n);const d=S[(i-1)*W+j-1]+(s>=.6?s*2:-.6),u=S[(i-1)*W+j]+G,l=S[i*W+j-1]+G*.4;if(d>=u&&d>=l){S[i*W+j]=d;B[i*W+j]=0}else if(u>=l){S[i*W+j]=u;B[i*W+j]=1}else{S[i*W+j]=l;B[i*W+j]=2}}
  const pairs=[];let i=n,j=m;while(i>0&&j>0){const b=B[i*W+j];if(b===0){if(sim(lyr[i-1].n,heard[j-1].n)>=.6)pairs.push([i-1,j-1]);i--;j--}else if(b===1)i--;else j--}return pairs.reverse()}

/**
 * lines: [{text, t?}] — t present when the source had timestamps
 * opts: {synced, words (transcript [{w,t,e}]), duration, window:[a,b] (a preview clip), onProgress}
 */
async function sync(input,buffer,opts={}){const dur=opts.duration||buffer.duration;const prog=opts.onProgress||(()=>{});
  const va=buffer?await vocalActivity(buffer).catch(()=>null):null;prog(.5,'Listening for the vocals');
  let L=input.map(l=>({text:cleanText(l.text),t:l.t,enh:parseEnhanced(l.text)})).filter(l=>l.text||l.t!=null);
  L=L.filter(l=>l.text);// instrumental markers come back from the gaps
  const notes=[];
  if(opts.synced&&L.every(l=>isFinite(l.t))){
    L.sort((a,b)=>a.t-b.t);L.forEach((l,i)=>{const next=L[i+1]?L[i+1].t:Math.min(dur,l.t+8);l.end=vocalEnd(l.t,next,va,Math.max(4,l.text.split(' ').length*.7+2));l.conf='source'})}
  else if(opts.words&&opts.words.length>=8){// speech recognition anchors
    const lyr=[];L.forEach((l,li)=>l.text.split(/\s+/).forEach((w,wi)=>lyr.push({li,wi,n:nw(w)})));const heard=opts.words.map(w=>({...w,n:nw(w.w)})).filter(w=>w.n);
    const pairs=alignWords(lyr,heard);const hitW={};for(const[a,b]of pairs){const x=lyr[a];(hitW[x.li]=hitW[x.li]||{})[x.wi]=heard[b]}
    L.forEach((l,i)=>{const h=hitW[i];const nwds=l.text.split(/\s+/).length;const k=h?Object.keys(h).length:0;l.match=k/nwds;if(h&&k){const first=Math.min(...Object.keys(h).map(Number));l.t=h[first].t-first*.25;l.heard=h}});
    // lines nobody heard are spread between their heard neighbours by syllables
    fillGaps(L,dur,va);L.forEach(l=>l.conf=l.match>=.34?'heard':'estimated');
    const est=L.filter(l=>l.conf==='estimated').length;if(est)notes.push(`${est} of ${L.length} lines weren’t clearly heard and were placed between their neighbours — check them on the timeline.`)}
  else{// no timestamps, no transcript: follow the vocal activity
    placeByVoice(L,dur,va);L.forEach(l=>l.conf='estimated');notes.push('These lyrics came without timestamps, so every line was placed from where the vocals are. Play it through and drag anything that’s off.')}
  // ends + words
  L.forEach((l,i)=>{const next=L[i+1]?L[i+1].t:dur;if(l.conf!=='source')l.end=vocalEnd(l.t,next,va,Math.max(4,l.text.split(' ').length*.7+2));
    if(l.enh){l.words=l.enh.map((w,k)=>({w:w.w,t:w.t,e:l.enh[k+1]?l.enh[k+1].t:l.end,conf:'source'}))}
    else if(l.heard){const ws=l.text.split(/\s+/);const base=placeWords(l,va,'estimated');l.words=ws.map((w,k)=>l.heard[k]?{w,t:l.heard[k].t,e:l.heard[k].e,conf:'heard'}:base[k]);for(let k=1;k<l.words.length;k++)if(l.words[k].t<l.words[k-1].t)l.words[k].t=l.words[k-1].t+.05}
    else l.words=placeWords(l,va,'estimated');delete l.enh;delete l.heard});
  if(opts.window){const[a,b]=opts.window;L=L.filter(l=>l.end>a&&l.t<b)}
  prog(1,'Done');return{lines:L,va:va?{regions:va.regions}:null,notes,instrumentals:instrumentals(L,dur)}}
function fillGaps(L,dur,va){const idx=L.map((l,i)=>isFinite(l.t)?i:-1).filter(i=>i>=0);
  // keep anchors monotonic
  let last=-1;for(const i of idx){if(L[i].t<=last){L[i].t=NaN;L[i].match=0}else last=L[i].t}
  const A=L.map((l,i)=>isFinite(l.t)?i:-1).filter(i=>i>=0);const pts=[[-1,va&&va.regions[0]?va.regions[0][0]-.3:0],...A.map(i=>[i,L[i].t]),[L.length,dur]];
  for(let k=0;k<pts.length-1;k++){const[i0,t0]=pts[k],[i1,t1]=pts[k+1];const seg=L.slice(i0+1,i1);if(!seg.length)continue;
    const start=i0<0?t0:L[i0].t+Math.max(1,L[i0].text.split(' ').length*.3);const w=seg.map(l=>l.text.split(/\s+/).reduce((a,x)=>a+syl(x),0)+2);const tot=w.reduce((a,b)=>a+b,0);let acc=0;
    seg.forEach((l,j)=>{l.t=start+(t1-start)*acc/tot;acc+=w[j]})}}
/* lines → sung phrases. Each line starts where a phrase starts and runs over one or more whole phrases; dynamic
   programming picks the split whose phrase lengths best match each line's syllable count. When there are more lines
   than phrases, long phrases are shared out by syllables instead. */
function placeByVoice(L,dur,va){const R=va&&va.regions.length?va.regions.filter(r=>r[1]-r[0]>.25):[];const n=L.length,m=R.length;
  const sy=L.map(l=>l.text.split(/\s+/).reduce((a,x)=>a+syl(x),0));
  if(m>=n&&n>0){const vocal=R.reduce((a,r)=>a+r[1]-r[0],0);const per=vocal/sy.reduce((a,b)=>a+b,0);
    const span=(j,k)=>{let d=0;for(let q=j;q<k;q++)d+=R[q][1]-R[q][0];return d};
    const INF=1e18;const D=[...Array(n+1)].map(()=>new Float64Array(m+1).fill(INF)),P=[...Array(n+1)].map(()=>new Int32Array(m+1));D[0][0]=0;
    for(let i=1;i<=n;i++)for(let k=i;k<=m-(n-i);k++)for(let j=i-1;j<k;j++){if(D[i-1][j]>=INF)continue;const exp=sy[i-1]*per,got=span(j,k);const c=D[i-1][j]+Math.pow(Math.log((got+.3)/(exp+.3)),2)+(k-j-1)*.15;if(c<D[i][k]){D[i][k]=c;P[i][k]=j}}
    // the last line may leave trailing phrases unused (ad-libs, outro)
    let bk=m,bc=INF;for(let k=n;k<=m;k++){const c=D[n][k]+(m-k)*.6;if(c<bc){bc=c;bk=k}}
    const starts=[];let k=bk;for(let i=n;i>0;i--){const j=P[i][k];starts[i-1]=j;k=j}L.forEach((l,i)=>{l.t=R[starts[i]][0]});return}
  const RR=R.length?R:[[Math.min(10,dur*.06),dur*.95]];const total=RR.reduce((a,r)=>a+r[1]-r[0],0);const w=sy.map(x=>x+1.5);const tot=w.reduce((a,b)=>a+b,0);let acc=0;
  const toTime=v=>{let r=v*total;for(const[a,b]of RR){if(r<=b-a)return a+r;r-=b-a}return RR[RR.length-1][1]};
  L.forEach((l,i)=>{let t=toTime(acc/tot);for(const[a,b]of RR)if(t>=a&&t<=b&&t-a<1.2){t=a;break}l.t=t;acc+=w[i]});
  for(let i=1;i<L.length;i++)if(L[i].t<=L[i-1].t+.4)L[i].t=L[i-1].t+.4}
/** gaps of 4 s or more between sung lines, plus the intro and outro */
function instrumentals(L,dur){const out=[];if(!L.length)return[{t:0,end:dur,kind:'whole'}];if(L[0].t>4)out.push({t:0,end:L[0].t,kind:'intro'});
  for(let i=0;i<L.length-1;i++){const g=L[i+1].t-L[i].end;if(g>=4)out.push({t:L[i].end,end:L[i+1].t,kind:'break'})}const last=L[L.length-1];if(dur-last.end>4)out.push({t:last.end,end:dur,kind:'outro'});return out}
/** after a manual edit: keep order, re-place that line's words, refresh breaks */
function retime(S,i,t,end,dur){const L=S.lines;const l=L[i];const prevEnd=i?L[i-1].t+.15:0,nextT=L[i+1]?L[i+1].t-.05:dur;l.t=Math.max(prevEnd,Math.min(t,nextT-.2));l.end=Math.max(l.t+.25,Math.min(end,L[i+1]?L[i+1].t:dur));
  if(i&&L[i-1].end>l.t)L[i-1].end=l.t;l.conf='manual';l.words=placeWords(l,null,'estimated');S.instrumentals=instrumentals(L,dur);return S}
/** repeated lines (choruses) — the renderer and the timeline label them */
function structure(L){const c={};L.forEach(l=>{const k=nw(l.text.replace(/\s+/g,''));c[k]=(c[k]||0)+1});return L.map(l=>c[nw(l.text.replace(/\s+/g,''))]>1)}

window.SLSync={analyse,sync,retime,instrumentals,structure,placeWords,at,band,beatInfo,sectionAt,vocalActivity,alignWords,parseEnhanced};
})();
;(window.__snParts=window.__snParts||{})["lib/lsync.js"]="662870336b97";
