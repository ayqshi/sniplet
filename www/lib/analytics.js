/* sniplit analytics — anonymous counts only, through GoatCounter (goatcounter.com), so there's no server to run and the
   owner reads the dashboard on their phone at https://<code>.goatcounter.com.
   What is sent: which screen was opened (never which song, artist, playlist or friend), a "play" count by kind of source,
   the app type (web, installed, Android, desktop) and the build. GoatCounter itself sees the browser, screen size and
   country, and does not store IP addresses or set cookies. Nothing identifies you: no sniplit ID, name, searches or
   history. Off in Settings → Privacy, and off by default for browsers that send Global Privacy Control or Do Not Track. */
(function(){
const code=()=>String(window.SNIPLIT_GOATCOUNTER||'').trim().replace(/[^a-z0-9-]/gi,'');
function on(){const s=window.SData&&SData.Store.settings;if(!s||!code())return false;if(s.analytics===undefined)s.analytics=!(navigator.globalPrivacyControl||navigator.doNotTrack==='1');return!!s.analytics}
const app=()=>window.sniplitAndroid?'android':window.sniplitDesktop?'desktop':(matchMedia('(display-mode: standalone)').matches||navigator.standalone)?'installed':'web';
let last='',lastAt=0,started=false;
function hit(path,title,event){if(!on())return;try{const u=new URL(`https://${code()}.goatcounter.com/count`);u.searchParams.set('p',path);u.searchParams.set('t',title||path);if(event)u.searchParams.set('e','true');
  u.searchParams.set('r',started?'':'app:'+app());u.searchParams.set('s',`${screen.width},${screen.height},${devicePixelRatio||1}`);u.searchParams.set('rnd',Math.random().toString(36).slice(2,8));started=true;
  if(navigator.sendBeacon&&navigator.sendBeacon(u.toString()))return;const i=new Image();i.referrerPolicy='no-referrer';i.src=u.toString()}catch(e){}}
// only the generic event names below are ever sent
const EV={play:1,full:1,premium_view:1,checkout_view:1,lyric_video_export:1,friend_added:1,message:1,install:1,error:1};
function track(type,data={}){if(type==='page'){const p='/'+String(data.p||'home').replace(/[^a-z0-9]/gi,'').slice(0,24);if(p===last&&Date.now()-lastAt<1500)return;last=p;lastAt=Date.now();hit(p,p.slice(1)||'home');return}
  if(type==='listen'){hit('play-'+(data.kind||'song').replace(/[^a-z]/gi,''),'Play',true);return}
  if(EV[type])hit(type+(data.k?'-'+String(data.k).replace(/[^a-z0-9]/gi,'').slice(0,16):''),type,true)}
let errs=0;addEventListener('error',()=>{if(errs++<3)track('error')});
window.SAnalytics={track,flush(){},enabled:on,dashboard:()=>code()?`https://${code()}.goatcounter.com`:''};
})();
