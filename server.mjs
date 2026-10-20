import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkOfficial, sha256 } from './lib/freshness.mjs';
import {CLIENT_SOURCE_FILES,sourceDigest}from'./public/integrity.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
export const FINGERPRINT_FILES=[...CLIENT_SOURCE_FILES.map(f=>'public/'+f),'lib/freshness.mjs','backend/worker.template.mjs','scripts/build-public.mjs','scripts/build-worker.mjs','server.mjs'];
export async function codeFingerprint(read=readFile){return sourceDigest(FINGERPRINT_FILES,(await Promise.all(FINGERPRINT_FILES.map(f=>read(path.join(root,f))))).map(b=>b.toString()));}
export async function clientFingerprint(){return sourceDigest(CLIENT_SOURCE_FILES,(await Promise.all(CLIENT_SOURCE_FILES.map(f=>readFile(path.join(root,'public',f),'utf8')))));}
export function createServer({fetcher=fetch,allowedHosts=['localhost','127.0.0.1','[::1]'],allowedOrigins=[]}={}){
  let inflight=null;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':mime['.json']});res.end(JSON.stringify(data));};
    try{
      let requestAuthority;try{requestAuthority=new URL('http://'+req.headers.host);}catch{return json(403,{error:'Host is not allowed'});}
      if(requestAuthority.username||requestAuthority.password||requestAuthority.pathname!=='/'||!allowedHosts.includes(requestAuthority.hostname))return json(403,{error:'Host is not allowed'});
      const origin=req.headers.origin;
      const port=server.address()?.port;
      const localOrigins=['localhost','127.0.0.1','[::1]'].flatMap(host=>[`http://${host}:${port}`]);
      if(origin&&!new Set([...localOrigins,...allowedOrigins]).has(origin))return json(403,{error:'Origin is not allowed'});
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/api/check'){
        if(req.method!=='POST'||url.search||req.headers['transfer-encoding']||Number(req.headers['content-length']??0)!==0){req.resume();return json(400,{error:'このAPIは空のPOSTのみ受け付けます。給与・社名・任意URLは受信しません。'});}
        if(inflight)return json(429,{error:'公式情報確認中です。完了後に再試行してください。'});
        inflight=(async()=>{const manifest=JSON.parse(await readFile(path.join(root,'review-manifest.json'),'utf8'));return checkOfficial({manifest,codeHash:await codeFingerprint(),fetcher});})();
        try{return json(200,{...(await inflight),checkId:randomUUID()});}finally{inflight=null;}
      }
      if(req.method!=='GET'&&req.method!=='HEAD'){req.resume();return json(405,{error:'method not allowed'});}
      const pathname=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
      if(!/^[a-zA-Z0-9._/-]+$/.test(pathname)||pathname.split('/').some(x=>x.startsWith('.'))||!mime[path.extname(pathname)])return json(404,{error:'not found'});
      const target=path.resolve(root,'public',pathname);
      if(!target.startsWith(path.join(root,'public')+path.sep))return json(404,{error:'not found'});
      const data=await readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]});res.end(req.method==='HEAD'?undefined:data);
    }catch(e){json(e.code==='ENOENT'?404:500,{error:e.code==='ENOENT'?'not found':'処理に失敗しました。結果は確定できません。'});}
  });
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT??4173),host=process.env.HOST??'127.0.0.1';
  createServer().listen(port,host,()=>console.log(`賃上げ促進税制シミュレーター: http://${host}:${port} （計画用・機能別照合）`));
}
