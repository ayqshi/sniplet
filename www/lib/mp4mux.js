/* sniplit — MP4 writer for the Lyric Studio.
   H.264 video (avcC from WebCodecs) + AAC (esds) or Opus (dOps) audio. Fast-start layout (moov before mdat),
   video and audio interleaved about once a second, ctts + edit list when the encoder reorders frames,
   co64 offsets when the file passes 4 GB. Media bytes are kept as Blob parts so long 4K renders can page to disk. */
(function(){
const te=new TextEncoder();
const u8=n=>new Uint8Array(n);
function be32(v){return[(v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255]}
function be16(v){return[(v>>>8)&255,v&255]}
function be64(v){const hi=Math.floor(v/4294967296),lo=v>>>0;return[...be32(hi),...be32(lo)]}
function cat(parts){let n=0;for(const p of parts)n+=p.length;const o=u8(n);let k=0;for(const p of parts){o.set(p,k);k+=p.length}return o}
function box(type,...body){const b=cat(body.map(x=>x instanceof Uint8Array?x:Uint8Array.from(x)));return cat([Uint8Array.from(be32(b.length+8)),te.encode(type),b])}
function full(type,ver,flags,...body){return box(type,[ver,(flags>>16)&255,(flags>>8)&255,flags&255],...body)}
const MATRIX=[0,1,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,1,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 64,0,0,0];

class Muxer{
  /** video:{width,height,fps}  audio:{codec:'aac'|'opus',sampleRate,channels}|null */
  constructor({video,audio}){this.v={...video,ts:video.fps*1000,samples:[],desc:null};this.a=audio?{...audio,samples:[],desc:null}:null;
    this.parts=[];this.pend=[];this.pendBytes=0;this.off=0;this.vQueue=[];this.aIdx=0;this.groupsV=[];this.groupsA=[];this.done=false}
  setVideoConfig(desc){if(desc&&!this.v.desc)this.v.desc=new Uint8Array(desc)}
  setAudioConfig(desc){if(this.a&&desc&&!this.a.desc)this.a.desc=new Uint8Array(desc)}
  /** all audio is encoded before video starts, so it is handed over in one go */
  addAudio(data,dur){this.a.samples.push({size:data.length,dur,data})}
  /** video samples arrive in decode order; pts in microseconds */
  addVideo(data,{pts,key}){const s={size:data.length,pts:Math.round(pts*this.v.fps/1e6)*1000,key,data};this.v.samples.push(s);this.vQueue.push(s);
    if(this.vQueue.length>=this.v.fps)this.flushGroup()}
  write(bytes){this.pend.push(bytes);this.pendBytes+=bytes.length;this.off+=bytes.length;if(this.pendBytes>8e6)this.spill()}
  spill(){if(this.pend.length){this.parts.push(new Blob(this.pend));this.pend=[];this.pendBytes=0}}
  /* one interleave group: ~1 s of video, then the audio that plays during it */
  flushGroup(last){if(!this.vQueue.length&&!last)return;
    if(this.vQueue.length){const g={off:this.off,n:this.vQueue.length};for(const s of this.vQueue){this.write(s.data);s.data=null}this.groupsV.push(g);
      this.vEnd=(this.vEnd||0)+this.vQueue.length*1000;this.vQueue=[]}
    if(this.a){const until=last?Infinity:this.vEnd/this.v.ts;let t=this.aT||0;const g={off:this.off,n:0};
      while(this.aIdx<this.a.samples.length&&t<until){const s=this.a.samples[this.aIdx++];this.write(s.data);s.data=null;g.n++;t+=s.dur/this.a.sampleRate}
      this.aT=t;if(g.n)this.groupsA.push(g)}}
  finish(){if(this.done)throw new Error('already finished');this.done=true;this.flushGroup(true);this.spill();
    if(!this.v.desc)throw new Error('The video encoder gave no H.264 configuration');if(this.a&&!this.a.desc&&this.a.codec==='aac')throw new Error('The audio encoder gave no AAC configuration');
    const mdatSize=this.off;const big=mdatSize+16+1e6>4294967295;
    const ftyp=box('ftyp',te.encode('isom'),be32(512),te.encode('isomiso2avc1mp41'));
    const mk=base=>this.moov(base,big);let moov=mk(0);const base=ftyp.length+moov.length+16;moov=mk(base);
    const mdatHead=cat([Uint8Array.from(be32(1)),te.encode('mdat'),Uint8Array.from(be64(mdatSize+16))]);
    return new Blob([ftyp,moov,mdatHead,...this.parts],{type:'video/mp4'})}
  moov(base,big){const V=this.v,A=this.a;
    const vDur=V.samples.length*1000;const movieDur=Math.max(vDur/V.ts,A?A.samples.reduce((a,s)=>a+s.dur,0)/A.sampleRate:0);
    const mvhd=full('mvhd',0,0,be32(0),be32(0),be32(1000),be32(Math.round(movieDur*1000)),be32(0x00010000),be16(0x0100),u8(10),MATRIX,u8(24),be32(A?3:2));
    return box('moov',mvhd,this.vTrak(base,big),...(A?[this.aTrak(base,big)]:[]))}
  stco(groups,base,big){return big?full('co64',0,0,be32(groups.length),...groups.map(g=>be64(g.off+base))):full('stco',0,0,be32(groups.length),...groups.map(g=>be32(g.off+base)))}
  stsc(groups){const runs=[];groups.forEach((g,i)=>{if(!runs.length||runs[runs.length-1].n!==g.n)runs.push({first:i+1,n:g.n})});return full('stsc',0,0,be32(runs.length),...runs.map(r=>[...be32(r.first),...be32(r.n),...be32(1)]))}
  vTrak(base,big){const V=this.v,S=V.samples,n=S.length;
    // decode times: presentation times in order, shifted so every composition offset is >= 0
    const sorted=S.map(s=>s.pts).sort((a,b)=>a-b);let D=0;S.forEach((s,i)=>{D=Math.max(D,sorted[i]-s.pts)});const dts=sorted.map(p=>p-D);
    const reorder=S.some((s,i)=>s.pts-dts[i]!==0);
    const stts=full('stts',0,0,be32(1),be32(n),be32(1000));
    let ctts=null;if(reorder){const runs=[];S.forEach((s,i)=>{const o=s.pts-dts[i];const r=runs[runs.length-1];if(r&&r.o===o)r.c++;else runs.push({c:1,o})});ctts=full('ctts',0,0,be32(runs.length),...runs.map(r=>[...be32(r.c),...be32(r.o)]))}
    const keys=[];S.forEach((s,i)=>s.key&&keys.push(i+1));
    const avc1=box('avc1',u8(6),be16(1),u8(16),be16(V.width),be16(V.height),be32(0x00480000),be32(0x00480000),be32(0),be16(1),u8(32),be16(0x18),be16(0xffff),box('avcC',V.desc),box('pasp',be32(1),be32(1)));
    const stbl=box('stbl',full('stsd',0,0,be32(1),avc1),stts,...(ctts?[ctts]:[]),full('stss',0,0,be32(keys.length),...keys.map(be32)),this.stsc(this.groupsV),full('stsz',0,0,be32(0),be32(n),...S.map(s=>be32(s.size))),this.stco(this.groupsV,base,big));
    const durMov=Math.round(n*1000/V.ts*1000);
    const edts=D?box('edts',full('elst',0,0,be32(1),be32(durMov),be32(D),be32(0x00010000))):null;
    return box('trak',full('tkhd',0,3,be32(0),be32(0),be32(1),be32(0),be32(durMov),u8(8),be16(0),be16(0),be16(0),be16(0),MATRIX,be32(V.width<<16),be32(V.height<<16)),...(edts?[edts]:[]),
      box('mdia',full('mdhd',0,0,be32(0),be32(0),be32(V.ts),be32(n*1000),be16(0x55c4),be16(0)),full('hdlr',0,0,be32(0),te.encode('vide'),u8(12),te.encode('sniplit video\0')),
        box('minf',full('vmhd',0,1,u8(8)),box('dinf',full('dref',0,0,be32(1),full('url ',0,1))),stbl)))}
  aTrak(base,big){const A=this.a,S=A.samples,n=S.length,sr=A.sampleRate;
    const runs=[];for(const s of S){const r=runs[runs.length-1];if(r&&r.d===s.dur)r.c++;else runs.push({c:1,d:s.dur})}
    const total=S.reduce((a,s)=>a+s.dur,0);
    let entry;if(A.codec==='opus'){let pre=312,inRate=sr,gain=0;const d=A.desc;
        if(d&&d.length>=19&&String.fromCharCode(...d.slice(0,8))==='OpusHead'){pre=d[10]|(d[11]<<8);inRate=(d[12]|(d[13]<<8)|(d[14]<<16)|(d[15]<<24))>>>0;gain=(d[16]|(d[17]<<8))<<16>>16}
        A.pre=pre;entry=box('Opus',u8(6),be16(1),u8(8),be16(A.channels),be16(16),be16(0),be16(0),be32(48000<<16>>>0),box('dOps',[0,A.channels],be16(pre),be32(inRate),be16(gain&0xffff),[0]))}
    else{const asc=A.desc;const desc=(tag,body)=>cat([Uint8Array.from([tag,0x80,0x80,0x80,body.length]),body]);
      const dsi=desc(5,asc);const dcd=desc(4,cat([Uint8Array.from([0x40,0x15,0,0,0,...be32(A.bitrate||192000),...be32(A.bitrate||192000)]),dsi]));
      const esd=desc(3,cat([Uint8Array.from([0,2,0]),dcd,desc(6,Uint8Array.from([2]))]));
      entry=box('mp4a',u8(6),be16(1),u8(8),be16(A.channels),be16(16),be16(0),be16(0),be32(sr<<16>>>0),full('esds',0,0,esd))}
    const skip=A.codec==='opus'?A.pre:(A.priming||0);const durMov=Math.round((total-skip)/sr*1000);
    const edts=skip?box('edts',full('elst',0,0,be32(1),be32(durMov),be32(skip),be32(0x00010000))):null;
    const stbl=box('stbl',full('stsd',0,0,be32(1),entry),full('stts',0,0,be32(runs.length),...runs.map(r=>[...be32(r.c),...be32(r.d)])),this.stsc(this.groupsA),full('stsz',0,0,be32(0),be32(n),...S.map(s=>be32(s.size))),this.stco(this.groupsA,base,big));
    return box('trak',full('tkhd',0,3,be32(0),be32(0),be32(2),be32(0),be32(durMov),u8(8),be16(0),be16(1),be16(0x0100),be16(0),MATRIX,be32(0),be32(0)),...(edts?[edts]:[]),
      box('mdia',full('mdhd',0,0,be32(0),be32(0),be32(sr),be32(total),be16(0x55c4),be16(0)),full('hdlr',0,0,be32(0),te.encode('soun'),u8(12),te.encode('sniplit audio\0')),
        box('minf',full('smhd',0,0,u8(4)),box('dinf',full('dref',0,0,be32(1),full('url ',0,1))),stbl)))}
}
const api={Muxer};if(typeof module!=='undefined')module.exports=api;else window.SMP4=api;
})();
;(window.__snParts=window.__snParts||{})["lib/mp4mux.js"]="662870336b97";
