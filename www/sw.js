/* sniplit service worker — opens instantly from cache (also from the home-screen icon with no connection),
   refreshes in the background, and shows a sniplit-styled page instead of the browser's error screen. */
const V='sniplit-16d3ca144387';
const SHELL=['./','index.html','app.css','app.js','lib/zip.js','lib/icons.js','lib/audio.js','lib/lyrics.js','lib/data.js','lib/sources.js','lib/genres.js','lib/avatars.js','lib/stats.js','config.js','lib/mp4mux.js','lib/lsync.js','lib/lpost.js','lib/lcompose.js','lib/lstudio.js','lib/import.js','lib/clean.js','lib/social.js','lib/license.js','lib/logo3d.js','lib/legal.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon-180.png','icons/maskable-512.png','icons/logo.svg'];
const IMG=/(mzstatic\.com|dzcdn\.net|ytimg\.com|audius|archive\.org\/services\/img|coverartarchive|theaudiodb|wikimedia)/;
const OFFLINE=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#060606"><meta name="apple-mobile-web-app-capable" content="yes"><title>sniplit</title>
<style>html,body{margin:0;height:100%;background:#060606;color:#f4f4f4;font:15px/1.5 Inter,-apple-system,system-ui,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
main{min-height:100%;display:grid;place-items:center;text-align:center;padding:calc(24px + env(safe-area-inset-top)) 28px calc(24px + env(safe-area-inset-bottom))}
.l{display:inline-flex;align-items:center;gap:10px;font-weight:700;font-size:22px;letter-spacing:-.03em;margin-bottom:28px}svg{width:24px;height:24px;fill:none;stroke:#f4f4f4;stroke-width:2;stroke-linejoin:round}
h1{font-size:24px;letter-spacing:-.03em;margin:0 0 8px}p{color:#8e8e8e;margin:0 auto 26px;max-width:320px}
button{font:inherit;font-weight:650;border:0;border-radius:999px;background:#fff;color:#000;height:44px;padding:0 24px;cursor:pointer;transition:transform .4s cubic-bezier(.34,1.4,.5,1)}button:active{transform:scale(.95)}</style></head>
<body><main><div><div class="l"><svg viewBox="0 0 24 24"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 7 4.8z"/></svg>sniplit</div>
<h1>You’re offline</h1><p>sniplit will open as soon as there’s a connection. Downloaded songs play offline once the app has loaded here once.</p><button onclick="location.reload()">Try again</button></div></main>
<script>addEventListener('online',()=>location.reload())</script></body></html>`;
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V&&x!==V+'-img').map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
async function trim(c,max){const k=await c.keys();for(let i=0;i<k.length-max;i++)await c.delete(k[i])}
const offline=()=>new Response(OFFLINE,{headers:{'Content-Type':'text/html; charset=utf-8'}});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  // the app's own files: always the newest from the network when there is one (so every file comes from the same
  // release and an update can never mix old and new code), the saved copy when offline or the network is very slow
  if(u.origin===location.origin){const code=r.mode==='navigate'||/\.(js|css|html|json|webmanifest)$/.test(u.pathname)||u.pathname.endsWith('/');
    e.respondWith(caches.open(V).then(async c=>{const fromCache=async()=>(await c.match(r,{ignoreSearch:true}))||(r.mode==='navigate'?(await c.match('index.html'))||offline():Response.error());
      if(!code){const hit=await c.match(r,{ignoreSearch:true});if(hit)return hit}
      const net=fetch(r,{cache:'no-cache'}).then(res=>{if(res.ok)c.put(r,res.clone());return res});
      if(!code)return net.catch(fromCache);
      const slow=new Promise(res=>setTimeout(()=>res(null),4000));const got=await Promise.race([net.catch(()=>null),slow]);
      if(got&&got.ok)return got;if(got&&!got.ok&&got.status!==404)return got;const hit=await fromCache();if(got&&got.status===404&&!(hit&&hit.ok))return got;e.waitUntil(net.catch(()=>{}));return hit}));return}
  if(r.destination==='image'&&r.mode!=='cors'&&IMG.test(u.host+u.pathname)){e.respondWith(caches.open(V+'-img').then(async c=>{const hit=await c.match(r);if(hit)return hit;try{const res=await fetch(r);if(res.ok||res.type==='opaque'){c.put(r,res.clone());trim(c,1500)}return res}catch(x){return hit||Response.error()}}))}});
// tapping a notification opens sniplit (or brings it forward) at the right place
self.addEventListener('notificationclick',e=>{e.notification.close();const h=(e.notification.data&&e.notification.data.hash)||'';e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus'in c){if(h)c.postMessage({sniplitGo:h});return c.focus()}}return self.clients.openWindow('./'+(h||''))}))});
