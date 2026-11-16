/* sniplit service worker — opens instantly from cache, refreshes in the background.
   Audio is cached in IndexedDB by the app; artwork is cached here. */
const V='sniplit-v4';
const SHELL=['./','index.html','app.css','app.js','lib/zip.js','lib/icons.js','lib/audio.js','lib/lyrics.js','lib/data.js','lib/sources.js','lib/import.js','lib/social.js','lib/legal.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon-180.png'];
const IMG=/(mzstatic\.com|dzcdn\.net|ytimg\.com|audius|archive\.org\/services\/img|coverartarchive|theaudiodb|wikimedia)/;
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V&&x!==V+'-img').map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
async function trim(c,max){const k=await c.keys();for(let i=0;i<k.length-max;i++)await c.delete(k[i])}
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  if(u.origin===location.origin){// stale-while-revalidate: instant open, fresh next time
    e.respondWith(caches.open(V).then(async c=>{const hit=await c.match(r,{ignoreSearch:true});const net=fetch(r).then(res=>{if(res.ok)c.put(r,res.clone());return res}).catch(()=>hit||c.match('index.html'));return hit||net}));return}
  if(r.destination==='image'&&IMG.test(u.host+u.pathname)){e.respondWith(caches.open(V+'-img').then(async c=>{const hit=await c.match(r);if(hit)return hit;try{const res=await fetch(r);if(res.ok||res.type==='opaque'){c.put(r,res.clone());trim(c,1500)}return res}catch(x){return hit||Response.error()}}))}});
