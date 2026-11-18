/* sniplit language filter: hides swearing and slurs in messages, names, notes and the word-meaning bubbles.
   Words are matched after undoing the usual disguises (sh1t, a$$, f*ck, spaced-out letters), and shown as the first
   letter plus stars. Lyrics themselves are left as the artist wrote them. Settings → Privacy can turn it off. */
(function(){
// stems: a word that starts with one of these (after normalising) is filtered, unless it's one of the safe words below
const STEMS=['fuck','fuk','fck','phuck','shit','shyt','bitch','biatch','bich','cunt','dick','cock','pussy','puss','asshole','arsehole','bastard','slut','whore','hoe','hoes','twat','wank','jizz','cum','dildo','porn','nigg','nigga','niger','nigr','negro','fag','faggot','retard','tranny','chink','spic','kike','wetback','gook','coon','dyke','motherf','mf','wtf','stfu','bullshit','damn','goddamn','prick','skank','thot','boob','tit','tits','penis','vagina','anal','rape','rapist','molest','pedo','nazi','hitler','kys'];
// whole words that look like a stem but are fine
const SAFE=new Set(['cocktail','cockpit','cockroach','peacock','hancock','scunthorpe','dickens','dickinson','title','titles','titan','titanic','titled','tithe','titter','analysis','analyst','analog','analogue','analytics','cumulative','cucumber','circumstance','document','documents','hoedown','shoes','shoe','hoek','pussycat','bass','class','classic','grass','glass','pass','passion','assess','assist','assume','asset','assets','mass','massive','assassin','basement','damnation','scrapbook','therapist','grape','drape','trapeze','nigeria','nigerian','niger','spice','spicy','spiced','chinks','fagin','raccoon','cocoon','tycoon','dykes','skanky','mfa','cockney','sextant','sussex','essex','middlesex','tits','hitlers']);
// "tits" / "tit" as birds is rare in this app; keep them filtered by removing from SAFE
SAFE.delete('tits');SAFE.delete('hitlers');
const LEET={'0':'o','1':'i','!':'i','3':'e','4':'a','@':'a','5':'s','$':'s','7':'t','+':'t','8':'b','9':'g','|':'i','€':'e','£':'l'};
function norm(w){let s=String(w).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'');s=s.replace(/[01!34@5$7+89|€£]/g,c=>LEET[c]||c);s=s.replace(/[*_.\-~#^]+/g,'');return s.replace(/(.)\1{2,}/g,'$1$1')}
function bad(w){if(/[_]/.test(w)||/\d$/.test(w)){const parts=String(w).split(/_+/).map(x=>x.replace(/\d+$/,'')).filter(Boolean);if(parts.length>1||parts[0]!==w)return parts.some(p=>p&&bad1(p))}return bad1(w)}
function bad1(w){const n=norm(w);if(n.length<2)return false;if(SAFE.has(n)||SAFE.has(n.replace(/s$/,'')))return false;
  for(const st of STEMS){if(st.length<=3){if(n===st||n===st+'s'||n===st+'z')return true}else if(n.startsWith(st)||n.endsWith(st)&&n.length<=st.length+3)return true}
  // a masked word like f*ck or sh!t: letters with symbols in between
  if(/[*@$!#]/.test(w)){const k=String(w).toLowerCase().replace(/[^a-z]/g,'');if(k.length>=2&&STEMS.some(st=>st.length>3&&st[0]===k[0]&&st.slice(-1)===k.slice(-1)&&Math.abs(st.length-String(w).length)<=1))return true}
  return false}
const on=()=>{try{const s=JSON.parse(localStorage.getItem('sn.settings')||'{}');return s.cleanLang!==false}catch(e){return true}};
const mask=w=>w[0]+'*'.repeat(Math.max(2,Math.min(6,w.length-1)));
function clean(text,force){if(text==null)return text;const t=String(text);if(!force&&!on())return t;
  // spaced out: "f u c k" → one word before checking
  let out=t.replace(/\b(?:[a-z@$!0-9][\s.]){2,}[a-z@$!0-9]\b/gi,m=>{const j=m.replace(/[\s.]/g,'');return bad(j)?mask(j):m});
  return out.replace(/[\p{L}\p{N}@$!*#_+|€£]+/gu,w=>bad(w)?mask(w):w)}
function has(text){return String(text||'').split(/[^\p{L}\p{N}@$!*#_+|€£]+/u).some(bad)}
window.SClean={clean,has,bad,on};
})();
;(window.__snParts=window.__snParts||{})["lib/clean.js"]="16d3ca144387";
