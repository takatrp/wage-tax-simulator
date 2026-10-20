import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {CHECK_SERVICE_ORIGIN} from '../public/config.mjs';
import {CLIENT_SOURCE_FILES,sourceDigest} from '../public/integrity.mjs';
import {RULE_VERSION} from '../public/rules.mjs';
const root=new URL('../',import.meta.url),manifest=JSON.parse(await readFile(new URL('review-manifest.json',root),'utf8'));
const origin='https://takatrp.github.io',pages=origin+'/wage-tax-simulator/';
await mkdir(new URL('output/',root),{recursive:true});
if(process.argv.includes('--pages')){
  const r=await fetch(pages,{cache:'no-store'});assert.equal(r.status,200);
  const html=await r.text(),src=html.match(/src="(\.\/releases\/[a-f0-9]{64}\/app\.mjs)"/)?.[1];
  assert.equal(src,`./releases/${manifest.codeHash}/app.mjs`);
  const base=new URL('.',new URL(src,pages)),types={};
  const texts=await Promise.all(CLIENT_SOURCE_FILES.map(async name=>{const s=await fetch(new URL(name,base),{cache:'no-store'});assert.equal(s.status,200,name);types[name]=s.headers.get('content-type');if(name.endsWith('.mjs'))assert.match(types[name],/javascript/);return s.text();}));
  assert.equal(await sourceDigest(CLIENT_SOURCE_FILES,texts),manifest.clientHash);
  const info=await(await fetch(new URL('build-info.mjs',base),{cache:'no-store'})).text();assert(info.includes(manifest.codeHash)&&info.includes(manifest.clientHash));
  const result={checkedAt:new Date().toISOString(),pages,codeHash:manifest.codeHash,clientHash:manifest.clientHash,releaseURL:base.href,sourceCount:texts.length,types,passed:true};
  await writeFile(new URL('output/live-pages.json',root),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}else{
  const health=await fetch(CHECK_SERVICE_ORIGIN+'/health',{cache:'no-store'});assert.equal(health.status,200);const h=await health.json();assert.equal(h.codeHash,manifest.codeHash);assert.equal(h.ruleVersion,RULE_VERSION);assert.equal(h.payrollAccepted,false);
  const opts=await fetch(CHECK_SERVICE_ORIGIN+'/api/check',{method:'OPTIONS',headers:{Origin:origin}});assert.equal(opts.status,204);assert.equal(opts.headers.get('access-control-allow-origin'),origin);assert.equal(opts.headers.get('access-control-allow-credentials'),null);
  const checks=[];
  for(let i=0;i<2;i++){
    const r=await fetch(CHECK_SERVICE_ORIGIN+'/api/check',{method:'POST',headers:{Origin:origin},cache:'no-store',signal:AbortSignal.timeout(20000)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));
    assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.match(r.headers.get('cache-control'),/no-store/);
    checks.push(data);assert.equal(data.codeHash,manifest.codeHash);assert.equal(data.clientHash,manifest.clientHash);assert.equal(data.ruleVersion,RULE_VERSION);
  }
  assert.notEqual(checks[0].checkId,checks[1].checkId);assert.notEqual(checks[0].checkedAt,checks[1].checkedAt);
  const denied=[];
  for(const[path,options,status]of[
    ['/api/check',{method:'POST',headers:{Origin:'https://invalid.example'}},403],
    ['/api/check',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{"testOnly":true}'},400],
    ['/api/check?url=https://invalid.example',{method:'POST',headers:{Origin:origin}},404]
  ]){const r=await fetch(CHECK_SERVICE_ORIGIN+path,options);denied.push({path,status:r.status});assert.equal(r.status,status);}
  const result={checkedAt:new Date().toISOString(),api:CHECK_SERVICE_ORIGIN,health:h,corsOrigin:origin,credentials:false,checks,denied};
  await writeFile(new URL('output/live-api.json',root),JSON.stringify(result,null,2));
  console.log(JSON.stringify({api:result.api,checks:checks.map(c=>({checkId:c.checkId,checkedAt:c.checkedAt,ready:c.ready,readyFeatureIds:c.readyFeatureIds,sources:c.sources.map(s=>({id:s.id,ok:s.ok,error:s.error}))})),denied}));
  for(const c of checks)assert.deepEqual(c.readyFeatureIds.sort(),['forecastMethod','smeR6','smeR8']);
}
