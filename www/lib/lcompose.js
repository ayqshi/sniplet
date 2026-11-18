/* sniplit Lyric Studio — procedural composition.
   build() turns a song (timed lyrics + analysis + artwork) and a style into a composition; render(ctx, t, comp)
   draws one frame. Everything is a pure function of time, so the live preview and the exported file are the
   same pictures, and every size is relative to the frame, so 720p and 2160p are the same layout at different detail.
   No randomness at render time: a per-song seed decides angles, layouts and glitches. */
(function(){
const L=window.SLSync;
const FONTS={
  heavy:{f:'"Arial Black","Archivo Black",Inter,"Helvetica Neue",Arial,sans-serif',w:900,label:'Heavy'},
  grotesk:{f:'Inter,"Helvetica Neue",Helvetica,Arial,sans-serif',w:800,label:'Grotesk'},
  condensed:{f:'Inter,"Helvetica Neue",Helvetica,Arial,sans-serif',w:900,sx:.78,label:'Condensed'},
  serif:{f:'"Playfair Display",Didot,"Bodoni 72","Bodoni MT",Georgia,"Times New Roman",serif',w:500,label:'Serif'},
  mono:{f:'"JetBrains Mono","SF Mono",Menlo,Consolas,"Courier New",monospace',w:600,label:'Mono'},
  rounded:{f:'"SF Pro Rounded",Nunito,"Arial Rounded MT Bold",Inter,sans-serif',w:800,label:'Rounded'}};
const STYLES={
  punch:{label:'Punch',blurb:'Two colours, heavy words, fisheye',font:'heavy',size:1,pos:'auto',intensity:.75,speed:1,bgImage:'none',scan:.55,grain:.1,glitch:.25,viz:0,fish:.7,ca:.55,glow:.55,vig:.55,colors0:{bg:'#8a0b14',fg:'#050505'}},
  kinetic:{label:'Kinetic',blurb:'Bold words that hit on the beat',fish:.3,ca:.3,glow:.3,vig:.3,font:'condensed',size:1,pos:'center',intensity:.75,speed:1,bgImage:'none',scan:0,grain:.12,glitch:0,viz:.5},
  cinematic:{label:'Cinematic',blurb:'Artwork, atmosphere, slow camera',fish:.08,ca:.15,glow:.45,vig:.45,font:'serif',size:1,pos:'lower',intensity:.45,speed:.8,bgImage:'art',scan:0,grain:.18,glitch:0,viz:.25},
  editorial:{label:'Editorial',blurb:'Quiet type, careful timing',fish:0,ca:0,glow:0,vig:0,font:'serif',size:1,pos:'center',intensity:.3,speed:.9,bgImage:'none',scan:0,grain:.05,glitch:0,viz:.15},
  analog:{label:'Analog',blurb:'CRT, tape and phosphor',fish:.4,ca:.6,glow:.6,vig:.6,font:'mono',size:1,pos:'center',intensity:.6,speed:1,bgImage:'art',scan:.7,grain:.45,glitch:.4,viz:.4}};

/* ---------- helpers ---------- */
function hash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
const rnd=(seed,k)=>{let x=(seed^Math.imul(k+1,2654435761))>>>0;x^=x<<13;x>>>=0;x^=x>>17;x^=x<<5;return((x>>>0)%100000)/100000};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease={out:x=>1-Math.pow(1-clamp(x),3),inOut:x=>{x=clamp(x);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2},back:x=>{x=clamp(x);const c=1.6;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)},expo:x=>x>=1?1:1-Math.pow(2,-10*clamp(x))};
const lerp=(a,b,x)=>a+(b-a)*x;
function hex(c){return'#'+c.map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('')}
function rgb(h){h=String(h).replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');const n=parseInt(h,16);return[(n>>16)&255,(n>>8)&255,n&255]}
const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])};
function hsl(c){let[r,g,b]=c.map(v=>v/255);const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h=0,s=0;const l=(mx+mn)/2;if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h/=6}return[h,s,l]}
function fromHsl([h,s,l]){const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return 255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))};return[f(0),f(8),f(4)]}
const mix=(a,b,x)=>a.map((v,i)=>v+(b[i]-v)*x);
const rgba=(c,a)=>`rgba(${c.map(Math.round).join(',')},${a})`;
const contrastOn=c=>lum(c)>.35?[12,12,14]:[250,250,248];
function mkCanvas(w,h){if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(Math.max(1,w|0),Math.max(1,h|0));const c=document.createElement('canvas');c.width=Math.max(1,w|0);c.height=Math.max(1,h|0);return c}

/* palette from artwork: small k-means, then roles */
function palette(img,seed){const fallback={dark:[14,14,18],vivid:[236,72,86],vivid2:[64,120,255],light:[240,236,228],mid:[90,90,100]};if(!img)return fallback;
  const c=mkCanvas(40,40),x=c.getContext('2d');try{x.drawImage(img,0,0,40,40)}catch(e){return fallback}let d;try{d=x.getImageData(0,0,40,40).data}catch(e){return fallback}
  const px=[];for(let i=0;i<d.length;i+=4)px.push([d[i],d[i+1],d[i+2]]);const K=6;let cen=[...Array(K)].map((_,k)=>px[Math.floor(rnd(seed,k)*px.length)]);let asg=new Array(px.length).fill(0);
  for(let it=0;it<8;it++){px.forEach((p,i)=>{let b=0,bd=1e9;cen.forEach((c2,k)=>{const dd=(p[0]-c2[0])**2+(p[1]-c2[1])**2+(p[2]-c2[2])**2;if(dd<bd){bd=dd;b=k}});asg[i]=b});
    cen=cen.map((c2,k)=>{const m=px.filter((_,i)=>asg[i]===k);return m.length?[0,1,2].map(j=>m.reduce((a,p)=>a+p[j],0)/m.length):c2})}
  const cl=cen.map((c2,k)=>({c:c2,w:asg.filter(a=>a===k).length/px.length,h:hsl(c2)}));
  const dark=[...cl].sort((a,b)=>a.h[2]-b.h[2])[0].c;const light=[...cl].sort((a,b)=>b.h[2]-a.h[2])[0].c;
  const viv=[...cl].sort((a,b)=>(b.h[1]*(1-Math.abs(b.h[2]-.5))*Math.sqrt(b.w+.05))-(a.h[1]*(1-Math.abs(a.h[2]-.5))*Math.sqrt(a.w+.05)));
  let vivid=viv[0].c;const vh=hsl(vivid);if(vh[1]<.25){vivid=fromHsl([rnd(seed,9),.72,.55])}else vivid=fromHsl([vh[0],Math.max(.55,vh[1]),clamp(vh[2],.42,.6)]);
  const v2c=viv.find(v=>Math.abs(v.h[0]-hsl(vivid)[0])>.12&&v.h[1]>.2);const vivid2=v2c?fromHsl([v2c.h[0],Math.max(.5,v2c.h[1]),clamp(v2c.h[2],.35,.6)]):fromHsl([(hsl(vivid)[0]+.45)%1,.65,.5]);
  return{dark:mix(dark,[8,8,10],.35),vivid,vivid2,light:mix(light,[250,248,244],.4),mid:cl.sort((a,b)=>b.w-a.w)[0].c}}

/* blur without ctx.filter (Safari): shrink, then scale back up smoothly, twice */
function softBlur(img,W,H,amount=1){const sm=Math.max(6,Math.round(26/amount));const a=mkCanvas(sm,Math.round(sm*H/W)),ax=a.getContext('2d');ax.imageSmoothingQuality='high';coverDraw(ax,img,0,0,a.width,a.height);
  const b=mkCanvas(sm*4,Math.round(sm*4*H/W)),bx=b.getContext('2d');bx.imageSmoothingQuality='high';bx.drawImage(a,0,0,b.width,b.height);const o=mkCanvas(W,H),ox=o.getContext('2d');ox.imageSmoothingQuality='high';ox.drawImage(b,0,0,W,H);return o}
function coverDraw(x,img,dx,dy,dw,dh,zoom=1,px=0,py=0){const iw=img.width,ih=img.height;const s=Math.max(dw/iw,dh/ih)*zoom;const w=iw*s,h=ih*s;x.drawImage(img,dx+(dw-w)/2+px*dw,dy+(dh-h)/2+py*dh,w,h)}
function noiseTiles(n,size,seed){const out=[];for(let k=0;k<n;k++){const c=mkCanvas(size,size),x=c.getContext('2d');const d=x.createImageData(size,size);for(let i=0;i<d.data.length;i+=4){const v=Math.floor(rnd(seed+k*977,i)*255);d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}x.putImageData(d,0,0);out.push(c)}return out}

/* ---------- text layout ---------- */
function setFont(x,F,px,weight){x.font=`${weight||F.w} ${Math.round(px)}px ${F.f}`}
function measure(x,F,word,px){return x.measureText(word).width*(F.sx||1)}
/** words → rows that fit maxW; chooses the largest size (≤ maxPx) that keeps rows ≤ maxRows */
function layout(x,F,words,maxW,maxPx,maxRows,{upper,minPx}={}){const ws=words.map(w=>upper?w.toUpperCase():w);let px=maxPx;
  for(let tries=0;tries<30;tries++){setFont(x,F,px);const sp=measure(x,F,' ',px);const rows=[];let row=[],rw=0;let fits=true;
    for(let i=0;i<ws.length;i++){const w=measure(x,F,ws[i],px);if(w>maxW){fits=false;break}if(row.length&&rw+sp+w>maxW){rows.push({items:row,w:rw});row=[];rw=0}row.push({i,w:ws[i],width:w,x:rw?rw+sp:0});rw=rw?rw+sp+w:w}
    if(row.length)rows.push({items:row,w:rw});if(fits&&rows.length<=maxRows)return{px,rows,sp};px*=.9;if(minPx&&px<minPx){px=minPx;maxRows=99}}
  setFont(x,F,px);const sp=measure(x,F,' ',px);const rows=[];let row=[],rw=0;for(let i=0;i<ws.length;i++){const w=measure(x,F,ws[i],px);if(row.length&&rw+sp+w>maxW){rows.push({items:row,w:rw});row=[];rw=0}row.push({i,w:ws[i],width:w,x:rw?rw+sp:0});rw=rw?rw+sp+w:w}if(row.length)rows.push({items:row,w:rw});return{px,rows,sp}}
function drawWord(x,F,text,X,Y,px){if(F.sx&&F.sx!==1){x.save();x.translate(X,Y);x.scale(F.sx,1);x.fillText(text,0,0);x.restore()}else x.fillText(text,X,Y)}
function strokeWord(x,F,text,X,Y){if(F.sx&&F.sx!==1){x.save();x.translate(X,Y);x.scale(F.sx,1);x.strokeText(text,0,0);x.restore()}else x.strokeText(text,X,Y)}

/* ---------- build ---------- */
function build({W,H,fps=30,style='kinetic',opts={},track={},timing,analysis,art=null,bg=null,seed}){
  const st=STYLES[style]||STYLES.kinetic;const o={...st,...opts};seed=seed??hash((track.artist||'')+'|'+(track.title||''));
  const pal=palette(art,seed);const font=FONTS[o.font]||FONTS[st.font];const s=Math.min(W,H)/1080;
  const lines=(timing&&timing.lines||[]).map((l,i)=>({...l,i,words:l.words&&l.words.length?l.words:L.placeWords(l,null,'estimated')}));
  // short gaps hold the line on screen until the next one, so nothing flashes to an empty frame mid-verse
  lines.forEach((l,i)=>{const n=lines[i+1];l.showEnd=n&&n.t-l.end<2.5?n.t:l.end});const chorus=L.structure(lines);lines.forEach((l,i)=>{l.chorus=chorus[i];const d=Math.max(.5,l.end-l.t);l.density=l.words.length/d});
  const instr=timing&&timing.instrumentals||[];
  const comp={W,H,fps,style,o,seed,pal,font,s,lines,instr,A:analysis,track,art,dur:analysis?analysis.duration:(lines.length?lines[lines.length-1].end+3:30),cache:{}};
  // colours: the person's choices win; otherwise they come from the artwork
  const C={...(st.colors0||{}),...(o.colors||{})};comp.col={bg:C.bg?rgb(C.bg):null,fg:C.fg?rgb(C.fg):null,accent:C.accent?rgb(C.accent):null};
  const imgSrc=o.bgImage==='custom'&&bg?bg:o.bgImage==='art'&&art?art:null;
  if(imgSrc){comp.bgBlur=softBlur(imgSrc,Math.round(W/2),Math.round(H/2),style==='cinematic'?1:1.6);comp.bgSharp=imgSrc}
  if(o.grain>0)comp.noise=noiseTiles(6,Math.round(256*Math.max(1,s)),seed);
  if(style==='analog'){const sc=mkCanvas(4,Math.max(3,Math.round(4*s))),sx=sc.getContext('2d');sx.fillStyle='rgba(0,0,0,.55)';sx.fillRect(0,0,4,Math.max(1,Math.round(1.6*s)));comp.scan=sc;
    if(art){const lo=mkCanvas(Math.round(W/(6*s)),Math.round(H/(6*s))),lx=lo.getContext('2d');coverDraw(lx,art,0,0,lo.width,lo.height,1.05);comp.pix=lo}}
  comp.layoutCache=new Map();return comp}

/* ---------- per-frame state ---------- */
function frameState(c,t){const A=c.A;const ls=c.lines;let li=-1;for(let i=0;i<ls.length;i++){if(ls[i].t<=t)li=i;else break}
  const line=li>=0?ls[li]:null;const active=line&&t<line.showEnd+.02;const sp=c.o.speed||1;
  const instr=c.instr.find(r=>t>=r.t&&t<r.end&&(r.end-r.t)>=4)||null;
  return{t,e:L.at(A,A?A.energy:null,t),br:L.at(A,A?A.bright:null,t),beat:L.beatInfo(A,t),sec:L.sectionAt(A,t),li,line,active,
    inT:line?t-line.t:0,outT:line?line.showEnd-t:0,instr,next:ls[li+1]||null,inD:.32/sp,outD:.36/sp}}

/* ---------- shared layers ---------- */
function grain(x,c,f,amt){if(!c.noise||amt<=0)return;const k=Math.floor(f.t*c.fps)%c.noise.length;x.save();x.globalAlpha=amt*.22;x.globalCompositeOperation='overlay';const pat=x.createPattern(c.noise[k],'repeat');x.fillStyle=pat;
  const off=rnd(c.seed,Math.floor(f.t*c.fps))*256;x.translate(-off,-off);x.fillRect(0,0,c.W+512,c.H+512);x.restore()}
function vignette(x,c,a=.55){const g=x.createRadialGradient(c.W/2,c.H/2,Math.min(c.W,c.H)*.25,c.W/2,c.H/2,Math.max(c.W,c.H)*.75);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${a})`);x.fillStyle=g;x.fillRect(0,0,c.W,c.H)}
/** spectrum bars from the analysis (not live audio), so export and preview match */
function bars(x,c,f,{y,h,color,n=24,mirror=false,gap=.35,round=true,amt}){const A=c.A;if(!A||amt<=0)return;const w=c.W*.84,x0=(c.W-w)/2,bw=w/n;x.fillStyle=color;
  for(let i=0;i<n;i++){const b=Math.floor(i*A.NB/n);const v=Math.pow(L.band(A,f.t,b),1.6)*(.35+.65*f.e);const bh=Math.max(c.s*3,v*h*amt);const X=x0+i*bw+bw*gap/2,BW=bw*(1-gap);
    if(round&&x.roundRect){x.beginPath();x.roundRect(X,mirror?y-bh/2:y-bh,BW,bh,BW/2);x.fill()}else x.fillRect(X,mirror?y-bh/2:y-bh,BW,bh)}}
function posY(c,block){const p=c.o.pos||'center';return p==='upper'?c.H*.2:p==='lower'?c.H*.7-block:c.H/2-block/2}
function titleCard(x,c,f,{color,sub,font=FONTS.grotesk}){const T=Math.min(3.2,c.lines.length?c.lines[0].t-.3:3.2);if(f.t>T||T<1)return;const a=ease.out(f.t/.7)*(1-ease.inOut((f.t-(T-.6))/.6));if(a<=0)return;
  x.save();x.globalAlpha=a;x.textAlign='center';x.textBaseline='alphabetic';x.fillStyle=rgba(color,1);const lay=layout(x,font,(c.track.title||'').split(/\s+/),c.W*.8,92*c.s,3);setFont(x,font,lay.px);
  const y0=c.H/2-lay.rows.length*lay.px*.55;lay.rows.forEach((r,ri)=>drawWord(x,font,r.items.map(i=>i.w).join(' '),c.W/2-(font.sx?r.w/2*(1-1/font.sx)*0:0),y0+ri*lay.px*1.05,lay.px));
  setFont(x,FONTS.grotesk,30*c.s,600);x.fillStyle=rgba(sub||color,.7);x.fillText((c.track.artist||'').toUpperCase().split('').join(String.fromCharCode(8202)),c.W/2,y0+lay.rows.length*lay.px*1.05+28*c.s);x.restore()}

/* ---------- KINETIC ---------- */
function kinetic(x,c,f){const o=c.o,P=c.pal,s=c.s,I=o.intensity;const cols=[c.col.bg||P.vivid,c.col.bg?mix(c.col.bg,[0,0,0],.55):mix(P.dark,P.vivid,.22),c.col.bg?mix(c.col.bg,[255,255,255],.25):P.vivid2];
  const li=Math.max(0,f.li);const secI=f.sec.i;const bgC=f.instr?mix(P.dark,P.vivid2,.18):cols[(li+secI)%cols.length];
  // background: line colour, with a slab of the previous colour wiping away on each new line
  x.fillStyle=rgba(bgC,1);x.fillRect(0,0,c.W,c.H);
  if(f.line&&f.inT<f.inD*1.6&&f.li>0){const prevC=cols[(li-1+secI)%cols.length];const p=ease.expo(f.inT/(f.inD*1.6));const ang=(rnd(c.seed,li)-.5)*.6;x.save();x.translate(c.W/2,c.H/2);x.rotate(ang);x.fillStyle=rgba(prevC,1);x.fillRect(-c.W,-c.H*1.2+p*c.H*2.4,c.W*2,c.H*2.4*(1-p));x.restore()}
  // beat bands
  const pulse=f.beat.pulse*I*(.4+.6*f.e);if(pulse>.02){x.save();x.globalAlpha=pulse*.18;x.fillStyle=rgba(contrastOn(bgC),1);const k=f.beat.i%4;const bh=c.H*.06;x.fillRect(0,(k*.23+.08)*c.H,c.W,bh);x.restore()}
  const fg=c.col.fg||contrastOn(bgC);const hi=c.col.accent||(lum(bgC)>.35?P.dark:(lum(P.light)>.6?P.light:[255,255,255]));
  if(o.viz>0)bars(x,c,f,{y:c.H*.94,h:c.H*.12,color:rgba(fg,.22),n:32,amt:o.viz,gap:.45});
  if(f.instr&&f.instr.end-f.instr.t>=4){kineticInterlude(x,c,f,bgC,fg);return}
  titleCard(x,c,f,{color:fg,font:c.font});
  if(!f.line||!f.active)return;const l=f.line;
  const key='k'+l.i;let lay=c.layoutCache.get(key);const F=c.font;
  if(!lay){const dens=l.density;const maxRows=dens>3.2?5:dens>2?4:3;lay=layout(x,F,l.words.map(w=>w.w),c.W*.82,(dens>3?150:dens>2?190:240)*s*(o.size||1),maxRows,{upper:true,minPx:70*s});c.layoutCache.set(key,lay)}
  const lineH=lay.px*1.0;const block=lay.rows.length*lineH;const y0=posY(c,block)+lineH*.82;const ang=(rnd(c.seed,l.i*7)-.5)*.12*I;const align='center';
  const out=f.outT<f.outD?ease.inOut(1-f.outT/f.outD):0;
  x.save();x.translate(c.W/2,y0+block/2);x.rotate(ang);x.translate(-c.W/2,-(y0+block/2));
  // the whole block leans with the beat
  const kick=f.beat.pulse*I*f.e*8*s;x.translate(0,-kick);
  setFont(x,F,lay.px);x.textBaseline='alphabetic';
  lay.rows.forEach((r,ri)=>{const rx=align==='left'?c.W*.09:(c.W-r.w)/2;r.items.forEach(it=>{const w=l.words[it.i];const wt=f.t-w.t;if(wt<-.02)return;
      const a=ease.out(wt/.08)*(1-out);const sc=lerp(1+.45*I,1,ease.back(wt/(.22/(o.speed||1))));const cur=f.t>=w.t&&f.t<w.e+.05;
      const X=rx+it.x,Y=y0+ri*lineH-out*c.H*.08;x.save();x.globalAlpha=a;x.translate(X+it.width/2,Y-lay.px*.35);x.scale(sc,sc);x.translate(-(X+it.width/2),-(Y-lay.px*.35));
      if(cur&&I>.2){x.fillStyle=rgba(hi,1);const pad=lay.px*.06;x.fillRect(X-pad,Y-lay.px*.78,it.width+pad*2,lay.px*.92)}
      x.fillStyle=rgba(cur&&I>.2?bgC:fg,1);drawWord(x,F,it.w,X,Y,lay.px);x.restore()})});
  x.restore();grain(x,c,f,o.grain)}
function kineticInterlude(x,c,f,bgC,fg){const s=c.s,o=c.o;const p=(f.t-f.instr.t)/(f.instr.end-f.instr.t);const F=c.font;const txt=(c.track.title||'').toUpperCase();
  bars(x,c,f,{y:c.H*.5,h:c.H*.3,color:rgba(fg,.18),n:40,mirror:true,amt:Math.max(.4,o.viz)});
  setFont(x,F,260*s);x.textBaseline='middle';x.lineWidth=3*s;x.strokeStyle=rgba(fg,.55);
  for(let r=0;r<6;r++){const y=c.H*(.12+r*.16);const dir=r%2?1:-1;const w=measure(x,F,txt+'  ',260*s)||c.W;const off=((f.t*120*s*(o.speed||1)*dir)%w+w)%w;
    for(let k=-1;k<3;k++){const X=-off+k*w;if(r===2||r===3){x.fillStyle=rgba(fg,.92-f.beat.pulse*.3);drawWord(x,F,txt,X,y,260*s)}else strokeWord(x,F,txt,X,y)}}
  grain(x,c,f,o.grain);
  if(p<.1||p>.9){x.fillStyle=rgba(bgC,p<.1?1-p/.1:(p-.9)/.1);x.fillRect(0,0,c.W,c.H)}}

/* ---------- CINEMATIC ---------- */
function cinematic(x,c,f){const o=c.o,P=c.pal,s=c.s,I=o.intensity;const base=c.col.bg||P.dark;x.fillStyle=rgba(base,1);x.fillRect(0,0,c.W,c.H);
  const sec=f.sec;const z=1.08+.12*ease.inOut(sec.p)+.02*f.beat.pulse*I*f.e;const px=(rnd(c.seed,sec.i)-.5)*.06*ease.inOut(sec.p),py=(rnd(c.seed,sec.i+5)-.5)*.05*ease.inOut(sec.p);
  if(c.bgBlur){x.save();x.globalAlpha=.85;coverDraw(x,c.bgBlur,0,0,c.W,c.H,z,px,py);x.restore()}
  else{// no picture: two slow pools of light in the song's colours
    for(const[k,col]of[[0,c.col.accent||P.vivid],[1,P.vivid2]]){const cx0=c.W*(.3+.4*rnd(c.seed,k+11))+Math.sin(f.t*.07+k*2)*c.W*.18,cy0=c.H*(.3+.4*rnd(c.seed,k+13))+Math.cos(f.t*.05+k)*c.H*.12;const r=c.W*(.9+.25*f.e);
      const g=x.createRadialGradient(cx0,cy0,0,cx0,cy0,r);g.addColorStop(0,rgba(col,.42+.12*f.e));g.addColorStop(1,rgba(col,0));x.fillStyle=g;x.fillRect(0,0,c.W,c.H)}}
  // light leak on section changes, stronger when the energy jumps
  const sinceSec=f.t-sec.s.t;if(sec.i>0&&sinceSec<1.6){const prev=c.A.sections[sec.i-1];const jump=clamp(Math.abs(sec.s.energy-prev.energy)*3+.3);const a=Math.sin(Math.PI*clamp(sinceSec/1.6))*.5*jump*I;
    const g=x.createLinearGradient(0,0,c.W,c.H*.6);g.addColorStop(0,rgba(P.light,0));g.addColorStop(.5,rgba(mix(P.vivid,[255,240,220],.5),a));g.addColorStop(1,rgba(P.light,0));x.fillStyle=g;x.fillRect(0,0,c.W,c.H)}
  // dust drifting up, faster with the energy
  x.save();x.fillStyle='rgba(255,255,255,.8)';for(let k=0;k<46;k++){const r=rnd(c.seed,k+300);const sp=.02+.05*rnd(c.seed,k+400);const yy=((r*c.H-f.t*sp*c.H*(.6+f.e))%c.H+c.H)%c.H;const xx=(rnd(c.seed,k+500)*c.W+Math.sin(f.t*.3+k)*20*s);
    x.globalAlpha=(.15+.35*rnd(c.seed,k+600))*(.5+f.e*.5);x.beginPath();x.arc(xx,yy,(1+2.5*rnd(c.seed,k+700))*s,0,7);x.fill()}x.restore();
  // the artwork itself, large in the intro and breaks, a small card while lyrics run
  const instrA=f.instr?ease.inOut(Math.min((f.t-f.instr.t)/1.2,(f.instr.end-f.t)/1.2)):0;const lyricA=1-instrA;
  if(c.art&&o.bgImage!=='none'){const big=c.W*.66,small=c.W*.3;const size=lerp(small,big,instrA)*(1+.015*f.beat.pulse*I);const cy=lerp(c.H*.24,c.H*.42,instrA);
    x.save();x.shadowColor='rgba(0,0,0,.55)';x.shadowBlur=60*s;x.shadowOffsetY=24*s;const X=c.W/2-size/2,Y=cy-size/2;x.beginPath();x.roundRect?x.roundRect(X,Y,size,size,14*s):x.rect(X,Y,size,size);x.fillStyle='#000';x.fill();x.shadowColor='transparent';x.clip();
    x.drawImage(c.art,X,Y,size,size);x.restore();
    if(instrA>.05){x.save();x.globalAlpha=instrA;x.textAlign='center';x.fillStyle='#fff';setFont(x,c.font,56*s);x.fillText(c.track.title||'',c.W/2,cy+size/2+90*s);setFont(x,FONTS.grotesk,28*s,500);x.fillStyle='rgba(255,255,255,.65)';x.fillText(c.track.artist||'',c.W/2,cy+size/2+136*s);x.restore()}}
  if(o.viz>0)bars(x,c,f,{y:c.H*.9,h:c.H*.05,color:'rgba(255,255,255,.28)',n:48,mirror:true,amt:o.viz,gap:.55});
  vignette(x,c,.62);
  // letterbox
  const lb=c.H*.045;x.fillStyle='#000';x.fillRect(0,0,c.W,lb);x.fillRect(0,c.H-lb,c.W,lb);
  if(!c.art||o.bgImage==='none')titleCard(x,c,f,{color:[255,255,255],font:c.font});
  if(f.line&&f.active&&lyricA>.02){const l=f.line;const F=c.font;const key='c'+l.i;let lay=c.layoutCache.get(key);if(!lay){lay=layout(x,F,l.words.map(w=>w.w),c.W*.8,(l.density>2.6?76:98)*s*(o.size||1),4,{minPx:44*s});c.layoutCache.set(key,lay)}
    const lineH=lay.px*1.28;const block=lay.rows.length*lineH;const y0=(o.pos==='upper'?c.H*.52:o.pos==='center'?c.H*.62:c.H*.7)-block/2+lineH*.8;
    const out=f.outT<f.outD*1.4?ease.inOut(1-f.outT/(f.outD*1.4)):0;const tint=c.col.fg||[255,255,255];
    setFont(x,F,lay.px);x.textBaseline='alphabetic';x.save();x.shadowColor='rgba(0,0,0,.6)';x.shadowBlur=24*s;
    lay.rows.forEach((r,ri)=>{const rx=(c.W-r.w)/2;r.items.forEach(it=>{const w=l.words[it.i];const wt=f.t-w.t+.12;const a=ease.out(wt/(.5/(o.speed||1)))*(1-out)*lyricA;if(a<=0)return;
      const sung=f.t>=w.t;x.globalAlpha=a*(sung?1:.55);x.fillStyle=rgba(sung?tint:mix(tint,[150,150,150],.4),1);const dy=(1-ease.out(wt/.6))*14*s-out*20*s;drawWord(x,F,it.w,rx+it.x,y0+ri*lineH+dy,lay.px)})});x.restore()}
  grain(x,c,f,o.grain)}

/* ---------- EDITORIAL ---------- */
function editorial(x,c,f){const o=c.o,P=c.pal,s=c.s;const paper=c.col.bg||mix(P.light,[247,244,238],.6);const ink=c.col.fg||(lum(paper)>.4?[20,20,22]:[240,238,232]);const acc=c.col.accent||P.vivid;
  x.fillStyle=rgba(paper,1);x.fillRect(0,0,c.W,c.H);const m=c.W*.08;
  if(c.bgSharp&&o.bgImage!=='none'){x.save();x.globalAlpha=.08;coverDraw(x,c.bgBlur||c.bgSharp,0,0,c.W,c.H,1.05);x.restore()}
  // running header and rules
  x.fillStyle=rgba(ink,1);x.textBaseline='alphabetic';setFont(x,FONTS.grotesk,22*s,700);x.textAlign='left';x.fillText((c.track.artist||'').toUpperCase(),m,m+10*s);x.textAlign='right';
  const mm=Math.floor(f.t/60),ss=Math.floor(f.t%60);x.fillText(`${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`,c.W-m,m+10*s);x.textAlign='left';
  x.fillRect(m,m+28*s,c.W-2*m,1.5*s);const prog=clamp(f.t/c.dur);x.fillStyle=rgba(acc,1);x.fillRect(m,c.H-m,(c.W-2*m)*prog,3*s);x.fillStyle=rgba(ink,.25);x.fillRect(m+(c.W-2*m)*prog,c.H-m,(c.W-2*m)*(1-prog),1*s);
  setFont(x,FONTS.serif,26*s,400);x.fillStyle=rgba(ink,.7);x.fillText(c.track.title||'',m,c.H-m-22*s);
  if(c.art){const sz=96*s;x.drawImage(c.art,c.W-m-sz,c.H-m-22*s-sz-14*s,sz,sz)}
  // section label
  const lbl=f.instr?(f.instr.kind==='intro'?'Intro':f.instr.kind==='outro'?'Outro':'Interlude'):f.line&&f.line.chorus?'Chorus':f.line?'Verse':'';
  setFont(x,FONTS.grotesk,20*s,700);x.fillStyle=rgba(acc,1);x.fillText(lbl.toUpperCase().split('').join(' '),m,m+80*s);
  if(o.viz>0){const A=c.A;if(A){x.fillStyle=rgba(ink,.5);const n=60;for(let i=0;i<n;i++){const v=L.band(A,f.t-(n-i)*.05,6)*f.e;x.fillRect(m+i*(c.W-2*m)/n,m+100*s,1.2*s,-v*40*s*o.viz)}}}
  if(f.instr){const p=(f.t-f.instr.t)/(f.instr.end-f.instr.t);setFont(x,FONTS.serif,120*s,400);x.fillStyle=rgba(ink,.12+.1*Math.sin(p*Math.PI));x.textAlign='center';x.fillText('—',c.W/2,c.H/2);x.textAlign='left';grain(x,c,f,o.grain);return}
  titleCard(x,c,f,{color:ink,sub:acc,font:FONTS.serif});
  if(!f.line)return;const F=c.font;
  // the last three lines stay above in small type, like a column you are reading down
  const hist=c.lines.slice(Math.max(0,f.li-3),f.li);setFont(x,F,34*s);let hy=c.H*.36;x.fillStyle=rgba(ink,.32);
  for(let k=hist.length-1;k>=0;k--){const hl=hist[k];const lay=layout(x,F,hl.text.split(/\s+/),c.W-2*m,34*s,2);setFont(x,F,lay.px);for(let r=lay.rows.length-1;r>=0;r--){x.fillText(lay.rows[r].items.map(i=>i.w).join(' '),m,hy);hy-=lay.px*1.3}hy-=12*s;x.globalAlpha=Math.max(.2,x.globalAlpha-.25)}
  x.globalAlpha=1;if(!f.active)return;const l=f.line;const key='e'+l.i;let lay=c.layoutCache.get(key);if(!lay){lay=layout(x,F,l.words.map(w=>w.w),c.W-2*m,(l.density>2.6?84:104)*s*(o.size||1),5,{minPx:48*s});c.layoutCache.set(key,lay)}
  const lineH=lay.px*1.14;const y0=(o.pos==='upper'?c.H*.4:o.pos==='lower'?c.H*.58:c.H*.46)+lay.px;setFont(x,F,lay.px);
  lay.rows.forEach((r,ri)=>{const Y=y0+ri*lineH;x.save();x.beginPath();x.rect(0,Y-lay.px,c.W,lay.px*1.28);x.clip();
    r.items.forEach(it=>{const w=l.words[it.i];const wt=f.t-w.t;const p=ease.expo(wt/(.45/(o.speed||1)));if(p<=0)return;const out=f.outT<f.outD?ease.inOut(1-f.outT/f.outD):0;
      x.fillStyle=rgba(ink,1);x.globalAlpha=1-out;drawWord(x,F,it.w,m+it.x,Y+(1-p)*lay.px*1.1-out*lay.px*.4,lay.px)});x.restore()});
  grain(x,c,f,o.grain)}

/* ---------- ANALOG ---------- */
function analog(x,c,f){const o=c.o,P=c.pal,s=c.s,I=o.intensity;const ph=c.col.fg||(c.col.accent)||(hsl(P.vivid)[0]>.12&&hsl(P.vivid)[0]<.5?[120,255,160]:[255,186,64]);
  const base=c.col.bg||[6,8,7];x.fillStyle=rgba(base,1);x.fillRect(0,0,c.W,c.H);const fi=Math.floor(f.t*c.fps);
  {const g=x.createRadialGradient(c.W/2,c.H*.48,0,c.W/2,c.H*.48,c.H*.7);g.addColorStop(0,rgba(ph,.13+.05*f.e));g.addColorStop(1,rgba(ph,.02));x.fillStyle=g;x.fillRect(0,0,c.W,c.H)}
  // picture: low-resolution artwork, colour channels pulled apart
  if(c.pix&&o.bgImage!=='none'){x.save();x.imageSmoothingEnabled=false;const split=(3+6*f.beat.pulse*I)*s;x.globalAlpha=.42;x.globalCompositeOperation='lighter';
    for(const[k,dx]of[[0,-split],[1,0],[2,split]]){x.save();x.globalAlpha=.3;x.drawImage(c.pix,dx,0,c.W,c.H);x.globalCompositeOperation='multiply';x.fillStyle=['#f00','#0f0','#00f'][k];x.fillRect(0,0,c.W,c.H);x.restore()}
    x.restore();x.fillStyle=rgba(base,.55);x.fillRect(0,0,c.W,c.H)}
  if(o.viz>0)bars(x,c,f,{y:c.H*.86,h:c.H*.1,color:rgba(ph,.35),n:28,amt:o.viz,gap:.3,round:false});
  // on-screen display
  setFont(x,FONTS.mono,30*s,700);x.fillStyle=rgba(ph,.9);x.textBaseline='alphabetic';x.textAlign='left';const mm=Math.floor(f.t/60),ss=Math.floor(f.t%60),fr=fi%c.fps;
  x.fillText('PLAY ▶',60*s,90*s);x.textAlign='right';x.fillText(`${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}:${String(fr).padStart(2,'0')}`,c.W-60*s,90*s);x.textAlign='left';
  x.fillText('SP',60*s,c.H-70*s);if(Math.floor(f.t*1.5)%2===0){const rw=x.measureText('REC').width;x.fillStyle='rgba(255,60,60,.9)';x.beginPath();x.arc(c.W-60*s-rw-22*s,c.H-80*s,10*s,0,7);x.fill();x.fillStyle=rgba(ph,.9);x.textAlign='right';x.fillText('REC',c.W-60*s,c.H-70*s);x.textAlign='left'}
  const F=c.font;
  if(f.instr){setFont(x,F,64*s);x.textAlign='center';x.fillStyle=rgba(ph,.85);x.fillText((c.track.title||'').toUpperCase(),c.W/2,c.H/2-20*s);setFont(x,F,34*s);x.fillStyle=rgba(ph,.55);x.fillText('— '+(c.track.artist||'').toUpperCase()+' —',c.W/2,c.H/2+40*s);x.textAlign='left'}
  else titleCard(x,c,f,{color:ph,font:F});
  if(f.line&&f.active){const l=f.line;const key='a'+l.i;let lay=c.layoutCache.get(key);if(!lay){lay=layout(x,F,l.words.map(w=>w.w),c.W*.8,(l.density>2.6?60:76)*s*(o.size||1),5,{upper:true,minPx:36*s});c.layoutCache.set(key,lay)}
    const lineH=lay.px*1.3;const block=lay.rows.length*lineH;const y0=posY(c,block)+lay.px;setFont(x,F,lay.px);x.save();x.shadowColor=rgba(ph,.8);x.shadowBlur=18*s;
    const glitchOn=o.glitch>0&&rnd(c.seed,fi>>2)<o.glitch*.25*(.4+f.e);const gx=glitchOn?(rnd(c.seed,fi)-.5)*40*s*o.glitch:0;let cursor=null;
    lay.rows.forEach((r,ri)=>{const rx=(c.W-r.w)/2;r.items.forEach(it=>{const w=l.words[it.i];const dur=Math.max(.05,Math.min(w.e-w.t,.5));const p=clamp((f.t-w.t)/dur);if(p<=0)return;const n=Math.max(1,Math.ceil(it.w.length*p));const txt=it.w.toUpperCase().slice(0,n);
      const X=rx+it.x+(ri%2&&glitchOn?gx:0),Y=y0+ri*lineH;const fl=.85+.15*Math.sin(f.t*50+it.i);x.fillStyle=rgba(ph,fl);drawWord(x,F,txt,X,Y,lay.px);
      if(glitchOn&&I>.3){x.fillStyle='rgba(255,40,80,.5)';drawWord(x,F,txt,X+4*s,Y,lay.px);x.fillStyle='rgba(40,200,255,.5)';drawWord(x,F,txt,X-4*s,Y,lay.px)}
      if(p<1||f.t<w.e)cursor=[X+measure(x,F,txt,lay.px)+6*s,Y]})});
    if(cursor&&Math.floor(f.t*3)%2===0){x.fillStyle=rgba(ph,.9);x.fillRect(cursor[0],cursor[1]-lay.px*.75,lay.px*.5,lay.px*.85)}x.restore()}
  // tape: a band of displaced lines that rolls through, more often when the song pushes
  if(o.glitch>0){const roll=((f.t*.35+rnd(c.seed,f.sec.i))%1.4)-.2;const bandH=c.H*(.03+.04*o.glitch);const y=roll*c.H;if(y>-bandH&&y<c.H){const src=x.canvas;try{x.drawImage(src,0,Math.max(0,y),c.W,bandH,(rnd(c.seed,fi)-.5)*30*s*o.glitch*(.5+f.e),Math.max(0,y),c.W,bandH)}catch(e){}x.fillStyle='rgba(255,255,255,.05)';x.fillRect(0,y,c.W,bandH*.3)}}
  if(c.scan&&o.scan>0){x.save();x.globalAlpha=o.scan;x.fillStyle=x.createPattern(c.scan,'repeat');x.fillRect(0,0,c.W,c.H);x.restore()}
  x.fillStyle=`rgba(255,255,255,${.015+.02*Math.sin(f.t*60)*o.intensity})`;x.fillRect(0,0,c.W,c.H);
  grain(x,c,f,o.grain);vignette(x,c,.75)}

/* ---------- PUNCH ----------
   Two colours that trade places line by line (colour on black, black on colour), heavy capitals that land word by
   word, hard cuts between lines, a rippled scan texture on the colour field, and a little warp, smear and glow on the type. */
function punchTexture(c,col){const k='pt';if(c.cache[k])return c.cache[k];const W=c.W,H=c.H;const cv=mkCanvas(W,H),x=cv.getContext('2d');const gap=Math.max(3,H/150);x.strokeStyle='rgba(0,0,0,.42)';x.lineWidth=Math.max(1,gap*.38);
  for(let y=-gap*4;y<H+gap*4;y+=gap){x.beginPath();for(let X=0;X<=W;X+=W/40){const d=(X-W/2)/(W/2);const yy=y+d*d*(y-H/2)*.07;X?x.lineTo(X,yy):x.moveTo(X,yy)}x.stroke()}
  const g=x.createRadialGradient(W/2,H/2,Math.min(W,H)*.2,W/2,H/2,Math.max(W,H)*.75);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.42)');x.fillStyle=g;x.fillRect(0,0,W,H);return c.cache[k]=cv}
function punch(x,c,f){const o=c.o,s=c.s,I=o.intensity;const A=c.col.bg||[138,11,20],Bc=c.col.fg||[5,5,5];const li=f.li;
  const flip=f.instr?Math.floor((f.beat.i||0)/4)%2===1:(Math.max(0,li)+f.sec.i)%2===1;const bg=flip?A:Bc,fg=flip?Bc:A;
  x.fillStyle=rgba(bg,1);x.fillRect(0,0,c.W,c.H);
  if(flip&&o.scan>0){x.save();x.globalAlpha=o.scan;const tex=punchTexture(c);const dy=(f.t*6*s)%Math.max(3,c.H/150);x.drawImage(tex,0,dy-c.H/150);x.restore()}
  else if(o.scan>0){x.save();x.globalAlpha=o.scan*.25;x.drawImage(punchTexture(c),0,0);x.restore()}
  if(f.instr&&f.instr.end-f.instr.t>=4){const p=(f.t-f.instr.t)/(f.instr.end-f.instr.t);x.save();x.globalAlpha=Math.min(1,p*6,(1-p)*6);x.fillStyle=rgba(fg,1);x.textAlign='center';setFont(x,c.font,52*s);x.fillText((c.track.title||'').toUpperCase(),c.W/2,c.H/2);x.restore();grain(x,c,f,o.grain);return}
  if(!f.line||!f.active){if(f.t<(c.lines[0]?c.lines[0].t:3))titleCard(x,c,f,{color:fg,font:c.font});grain(x,c,f,o.grain);return}
  const l=f.line,F=c.font;const key='p'+l.i;let L0=c.layoutCache.get(key);
  if(!L0){const n=l.words.length;const big=n<=2?250:n<=4?190:n<=7?150:120;const fz=1-(o.fish||0)*.34;// the fisheye magnifies the middle, so the type is set narrower to stay on screen
    const lay=layout(x,F,l.words.map(w=>w.w),c.W*.8*fz,big*s*(o.size||1)*fz,n<=3?2:6,{upper:true,minPx:48*s});
    const r1=rnd(c.seed,l.i*13),r2=rnd(c.seed,l.i*17);const posMode=l.pos||(o.pos==='auto'?(r1<.4?'upper':r1<.8?'center':'lower'):o.pos);
    L0={lay,posMode,italic:r2<.35,left:false};c.layoutCache.set(key,L0)}
  const{lay}=L0;const lineH=lay.px*.98;const block=lay.rows.length*lineH;const yTop=L0.posMode==='upper'?c.H*.16:L0.posMode==='lower'?c.H*.82-block:c.H/2-block/2;
  // draw the words onto a scratch layer, then warp it onto the frame in thin strips
  const T=c.cache.ptxt||(c.cache.ptxt=mkCanvas(c.W,c.H));const tx=T.getContext('2d');tx.clearRect(0,0,c.W,c.H);setFont(tx,F,lay.px);tx.textBaseline='alphabetic';tx.fillStyle=rgba(fg,1);try{tx.letterSpacing='0px'}catch(e){}// spacing matches what layout() measured, so rows centre exactly
  // camera: a slow push through the line, a bump on every beat, a small shake when the song hits hard
  const lp=clamp((f.t-l.t)/Math.max(.4,l.showEnd-l.t));const zoom=1+.06*ease.inOut(lp)*I+.035*f.beat.pulse*I;const cy=yTop+block/2;const shake=f.e>.7?(rnd(c.seed,Math.floor(f.t*c.fps))-.5)*6*s*I*(f.e-.7)/.3:0;
  tx.save();tx.translate(c.W/2+shake,cy);tx.scale(zoom,zoom);tx.translate(-c.W/2,-cy);
  let minX=c.W,maxX=0;
  lay.rows.forEach((r,ri)=>{const rx=L0.left?c.W*.09:(c.W-r.w)/2;const Y=yTop+ri*lineH+lay.px*.82;r.items.forEach(it=>{const w=l.words[it.i];const wt=f.t-w.t;if(wt<0)return;
    // landing: the word slams in big, overshoots a touch and settles, dropping into place with a vertical smear
    const land=clamp(wt/(.2/(o.speed||1)));const pop=lerp(1+.6*I,1,ease.back(land));const dy=(1-ease.out(land))*-26*s*I;const X=rx+it.x;
    tx.save();tx.translate(X+it.width/2,Y-lay.px*.35+dy);if(L0.italic)tx.transform(1,0,-.2,1,0,0);tx.scale(pop,pop);tx.translate(-(X+it.width/2),-(Y-lay.px*.35));
    if(land<1&&I>.1){tx.globalAlpha=.28*(1-land);for(const d of[1,2,3])drawWord(tx,F,it.w,X,Y-d*9*s*I*(1-land),lay.px)}
    if(!flip&&I>.2){tx.globalAlpha=.22;tx.strokeStyle=rgba(fg,1);tx.lineWidth=2*s;strokeWord(tx,F,it.w,X+7*s,Y+7*s)}
    tx.globalAlpha=Math.min(1,wt/.04);drawWord(tx,F,it.w,X,Y,lay.px);tx.restore();minX=Math.min(minX,X-80*s);maxX=Math.max(maxX,X+it.width+80*s)})});
  tx.restore();minX=Math.max(0,minX);maxX=Math.min(c.W,maxX);
  if(maxX<=minX){grain(x,c,f,o.grain);return}
  const y0=Math.max(0,Math.floor(yTop-lay.px*1.1-block*.06)),y1=Math.min(c.H,Math.ceil(yTop+block+lay.px*.9+block*.06));const strip=Math.max(2,Math.round(2.5*s));const amp=(1.2+2.6*I*(.5+f.e*.5))*s;const ph=f.t*7;
  if(!flip){// glow under colour-on-black type
    const gc=c.cache.pglow||(c.cache.pglow=mkCanvas(Math.max(8,c.W/12),Math.max(8,c.H/12)));const gx=gc.getContext('2d');gx.clearRect(0,0,gc.width,gc.height);gx.drawImage(T,0,0,gc.width,gc.height);x.save();x.globalAlpha=.55;x.globalCompositeOperation='lighter';x.imageSmoothingQuality='high';x.drawImage(gc,0,0,c.W,c.H);x.restore()}
  const gl=o.glitch>0&&rnd(c.seed,Math.floor(f.t*c.fps/3))<o.glitch*.12*(.4+f.e);
  for(let y=y0;y<y1;y+=strip){const dx=Math.sin(y/(18*s)+ph)*amp+(gl&&rnd(c.seed,y)<.08?(rnd(c.seed,y+1)-.5)*40*s:0);x.drawImage(T,minX,y,maxX-minX,strip,minX+dx,y,maxX-minX,strip)}
  grain(x,c,f,o.grain)}
const R={punch,kinetic,cinematic,editorial,analog};
function render(x,t,c){const o=c.o;const P=window.SLPost&&SLPost.active(o)?SLPost.get(c.W,c.H):null;
  if(P){const S=c.cache.scr||(c.cache.scr=mkCanvas(c.W,c.H));const sx=S.getContext('2d');render2d(sx,t,c);const out=P.render(S,{fish:o.fish,ca:o.ca,glow:o.glow,vig:o.vig,grain:0},t);x.save();x.setTransform(1,0,0,1,0,0);x.drawImage(out,0,0,x.canvas.width,x.canvas.height);x.restore();return}
  render2d(x,t,c)}
function render2d(x,t,c){const f=frameState(c,t);x.save();x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;x.globalCompositeOperation='source-over';x.textAlign='left';x.shadowBlur=0;(R[c.style]||kinetic)(x,c,f);
  // fade from and to black only at the very start and end, never mid-song
  const edge=Math.min(t/.35,(c.dur-t)/.5);if(edge<1){x.globalAlpha=1;x.fillStyle=`rgba(0,0,0,${clamp(1-edge)*.55})`;x.fillRect(0,0,c.W,c.H)}x.restore()}

window.SLCompose={build,render,STYLES,FONTS,palette,hash};
})();
;(window.__snParts=window.__snParts||{})["lib/lcompose.js"]="662870336b97";
