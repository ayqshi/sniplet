/* sniplit Lyric Studio — post-processing on the GPU (WebGL), applied to every frame after the 2D composition.
   Fisheye (barrel bulge that keeps the corners filled), colour fringing that grows toward the edges, glow taken
   from a blurred copy of the frame, vignette and film grain. Used identically by the preview and the export. */
(function(){
const VS=`attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;v.y=1.-v.y;gl_Position=vec4(p,0.,1.);}`;
const FS=`precision highp float;varying vec2 v;uniform sampler2D tex,small;uniform vec2 res;uniform float fish,ca,glow,vig,grain,time,zoom;
vec2 bulge(vec2 uv,float k){vec2 a=vec2(res.x/res.y,1.);vec2 c=(uv-.5)*a;float d=length(.5*a);float r=length(c)/d;float rr=r*(1.-k*.78*(1.-r*r));vec2 o=r>0.?c*(rr/r):c;return o/a/zoom+.5;}
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+time*37.)*43758.5453);}
void main(){vec2 uv=v;float k=fish*.9;
  float rr=length((uv-.5)*vec2(res.x/res.y,1.));float f=ca*.012*(.3+rr*1.6);
  vec2 ur=bulge(uv,k*(1.+f*4.)),ug=bulge(uv,k),ub=bulge(uv,k*(1.-f*4.));
  ur=.5+(ur-.5)*(1.+f);ub=.5+(ub-.5)*(1.-f);
  vec3 c=vec3(texture2D(tex,ur).r,texture2D(tex,ug).g,texture2D(tex,ub).b);
  vec3 g=texture2D(small,ug).rgb;c+=max(g-.18,0.)*glow*1.6;
  float vg=smoothstep(1.15,.25,rr*1.25);c*=mix(1.,vg,vig);
  c+=(h(uv*res)-.5)*grain*.16;
  gl_FragColor=vec4(clamp(c,0.,1.),1.);}`;
function mk(w,h){if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(w,h);const c=document.createElement('canvas');c.width=w;c.height=h;return c}
class Post{constructor(W,H){this.W=W;this.H=H;this.c=mk(W,H);const gl=this.gl=this.c.getContext('webgl',{premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false})||this.c.getContext('experimental-webgl');
    if(!gl)throw new Error('no webgl');const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o};
    const pr=this.pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);gl.useProgram(pr);
    const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    const tx=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);for(const[k,v]of[[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);return t};
    this.t0=tx();this.t1=tx();this.small=mk(Math.max(8,W>>3),Math.max(8,H>>3));this.sx=this.small.getContext('2d');this.sx.imageSmoothingQuality='high';
    this.u={};for(const n of['tex','small','res','fish','ca','glow','vig','grain','time','zoom'])this.u[n]=gl.getUniformLocation(pr,n);gl.uniform1i(this.u.tex,0);gl.uniform1i(this.u.small,1);gl.viewport(0,0,W,H)}
  render(src,p,t){const gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.t0);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
    // the glow source: the frame shrunk to 1/8 twice over (cheap and very soft once stretched back)
    this.sx.clearRect(0,0,this.small.width,this.small.height);this.sx.drawImage(src,0,0,this.small.width,this.small.height);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.t1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.small);
    gl.uniform2f(this.u.res,this.W,this.H);gl.uniform1f(this.u.fish,p.fish||0);gl.uniform1f(this.u.ca,p.ca||0);gl.uniform1f(this.u.glow,p.glow||0);gl.uniform1f(this.u.vig,p.vig||0);gl.uniform1f(this.u.grain,p.grain||0);gl.uniform1f(this.u.time,(t||0)%100);gl.uniform1f(this.u.zoom,1+(p.fish||0)*.04);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return this.c}}
const cache=new Map();
/** returns a ready post-processor for this size, or null if the device has no WebGL */
function get(W,H){const k=W+'x'+H;if(cache.has(k))return cache.get(k);let p=null;try{p=new Post(W,H)}catch(e){p=null}cache.set(k,p);if(cache.size>4)cache.delete(cache.keys().next().value);return p}
const active=o=>(o.fish||0)>.01||(o.ca||0)>.01||(o.glow||0)>.01||(o.vig||0)>.01;
window.SLPost={get,active};
})();
