/* sniplit — tiny file utilities: ZIP (store), WAV/AIFF/PCM encoders, downloads */
(function(){
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u8){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=CRC[(c^u8[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
async function toU8(x){if(x instanceof Uint8Array)return x;if(typeof x==='string')return new TextEncoder().encode(x);if(x instanceof Blob)return new Uint8Array(await x.arrayBuffer());return new Uint8Array(x)}
/** files: [{name, data(string|Blob|Uint8Array)}] -> Blob (application/zip, no compression) */
async function makeZip(files){
  const parts=[],central=[];let off=0;const enc=new TextEncoder();
  for(const f of files){
    const data=await toU8(f.data),name=enc.encode(f.name.replace(/^\/+/,'')),crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);
    h.setUint16(10,0,true);h.setUint16(12,0x21,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);
    h.setUint16(26,name.length,true);h.setUint16(28,0,true);
    parts.push(new Uint8Array(h.buffer),name,data);
    const c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);
    c.setUint16(12,0,true);c.setUint16(14,0x21,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);
    c.setUint16(28,name.length,true);c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer),name);
    off+=30+name.length+data.length;
  }
  const csize=central.reduce((a,b)=>a+b.length,0);
  const e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,csize,true);e.setUint32(16,off,true);
  return new Blob([...parts,...central,new Uint8Array(e.buffer)],{type:'application/zip'});
}
function interleave(buf){const ch=buf.numberOfChannels,n=buf.length,out=new Float32Array(n*ch),cs=[];for(let c=0;c<ch;c++)cs.push(buf.getChannelData(c));for(let i=0;i<n;i++)for(let c=0;c<ch;c++)out[i*ch+c]=cs[c][i];return out}
/** AudioBuffer -> WAV Blob. bits: 16 | 24 | 32 (float) */
function encodeWAV(buf,bits=16){
  const ch=buf.numberOfChannels,sr=buf.sampleRate,data=interleave(buf),bps=bits/8,fl=bits===32;
  const dv=new DataView(new ArrayBuffer(44+data.length*bps));const w=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i))};
  w(0,'RIFF');dv.setUint32(4,36+data.length*bps,true);w(8,'WAVE');w(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,fl?3:1,true);
  dv.setUint16(22,ch,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*ch*bps,true);dv.setUint16(32,ch*bps,true);dv.setUint16(34,bits,true);
  w(36,'data');dv.setUint32(40,data.length*bps,true);let o=44;
  for(let i=0;i<data.length;i++){let s=Math.max(-1,Math.min(1,data[i]));
    if(fl){dv.setFloat32(o,s,true)}else if(bits===16){dv.setInt16(o,s<0?s*0x8000:s*0x7FFF,true)}else{const v=Math.round(s<0?s*0x800000:s*0x7FFFFF);dv.setUint8(o,v&255);dv.setUint8(o+1,(v>>8)&255);dv.setUint8(o+2,(v>>16)&255)}o+=bps}
  return new Blob([dv.buffer],{type:'audio/wav'});
}
/** AudioBuffer -> AIFF (16-bit big-endian) */
function encodeAIFF(buf){
  const ch=buf.numberOfChannels,sr=buf.sampleRate,data=interleave(buf),frames=buf.length,dl=data.length*2;
  const dv=new DataView(new ArrayBuffer(54+dl));const w=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i))};
  w(0,'FORM');dv.setUint32(4,46+dl);w(8,'AIFF');w(12,'COMM');dv.setUint32(16,18);dv.setUint16(20,ch);dv.setUint32(22,frames);dv.setUint16(26,16);
  // 80-bit extended sample rate
  let e=16383+31,m=sr;while(!(m&0x80000000)){m<<=1;e--}dv.setUint16(28,e);dv.setUint32(30,m>>>0);dv.setUint32(34,0);
  w(38,'SSND');dv.setUint32(42,8+dl);dv.setUint32(46,0);dv.setUint32(50,0);let o=54;
  for(let i=0;i<data.length;i++){const s=Math.max(-1,Math.min(1,data[i]));dv.setInt16(o,s<0?s*0x8000:s*0x7FFF);o+=2}
  return new Blob([dv.buffer],{type:'audio/aiff'});
}
function encodePCM(buf){const d=interleave(buf),o=new Int16Array(d.length);for(let i=0;i<d.length;i++){const s=Math.max(-1,Math.min(1,d[i]));o[i]=s<0?s*0x8000:s*0x7FFF}return new Blob([o.buffer],{type:'application/octet-stream'})}
function download(blob,name){
  try{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000);return true}catch(e){return false}
}
function safeName(s){return String(s||'file').replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,' ').trim().slice(0,120)||'file'}
window.SFile={makeZip,encodeWAV,encodeAIFF,encodePCM,download,safeName,crc32};
})();
;(window.__snParts=window.__snParts||{})["lib/zip.js"]="16d3ca144387";
