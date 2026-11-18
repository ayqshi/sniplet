/* sniplit's 3D chrome play mark (the same mesh and studio lighting as the home page), as a small reusable renderer.
   SLogo3D.mount(canvas) draws one slowly turning logo and returns a stop() function. */
(function(){
function mount(cv,{scale=1}={}){const gl=cv.getContext('webgl',{antialias:true,alpha:true,premultipliedAlpha:false});if(!gl)return null;
const ext=gl.getExtension('OES_element_index_uint');
function tube(){const V=[[-.75,1.0],[-.75,-1.0],[1.05,0]],rc=.34,pts=[];
  for(let i=0;i<3;i++){const P=V[(i+2)%3],C=V[i],N=V[(i+1)%3];const d1=norm([P[0]-C[0],P[1]-C[1]]),d2=norm([N[0]-C[0],N[1]-C[1]]);const th=Math.acos(d1[0]*d2[0]+d1[1]*d2[1]);const t=rc/Math.tan(th/2);
    const bis=norm([d1[0]+d2[0],d1[1]+d2[1]]);const cen=[C[0]+bis[0]*rc/Math.sin(th/2),C[1]+bis[1]*rc/Math.sin(th/2)];const T1=[C[0]+d1[0]*t,C[1]+d1[1]*t],T2=[C[0]+d2[0]*t,C[1]+d2[1]*t];
    let a1=Math.atan2(T1[1]-cen[1],T1[0]-cen[0]),a2=Math.atan2(T2[1]-cen[1],T2[0]-cen[0]);let da=a2-a1;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;
    for(let k=0;k<=24;k++){const a=a1+da*k/24;pts.push([cen[0]+Math.cos(a)*rc,cen[1]+Math.sin(a)*rc])}}
  // resample closed path uniformly
  const L=[0];for(let i=1;i<=pts.length;i++){const a=pts[i-1],b=pts[i%pts.length];L.push(L[i-1]+Math.hypot(b[0]-a[0],b[1]-a[1]))}const tot=L[L.length-1],M=420,S=[];
  for(let k=0;k<M;k++){const s=k/M*tot;let i=1;while(L[i]<s)i++;const a=pts[i-1],b=pts[i%pts.length],f=(s-L[i-1])/(L[i]-L[i-1]||1);S.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f])}
  const R=.2,RZ=.26,SEG=48,pos=[],nrm=[],idx=[];
  for(let k=0;k<M;k++){const p=S[k],q=S[(k+1)%M],o=S[(k-1+M)%M];const tg=norm([q[0]-o[0],q[1]-o[1]]);const nx=-tg[1],ny=tg[0];
    for(let j=0;j<SEG;j++){const a=j/SEG*Math.PI*2,c=Math.cos(a),s=Math.sin(a);pos.push(p[0]+nx*R*c,p[1]+ny*R*c,RZ*s);const nn=norm3([nx*c/R,ny*c/R,s/RZ]);nrm.push(...nn)}}
  for(let k=0;k<M;k++)for(let j=0;j<SEG;j++){const a=k*SEG+j,b=((k+1)%M)*SEG+j,c=((k+1)%M)*SEG+(j+1)%SEG,d=k*SEG+(j+1)%SEG;idx.push(a,b,c,a,c,d)}
  return{pos:new Float32Array(pos),nrm:new Float32Array(nrm),idx:new Uint32Array(idx)}}
function norm(v){const l=Math.hypot(v[0],v[1])||1;return[v[0]/l,v[1]/l]}function norm3(v){const l=Math.hypot(...v)||1;return v.map(x=>x/l)}
const VS=`attribute vec3 p;attribute vec3 n;uniform mat4 P,M;varying vec3 vN,vW;void main(){vec4 w=M*vec4(p,1.);vW=w.xyz;vN=mat3(M)*n;gl_Position=P*w;}`;
const FS=`precision highp float;varying vec3 vN,vW;uniform vec3 E;uniform float L,T;
vec3 env(vec3 r){float y=r.y;vec3 c=mix(vec3(.015),vec3(.11),smoothstep(-.5,.7,y));
 c+=vec3(2.6)*smoothstep(.02,0.,abs(r.y-.06))*.5;                       // horizon line
 c+=vec3(3.)*smoothstep(.62,.7,r.y)*smoothstep(.42,.32,abs(r.x+.2+.05*sin(T*.2)));   // top softbox
 c+=vec3(2.2)*smoothstep(.16,.08,abs(r.x-.82))*smoothstep(-.15,.05,r.y)*smoothstep(.75,.5,r.y); // right strip
 c+=vec3(1.4)*smoothstep(.12,.05,abs(r.x+.86))*smoothstep(-.3,.0,r.y)*smoothstep(.6,.3,r.y);   // left strip
 c+=vec3(.9)*smoothstep(.06,0.,abs(r.z+.75))*smoothstep(-.2,.35,r.y);
 c+=vec3(.35)*pow(max(0.,dot(r,normalize(vec3(-.5,.5,.7)))),24.);return c*(1.+L*.6);}
void main(){vec3 N=normalize(vN),V=normalize(E-vW),R=reflect(-V,N);float fr=.55+.45*pow(1.-max(0.,dot(N,V)),5.);
 vec3 col=env(R)*fr+vec3(.04)*max(0.,N.y);col=col/(1.+col*.45);col=pow(col,vec3(.4545));gl_FragColor=vec4(col,1.);}`;
const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o};const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);gl.useProgram(pr);
const g=tube();const buf=(d,t=gl.ARRAY_BUFFER)=>{const b=gl.createBuffer();gl.bindBuffer(t,b);gl.bufferData(t,d,gl.STATIC_DRAW);return b};
buf(g.pos);const lp=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(lp);gl.vertexAttribPointer(lp,3,gl.FLOAT,false,0,0);
buf(g.nrm);const ln=gl.getAttribLocation(pr,'n');gl.enableVertexAttribArray(ln);gl.vertexAttribPointer(ln,3,gl.FLOAT,false,0,0);
buf(g.idx,gl.ELEMENT_ARRAY_BUFFER);const U=n=>gl.getUniformLocation(pr,n);const uP=U('P'),uM=U('M'),uE=U('E'),uL=U('L'),uT=U('T');
gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);
const persp=(f,a,n,fa)=>{const t=1/Math.tan(f/2);return[t/a,0,0,0,0,t,0,0,0,0,(fa+n)/(n-fa),-1,0,0,2*fa*n/(n-fa),0]};
const mul=(a,b)=>{const o=new Array(16).fill(0);for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)o[j*4+i]+=a[k*4+i]*b[j*4+k];return o};
const rx=a=>[1,0,0,0,0,Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1],ry=a=>[Math.cos(a),0,-Math.sin(a),0,0,1,0,0,Math.sin(a),0,Math.cos(a),0,0,0,0,1],rz=a=>[Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1,0,0,0,0,1];
const tr=(x,y,z,s)=>[s,0,0,0,0,s,0,0,0,0,s,0,x,y,z,1];

function size(){const d=Math.min(devicePixelRatio||1,2);const r=cv.getBoundingClientRect();cv.width=Math.max(2,Math.round(r.width*d));cv.height=Math.max(2,Math.round(r.height*d))}size();
let raf=0,stopped=false;const t0=performance.now();
function frame(now){if(stopped)return;raf=requestAnimationFrame(frame);const t=(now-t0)/1000;if(cv.width<3)size();
  gl.viewport(0,0,cv.width,cv.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(uP,false,persp(.6,cv.width/cv.height,.1,50));gl.uniform3f(uE,0,0,0);gl.uniform1f(uL,0);gl.uniform1f(uT,t);
  const ease=1-Math.pow(1-Math.min(1,t/1.1),3);// settles in from a slight turn
  const M=mul(tr(-.05,0,-4.6,scale*(.86+.14*ease)),mul(ry(-.28+Math.sin(t*.9)*.32+(1-ease)*.9),mul(rx(.12+Math.sin(t*.6)*.05),rz(.02))));
  gl.uniformMatrix4fv(uM,false,M);gl.drawElements(gl.TRIANGLES,g.idx.length,ext?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,0)}
raf=requestAnimationFrame(frame);return()=>{stopped=true;cancelAnimationFrame(raf);try{gl.getExtension('WEBGL_lose_context')?.loseContext()}catch(e){}}}
window.SLogo3D={mount};
})();
;(window.__snParts=window.__snParts||{})["lib/logo3d.js"]="16d3ca144387";
