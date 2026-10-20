import { SOURCES, RULE_VERSION, FEATURES, validDate } from '../public/rules.mjs';
export const CHECK_TTL_MS=15*60*1000;
export function validTimestamp(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v.replace('.000Z','Z');}
export function normalizeOfficial(html) {
  const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]??html;
  return main.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi,(_,a,b,c)=>` [link:${a??b??c}] `).replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
}
export async function sha256(data){const bytes=typeof data==='string'?new TextEncoder().encode(data):data;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function fetchOfficial(source,fetcher=fetch) {
  const response=await fetcher(source.url,{redirect:'error',cache:'no-store',cf:{cacheTtl:0,cacheEverything:false},signal:AbortSignal.timeout(8000),headers:{'User-Agent':'WageTaxRuleCheck/0.4','Accept':source.format==='pdf'?'application/pdf':'text/html','Cache-Control':'no-cache'}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const contentType=response.headers.get('content-type')??'';
  if(!contentType.includes(source.format==='pdf'?'application/pdf':'text/html'))throw new Error('想定外のContent-Type');
  const chunks=[];let size=0;
  if(!response.body)throw new Error('本文なし');
  for await(const chunk of response.body){size+=chunk.byteLength;if(size>8*1024*1024)throw new Error('本文サイズ上限超過');chunks.push(chunk);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let normalized;
  if(source.format==='pdf'){
    if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new Error('PDF形式を確認できない');normalized=bytes;
  }else{
    normalized=normalizeOfficial(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    const required=source.id==='nta-size'?'中小企業者':source.id==='nta-limits'?'税額控除':'賃上げ';
    if(normalized.length<300||!normalized.includes(required))throw new Error('公式制度本文を確認できない');
  }
  return {id:source.id,title:source.title,url:source.url,ok:true,hash:await sha256(normalized),bytes:bytes.length,normalization:source.format==='pdf'?'pdf-bytes-v1':'html-main-text-v1'};
}
export function gateFeature({id,sources,manifest,checkedAt,now=Date.now(),codeHash}) {
  const reasons=[];
  const definition=FEATURES[id],review=manifest.features?.[id]??{};
  if(!definition)return {ready:false,reasons:['未知の機能']};
  const checked=Date.parse(checkedAt);
  if(!validTimestamp(checkedAt)||checked>now+5000||now-checked>=CHECK_TTL_MS)reasons.push('公式確認の期限切れ・日時不正');
  const required=definition.dependencies.map(dep=>SOURCES.find(s=>s.id===dep));
  if(required.some(s=>!s||!sources.some(r=>r.id===s.id&&r.url===s.url&&r.ok)))reasons.push('この機能の必須公式資料が未取得・取得失敗');
  if(review.status!=='approved'||!validTimestamp(review.reviewedAt)||Date.parse(review.reviewedAt)>now||typeof review.reviewer!=='string'||!review.reviewer.trim())reasons.push('この機能の税務ルールは独立レビュー待ち');
  if(manifest.ruleVersion!==RULE_VERSION||manifest.codeHash!==codeHash)reasons.push('実装ルールと検証済み成果物の版・コードが不一致');
  if(!validManifestDate(review.validUntil,now)||Date.parse(review.validUntil)<Date.parse(review.reviewedAt))reasons.push('レビュー済みルールの有効期限切れ・未設定');
  const coverage=review.coverage;
  if(!coverage||!validDate(coverage.from)||!validDate(coverage.through)||coverage.from<definition.from||coverage.through>definition.through||coverage.from>coverage.through)reasons.push('レビューの適用開始日範囲が未設定・範囲外');
  for(const s of sources.filter(s=>s.ok&&definition.dependencies.includes(s.id))){
    if(!review.fingerprints?.[s.id])reasons.push(`${s.id}：レビュー済み本文指紋なし`);
    else if(review.fingerprints[s.id]!==s.hash)reasons.push(`${s.id}：公式情報変更の疑い・再レビュー待ち`);
  }
  return {ready:reasons.length===0,reasons,title:definition.title,kind:definition.kind,dependencies:definition.dependencies,coverage:coverage??null,reviewStatus:review.status??'pending',reviewer:review.reviewer??null,reviewedAt:review.reviewedAt??null,validUntil:review.validUntil??null};
}
export function gateCheck(args){
 const features=Object.fromEntries(Object.keys(FEATURES).map(id=>[id,gateFeature({...args,id})]));
 const readyFeatureIds=Object.keys(features).filter(id=>features[id].ready),ready=readyFeatureIds.some(id=>FEATURES[id].kind==='basic');
 return {ready,features,readyFeatureIds,reasons:ready?[]:['対象機能ごとの必須資料・実装ルール承認を確認してください。']};
}
function validManifestDate(v,now){return validTimestamp(v)&&Date.parse(v)>now;}
export async function checkOfficial({manifest,codeHash,fetcher=fetch,now,clock=Date.now}){
  const sources=await Promise.all(SOURCES.map(async s=>{try{return await fetchOfficial(s,fetcher);}catch(e){return {id:s.id,title:s.title,url:s.url,ok:false,error:e.message};}}));
  const completed=now??clock(),checkedAt=new Date(completed).toISOString(), gate=gateCheck({sources,manifest,checkedAt,now:completed,codeHash});
  return {checkedAt,expiresAt:new Date(completed+CHECK_TTL_MS).toISOString(),ruleVersion:RULE_VERSION,codeHash,clientHash:manifest.clientHash,scope:'法人 / 両年度12か月 / 機能別に承認された開始日期間 / 組織再編・複雑な通算等を除く。固定依存資料の更新チェックであり法令全体の最新性保証ではありません。',reviewStatus:gate.ready?'partially_approved':'pending',sources,...gate};
}

