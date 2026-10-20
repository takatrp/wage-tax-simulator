import{readFile,writeFile,mkdir}from'node:fs/promises';import{codeFingerprint}from'../server.mjs';import{fileURLToPath}from'node:url';import path from'node:path';
const root=new URL('../',import.meta.url),manifest=JSON.parse(await readFile(new URL('review-manifest.json',root),'utf8')),codeHash=await codeFingerprint();
if(manifest.codeHash!==codeHash)throw new Error('承認したコード指紋が一致しないためWorker生成を停止します。');
const strip=s=>s.replace(/^import[^\n]+\n/gm,'').replace(/\bexport /g,'');
const sources=await Promise.all(['public/rules.mjs','lib/freshness.mjs','backend/worker.template.mjs'].map(async f=>strip(await readFile(new URL(f,root),'utf8'))));
const worker=sources.join('\n')+'\nconst REVIEW_MANIFEST='+JSON.stringify(manifest)+';\nconst VERIFIED_CODE_HASH='+JSON.stringify(codeHash)+';\nexport default createCheckWorker({manifest:REVIEW_MANIFEST,codeHash:VERIFIED_CODE_HASH});\n';
await writeFile(new URL('backend/generated-worker.mjs',root),worker);
if(process.argv[2]){const destination=path.resolve(process.argv[2]);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,worker);}
console.log(JSON.stringify({codeHash,workerBytes:Buffer.byteLength(worker),source:'shared rules + freshness + worker template',output:process.argv[2]??fileURLToPath(new URL('backend/generated-worker.mjs',root))}));
