import {mkdir,writeFile}from'node:fs/promises';
const urls=['https://takatrp.github.io/tool-portal/','https://takatrp.github.io/shohizei-kazei-houshiki/'];
await mkdir(new URL('../output/reference/',import.meta.url),{recursive:true});
for(const url of urls){const r=await fetch(url,{signal:AbortSignal.timeout(12000)});console.log(url,r.status);if(!r.ok)continue;const html=await r.text(),slug=new URL(url).pathname.split('/').filter(Boolean)[0];await writeFile(new URL('../output/reference/'+slug+'.html',import.meta.url),html);
 let css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n');
 for(const m of [...html.matchAll(/<link\b[^>]*href=["']([^"']+\.css[^"']*)["'][^>]*>/gi)].slice(0,6)){const asset=new URL(m[1],url);if(asset.hostname!=='takatrp.github.io')continue;const cr=await fetch(asset,{signal:AbortSignal.timeout(12000)});if(cr.ok)css+='\n'+await cr.text();}
 await writeFile(new URL('../output/reference/'+slug+'.css',import.meta.url),css);
 const colors=Object.entries([...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].reduce((a,m)=>{a[m[0]]=(a[m[0]]??0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,18);
 console.log(JSON.stringify({title:html.match(/<title>(.*?)<\/title>/i)?.[1],colors,font:[...css.matchAll(/font-family\s*:[^;}]+/gi)].map(m=>m[0]).slice(0,8),cssStart:css.slice(0,9000)}));
}
