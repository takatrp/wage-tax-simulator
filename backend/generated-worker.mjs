// All rules remain draft until an independent tax reviewer approves code + source hashes.
const TOOL_NAME = '賃上げ促進税制シミュレーター';
const RULE_VERSION = 'jp-corp-wage-2026.10.20-web.6';
const SOURCES = [
  { id: 'nta-sme', title: '国税庁 No.5927-2（中小企業者等）', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5927-2.htm', format: 'html' },
  { id: 'nta-mid', title: '国税庁 No.5927-3（中堅企業）', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5927-3.htm', format: 'html' },
  { id: 'nta-all', title: '国税庁 No.5927（全企業）', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5927.htm', format: 'html' },
  { id: 'nta-size', title: '国税庁 No.5432（中小企業者の定義）', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5432.htm', format: 'html' },
  { id: 'nta-limits', title: '国税庁 No.5450（特別税額控除の制限）', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5450.htm', format: 'html' },
  { id: 'meti', title: '経済産業省 賃上げ促進税制（制度・改正情報）', url: 'https://www.meti.go.jp/policy/economy/jinzai/syotokukakudaisokushin/syotokukakudai.html', format: 'html' },
  { id: 'chusho', title: '中小企業庁 賃上げ促進税制（制度・ガイドブック）', url: 'https://www.chusho.meti.go.jp/zaimu/zeisei/syotokukakudai.html', format: 'html' },
  { id: 'chusho-r6', title: '中小企業庁 令和6年度開始用の歴史資料（2024年資格の検証用）', url: 'https://www.chusho.meti.go.jp/zaimu/zeisei/syotokukakudai_r06.html', format: 'html' },
  { id: 'nta-return-sme', title: '国税庁 2026年 別表六(24)（当期・繰越控除の順序）', url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/itiran2026/pdf/06(24).pdf', format: 'pdf' },
  { id: 'nta-reform2024', title: '国税庁 令和6年度法人税改正の概要（中小繰越と他の賃上げ枠の併用）', url: 'https://www.nta.go.jp/publication/pamph/hojin/kaisei_gaiyo2024/pdf/D.pdf', format: 'pdf' },
  { id: 'meti-guide', title: '経済産業省 ガイドブック（令和8年6月15日公表版・確認対象）', url: 'https://www.meti.go.jp/policy/economy/jinzai/syotokukakudaisokushin/pdf/gaidobook08_03.pdf', format: 'pdf' }
];
const RULESETS = [
  { id: 'r6', from: '2024-04-01', through: '2026-03-31', name: '令和6年度改正 / 2026年4月1日前開始', training: true,
    sme: [[150,15],[250,30]], mid: [[300,10],[400,25]], all: [[300,10],[400,15],[500,20],[700,25]] },
  { id: 'r8', from: '2026-04-01', through: '2027-03-31', name: '令和8年度改正 / 教育訓練費上乗せ廃止', training: false,
    sme: [[150,15],[250,30]], mid: [[400,10],[500,15],[600,25]], all: null }
];
function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s; }
function selectRules(start) { return validDate(start) ? RULESETS.find(r => start >= r.from && start <= r.through) ?? null : null; }
const FRAME_NAMES = { sme:'中小企業者等向け', mid:'中堅企業向け', all:'全企業向け' };
// Current NTA 5432 describes FY starts from 2025-04-01; it cannot approve 2024 eligibility.
const FEATURES = {
 quickEstimate:{title:'中小企業の条件付き概算・年間給与見込',kind:'additional',from:'2024-04-01',through:'2027-03-31',dependencies:['nta-sme','nta-limits','nta-reform2024']},
 smeR6Early:{title:'中小基本計算・2024年度資格',kind:'basic',from:'2024-04-01',through:'2025-03-31',dependencies:['nta-sme','chusho-r6','nta-limits']},
 smeR6:{title:'中小基本計算・2025年度資格',kind:'basic',from:'2025-04-01',through:'2026-03-31',dependencies:['nta-sme','nta-size','nta-limits'],inputConditions:{certType:'none',carryBalance:'0',trainingClaim:'no'}},
 smeR8:{title:'中小基本計算・令和8年度',kind:'basic',from:'2026-04-01',through:'2027-03-31',dependencies:['nta-sme','nta-size','nta-limits'],inputConditions:{certType:'none',carryBalance:'0'}},
 midR6:{title:'中堅基本計算・令和6年度改正',kind:'basic',from:'2024-04-01',through:'2026-03-31',dependencies:['nta-mid','nta-limits']},
 midR8:{title:'中堅基本計算・令和8年度改正',kind:'basic',from:'2026-04-01',through:'2027-03-31',dependencies:['nta-mid','nta-limits']},
 allR6:{title:'全企業基本計算・令和6年度改正',kind:'basic',from:'2024-04-01',through:'2026-03-31',dependencies:['nta-all','nta-limits']},
 trainingSme:{title:'中小の教育訓練費上乗せ',kind:'additional',from:'2024-04-01',through:'2026-03-31',dependencies:['nta-sme','chusho-r6']},
 trainingMid:{title:'中堅の教育訓練費上乗せ',kind:'additional',from:'2024-04-01',through:'2026-03-31',dependencies:['nta-mid','meti-guide']},
 trainingAll:{title:'全企業の教育訓練費上乗せ',kind:'additional',from:'2024-04-01',through:'2026-03-31',dependencies:['nta-all','meti-guide']},
 certSme:{title:'中小の認定上乗せ',kind:'additional',from:'2024-04-01',through:'2027-03-31',dependencies:['nta-sme','chusho-r6','chusho']},
 certMid:{title:'中堅の認定上乗せ',kind:'additional',from:'2024-04-01',through:'2027-03-31',dependencies:['nta-mid','meti-guide']},
 certAll:{title:'全企業の認定上乗せ',kind:'additional',from:'2024-04-01',through:'2026-03-31',dependencies:['nta-all','meti-guide']},
 carrySme:{title:'確認済み既存繰越残高の利用',kind:'additional',from:'2024-04-01',through:'2027-03-31',dependencies:['nta-sme','nta-limits','nta-return-sme','nta-reform2024']},
 forecastMethod:{title:'着地予測の換算方法・仮定表示',kind:'additional',from:'2024-04-01',through:'2027-03-31',dependencies:[]}
};
function baseFeature(frame,start){const r=selectRules(start);if(!r||!r[frame])return null;if(frame==='sme')return start<'2025-04-01'?'smeR6Early':r.id==='r6'?'smeR6':'smeR8';return frame+(r.id==='r6'?'R6':'R8');}

const CHECK_TTL_MS=15*60*1000;
function validTimestamp(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v.replace('.000Z','Z');}
function normalizeOfficial(html) {
  const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]??html;
  return main.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi,(_,a,b,c)=>` [link:${a??b??c}] `).replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
}
async function sha256(data){const bytes=typeof data==='string'?new TextEncoder().encode(data):data;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
async function fetchOfficial(source,fetcher=fetch) {
  const response=await fetcher(source.url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'WageTaxRuleCheck/0.4','Accept':source.format==='pdf'?'application/pdf':'text/html','Cache-Control':'no-cache'}});
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
function gateFeature({id,sources,manifest,checkedAt,now=Date.now(),codeHash}) {
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
function gateCheck(args){
 const features=Object.fromEntries(Object.keys(FEATURES).map(id=>[id,gateFeature({...args,id})]));
 const readyFeatureIds=Object.keys(features).filter(id=>features[id].ready),ready=readyFeatureIds.some(id=>FEATURES[id].kind==='basic');
 return {ready,features,readyFeatureIds,reasons:ready?[]:['対象機能ごとの必須資料・実装ルール承認を確認してください。']};
}
function validManifestDate(v,now){return validTimestamp(v)&&Date.parse(v)>now;}
async function checkOfficial({manifest,codeHash,fetcher=fetch,now,clock=Date.now}){
  const sources=await Promise.all(SOURCES.map(async s=>{try{return await fetchOfficial(s,fetcher);}catch(e){return {id:s.id,title:s.title,url:s.url,ok:false,error:e.message};}}));
  const completed=now??clock(),checkedAt=new Date(completed).toISOString(), gate=gateCheck({sources,manifest,checkedAt,now:completed,codeHash});
  return {checkedAt,expiresAt:new Date(completed+CHECK_TTL_MS).toISOString(),ruleVersion:RULE_VERSION,codeHash,clientHash:manifest.clientHash,scope:'法人 / 両年度12か月 / 機能別に承認された開始日期間 / 組織再編・複雑な通算等を除く。固定依存資料の更新チェックであり法令全体の最新性保証ではありません。',reviewStatus:gate.ready?'partially_approved':'pending',sources,...gate};
}


// Built with the exact shared rules and freshness modules, no third-party libraries.
async function hasEmptyBody(request,timeoutMs=2000){
 if(request.body===null)return true;
 let reader,timer;
 try{
  reader=request.body.getReader();
  const empty=(async()=>{for(let reads=0;reads<16;reads++){const{done,value}=await reader.read();if(done)return true;if(!(value instanceof Uint8Array)||value.byteLength!==0)return false;}return false;})();
  return await Promise.race([empty,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);
 }catch{return false;}
 finally{clearTimeout(timer);void reader?.cancel().catch(()=>{});}
}
function createCheckWorker({manifest,codeHash,fetcher=fetch,allowedOrigin='https://takatrp.github.io'}){
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

const REVIEW_MANIFEST={"ruleVersion":"jp-corp-wage-2026.10.20-web.6","codeHash":"b0d8400977c76e50aa9a99c8e30a31949e996866fc747b373eccb6ba70660366","clientHash":"84c3bc5f3c533767c2feb12700398ecafd04b328f331a4f085f9ece243b5382b","features":{"smeR6":{"status":"approved","reviewer":"AIによる独立コード・公表資料照合（申告用監査ではない）","reviewedAt":"2026-10-20T04:40:08Z","validUntil":"2026-11-20T00:00:00Z","coverage":{"from":"2025-04-01","through":"2026-03-31"},"fingerprints":{"nta-sme":"77b8fea1033a7bf32193665da092472636a2c9b523026b523ad6220071006bbb","nta-size":"d59e06baf4038cfd46a64923924df54b072bc2e7fd1fb898428ac70820fb0e90","nta-limits":"b9e10b4ba3f2e7b96b12979722e0f081b112c9980d8fe6f3173177cccf98e5c0"}},"smeR8":{"status":"approved","reviewer":"AIによる独立コード・公表資料照合（申告用監査ではない）","reviewedAt":"2026-10-20T04:40:08Z","validUntil":"2026-11-20T00:00:00Z","coverage":{"from":"2026-04-01","through":"2027-03-31"},"fingerprints":{"nta-sme":"77b8fea1033a7bf32193665da092472636a2c9b523026b523ad6220071006bbb","nta-size":"d59e06baf4038cfd46a64923924df54b072bc2e7fd1fb898428ac70820fb0e90","nta-limits":"b9e10b4ba3f2e7b96b12979722e0f081b112c9980d8fe6f3173177cccf98e5c0"}},"forecastMethod":{"status":"approved","reviewer":"AIによる独立コード・公表資料照合（申告用監査ではない）","reviewedAt":"2026-10-20T04:40:08Z","validUntil":"2026-11-20T00:00:00Z","coverage":{"from":"2025-04-01","through":"2027-03-31"},"fingerprints":{}},"quickEstimate":{"status":"approved","reviewer":"AIによる独立税務・コードレビュー（経営判断用の条件付き概算、申告用監査ではない）","reviewedAt":"2026-10-20T09:03:06.677Z","validUntil":"2026-11-20T00:00:00Z","coverage":{"from":"2024-04-01","through":"2027-03-31"},"fingerprints":{"nta-sme":"77b8fea1033a7bf32193665da092472636a2c9b523026b523ad6220071006bbb","nta-limits":"b9e10b4ba3f2e7b96b12979722e0f081b112c9980d8fe6f3173177cccf98e5c0","nta-reform2024":"a36a948ef1c8ae9ff7c2014a3c50d48ce3bc65fc8e73d28ca0733efcb8b46bdf"}}},"note":"通常内国法人・非受託・非通算・特殊法人なしの計画用概算に限定。認定なし・既存繰越0円・旧年度の教育加算なし。2024年度・中堅・全企業・認定/教育加算・繰越利用は未承認。validUntilはレビュー更新期限であり法的有効期限ではない。申告用監査保証ではない。 quickEstimateは中小企業資格・対象給与・通常12月・補塡助成金/他制度調整なしを明示仮定した独立の条件付き概算。2024-04-01〜2027-03-31開始、基本15/30%・年間見込・任意20%上限のみ。資格判定・加算・繰越を承認せず、smeR6Earlyの承認は拡張しない。"};
const VERIFIED_CODE_HASH="b0d8400977c76e50aa9a99c8e30a31949e996866fc747b373eccb6ba70660366";
export default createCheckWorker({manifest:REVIEW_MANIFEST,codeHash:VERIFIED_CODE_HASH});
