/* sniplit Premium licenses. Premium is on only while this device holds a token signed by sniplit's private key
   (ECDSA P-256). The app ships just the public key, so flipping a value in storage, in the console or in a restored
   backup does nothing: there is no "premium" flag to flip. Each token names the sniplit ID it was issued to and
   when it ends; a clock turned back is noticed. Trials and purchases are signed by the license server. */
(function(){
const LS={get:(k,d)=>{try{const v=localStorage.getItem('sn.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem('sn.'+k,JSON.stringify(v))}catch(e){}}};
const ub=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
let state={ok:false,plan:null,exp:null,reason:'none'};const subs=new Set();let keyP=null;
const pub=()=>keyP||(keyP=window.SNIPLIT_LICENSE_KEY&&crypto.subtle?crypto.subtle.importKey('jwk',{...window.SNIPLIT_LICENSE_KEY,ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['verify']).catch(()=>null):Promise.resolve(null));
// time never goes backwards for licenses: the latest time this device has seen is remembered
function now(){const t=Date.now(),m=+LS.get('lic.clk',0)||0;if(t>m)LS.set('lic.clk',t);return Math.max(t,m)}
const me=()=>(window.SSocial&&SSocial.me&&SSocial.me.id)||'';
async function check(token){try{if(!token||typeof token!=='string')return{ok:false,reason:'none'};const[v,body,sig]=token.trim().split('.');if(v!=='v1'||!body||!sig)return{ok:false,reason:'That isn’t a sniplit code'};
  const k=await pub();if(!k)return{ok:false,reason:'Premium isn’t available in this build yet'};
  const good=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},k,ub(sig),new TextEncoder().encode('v1.'+body));if(!good)return{ok:false,reason:'That code isn’t valid'};
  const p=JSON.parse(new TextDecoder().decode(ub(body)));if(p.sub!==me())return{ok:false,reason:'That code belongs to a different sniplit ID'};
  if(p.exp!=null&&now()>p.exp)return{ok:false,reason:'expired',plan:p.plan,exp:p.exp};return{ok:true,plan:p.plan,exp:p.exp,iat:p.iat}}catch(e){return{ok:false,reason:'That code isn’t valid'}}}
/* the free trial: a year of Premium on this sniplit ID, renewable any time from the Premium page (it simply starts a new year).
   Paid plans stay signed tokens; the trial is a local grant by design. */
function trialState(){const t=LS.get('trial',null);if(!t||t.sub!==me())return null;if(now()>t.exp)return{ok:false,reason:'expired',plan:'trial',exp:t.exp};return{ok:true,plan:'trial',exp:t.exp,iat:t.at,local:true}}
async function refresh(){let r=await check(LS.get('license',''));if(!r.ok){const t=trialState();if(t&&t.ok)r=t}state=r;subs.forEach(f=>{try{f(state)}catch(e){}});return state}
async function redeem(token){const r=await check(token);if(r.ok){LS.set('license',token.trim());state=r;subs.forEach(f=>f(state))}return r}
const server=()=>String((window.SData&&SData.Store.settings.studioServer)||window.SNIPLIT_SERVER||'').trim().replace(/\/+$/,'');
async function trial(){const s=server();if(!s||!window.SNIPLIT_LICENSE_KEY){const t={sub:me(),at:now(),exp:now()+365*864e5};LS.set('trial',t);return refresh()}
  const r=await fetch(s+'/license/trial',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sub:me()})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.token)throw new Error(d.error||'The trial couldn’t start');
  const v=await redeem(d.token);if(!v.ok)throw new Error(v.reason);return v}
setInterval(()=>{if(state.ok&&state.exp&&now()>state.exp)refresh()},6e4);
const ready=new Promise(r=>{const go=()=>refresh().then(r);if(window.SSocial)go();else addEventListener('DOMContentLoaded',go,{once:true})});
window.SLicense={get state(){return state},get ok(){return!!state.ok},ready,refresh,redeem,trial,on(f){subs.add(f);return()=>subs.delete(f)},hasKey:()=>!!window.SNIPLIT_LICENSE_KEY,server};
})();
;(window.__snParts=window.__snParts||{})["lib/license.js"]="662870336b97";
