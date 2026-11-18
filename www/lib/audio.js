/* sniplit — audio engine
   Two media elements: `raw` (never routed through Web Audio — keeps iOS background playback alive)
   and `fx` (routed through the effect graph). Effects engage only when non-neutral. */
(function(){
const EQ_FREQ=[32,64,125,250,500,1000,2000,4000,8000,16000];
const DEFAULT_FX={rate:1,pitch:0,eq:[0,0,0,0,0,0,0,0,0,0],bass:0,vocal:'normal',reverb:0,spin:false,volume:1};

const WORKLET=`
class SniplitPitch extends AudioWorkletProcessor{
  static get parameterDescriptors(){return[{name:'ratio',defaultValue:1,minValue:.25,maxValue:4}]}
  constructor(){super();this.N=8192;this.b=[new Float32Array(this.N),new Float32Array(this.N)];this.w=0;this.ph=0;this.win=2048}
  rd(c,pos){const N=this.N;pos=((pos%N)+N)%N;const i=Math.floor(pos),f=pos-i,b=this.b[c];return b[i]*(1-f)+b[(i+1)%N]*f}
  process(inp,out,p){const r=p.ratio[0],i=inp[0],o=out[0];if(!i||!i.length){return true}
    const n=i[0].length,ch=Math.min(2,o.length);
    if(Math.abs(r-1)<1e-4){for(let c=0;c<o.length;c++)o[c].set(i[c]||i[0]);return true}
    for(let k=0;k<n;k++){
      for(let c=0;c<2;c++){const s=(i[c]||i[0]);this.b[c][this.w]=s[k]}
      this.ph+=(1-r)/this.win;if(this.ph>=1)this.ph-=1;if(this.ph<0)this.ph+=1;
      const p2=(this.ph+.5)%1,d1=this.ph*this.win+2,d2=p2*this.win+2,g1=Math.sin(Math.PI*this.ph)**2,g2=Math.sin(Math.PI*p2)**2;
      for(let c=0;c<ch;c++)o[c][k]=this.rd(c,this.w-d1)*g1+this.rd(c,this.w-d2)*g2;
      this.w=(this.w+1)%this.N}
    return true}}
registerProcessor('sniplit-pitch',SniplitPitch);
/* Spectral vocal separation. Per frequency bin: how centred is it (L/R coherence + balance), how tonal is it
   (median over time vs median over frequency — drums are spread across frequency, voices are stable over time),
   and is it inside the vocal range. Karaoke removes only tonal, centred, vocal-range energy, so kick, snare, bass
   and cymbals stay. A slow loudness follower then restores the level the vocal took with it. */
class SniplitStems extends AudioWorkletProcessor{
  static get parameterDescriptors(){return[{name:'mode',defaultValue:1,minValue:0,maxValue:2},{name:'strength',defaultValue:1,minValue:0,maxValue:1},{name:'makeup',defaultValue:1,minValue:0,maxValue:1}]}
  constructor(){super();const N=this.N=2048,H=this.H=512;this.K=N/2+1;this.win=new Float32Array(N);for(let i=0;i<N;i++)this.win[i]=Math.sqrt(.5-.5*Math.cos(2*Math.PI*i/N));
    this.inL=new Float32Array(N);this.inR=new Float32Array(N);this.outL=new Float32Array(N+H);this.outR=new Float32Array(N+H);this.pos=0;this.fill=0;
    this.re=[new Float32Array(N),new Float32Array(N)];this.im=[new Float32Array(N),new Float32Array(N)];this.hist=[];for(let i=0;i<7;i++)this.hist.push(new Float32Array(this.K));this.hi=0;this.mask=new Float32Array(this.K);
    this.rev=new Uint32Array(N);const b=Math.log2(N);for(let i=0;i<N;i++){let r=0;for(let j=0;j<b;j++)r|=((i>>j)&1)<<(b-1-j);this.rev[i]=r}
    this.cs=new Float32Array(N/2);this.sn=new Float32Array(N/2);for(let i=0;i<N/2;i++){this.cs[i]=Math.cos(2*Math.PI*i/N);this.sn[i]=-Math.sin(2*Math.PI*i/N)}
    this.lvIn=1e-4;this.lvOut=1e-4;this.gain=1;this.q=new Float32Array(21);this.t7=new Float32Array(7)}
  fft(re,im,inv){const N=this.N,rv=this.rev;for(let i=0;i<N;i++){const j=rv[i];if(j>i){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
    for(let size=2;size<=N;size<<=1){const h=size>>1,st=N/size;for(let i=0;i<N;i+=size)for(let j=0,k=0;j<h;j++,k+=st){const c=this.cs[k],s=inv?-this.sn[k]:this.sn[k];const a=i+j,b=a+h;
      const tr=re[b]*c-im[b]*s,ti=re[b]*s+im[b]*c;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti}}}
  med(arr,n){for(let i=1;i<n;i++){const v=arr[i];let j=i-1;while(j>=0&&arr[j]>v){arr[j+1]=arr[j];j--}arr[j+1]=v}return arr[n>>1]}
  frame(mode,strength){const N=this.N,K=this.K,[rl,rr]=this.re,[il,ir]=this.im;
    for(let i=0;i<N;i++){const k=(this.pos+i)%N;rl[i]=this.inL[k]*this.win[i];rr[i]=this.inR[k]*this.win[i];il[i]=0;ir[i]=0}
    this.fft(rl,il,false);this.fft(rr,ir,false);
    const mag=this.hist[this.hi];this.hi=(this.hi+1)%7;const bin=sampleRate/N;
    const raw=this.raw||(this.raw=new Float32Array(K));for(let k=0;k<K;k++){const mr=(rl[k]+rr[k])*.5,mi=(il[k]+ir[k])*.5;raw[k]=Math.hypot(mr,mi)}
    for(let k=0;k<K;k++){let mx=0;const w=k>200?3:2;for(let j=k-w;j<=k+w;j++)if(j>=0&&j<K&&raw[j]>mx)mx=raw[j];mag[k]=mx}// pitch-tolerant (vibrato) magnitude
    for(let k=0;k<K;k++){const f=k*bin;
      const band=f<110?0:f<220?(f-110)/110:f<7000?1:f<11000?1-(f-7000)/4000:0;let m=0;
      if(band>0){const L2=rl[k]*rl[k]+il[k]*il[k],R2=rr[k]*rr[k]+ir[k]*ir[k];const cr=rl[k]*rr[k]+il[k]*ir[k],ci=il[k]*rr[k]-rl[k]*ir[k];
        const coh=2*Math.hypot(cr,ci)/(L2+R2+1e-12),phase=(cr)/(Math.sqrt(L2*R2)+1e-12),bal=1-Math.abs(Math.sqrt(L2)-Math.sqrt(R2))/(Math.sqrt(L2)+Math.sqrt(R2)+1e-12);
        const centre=Math.pow(Math.max(0,coh),4)*Math.pow(Math.max(0,bal),3)*Math.max(0,phase);
        for(let t=0;t<7;t++)this.t7[t]=this.hist[t][k];const H=Math.min(raw[k]*1.5,this.med(this.t7,7));let n=0;for(let j=k-10;j<=k+10;j++)if(j>=0&&j<K)this.q[n++]=raw[j];this.med(this.q,n);const P=this.q[Math.floor(n*.2)]*1.5;
        const tonal=(H*H)/(H*H+P*P+1e-12);const tw=Math.min(1,Math.max(0,(tonal-.18)/.4));m=band*centre*tw*tw*(3-2*tw)}
      const prev=this.mask[k];this.mask[k]=m>prev?prev+(m-prev)*.6:prev+(m-prev)*.25;m=Math.min(1,this.mask[k]*strength*1.15);
      const cR=(rl[k]+rr[k])*.5*m,cI=(il[k]+ir[k])*.5*m;
      if(mode===2){rl[k]=cR;il[k]=cI;rr[k]=cR;ir[k]=cI}else{rl[k]-=cR;il[k]-=cI;rr[k]-=cR;ir[k]-=cI}
      if(k>0&&k<N/2){rl[N-k]=rl[k];il[N-k]=-il[k];rr[N-k]=rr[k];ir[N-k]=-ir[k]}}
    this.fft(rl,il,true);this.fft(rr,ir,true);const H2=this.H,sc=1/N*(2*H2/N)*1;// sqrt-hann² overlap at 75% sums to 2
    const oL=this.outL,oR=this.outR;oL.copyWithin(0,H2);oR.copyWithin(0,H2);oL.fill(0,N);oR.fill(0,N);
    for(let i=0;i<N;i++){oL[i]+=rl[i]*this.win[i]*sc;oR[i]+=rr[i]*this.win[i]*sc}}
  process(inp,out,p){const i=inp[0],o=out[0];if(!i||!i.length)return true;const L=i[0],R=i[1]||i[0],n=L.length,mode=Math.round(p.mode[0]),str=p.strength[0];
    if(mode===0){o[0].set(L);if(o[1])o[1].set(R);return true}
    for(let k=0;k<n;k++){const w=(this.pos+this.fill)%this.N;this.inL[w]=L[k];this.inR[w]=R[k];this.fill++;
      if(this.fill===this.N){this.frame(mode,str);this.pos=(this.pos+this.H)%this.N;this.fill-=this.H;this.oi=0}
      const j=this.oi||0;const yl=this.outL[j]||0,yr=this.outR[j]||0;this.oi=j+1;
      // loudness makeup for karaoke: follow input vs output level over ~2 s, cap +10 dB
      if(mode===1&&p.makeup[0]>.5){const a=.99997;this.lvIn=this.lvIn*a+(L[k]*L[k]+R[k]*R[k])*(1-a);this.lvOut=this.lvOut*a+(yl*yl+yr*yr)*(1-a);const g=Math.min(3.16,Math.max(1,Math.sqrt(this.lvIn/(this.lvOut+1e-9))*.92));this.gain+=(g-this.gain)*.0002}
      else if(mode!==1)this.gain=mode===2?1.6:1;else this.gain=1;
      o[0][k]=yl*this.gain;if(o[1])o[1][k]=yr*this.gain}
    return true}}
registerProcessor('sniplit-stems',SniplitStems);`;
const workletURL=URL.createObjectURL(new Blob([WORKLET],{type:'text/javascript'}));

function impulse(ctx,sec=2.6,decay=2.4){const sr=ctx.sampleRate,n=Math.floor(sr*sec),b=ctx.createBuffer(2,n,sr);for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,decay)}return b}

/** Build an effect chain on any (online/offline) context. Returns {input, output, set(fx)} */
async function buildChain(ctx,fx,{pitchRatioOverride}={}){
  const input=ctx.createGain(),output=ctx.createGain();
  let pitch=null;
  let stems=null;try{await ctx.audioWorklet.addModule(workletURL);pitch=new AudioWorkletNode(ctx,'sniplit-pitch',{outputChannelCount:[2]});stems=new AudioWorkletNode(ctx,'sniplit-stems',{outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'})}catch(e){pitch=null}
  // vocal block
  const vIn=ctx.createGain(),vOut=ctx.createGain(),split=ctx.createChannelSplitter(2),merge=ctx.createChannelMerger(2);
  const inv=ctx.createGain();inv.gain.value=-1;
  const bassKeep=ctx.createBiquadFilter();bassKeep.type='lowpass';bassKeep.frequency.value=130;
  const vHP=ctx.createBiquadFilter();vHP.type='highpass';vHP.frequency.value=170;
  const vLP=ctx.createBiquadFilter();vLP.type='lowpass';vLP.frequency.value=7200;
  const vPk=ctx.createBiquadFilter();vPk.type='peaking';vPk.frequency.value=2500;vPk.Q.value=.8;vPk.gain.value=4;
  const midSum=ctx.createGain();midSum.gain.value=.5;const diff=ctx.createGain();diff.gain.value=1;
  // eq
  const eq=EQ_FREQ.map((f,i)=>{const b=ctx.createBiquadFilter();b.type=i===0?'lowshelf':i===9?'highshelf':'peaking';b.frequency.value=f;b.Q.value=1.1;return b});
  const bass=ctx.createBiquadFilter();bass.type='lowshelf';bass.frequency.value=95;
  const sub=ctx.createBiquadFilter();sub.type='peaking';sub.frequency.value=48;sub.Q.value=1.2;
  const pan=ctx.createStereoPanner?ctx.createStereoPanner():ctx.createGain();
  let lfo=null;
  const dry=ctx.createGain(),wet=ctx.createGain(),conv=ctx.createConvolver();conv.buffer=impulse(ctx);
  const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-3;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.002;limiter.release.value=.12;
  const vol=ctx.createGain();
  // static wiring after vocal block
  let node=vOut;for(const b of eq){node.connect(b);node=b}
  node.connect(bass);bass.connect(sub);sub.connect(pan);pan.connect(dry);pan.connect(conv);conv.connect(wet);
  dry.connect(limiter);wet.connect(limiter);limiter.connect(vol);vol.connect(output);
  // the pitch shifter only sits in the path while it is actually shifting — it is the heaviest node on a phone
  let pitchOn=null;function wirePitch(on){on=!!(on&&pitch);if(on===pitchOn)return;pitchOn=on;try{input.disconnect()}catch(e){}try{pitch&&pitch.disconnect()}catch(e){}
    if(on){input.connect(pitch);pitch.connect(vIn)}else input.connect(vIn)}
  let mode=null;
  function wireVocal(m){
    if(m===mode)return;mode=m;
    [vIn,split,inv,bassKeep,vHP,vLP,vPk,midSum,diff,merge,stems].forEach(n=>{try{n&&n.disconnect()}catch(e){}});
    if(stems&&(m==='karaoke'||m==='vocals')){stems.parameters.get('mode').value=m==='karaoke'?1:2;vIn.connect(stems);stems.connect(vOut)}
    else if(m==='karaoke'){ // L-R cancels centre-panned vocals; add back centre bass
      vIn.connect(split);split.connect(diff,0);split.connect(inv,1);inv.connect(diff);
      diff.connect(merge,0,0);diff.connect(merge,0,1);
      vIn.connect(bassKeep);bassKeep.connect(vOut);merge.connect(vOut);
    }else if(m==='vocals'){ // centre (mid) band-limited to the vocal range
      vIn.connect(split);split.connect(midSum,0);split.connect(midSum,1);
      midSum.connect(vHP);vHP.connect(vLP);vLP.connect(vPk);vPk.connect(merge,0,0);vPk.connect(merge,0,1);merge.connect(vOut);
    }else vIn.connect(vOut);
  }
  function set(f){
    const r=pitchRatioOverride?pitchRatioOverride(f):Math.pow(2,(f.pitch||0)/12);
    if(pitch)pitch.parameters.get('ratio').value=r;wirePitch(Math.abs(r-1)>.004);
    wireVocal(f.vocal||'normal');
    eq.forEach((b,i)=>b.gain.value=f.eq[i]||0);
    bass.gain.value=Math.max(-30,Math.min(40,f.bass||0));
    sub.gain.value=(f.bass||0)>0?Math.min(24,(f.bass||0)*.45):(f.bass||0)*.5;
    limiter.threshold.value=(f.bass||0)>8?-6:-1;
    wet.gain.value=f.reverb||0;dry.gain.value=1-(f.reverb||0)*.45;
    vol.gain.value=f.volume==null?1:f.volume;
    if(f.spin&&!lfo&&ctx.createStereoPanner){lfo=ctx.createOscillator();lfo.frequency.value=.12;const d=ctx.createGain();d.gain.value=.85;lfo.connect(d);d.connect(pan.pan);lfo.start()}
    if(!f.spin&&lfo){try{lfo.stop()}catch(e){}lfo=null;if(pan.pan)pan.pan.value=0}
  }
  set(fx);
  return{input,output,set,hasPitch:!!pitch,stems};
}

const corsHosts={};
async function probeCors(url){if(!url||/^blob:|^data:/.test(url))return true;let h;try{h=new URL(url,location.href).host}catch(e){return false}if(h in corsHosts)return corsHosts[h];
  const ac=new AbortController();const to=setTimeout(()=>ac.abort(),6000);try{const r=await fetch(url,{mode:'cors',signal:ac.signal});ac.abort();corsHosts[h]=r.ok||r.status===206}catch(e){corsHosts[h]=e.name==='AbortError'&&corsHosts[h]===true}clearTimeout(to);return corsHosts[h]}
/* speed alone (and speed+pitch moving together) needs no graph: the media element does it, and stays background-safe */
function isNeutral(f){const tape=f.rate!==1&&Math.abs(12*Math.log2(f.rate)-(f.pitch||0))<1.05;return(!f.pitch||tape)&&f.eq.every(v=>!v)&&!f.bass&&f.vocal==='normal'&&!f.reverb&&!f.spin}

class Engine{
  constructor(){
    window.__snEngine=this;this.raw=new Audio();this.fxEl=new Audio();this.raw2=new Audio();// raw2: the other half of a crossfade
    for(const a of[this.raw,this.fxEl,this.raw2]){a.preload='auto';a.playsInline=true;a.setAttribute('playsinline','');a.setAttribute('webkit-playsinline','');a.crossOrigin=null}
    this.fxEl.crossOrigin='anonymous';
    /* iPhone: play through the media channel (not the ringer), so the silent switch doesn't mute sniplit */
    try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch(e){}
    this.unlocked=false;const un=()=>this.unlock();for(const ev of['pointerup','touchend','keydown','click'])addEventListener(ev,un,{capture:true,passive:true});
    this.el=this.raw;this.fx=structuredClone(DEFAULT_FX);this.listeners={};this.ctx=null;this.chain=null;this.blob=null;this.blobUrl=null;this.buffer=null;this.kind='none';this.yt=null;this.forceGraph=false;
    for(const a of[this.raw,this.fxEl,this.raw2]){
      a.addEventListener('timeupdate',()=>a===this.el&&this.emit('time'));
      a.addEventListener('ended',()=>a===this.el&&this.emit('ended'));
      a.addEventListener('play',()=>{if(a===this.xfIn)return;if(a!==this.el||this.kind==='yt'){a.pause();return}this.emit('state')});
      a.addEventListener('pause',()=>a===this.el&&this.emit('state'));
      a.addEventListener('loadedmetadata',()=>a===this.el&&this.emit('meta'));
      a.addEventListener('waiting',()=>a===this.el&&this.emit('buffering',true));
      a.addEventListener('playing',()=>a===this.el&&this.emit('buffering',false));
      a.addEventListener('error',()=>a===this.el&&this.kind!=='none'&&this.emit('error',a.error));
    }
  }
  /* Phones only let audio start inside a tap. The first tap anywhere primes both media elements and the audio
     context, so later plays (after a search or a source lookup) aren't refused. */
  unlock(){
    if(this.unlocked)return;this.unlocked=true;
    const SIL='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
    for(const a of[this.raw,this.fxEl,this.raw2]){if(a.src)continue;a.src=SIL;const p=a.play();if(p&&p.then)p.then(()=>{if(a.src===SIL){a.pause();a.removeAttribute('src');a.load()}}).catch(()=>{if(a.src===SIL){a.removeAttribute('src')}})}
    try{const AC=window.AudioContext||window.webkitAudioContext;if(!this.ctx)this.ctx=new AC({latencyHint:'playback'});if(this.ctx.state!=='running')this.ctx.resume().catch(()=>{})}catch(e){}
    if(this.pendingPlay){this.pendingPlay=false;this.play()}
  }
  /** can this device fade media-element volume? (iPhone ignores element volume, so it can't) */
  get canFade(){if(this._cf!=null)return this._cf;const a=new Audio();a.volume=.5;return this._cf=Math.abs(a.volume-.5)<.01}
  /** Crossfade into the next song: it starts on the spare element at zero volume while this one fades out; then the
      two elements trade places, so nothing is routed through Web Audio and background playback is unaffected. */
  async crossfade(src,dur=4,onStart){if(this.kind!=='file'||this.el!==this.raw||!this.canFade||src.yt||src.live)return false;this.cancelFade();
    const old=this.raw,nx=this.raw2;const url=src.blob?URL.createObjectURL(src.blob):src.url;nx.src=url;nx.volume=0;nx.playbackRate=this.fx.rate;this.xfIn=nx;try{await nx.play()}catch(e){this.xfIn=null;nx.removeAttribute('src');return false}
    const oldBlobUrl=this.blobUrl;this.raw=nx;this.raw2=old;this.el=nx;this.url=url;this.blob=src.blob||null;this.blobUrl=src.blob?url:null;this.buffer=null;this.corsOK=false;this.setPreserve();
    onStart&&onStart();this.emit('meta');this.emit('state');const vol=Math.min(1,this.fx.volume==null?1:this.fx.volume);const t0=performance.now();
    await new Promise(res=>{this.fadeT=setInterval(()=>{const p=Math.min(1,(performance.now()-t0)/(dur*1000));const e=p*p*(3-2*p);old.volume=vol*(1-e);nx.volume=vol*e;
      if(p>=1){clearInterval(this.fadeT);this.fadeT=null;this.xfIn=null;old.pause();old.removeAttribute('src');old.load();old.volume=1;if(oldBlobUrl)URL.revokeObjectURL(oldBlobUrl);res()}},40);this._fadeRes=res});return true}
  cancelFade(){this.xfIn=null;if(this.fadeT){clearInterval(this.fadeT);this.fadeT=null;try{this.raw2.pause();this.raw2.removeAttribute('src');this.raw2.volume=1;this.raw.volume=Math.min(1,this.fx.volume==null?1:this.fx.volume)}catch(e){}this._fadeRes&&this._fadeRes()}}
  on(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f)}
  emit(e,d){(this.listeners[e]||[]).forEach(f=>{try{f(d)}catch(x){console.error(x)}})}
  async ensureCtx(){
    if(this.srcNode)return;
    const AC=window.AudioContext||window.webkitAudioContext;if(!this.ctx)this.ctx=new AC({latencyHint:'playback'});
    this.srcNode=this.ctx.createMediaElementSource(this.fxEl);
    this.chain=await buildChain(this.ctx,this.chainFx());
    this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=2048;this.analyser.smoothingTimeConstant=.78;
    this.srcNode.connect(this.chain.input);this.chain.output.connect(this.analyser);this.analyser.connect(this.ctx.destination);
  }
  get playing(){return this.kind==='yt'?this.yt&&this.yt.playing:!this.el.paused}
  get time(){return this.kind==='yt'?(this.yt?this.yt.time:0):this.el.currentTime||0}
  get duration(){return this.kind==='yt'?(this.yt?this.yt.duration:0):(isFinite(this.el.duration)?this.el.duration:0)}
  get buffered(){try{const b=this.el.buffered;return b.length?b.end(b.length-1):0}catch(e){return 0}}
  get fxCapable(){return!!this.blob||this.kind==='file'}
  /** src: {url, blob, yt:{...adapter}} */
  async load(src,{autoplay=true,at=0}={}){
    this.stopAll();
    this.blob=src.blob||null;this.buffer=null;this.corsOK=false;
    const v=Math.min(1,this.fx.volume==null?1:this.fx.volume);for(const a of[this.raw,this.fxEl,this.raw2]){a.volume=a===this.fxEl?1:v;a.muted=false;a.playbackRate=this.fx.rate}if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
    if(this.blobUrl){URL.revokeObjectURL(this.blobUrl);this.blobUrl=null}
    if(src.yt){this.kind='yt';this.yt=src.yt;this.emit('state');return}
    this.kind=src.live?'live':'file';
    const url=this.blob?(this.blobUrl=URL.createObjectURL(this.blob)):src.url;
    this.url=url;
    await this.route(false);
    this.el.src=url;this.el.playbackRate=this.fx.rate;this.setPreserve();
    if(at)this.el.addEventListener('loadedmetadata',()=>{try{this.el.currentTime=at}catch(e){}},{once:true});
    if(autoplay)return this.play();
  }
  /** 'Tape' mode: when the pitch change is roughly what the speed change would give anyway (slowed, nightcore),
      let the browser resample (pitch follows speed) instead of running the pitch shifter. */
  get tape(){const f=this.fx;return f.rate!==1&&Math.abs(12*Math.log2(f.rate)-(f.pitch||0))<1.05}
  setPreserve(){const a=this.el,keep=!this.tape;a.preservesPitch=a.mozPreservesPitch=a.webkitPreservesPitch=keep}
  chainFx(){return this.tape?{...this.fx,pitch:0}:this.fx}
  /* one re-route at a time: two at once could hand the same element to the audio graph twice */
  async route(keepTime=true){if(this.routing){this.rerun=true;return this.routing}this.routing=this._route(keepTime).finally(()=>{this.routing=null;if(this.rerun){this.rerun=false;this.route(keepTime)}});return this.routing}
  async _route(keepTime=true){
    const want=((!isNeutral(this.fx)||this.forceGraph)&&(this.blob||this.corsOK))?this.fxEl:this.raw;
    if(want===this.el&&this.el.src)return;
    const t=this.el.currentTime,was=!this.el.paused&&this.el.src;
    if(want===this.fxEl)await this.ensureCtx();
    const old=this.el;this.el=want;
    if(keepTime&&old.src){const n=this.el;n.src=this.url;n.playbackRate=this.fx.rate;this.setPreserve();
      // seek only once the new element knows its length, then hand over without a gap
      await new Promise(r=>{if(n.readyState>=1)return r();const done=()=>{n.removeEventListener('loadedmetadata',done);n.removeEventListener('error',done);r()};n.addEventListener('loadedmetadata',done);n.addEventListener('error',done);setTimeout(done,4000)});
      try{n.currentTime=t}catch(e){}old.pause();old.removeAttribute('src');old.load();if(was)await this.play()}
  }
  async play(){
    if(this.kind==='yt'){this.yt.play();return}
    if(this.el===this.fxEl&&this.ctx&&this.ctx.state!=='running')try{await this.ctx.resume()}catch(e){}
    try{await this.el.play();this.pendingPlay=false}catch(e){if(e&&e.name==='AbortError')return;this.pendingPlay=true;this.unlocked=false;this.emit('blocked',e)}
  }
  pause(){if(this.kind==='yt')this.yt&&this.yt.pause();else this.el.pause()}
  toggle(){this.playing?this.pause():this.play()}
  seek(t){if(this.kind==='yt')this.yt.seek(t);else{try{this.el.currentTime=Math.max(0,Math.min(t,this.duration||t))}catch(e){}}}
  stopAll(){this.cancelFade();for(const a of[this.raw,this.fxEl,this.raw2]){a.pause()}if(this.yt){this.yt.stop();this.yt=null}this.kind='none'}
  async setFx(patch){
    Object.assign(this.fx,patch);
    if(this.kind==='yt'){if(patch.rate)this.yt.rate(this.fx.rate);if(patch.volume!=null)this.yt.volume(this.fx.volume);return 'yt'}
    this.el.playbackRate=this.fx.rate;this.setPreserve();this.raw.volume=Math.min(1,this.fx.volume);
    if(!isNeutral(this.fx)&&!this.blob&&!this.corsOK){ // streams can run through the studio too, if their server allows it
      this.corsOK=this.kind==='file'&&await probeCors(this.url);if(!this.corsOK)return 'nocors'}
    await this.route(true);
    if(this.chain)this.chain.set(this.chainFx());
    if(this.el===this.fxEl&&this.ctx&&this.ctx.state!=='running'&&!this.el.paused)this.ctx.resume().catch(()=>{});
    return 'ok';
  }
  resetFx(){return this.setFx(structuredClone({...DEFAULT_FX,volume:this.fx.volume}))}
  async decode(){
    if(this.buffer)return this.buffer;if(!this.blob)return null;
    const AC=window.OfflineAudioContext||window.webkitOfflineAudioContext;const tmp=new AC(2,44100,44100);
    this.buffer=await tmp.decodeAudioData(await this.blob.arrayBuffer());return this.buffer;
  }
  /** Offline render with effects. Speed changes length; pitch preserved via worklet compensation. */
  static async render(buffer,fx,{start=0,end}={}){
    const rate=fx.rate||1,sr=buffer.sampleRate,s0=Math.floor(start*sr),s1=Math.floor((end||buffer.duration)*sr);
    const len=Math.ceil((s1-s0)/rate)+Math.floor(sr*(fx.reverb?2.5:.05));
    const ctx=new OfflineAudioContext(2,len,sr);
    const chain=await buildChain(ctx,fx,{pitchRatioOverride:f=>Math.pow(2,(f.pitch||0)/12)/rate});
    const src=ctx.createBufferSource();src.buffer=buffer;src.playbackRate.value=rate;
    src.connect(chain.input);chain.output.connect(ctx.destination);src.start(0,start,(s1-s0)/sr);
    return ctx.startRendering();
  }
  /** Encode via MediaRecorder in real time (for compressed formats). */
  static async recordCompressed(buffer,mime,onProg){
    const ctx=new AudioContext();const dest=ctx.createMediaStreamDestination();const src=ctx.createBufferSource();src.buffer=buffer;src.connect(dest);
    const rec=new MediaRecorder(dest.stream,{mimeType:mime,audioBitsPerSecond:256000});const chunks=[];
    rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
    const done=new Promise(r=>rec.onstop=r);rec.start(250);src.start();const t0=ctx.currentTime;
    const iv=setInterval(()=>onProg&&onProg(Math.min(1,(ctx.currentTime-t0)/buffer.duration)),200);
    await new Promise(r=>src.onended=r);rec.stop();await done;clearInterval(iv);ctx.close();
    return new Blob(chunks,{type:mime.split(';')[0]});
  }
  static compressedFormats(){
    if(!window.MediaRecorder)return[];
    return[['audio/webm;codecs=opus','WebM · Opus','webm'],['audio/ogg;codecs=opus','OGG · Opus','ogg'],['audio/mp4;codecs=mp4a.40.2','M4A · AAC','m4a'],['audio/mp4','MP4 audio','m4a'],['audio/webm','WebM','webm']]
      .filter(([m])=>{try{return MediaRecorder.isTypeSupported(m)}catch(e){return false}});
  }
}
Engine.DEFAULT_FX=DEFAULT_FX;Engine.EQ_FREQ=EQ_FREQ;Engine.isNeutral=isNeutral;

/* ---------- YouTube adapter (visible IFrame player; YouTube's ads play untouched) ---------- */
let ytReady=null;
function loadYT(){
  if(ytReady)return ytReady;
  ytReady=new Promise((res,rej)=>{
    if(window.YT&&window.YT.Player)return res(window.YT);
    window.onYouTubeIframeAPIReady=()=>res(window.YT);
    const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=()=>{ytReady=null;rej(new Error('YouTube unavailable'))};document.head.appendChild(s);
    setTimeout(()=>rej(new Error('YouTube timed out')),12000);
  });
  return ytReady;
}
class YTSource{
  constructor(host,videoId,{expectedDuration,onEvent,title,artist}){this.host=host;this.id=videoId;this.exp=expectedDuration||0;this.words=[...new Set(`${title||''} ${artist||''}`.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!/^(the|and|feat|with|official|video|audio|lyrics?)$/.test(w)))];this.on=onEvent||(()=>{});this.playing=false;this.ad=false;this._t=0}
  async init(autoplay=true){if(this.p&&this.p.playVideo){if(autoplay)this.play();return}if(this.initP)return this.initP.then(()=>{if(autoplay)this.play()});this.initP=this._init(autoplay);return this.initP}
  async _init(autoplay=true){
    const YT=await loadYT();const div=document.createElement('div');this.host.innerHTML='';this.host.appendChild(div);
    await new Promise(res=>{this.p=new YT.Player(div,{videoId:this.id,width:'100%',height:'100%',playerVars:{autoplay:autoplay?1:0,playsinline:1,rel:0,modestbranding:1,controls:0,disablekb:1,fs:0,iv_load_policy:3,cc_load_policy:0,...(/^https?:$/.test(location.protocol)?{origin:location.origin}:{widget_referrer:'https://ayqshi.github.io/sniplet/www/'})},
      events:{onReady:()=>{try{const E=window.__snEngine;if(E&&E.yt===this){if(E.fx.rate&&E.fx.rate!==1)this.p.setPlaybackRate(E.fx.rate);if(E.fx.volume!=null)this.p.setVolume(Math.round(Math.min(1,E.fx.volume)*100))}}catch(x){}res();this.on('ready');if(autoplay)this.watch()},onStateChange:e=>{this.state=e.data;this.playing=e.data===1;if(e.data===1&&window.__snEngine&&window.__snEngine.yt!==this){try{this.p.stopVideo()}catch(x){}this.playing=false;return}if(this.playing&&this.needTap){this.needTap=false;this.on('tapped')}if(this.playing)this.want=false;if(e.data===0)this.on('ended');this.on('state')},onError:e=>this.on('error',e.data)}})});
    this.iv=setInterval(()=>this.poll(),400);
  }
  poll(){if(!this.p||!this.p.getCurrentTime)return;
    const d=this.p.getVideoData?this.p.getVideoData():{};const dur=this.p.getDuration();
    // Ad heuristic: the player reports a different video id, or a short duration unlike the expected track.
    // ...or a title that has nothing to do with the song (ads carry their own title; uploads of the song carry its name)
    const tt=String(d.title||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g,' ');const titleOff=this.words.length>0&&tt.trim().length>0&&!this.words.some(w=>tt.includes(w));
    if(!titleOff&&tt&&!this.ad&&dur>0)this.realDur=dur;// remember the real upload's length once we've seen it
    const durOff=dur>0&&((this.realDur&&Math.abs(dur-this.realDur)>3)||(!this.realDur&&this.exp>60&&dur<Math.min(this.exp*.5,65)));
    const ad=(this.playing||this.state===3)&&((d.video_id&&d.video_id!==this.id)||(titleOff&&durOff)||(durOff&&this.realDur)||(!this.realDur&&this.exp>60&&dur>0&&dur<Math.min(this.exp*.5,65)&&this.p.getCurrentTime()<dur));
    if(ad!==this.ad){this.ad=ad;this.on('ad',ad)}
    this.on('time');}
  get adTime(){try{return this.ad?this.p.getCurrentTime():0}catch(e){return 0}}
  get adDuration(){try{return this.ad?this.p.getDuration():0}catch(e){return 0}}
  get time(){try{return this.ad?0:this.p.getCurrentTime()}catch(e){return 0}}
  get duration(){try{return this.ad?this.exp:this.p.getDuration()}catch(e){return 0}}
  /* phones block a script from starting the video until the person has tapped the player itself once */
  watch(){this.want=true;clearTimeout(this.wt);this.wt=setTimeout(()=>{if(this.want&&!this.playing&&this.state!==3&&!this.ad){this.needTap=true;this.on('needtap')}},2600)}
  play(){this.p&&this.p.playVideo&&this.p.playVideo();this.watch()}
  pause(){this.want=false;this.p&&this.p.pauseVideo&&this.p.pauseVideo()}
  seek(t){if(!this.ad)this.p&&this.p.seekTo(t,true)}
  rate(r){try{this.p.setPlaybackRate(r)}catch(e){}}
  volume(v){try{this.p.setVolume(Math.round(Math.min(1,v)*100))}catch(e){}}
  stop(){clearInterval(this.iv);try{this.p.destroy()}catch(e){}this.host.innerHTML=''}
}
/** the vocal stem of a stretch of audio, mono at 16 kHz — what speech recognition hears best */
async function vocalStem(buffer,from=0,len=30){const sr=buffer.sampleRate,n=Math.floor(Math.min(len,buffer.duration-from)*sr);if(n<sr*2)return null;
  let iso;try{const ctx=new OfflineAudioContext(2,n,sr);await ctx.audioWorklet.addModule(workletURL);const st=new AudioWorkletNode(ctx,'sniplit-stems',{outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'});st.parameters.get('mode').value=2;
    const s=ctx.createBufferSource();s.buffer=buffer;const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=110;s.connect(st);st.connect(hp);hp.connect(ctx.destination);s.start(0,from);iso=await ctx.startRendering()}catch(e){iso=null}
  const src=iso||buffer,off=iso?0:from;const out=new OfflineAudioContext(1,Math.floor(n/sr*16000),16000);const s2=out.createBufferSource();s2.buffer=src;
  const lp=out.createBiquadFilter();lp.type='lowpass';lp.frequency.value=6500;const comp=out.createDynamicsCompressor();comp.threshold.value=-30;comp.ratio.value=4;comp.attack.value=.003;comp.release.value=.15;
  s2.connect(lp);lp.connect(comp);comp.connect(out.destination);s2.start(0,off);const pcm=(await out.startRendering()).getChannelData(0);let pk=0;for(let i=0;i<pcm.length;i++)pk=Math.max(pk,Math.abs(pcm[i]));if(pk>0)for(let i=0;i<pcm.length;i++)pcm[i]*=.95/pk;return pcm}
window.SAudio={Engine,YTSource,loadYT,buildChain,vocalStem};
})();
;(window.__snParts=window.__snParts||{})["lib/audio.js"]="662870336b97";
