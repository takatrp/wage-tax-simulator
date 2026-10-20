import{checkOfficial}from'../lib/freshness.mjs';
import{RULE_VERSION}from'../public/rules.mjs';
// Built with the exact shared rules and freshness modules, no third-party libraries.
export async function hasEmptyBody(request,timeoutMs=2000){
 if(request.body===null)return true;
 let reader,timer;
 try{
  reader=request.body.getReader();
  const empty=(async()=>{for(let reads=0;reads<16;reads++){const{done,value}=await reader.read();if(done)return true;if(!(value instanceof Uint8Array)||value.byteLength!==0)return false;}return false;})();
  return await Promise.race([empty,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);
 }catch{return false;}
 finally{clearTimeout(timer);void reader?.cancel().catch(()=>{});}
}
export function createCheckWorker({manifest,codeHash,fetcher=fetch,allowedOrigin='https://takatrp.github.io'}){
 let inflight=false;
 return{async fetch(request){
  const url=new URL(request.url),origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Vary':'Origin','Referrer-Policy':'no-referrer'};
  if(origin===allowedOrigin)headers['Access-Control-Allow-Origin']=origin;
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
  if(url.pathname==='/health'&&request.method==='GET'&&!url.search)return reply(200,{service:'official-rule-check-only',ruleVersion:RULE_VERSION,codeHash,payrollAccepted:false});
  if(url.pathname!=='/api/check'||url.search)return reply(404,{error:'not found'});
  if(origin!==allowedOrigin)return reply(403,{error:'Origin is not allowed'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Cache-Control, Content-Type','Access-Control-Max-Age':'0'}});
  if(request.method!=='POST'||Number(request.headers.get('content-length')??0)!==0||request.headers.has('transfer-encoding')||!await hasEmptyBody(request))return reply(400,{error:'Empty POST only. Payroll, company information, files and arbitrary URLs are not accepted.'});
  if(inflight)return reply(429,{error:'確認中です。完了後に再試行してください。'});
  inflight=true;
  try{return reply(200,{...await checkOfficial({manifest,codeHash,fetcher}),checkId:crypto.randomUUID()});}
  catch{return reply(503,{ready:false,error:'公式取得に失敗しました。計算を停止してください。'});}
  finally{inflight=false;}
 }};
}
