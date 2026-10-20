import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {codeFingerprint,clientFingerprint} from '../server.mjs';
import {CLIENT_SOURCE_FILES,canonicalSource,sourceDigest} from '../public/integrity.mjs';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export async function stagePublicRelease({sourceDir,outputDir,codeHash,clientHash}){
  if(!/^[a-f0-9]{64}$/.test(codeHash)||!/^[a-f0-9]{64}$/.test(clientHash))throw new Error('公開用の承認指紋が不正です。');
  const files=(await readdir(sourceDir)).filter(f=>/\.(html|css|mjs)$/.test(f)).sort();
  if(files.some(f=>!CLIENT_SOURCE_FILES.includes(f)&&f!=='build-info.mjs')||CLIENT_SOURCE_FILES.some(f=>!files.includes(f)))throw new Error('画面指紋の対象ファイルを見直してください。');
  const sourcePath=name=>sourceDir instanceof URL?new URL(name,sourceDir):path.join(sourceDir,name);
  const sources=await Promise.all(CLIENT_SOURCE_FILES.map(f=>readFile(sourcePath(f),'utf8')));
  if(await sourceDigest(CLIENT_SOURCE_FILES,sources)!==clientHash)throw new Error('公開直前の画面ソースが承認指紋と一致しません。');
  const buildInfo=`// Derived metadata, excluded from source digests to avoid circular hashes.\nexport const EXPECTED_CODE_HASH='${codeHash}';\nexport const EXPECTED_CLIENT_HASH='${clientHash}';\n`;
  // Full code digest includes the client and both build scripts. It also
  // versions build-info when only backend code changes. Relative ESM imports
  // stay inside this immutable release, preventing mixed cached modules.
  const prefix=`./releases/${codeHash}/`,releaseDir=path.join(outputDir,'releases',codeHash);
  const artifacts=new Map(CLIENT_SOURCE_FILES.map((f,i)=>[f,canonicalSource(sources[i])]));
  artifacts.set('build-info.mjs',buildInfo);
  for(const[file,body]of artifacts){try{if(await readFile(path.join(releaseDir,file),'utf8')!==body)throw new Error('既存の公開版を書き換える操作を停止しました。新しい版で公開してください。');}catch(e){if(e.code!=='ENOENT')throw e;}}
  await mkdir(releaseDir,{recursive:true});
  for(const[file,body]of artifacts)await writeFile(path.join(releaseDir,file),body);
  const original=artifacts.get('index.html');
  const entry=original.replace(/(href|src)="\.\/([^"/]+\.(?:css|mjs))"/g,(_m,attr,name)=>`${attr}="${prefix}${name}"`);
  if(entry===original||/(?:href|src)="\.\/[^"/]+\.(?:css|mjs)"/.test(entry))throw new Error('入口HTMLの版固定に失敗しました。');
  await writeFile(path.join(outputDir,'index.html'),entry);
  await writeFile(path.join(outputDir,'.nojekyll'),'');
  return{path:outputDir,releasePath:`releases/${codeHash}/`,codeHash,clientHash,personalDataIncluded:false};
}

async function main(){
  const manifest=JSON.parse(await readFile(path.join(projectRoot,'review-manifest.json'),'utf8'));
  const codeHash=await codeFingerprint(),clientHash=await clientFingerprint();
  if(manifest.codeHash!==codeHash||manifest.clientHash!==clientHash)throw new Error('承認した最終コード・画面と一致しません。公開物を生成せず停止します。');
  const result=await stagePublicRelease({sourceDir:path.join(projectRoot,'public'),outputDir:path.join(projectRoot,'docs'),codeHash,clientHash});
  await writeFile(path.join(projectRoot,'public','build-info.mjs'),await readFile(path.join(projectRoot,'docs',result.releasePath,'build-info.mjs')));
  console.log(JSON.stringify(result));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
