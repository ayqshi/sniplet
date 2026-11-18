/* sniplit avatars — every listener gets a little character made of simple 2D shapes, decided by their id.
   Bodies, eyes, mouths, ears, horns, antennae, leaves, halos and patterns combine into creatures, robots,
   spirits, critters and blobs. The flat drawing then gets depth: a cast shadow, light from the top-left,
   a rim of light, soft bloom, grain and a vignette, so it sits in sniplit's dark, quiet theme. */
(function(){
const cache=new Map();
function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296}}
function hash(str){let h=2166136261;for(const c of String(str)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
const hsl=(h,s,l,a=1)=>`hsla(${h},${s}%,${l}%,${a})`;
const pick=(r,a)=>a[Math.floor(r()*a.length)];

/* ---- shape helpers (all in a 100×100 space) ---- */
function blob(x,r,cx,cy,rad,wob,n=7){x.beginPath();const pts=[...Array(n)].map((_,i)=>{const a=i/n*Math.PI*2;const rr=rad*(1+(r()-.5)*wob);return[cx+Math.cos(a)*rr,cy+Math.sin(a)*rr]});
  for(let i=0;i<n;i++){const p=pts[i],q=pts[(i+1)%n];const mx=(p[0]+q[0])/2,my=(p[1]+q[1])/2;if(i===0)x.moveTo(mx,my);else x.quadraticCurveTo(p[0],p[1],mx,my)}const p0=pts[0],q0=pts[1];x.quadraticCurveTo(p0[0],p0[1],(p0[0]+q0[0])/2,(p0[1]+q0[1])/2);x.closePath()}
function rr(x,X,Y,W,H,R){x.beginPath();x.moveTo(X+R,Y);x.arcTo(X+W,Y,X+W,Y+H,R);x.arcTo(X+W,Y+H,X,Y+H,R);x.arcTo(X,Y+H,X,Y,R);x.arcTo(X,Y,X+W,Y,R);x.closePath()}
function poly(x,cx,cy,rad,n,rot=0){x.beginPath();for(let i=0;i<n;i++){const a=rot+i/n*Math.PI*2-Math.PI/2;const px=cx+Math.cos(a)*rad,py=cy+Math.sin(a)*rad;i?x.lineTo(px,py):x.moveTo(px,py)}x.closePath()}

const BODIES=['blob','round','tall','square','ghost','hex','bean','tri'];
const KINDS=['critter','robot','spirit','monster','sprout','alien','bird','cat'];

function body(x,r,kind,shape,col){x.fillStyle=col;
  switch(shape){
    case'round':x.beginPath();x.arc(50,56,27,0,7);break;
    case'tall':rr(x,28,26,44,56,20);break;
    case'square':rr(x,25,30,50,48,kind==='robot'?7:14);break;
    case'ghost':x.beginPath();x.moveTo(25,82);x.lineTo(25,52);x.arc(50,52,25,Math.PI,0);x.lineTo(75,82);for(let i=0;i<4;i++){x.quadraticCurveTo(75-i*12.5-3,76,75-(i+.5)*12.5,82);x.quadraticCurveTo(75-(i+1)*12.5+3,88,75-(i+1)*12.5,82)}x.closePath();break;
    case'hex':poly(x,50,56,29,6,Math.PI/6);break;
    case'bean':x.beginPath();x.ellipse(50,57,24,29,(r()-.5)*.4,0,7);break;
    case'tri':x.beginPath();x.moveTo(50,24);x.quadraticCurveTo(84,80,78,82);x.lineTo(22,82);x.quadraticCurveTo(16,80,50,24);x.closePath();break;
    default:blob(x,r,50,56,27,.32,7)}
  x.fill()}

function extras(x,r,kind,col,dark,accent){const k=kind;x.save();
  if(k==='cat'||k==='critter'&&r()<.6){x.fillStyle=col;for(const s of[-1,1]){x.beginPath();x.moveTo(50+s*12,34);x.lineTo(50+s*24,14+r()*6);x.lineTo(50+s*27,38);x.closePath();x.fill();x.fillStyle=dark;x.beginPath();x.moveTo(50+s*16,32);x.lineTo(50+s*23,20);x.lineTo(50+s*24,34);x.closePath();x.fill();x.fillStyle=col}}
  else if(k==='monster'){x.fillStyle=hsl(40,25,88);for(const s of[-1,1]){x.beginPath();x.moveTo(50+s*14,32);x.quadraticCurveTo(50+s*30,22,50+s*27,8);x.quadraticCurveTo(50+s*22,24,50+s*8,30);x.closePath();x.fill()}}
  else if(k==='robot'||k==='alien'){x.strokeStyle=dark;x.lineWidth=2.5;const n=k==='alien'?2:1;for(let i=0;i<n;i++){const ox=n===1?50:50+(i?11:-11);x.beginPath();x.moveTo(ox,32);x.lineTo(ox+(n===1?0:(i?6:-6)),15);x.stroke();x.fillStyle=accent;x.beginPath();x.arc(ox+(n===1?0:(i?6:-6)),14,4,0,7);x.fill()}}
  else if(k==='sprout'){x.fillStyle=hsl(130,35,48);x.strokeStyle=hsl(130,30,30);x.lineWidth=2;x.beginPath();x.moveTo(50,32);x.lineTo(50,20);x.stroke();for(const s of[-1,1]){x.beginPath();x.ellipse(50+s*8,17,9,4.5,s*-.5,0,7);x.fill()}}
  else if(k==='spirit'){x.strokeStyle=hsl(48,80,75,.9);x.lineWidth=2.5;x.beginPath();x.ellipse(50,18,15,4.5,0,0,7);x.stroke()}
  else if(k==='bird'){x.fillStyle=accent;x.beginPath();x.moveTo(44,30);x.quadraticCurveTo(50,10,56,30);x.closePath();x.fill();x.beginPath();x.moveTo(50,27);x.quadraticCurveTo(62,14,60,30);x.closePath();x.fill()}
  x.restore()}

function pattern(x,r,col){const t=Math.floor(r()*4);x.save();x.clip();x.fillStyle=col;
  if(t===0)for(let i=0;i<6;i++){x.beginPath();x.arc(28+r()*44,40+r()*42,2+r()*4,0,7);x.fill()}
  else if(t===1){x.globalAlpha=.6;for(let i=0;i<4;i++){x.fillRect(20,52+i*9,60,3.5)}}
  else if(t===2){x.beginPath();x.ellipse(50,70,15,11,0,0,7);x.fill()}
  x.restore()}

function face(x,r,kind,eyeCol,mouthCol,accent){const style=kind==='robot'?pick(r,['visor','square','dots']):pick(r,['round','round','sleepy','single','triple','big','happy']);const ey=50+(r()-.5)*6,sp=9+r()*4;
  const eye=(cx,cy,R)=>{x.fillStyle='#fff';x.beginPath();x.arc(cx,cy,R,0,7);x.fill();x.fillStyle=eyeCol;x.beginPath();x.arc(cx+R*.18,cy+R*.12,R*.55,0,7);x.fill();x.fillStyle='rgba(255,255,255,.95)';x.beginPath();x.arc(cx-R*.12,cy-R*.25,R*.22,0,7);x.fill()};
  if(style==='visor'){x.fillStyle=hsl(200,30,10);rr(x,32,ey-7,36,13,6);x.fill();x.fillStyle=accent;x.shadowColor=accent;x.shadowBlur=6;x.fillRect(38,ey-2,8,3);x.fillRect(54,ey-2,8,3);x.shadowBlur=0}
  else if(style==='square'){x.fillStyle='#fff';for(const s of[-1,1])x.fillRect(50+s*sp-5,ey-5,10,10);x.fillStyle=eyeCol;for(const s of[-1,1])x.fillRect(50+s*sp-2,ey-2,5,5)}
  else if(style==='dots'){x.fillStyle=accent;for(const s of[-1,1]){x.beginPath();x.arc(50+s*sp,ey,3.5,0,7);x.fill()}}
  else if(style==='single')eye(50,ey,9);
  else if(style==='triple'){eye(50-sp*1.1,ey+2,5);eye(50,ey-4,6);eye(50+sp*1.1,ey+2,5)}
  else if(style==='sleepy'){x.strokeStyle=eyeCol;x.lineWidth=2.6;x.lineCap='round';for(const s of[-1,1]){x.beginPath();x.arc(50+s*sp,ey-1,4.5,.15*Math.PI,.85*Math.PI);x.stroke()}}
  else if(style==='happy'){x.strokeStyle=eyeCol;x.lineWidth=2.6;x.lineCap='round';for(const s of[-1,1]){x.beginPath();x.arc(50+s*sp,ey+2,4.5,1.15*Math.PI,1.85*Math.PI);x.stroke()}}
  else{const R=style==='big'?7.5:5.5;for(const s of[-1,1])eye(50+s*sp,ey,R)}
  // cheeks
  if(kind!=='robot'&&r()<.6){x.fillStyle='rgba(255,140,150,.35)';for(const s of[-1,1]){x.beginPath();x.ellipse(50+s*(sp+7),ey+9,4.5,2.6,0,0,7);x.fill()}}
  const my=ey+13;const m=kind==='robot'?pick(r,['grill','line']):pick(r,['smile','o','fang','line','zig','grin']);x.strokeStyle=mouthCol;x.fillStyle=mouthCol;x.lineWidth=2.4;x.lineCap='round';x.lineJoin='round';
  if(m==='smile'){x.beginPath();x.arc(50,my-3,5,.2*Math.PI,.8*Math.PI);x.stroke()}
  else if(m==='o'){x.beginPath();x.ellipse(50,my,3,3.6,0,0,7);x.fill()}
  else if(m==='fang'){x.beginPath();x.arc(50,my-3,6,.15*Math.PI,.85*Math.PI);x.stroke();x.fillStyle='#fff';x.beginPath();x.moveTo(46,my+1.5);x.lineTo(47.5,my+5);x.lineTo(49,my+1.8);x.fill()}
  else if(m==='zig'){x.beginPath();x.moveTo(43,my);for(let i=1;i<=4;i++)x.lineTo(43+i*3.5,my+(i%2?2.5:0));x.stroke()}
  else if(m==='grin'){x.beginPath();x.moveTo(42,my-1);x.quadraticCurveTo(50,my+8,58,my-1);x.closePath();x.fill();x.fillStyle='#fff';x.fillRect(45,my-.5,10,2.2)}
  else if(m==='grill'){x.fillStyle=hsl(200,20,15);rr(x,40,my-3,20,7,2.5);x.fill();x.strokeStyle='rgba(255,255,255,.35)';x.lineWidth=1;for(let i=1;i<4;i++){x.beginPath();x.moveTo(40+i*5,my-3);x.lineTo(40+i*5,my+4);x.stroke()}}
  else{x.beginPath();x.moveTo(45,my);x.lineTo(55,my);x.stroke()}}

/** draw a character into a canvas of size px (square) */
function draw(seedStr,px=256){const seed=hash(seedStr);const r=rng(seed);const c=document.createElement('canvas');c.width=c.height=px;const x=c.getContext('2d');x.scale(px/100,px/100);
  const kind=pick(r,KINDS),shape=kind==='robot'?pick(r,['square','tall','hex']):kind==='spirit'?pick(r,['ghost','blob','bean']):pick(r,BODIES);
  const hue=Math.floor(r()*360);const sat=26+r()*26;const light=52+r()*14;// muted, so it sits well on the dark theme
  const col=hsl(hue,sat,light),dark=hsl(hue,sat+6,light-24),accent=hsl((hue+150+r()*60)%360,62,64),bgHue=(hue+180+r()*80)%360;
  // backdrop: deep, low-saturation, lit from the top-left
  const bg=x.createRadialGradient(30,24,4,50,50,78);bg.addColorStop(0,hsl(bgHue,14,24));bg.addColorStop(1,hsl(bgHue,18,8));x.fillStyle=bg;x.fillRect(0,0,100,100);
  x.translate(50,56);x.scale(1.16,1.16);x.translate(-50,-54);// characters fill more of the circle
  // soft light shapes behind
  x.globalAlpha=.10;x.fillStyle=hsl(bgHue,30,70);x.beginPath();x.arc(18+r()*20,20+r()*15,14+r()*10,0,7);x.fill();x.globalAlpha=1;
  // cast shadow
  x.save();x.fillStyle='rgba(0,0,0,.5)';x.filter&&(x.filter='blur(2.5px)');x.beginPath();x.ellipse(53,88,25,5,0,0,7);x.fill();x.restore();
  const rr2=rng(seed^0x9e3779b9);
  // body with shading
  x.save();x.shadowColor='rgba(0,0,0,.45)';x.shadowBlur=8;x.shadowOffsetY=3;extras(x,rng(seed^7),kind,col,dark,accent);body(x,rr2,kind,shape,col);x.restore();
  x.save();body(x,rng(seed^0x9e3779b9),kind,shape,col);x.clip();
  const sh=x.createLinearGradient(25,25,78,85);sh.addColorStop(0,'rgba(255,255,255,.28)');sh.addColorStop(.45,'rgba(255,255,255,0)');sh.addColorStop(1,'rgba(0,0,0,.38)');x.fillStyle=sh;x.fillRect(0,0,100,100);
  body(x,rng(seed^0x9e3779b9),kind,shape,col);pattern(x,r,hsl(hue,sat,light-12,.55));x.restore();
  // rim light on the lit edge
  x.save();body(x,rng(seed^0x9e3779b9),kind,shape,'transparent');x.clip();x.strokeStyle='rgba(255,255,255,.22)';x.lineWidth=3;x.translate(1.5,1.5);body(x,rng(seed^0x9e3779b9),kind,shape,'transparent');x.stroke();x.restore();
  face(x,r,kind,hsl(hue,30,12),hsl(hue,35,18),accent);
  // post: bloom, grain, vignette
  x.setTransform(1,0,0,1,0,0);
  try{const b=document.createElement('canvas');b.width=b.height=px/8;const bx=b.getContext('2d');bx.drawImage(c,0,0,b.width,b.height);x.globalCompositeOperation='screen';x.globalAlpha=.22;x.imageSmoothingQuality='high';x.drawImage(b,0,0,px,px);x.globalAlpha=1;x.globalCompositeOperation='source-over'}catch(e){}
  const img=x.getImageData(0,0,px,px),d=img.data,gr=rng(seed^0x1234);for(let i=0;i<d.length;i+=4){const n=(gr()-.5)*14;d[i]+=n;d[i+1]+=n;d[i+2]+=n}x.putImageData(img,0,0);
  const vg=x.createRadialGradient(px/2,px/2,px*.32,px/2,px/2,px*.72);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.45)');x.fillStyle=vg;x.fillRect(0,0,px,px);
  return c}
function url(seedStr,px=128){const k=seedStr+'@'+px;if(cache.has(k))return cache.get(k);let u='';try{const c=draw(seedStr,px);u=c.toDataURL('image/webp',.86);if(!u.startsWith('data:image/webp'))u=c.toDataURL('image/png')}catch(e){u=''}cache.set(k,u);return u}
window.SAvatars={draw,url,hash};
})();
;(window.__snParts=window.__snParts||{})["lib/avatars.js"]="662870336b97";
