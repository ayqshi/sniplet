/* sniplit genres — the Browse catalog. Every genre ships its own artwork (drawn here, so it works offline and
   never depends on a remote image), and a genre page pulls its charts, artists, playlists and new releases. */
(function(){
/* name · Deezer genre id · search words · two colours · motif */
const G=[
 ['Pop',132,'pop hits','#ff4f9a','#7b2cff','stars'],
 ['Hip-Hop/Rap',116,'hip hop rap','#ffb800','#d1361f','bars'],
 ['R&B/Soul',165,'r&b soul','#a855f7','#3b1a73','waves'],
 ['Dance',113,'dance house','#00e5ff','#3a2bd9','pulse'],
 ['Electronic',106,'electronic','#2bff88','#0b5c7a','grid'],
 ['Rock',152,'rock','#ff3b3b','#3a0f0f','bolt'],
 ['Alternative',85,'alternative indie','#ff8a3d','#5b2a86','stripes'],
 ['Latin',197,'reggaeton latin','#ffd23f','#ff3f6c','sun'],
 ['K-Pop',16,'k-pop','#ff7ad9','#5b6bff','hearts'],
 ['Country',84,'country','#f2a65a','#6b3f1d','hills'],
 ['Afrobeats',2,'afrobeats','#ffcc00','#0f8a4b','rings'],
 ['Jazz',129,'jazz','#e8b04a','#1d2a4f','notes'],
 ['Metal',464,'metal','#9aa4b2','#111318','spikes'],
 ['Reggae',144,'reggae','#2ecc40','#c0392b','sun'],
 ['Classical',98,'classical','#d9c7a7','#4a3b2a','staff'],
 ['Soundtrack',173,'soundtrack film score','#6ec1ff','#14213d','film'],
 ['Blues',153,'blues','#3d7bff','#0b1f4d','waves'],
 ['Folk',466,'folk acoustic','#b5d99c','#3c5a2e','hills'],
 ['Gospel',186,'gospel christian','#ffe58a','#b06a00','rays'],
 ['Chill',0,'chill lofi','#8fd3c8','#2a4a6b','moon'],
];
const BY=Object.fromEntries(G.map(g=>[g[0].toLowerCase(),g]));
const find=name=>BY[String(name||'').toLowerCase()]||null;

/* each motif is a few shapes, kept bold and simple so it reads at card size */
const M={
 stars:'<g fill="#fff" opacity=".28"><path d="M250 30l9 22 24 2-18 16 6 23-21-12-21 12 6-23-18-16 24-2z"/><path d="M200 100l5 12 13 1-10 9 3 13-11-7-11 7 3-13-10-9 13-1z"/><circle cx="290" cy="120" r="6"/></g>',
 bars:'<g fill="#fff" opacity=".26">'+[0,1,2,3,4,5,6].map(i=>`<rect x="${190+i*18}" y="${150-[40,90,60,120,75,100,50][i]}" width="11" height="${[40,90,60,120,75,100,50][i]}" rx="5"/>`).join('')+'</g>',
 waves:'<g fill="none" stroke="#fff" stroke-width="7" opacity=".24" stroke-linecap="round"><path d="M150 60q30-26 60 0t60 0t60 0"/><path d="M150 95q30-26 60 0t60 0t60 0"/><path d="M150 130q30-26 60 0t60 0t60 0"/></g>',
 pulse:'<g fill="none" stroke="#fff" stroke-width="8" opacity=".3" stroke-linejoin="round" stroke-linecap="round"><path d="M150 100h40l15-50 25 100 20-70 15 20h55"/></g>',
 grid:'<g stroke="#fff" opacity=".18" stroke-width="2">'+[0,1,2,3,4,5].map(i=>`<line x1="${170+i*28}" y1="10" x2="${140+i*40}" y2="180"/>`).join('')+[0,1,2,3].map(i=>`<line x1="150" y1="${80+i*28}" x2="330" y2="${80+i*28}"/>`).join('')+'</g><circle cx="255" cy="58" r="30" fill="#fff" opacity=".25"/>',
 bolt:'<path d="M265 10l-60 90h40l-25 80 75-105h-42l30-65z" fill="#fff" opacity=".3"/>',
 stripes:'<g fill="#fff" opacity=".16">'+[0,1,2,3,4].map(i=>`<path d="M${180+i*34} 180l50-180h16l-50 180z"/>`).join('')+'</g>',
 sun:'<circle cx="255" cy="70" r="38" fill="#fff" opacity=".32"/><g stroke="#fff" stroke-width="6" opacity=".22" stroke-linecap="round">'+[...Array(10)].map((_,i)=>{const a=i/10*Math.PI*2;return`<line x1="${255+Math.cos(a)*52}" y1="${70+Math.sin(a)*52}" x2="${255+Math.cos(a)*70}" y2="${70+Math.sin(a)*70}"/>`}).join('')+'</g>',
 hearts:'<g fill="#fff" opacity=".28"><path d="M250 120c-40-28-55-48-40-68 12-15 32-10 40 6 8-16 28-21 40-6 15 20 0 40-40 68z"/><path d="M300 60c-14-10-19-17-14-24 4-5 11-3 14 2 3-5 10-7 14-2 5 7 0 14-14 24z"/></g>',
 hills:'<path d="M140 180q60-90 120-40t90-30v70z" fill="#fff" opacity=".18"/><path d="M180 180q60-60 160-50v50z" fill="#fff" opacity=".18"/><circle cx="280" cy="50" r="22" fill="#fff" opacity=".3"/>',
 rings:'<g fill="none" stroke="#fff" opacity=".24" stroke-width="7"><circle cx="255" cy="90" r="22"/><circle cx="255" cy="90" r="44"/><circle cx="255" cy="90" r="66" stroke-dasharray="14 10"/></g>',
 notes:'<g fill="#fff" opacity=".3"><ellipse cx="220" cy="130" rx="18" ry="13" transform="rotate(-20 220 130)"/><rect x="232" y="40" width="7" height="88"/><path d="M239 40c25 8 40 22 30 50 0-18-12-26-30-28z"/><ellipse cx="285" cy="110" rx="13" ry="9" transform="rotate(-20 285 110)"/><rect x="293" y="50" width="5" height="58"/></g>',
 spikes:'<path d="M150 180l30-80 20 50 25-120 25 120 20-50 30 80z" fill="#fff" opacity=".22"/>',
 staff:'<g stroke="#fff" stroke-width="3" opacity=".24">'+[0,1,2,3,4].map(i=>`<line x1="150" y1="${50+i*16}" x2="330" y2="${50+i*16}"/>`).join('')+'</g><g fill="#fff" opacity=".34"><ellipse cx="200" cy="98" rx="10" ry="7"/><rect x="208" y="50" width="3" height="48"/><ellipse cx="245" cy="74" rx="10" ry="7"/><rect x="253" y="26" width="3" height="48"/><ellipse cx="290" cy="90" rx="10" ry="7"/><rect x="298" y="42" width="3" height="48"/></g>',
 film:'<g fill="#fff" opacity=".22"><rect x="190" y="30" width="120" height="120" rx="12"/></g><g fill="#000" opacity=".25">'+[0,1,2,3,4].map(i=>`<rect x="198" y="${40+i*22}" width="10" height="12" rx="2"/><rect x="292" y="${40+i*22}" width="10" height="12" rx="2"/>`).join('')+'</g><path d="M240 70l35 20-35 20z" fill="#fff" opacity=".45"/>',
 rays:'<g fill="#fff" opacity=".16">'+[...Array(7)].map((_,i)=>`<path d="M255 190L${170+i*30} -10h16z"/>`).join('')+'</g><circle cx="255" cy="190" r="40" fill="#fff" opacity=".25"/>',
 moon:'<path d="M270 30a55 55 0 1 0 40 95a45 45 0 1 1-40-95z" fill="#fff" opacity=".3"/><g fill="#fff" opacity=".4"><circle cx="200" cy="40" r="3"/><circle cx="185" cy="90" r="2"/><circle cx="215" cy="140" r="2.5"/></g>'
};
const cache={};
function art(name){const g=find(name);if(!g)return'';if(cache[g[0]])return cache[g[0]];
  const id='g'+g[1];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g[3]}"/><stop offset="1" stop-color="${g[4]}"/></linearGradient><radialGradient id="${id}s" cx=".1" cy=".95" r=".9"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><rect width="320" height="180" fill="url(#${id})"/>${M[g[5]]||''}<rect width="320" height="180" fill="url(#${id}s)"/></svg>`;
  return cache[g[0]]='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}

window.SGenres={list:G.map(g=>g[0]),find,art,dzId:n=>{const g=find(n);return g?g[1]:null},words:n=>{const g=find(n);return g?g[2]:String(n||'')},color:n=>{const g=find(n);return g?g[3]:'#888'}};
})();
