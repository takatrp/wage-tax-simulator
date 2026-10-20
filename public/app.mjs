import { TOOL_NAME, RULE_VERSION, SOURCES, FEATURES, FRAME_NAMES, baseFeature, selectRules } from './rules.mjs';
import { certification } from './calc.mjs';
import { GROUPS,FIELDS,CERTS,initialInput,mergeCsvInput } from './fields.mjs';
import {featureState,requiredFeatures,caseScopeIssues,receiptMatchesBuild} from './verification.mjs';
import {createCalculationHandler} from './workflow.mjs';
import {checkEndpoint} from './config.mjs';
import {EXPECTED_CODE_HASH,EXPECTED_CLIENT_HASH} from './build-info.mjs';
import {verifyPublicSources}from'./integrity.mjs';
import {calculateCase} from './case.mjs';
import {newCase,saveCase,restoreCase,validInputMethod} from './entry.mjs';
import {mountFxImport} from './fx-ui.mjs';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=v=>new Intl.NumberFormat('ja-JP').format(BigInt(v??'0'));
let checkClock=null;
const entry=newCase();
let input=entry.input,inputMethod=entry.inputMethod,check=null,result=null,checking=false,resultInput=null;
function notify(message,error=false){$('#notice').hidden=false;$('#notice').className='notice'+(error?' error':'');$('#notice').textContent=message;}
function tab(name){$$('.nav').forEach(n=>{n.classList.toggle('active',n.dataset.tab===name);n.setAttribute('aria-current',n.dataset.tab===name?'page':'false');});for(const n of ['input','csv','result','sources'])$('#'+n+'Panel').hidden=n!==name;window.scrollTo(0,0);}
$$('.nav').forEach(n=>n.addEventListener('click',()=>tab(n.dataset.tab)));
function renderInputMethod(){$('#inputMethod').value=inputMethod;}
$('#inputMethod').addEventListener('change',e=>{inputMethod=validInputMethod(e.target.value);tab(inputMethod==='csv'?'csv':'input');});
$('#manualEntry').addEventListener('click',()=>{inputMethod='manual';renderInputMethod();tab('input');});
$('#resetInput').addEventListener('click',()=>{if(!window.confirm('現在の画面入力をリセットします。端末に保存した入力は残ります。'))return;const next=newCase();input=next.input;inputMethod=next.inputMethod;fxImporter.reset();invalidate();renderForm();renderInputMethod();tab(next.view);notify('新しいCSVから開始できます。保存済み入力は削除していません。');});
function fieldLabel(key,label){if(input.mode!=='forecast')return label;return ({grossCurrent:'当期給与累計（賞与分離なら通常給与のみ・円）',grossPrevious:'前期通年 全国内雇用者給与総額（円）',reimburseCurrent:'当期 通常補塡額の年末見込（円）',subsidyCurrent:'当期 雇用安定助成金の年末見込（円）',corporateTax:'調整前法人税額の年末見込（円）',continuousCurrent:'当期 継続雇用者給与の通年見込（補塡控除後・円）',continuousPrevious:'前期通年 継続雇用者給与（補塡控除後・円）',trainingCurrent:'当期 教育費の年末見込（補助金控除後・円）',continuousReviewed:'既知の対象者条件・集計を確認済み（全期間要件は上記の仮定と別）'})[key]??label;}
function fieldHtml([key,label,type]){
 label=fieldLabel(key,label);
 let control;
 if(type==='tri'||type==='cert'||type==='mode'){const opts=type==='mode'?[['actual','通年実績モード'],['forecast','着地予測モード（期中CSV）']]:type==='tri'?[['unknown','未確認'],['yes','はい'],['no','いいえ']]:CERTS;control=`<select id="f-${key}" data-field="${key}" class="${input[key]==='unknown'?'unknown':''}">${opts.map(([v,t])=>`<option value="${v}" ${input[key]===v?'selected':''}>${t}</option>`).join('')}</select>`;}
 else control=`<input id="f-${key}" data-field="${key}" type="${type==='date'?'date':'text'}" ${type==='money'?'inputmode="numeric" autocomplete="off" placeholder="未入力"':''} maxlength="500" value="${esc(input[key])}">`;
 return `<label class="field" for="f-${key}">${label}${control}</label>`;
}
function renderForm(){
 $('#inputForm').innerHTML=GROUPS.filter(g=>!g.forecast||input.mode==='forecast').map((g,i)=>`<section class="card"><div class="card-heading"><span class="step-num">${String(i+1).padStart(2,'0')}</span><div><h3>${g.title}</h3><p>${g.hint}</p></div></div><div class="fields">${g.fields.map(fieldHtml).join('')}</div>${g.title==='法人の適用資格'?'<p>大規模法人1社の所有50%以上、複数で2/3以上等の除外・みなし大企業等を含めて税理士が確認してください。資本金・人数だけの自動認定はしません。</p>':''}</section>`).join('');
 $$('[data-field]').forEach(el=>el.addEventListener('input',()=>{input[el.dataset.field]=el.value;el.classList.toggle('unknown',el.value==='unknown');invalidate();updateRule();renderFreshness();if(el.dataset.field==='mode'){fxImporter.reset();renderForm();}}));updateRule();
}
function updateRule(){const r=selectRules(input.start);$('.scope-note').textContent=input.mode==='forecast'?'年間見込・確定判定ではない。期中の通常給与累計を換算し、賞与・残月給与・補正を別に計算します。前期は通年実績。全期間要件は期中には確定しません。':'標準対応：両年度12か月、組織再編なし。短期決算・複雑な通算・90%総額制限が関係する場合は計算を停止します。';$('#ruleLabel').textContent=r?`${input.start} 開始 → ${r.name}`:'未対応の開始日：新規控除の計算を停止';}
function invalidate(){result=null;resultInput=null;$('#print').disabled=true;$('#results').innerHTML='<div class="empty"><span>∑</span><h3>入力が更新されました</h3><p>公式情報を確認して再試算してください。</p></div>';$('#printArea').innerHTML='';}
function clockState(){return {...(checkClock??{}),nowWall:Date.now(),nowMono:performance.now()};}
function featureStatus(id,start=input.start){return featureState(check,id,start,clockState());}
function authorizations(data=input){
 const allowedFrames=[],blockedFrames=[];
 for(const frame of ['sme','mid','all']){
  const ids=requiredFeatures(data,frame,certification(data,frame)==='yes');
  if(!ids.length)continue;
  const reasons=ids.map(id=>({id,...featureStatus(id,data.start)})).filter(x=>!x.ready).map(x=>FEATURES[x.id].title+'：'+x.reason);
  reasons.push(...caseScopeIssues(data,frame));
  if(reasons.length)blockedFrames.push({frame,reasons});else allowedFrames.push(frame);
 }
 return {allowedFrames,blockedFrames,issues:blockedFrames.flatMap(f=>f.reasons)};
}
function freshNow(){return authorizations().allowedFrames.length>0;}
function resultStillAuthorized(){return !!result&&!!resultInput&&result.frames.length>0&&result.frames.every(f=>authorizations(resultInput).allowedFrames.includes(f.frame));}
function renderFreshness(){
 const baseIds=['sme','mid','all'].map(f=>baseFeature(f,input.start)).filter(Boolean);
 const readyIds=baseIds.filter(id=>featureStatus(id).ready);
 const authorized=authorizations();
 $('#freshTitle').textContent=checking?'公式情報を確認しています':readyIds.length?('基本計算 '+readyIds.length+'/'+baseIds.length+'機能の限定照合済み（上乗せ・繰越は別確認）'):'要確認 — 通常の計算結果・印刷を停止しています';
 $('#freshSummary').textContent=checking?'機能ごとの固定公式出典を確認しています。給与・社名は送信しません。':check?check.sources.filter(s=>s.ok).length+'/'+SOURCES.length+'資料取得。法令全体の最新性保証ではありません。'+(authorized.allowedFrames.length?'確認済み機能だけを計算できます。':'対象機能の公式取得・ルール承認がそろうまで金額を表示しません。'):'確認APIへ接続できません。古い結果を含めて計算・印刷を停止します。';
 $('#freshMeta').textContent='公式取得試行日時：'+(check?.checkedAt??'未確認')+' / 取得確認期限：'+(check?.expiresAt??'未設定')+' / ルール：'+RULE_VERSION;
 $('.freshness').classList.toggle('ready',authorized.allowedFrames.length>0);$('#recheck').disabled=checking;$('#calculate').disabled=checking;
 $('#footerVersion').textContent=RULE_VERSION;
 $('#reviewDetails').innerHTML=[['実装ルール版',RULE_VERSION],['適用範囲',check?.scope??'法人・両年度12か月。機能ごとの承認期間のみ。'],['対象事業年度',input.start+'〜'+input.end],['公式取得試行日時',check?.checkedAt??'未確認'],['公式取得確認期限',check?.expiresAt??'未設定']].map(([a,b])=>'<dt>'+esc(a)+'</dt><dd>'+esc(b)+'</dd>').join('')+'<table><thead><tr><th>機能・依存資料</th><th>限定照合と承認範囲</th></tr></thead><tbody>'+Object.entries(FEATURES).map(([id,d])=>{const r=check?.features?.[id],state=featureStatus(id);return '<tr><td>'+esc(d.title)+'<br><small>'+esc(d.dependencies.join(', '))+'</small></td><td>'+esc(state.ready?'限定照合済み':state.reason)+'<br>担当 '+esc(r?.reviewer??'未設定')+' / '+esc(r?.reviewedAt??'未設定')+'<br>レビュー更新期限（法的期限ではない） '+esc(r?.validUntil??'未設定')+'<br>開始日期間 '+esc(r?.coverage? r.coverage.from+'〜'+r.coverage.through:'未承認')+'</td></tr>';}).join('')+'</tbody></table>';
 $('#sourceList').innerHTML=SOURCES.map(s=>{const r=check?.sources.find(x=>x.id===s.id);return '<article class="source"><a href="'+s.url+'" target="_blank" rel="noopener noreferrer">'+s.title+' ↗</a><span class="badge">'+(r?.ok?'取得成功 / 機能承認は別判定':'未取得・失敗')+'</span><small>'+s.url+'<br>今回のSHA-256：'+(r?.hash??'取得なし')+'<br>比較方式：'+(r?.normalization??'未確認')+'</small><p>'+esc(r?.error??'この資料を依存先とする機能のみで照合します。')+'</p></article>';}).join('');
}

async function refresh(){
 if(checking)return false;checking=true;check=null;checkClock=null;renderFreshness();
 try{const r=await fetch(checkEndpoint(),{method:'POST',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`公式確認API HTTP ${r.status}`);const data=await r.json();if(!Array.isArray(data.sources)||!data.features||data.ruleVersion!==RULE_VERSION||!receiptMatchesBuild(data,EXPECTED_CODE_HASH,EXPECTED_CLIENT_HASH)||!Number.isFinite(Date.parse(data.expiresAt))||!Array.isArray(data.reasons))throw new Error('確認APIの応答形式・ルール版が不正です。');await verifyPublicSources(EXPECTED_CLIENT_HASH);check=data;checkClock={receivedWall:Date.now(),receivedMono:performance.now()};}
 catch(e){notify(`公式情報を確認できませんでした。${e.message}。通常の計算結果と印刷を停止します。`,true);}
 finally{checking=false;renderFreshness();}return freshNow();
}
function pct(f){if(BigInt(f.previous)===0n)return '算定不可（比較0）';return `${(Number((BigInt(f.current)-BigInt(f.previous))*1000000n/BigInt(f.previous))/10000).toFixed(4)}%`;}
function renderResult(){
 if(!result)return;if(!resultStillAuthorized()){invalidate();notify('公式確認または機能レビューの期限が切れたため、結果と印刷を無効にしました。',true);return;}
 const readiness='表示している枠は必要機能の限定照合済みです。申告書・証憑・法令全体の最終確認を保証しません。';
 const blocked=(result.blockedFrames??[]).map(f=>FRAME_NAMES[f.frame]+'：'+f.reasons.join(' / '));
 const projection=result.forecast?'<div class="result-warning"><strong>年間見込・確定判定ではない</strong>換算期間 '+esc(result.forecast.start)+'〜'+esc(result.forecast.end)+' / '+result.forecast.months+'か月<br>'+esc(result.forecast.formula)+'<br>年間給与見込 '+yen(result.forecast.annual)+'円</div>':'';
 const header=projection+`<div class="result-warning"><strong>${result.frames.length?'計画用試算 — 申告用確定額・監査保証ではありません':'要確認 — 計算を停止しました'}</strong>${esc(readiness)}<br>対象：${esc(resultInput.start)}〜${esc(resultInput.end)} / ルール ${RULE_VERSION}<br>確認日時：${esc(check?.checkedAt??'未確認')} / ${esc(resultStillAuthorized()?'対象機能の限定照合済み':'確認待ち')}</div>`;
 $('#results').innerHTML=header+(blocked.length?'<div class="result-warning">以下の未確認枠は金額表示を停止：'+blocked.map(esc).join('<br>')+'</div>':'')+(result.issues.length?`<div class="card"><h3>確認が必要な事項</h3><ul>${result.issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'')+`<div class="result-grid">${result.frames.map(f=>`<article class="result-card"><h3>${f.name}</h3><span class="badge ${f.status==='対象外'?'excluded':''}">${f.status}</span><div class="result-number">${yen(f.totalUsed)}<small>円</small></div><div class="result-label">当期控除額の概算（新規＋既存繰越利用）</div><dl>${[['賃上げ率 / 判定対象',pct(f)+' / '+f.increaseBasis],['控除率（基本 → 合計）',`${f.baseRate}% → ${f.rate}%`],['控除基礎増加額',yen(f.base)+'円'],['当期理論控除額',yen(f.generated)+'円'],['法人税20%上限',yen(f.cap)+'円'],['当期分の控除',yen(f.currentUsed)+'円'],['既存繰越の利用',yen(f.carryUsed)+'円'],['当期未控除額（翌期繰越の適用は別途確認）',f.frame==='sme'?yen(f.newCarry)+'円':'制度なし']].map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>${f.pending.length?`<details open><summary>要確認 ${f.pending.length}件</summary><ul>${f.pending.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></details>`:''}<p>${f.reasons.map(esc).join('<br>')}</p>${f.carry?`<p>既存繰越残高 ${yen(f.carry.balance)}円 → 利用後 ${yen(f.carry.remaining)}円。${f.carry.expiry}</p>`:''}</article>`).join('')}</div>`+(result.steps.length?`<section class="card"><h3>計算根拠と判定過程</h3><ol class="trace">${result.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><p>閾値の判定は表示率の四捨五入を使わず、円単位の整数交差積で行います。全国内給与と継続雇用者給与は別々に集計します。</p><p>${esc(result.rounded)}</p></section>`:'');
 $('#print').disabled=false;buildPrint();
}
function buildPrint(){if(!resultStillAuthorized()){$('#printArea').innerHTML='';return;}$('#printArea').innerHTML=`<h1>賃上げ促進税制シミュレーター — 試算サマリー</h1>${result.forecast?'<section><h2>年間見込・確定判定ではない</h2><p>換算対象期間 '+esc(result.forecast.start)+'〜'+esc(result.forecast.end)+'、経過 '+result.forecast.months+'月。'+esc(result.forecast.formula)+'</p><p>年間給与見込 '+yen(result.forecast.annual)+'円 / 補正 '+esc(result.forecast.adjustment)+'円</p><ul>'+result.forecast.assumptions.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><p>'+Object.entries(result.forecast.basis).map(([k,v])=>esc(k)+'：'+esc(v)).join('<br>')+'</p></section>':''}<p>案件：${esc(resultInput.company||'未指定')} / 対象：${esc(resultInput.start)}〜${esc(resultInput.end)}<br>作成：${new Date().toISOString()} / 前期：${esc(resultInput.prevStart)}〜${esc(resultInput.prevEnd)}</p><p class="print-warning">計画用試算。申告用の確定計算・監査保証ではありません。対象機能の依存資料・実装版・レビュー期限を限定照合。法令全体の最新性・申告適合性の保証ではありません。</p><p>実装版：${RULE_VERSION}<br>公式確認：${esc(check?.checkedAt??'未確認')} / 確認期限：${esc(check?.expiresAt??'未設定')}<br>レビュー担当・日時：機能別の承認記録を下欄に記載<br>適用範囲：${esc(check?.scope??'未確認')}</p>${result.issues.length?`<h2>計算停止・確認事項</h2><ul>${result.issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<table><thead><tr><th>枠 / 判定</th><th>控除基礎</th><th>控除率</th><th>理論控除</th><th>当期分</th><th>繰越利用</th><th>当期未控除額（翌期繰越の適用は別途確認）</th></tr></thead><tbody>${result.frames.map(f=>`<tr><td>${f.name}<br>${f.status}</td><td>${yen(f.base)}円</td><td>${f.rate}%</td><td>${yen(f.generated)}円</td><td>${yen(f.currentUsed)}円</td><td>${yen(f.carryUsed)}円</td><td>${f.frame==='sme'?yen(f.newCarry)+'円':'なし'}</td></tr>`).join('')}</tbody></table><p>複数枠の同時適用はできません。各枠の金額は合算しません。1円未満切捨て概算。申告書の端数・他制度との配分は別途確認。</p>${result.frames.map(f=>`<section><h2>${f.name} の判定過程</h2><p>増加率：${pct(f)}（${f.increaseBasis}）、基本率${f.baseRate}%、上乗せ後${f.rate}%。</p><ul>${[...f.pending,...f.reasons].map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`).join('')}<h2>計算根拠</h2><ol>${result.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><h2>入力値</h2><table>${FIELDS.map(([key,label])=>`<tr><th>${fieldLabel(key,label)}</th><td>${esc(resultInput[key])||'未入力'}</td></tr>`).join('')}</table><h2>機能別レビュー記録</h2><ul>${result.frames.flatMap(f=>requiredFeatures(resultInput,f.frame,certification(resultInput,f.frame)==='yes')).filter((id,i,a)=>a.indexOf(id)===i).map(id=>{const r=check.features[id];return '<li>'+esc(FEATURES[id].title)+'：'+esc(featureStatus(id,resultInput.start).reason)+' / '+esc(r.reviewer)+' / '+esc(r.reviewedAt)+' / レビュー更新期限（法的期限ではない） '+esc(r.validUntil)+' / 開始日期間 '+esc(r.coverage.from)+'〜'+esc(r.coverage.through)+'</li>';}).join('')}</ul><h2>公式出典・照合状況</h2><ul>${SOURCES.map(s=>{const r=check?.sources.find(x=>x.id===s.id);return `<li>${s.title}：${r?.ok?'取得成功（レビューは別判定）':esc(r?.error??'未取得')}<br><span class="small">${s.url}<br>SHA-256 ${r?.hash??'なし'}</span></li>`;}).join('')}</ul><ul>${(check?.reasons??['公式確認なし']).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;}
function showBlocked(authorization){invalidate();const reasons=authorization.issues?.length?authorization.issues:['対象年度の必須機能について、公式情報の取得と独立ルール承認が必要です。'];$('#results').innerHTML='<div class="result-warning"><strong>要確認 — 計算・金額表示・印刷を停止しました</strong>未確認のまま適用可能とは判定しません。</div><ul>'+reasons.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';tab('result');}
$('#calculate').addEventListener('click',createCalculationHandler({invalidate,refresh,getInput:()=>({...input}),authorize:authorizations,calculate:calculateCase,block:showBlocked,show:(data,snapshot)=>{result=data;resultInput=snapshot;renderResult();tab('result');}}));
$('#recheck').addEventListener('click',async()=>{invalidate();await refresh();});
$('#print').addEventListener('click',()=>{if(!resultStillAuthorized()){invalidate();notify('確認期限・レビュー期限または入力が無効のため印刷を停止しました。',true);return;}buildPrint();window.print();});
window.addEventListener('beforeprint',()=>{if(!resultStillAuthorized()){invalidate();return;}buildPrint();});
setInterval(()=>{renderFreshness();if(result&&!resultStillAuthorized())invalidate();},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){invalidate();refresh();}});

function saved(){return saveCase(input,inputMethod);}
function download(content,name,type){const blob=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function restore(data){const restored=restoreCase(data,inputMethod);input=restored.input;inputMethod=restored.inputMethod;fxImporter.reset();invalidate();renderForm();renderInputMethod();await refresh();notify('入力を復元しました。入力方法と値を保持し、以前の確認状態・結果は戻さず再確認しました。');tab(restored.view);}
$('#saveLocal').addEventListener('click',()=>{try{localStorage.setItem('wage-tax-input-v1',JSON.stringify(saved()));notify('このブラウザに入力集計値を保存しました。個人別CSVは保存していません。保存値は暗号化されません。');}catch(e){notify('端末保存できませんでした。JSON保存をご利用ください。',true);}});
$('#restoreLocal').addEventListener('click',async()=>{try{const value=localStorage.getItem('wage-tax-input-v1');if(!value)throw new Error('端末に保存された入力はありません。');await restore(JSON.parse(value));}catch(e){notify(e.message,true);}});
$('#downloadState').addEventListener('click',()=>download(JSON.stringify(saved(),null,2),'wage-tax-input.json','application/json;charset=utf-8'));
$('#restoreFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>1000000)throw new Error('JSONは1MB以内にしてください。');await restore(JSON.parse(await f.text()));}catch(err){notify(err.message,true);}e.target.value='';});
$('#clearLocal').addEventListener('click',()=>{try{localStorage.removeItem('wage-tax-input-v1');notify('このツールの端末保存データを削除しました。現在の画面入力は残っています。');}catch{notify('端末保存にアクセスできません。',true);}});
$('#demo').addEventListener('click',()=>{const mode=input.mode;input={...initialInput(),mode,company:'架空サンプル株式会社',standardDomesticCorp:'yes',blue:'yes',normalPeriod:'yes',payrollReviewed:'yes',specialLimitsReviewed:'yes',noCapital:'no',capital:'10000000',headcount:'25',groupHeadcount:'25',smeOwnership:'yes',smeIncome:'yes',multiStakeholder:'no',grossCurrent:'103000000',grossPrevious:'100000000',reimburseCurrent:'0',reimbursePrevious:'0',subsidyCurrent:'0',subsidyPrevious:'0',corporateTax:'2000000',overlap:'0',continuousCurrent:'52000000',continuousPrevious:'50000000',continuousReviewed:'yes',trainingClaim:'no',trainingCurrent:'0',trainingPrevious:'0',trainingReviewed:'no',certType:'none',certReviewed:'yes',carryBalance:'0',carryReviewed:'yes'};if(mode==='forecast')Object.assign(input,{grossCurrent:'50000000',completedMonths:'6',observationStart:input.start,observationEnd:'2026-09-30',forecastCoverageComplete:'yes',forecastPreviousAnnual:'yes',bonusSeparated:'yes',paidBonus:'3000000',plannedBonus:'2000000',annualAdjustment:'-1000000',forecastAdjustmentBasis:'架空の給与台帳と採用計画、補塡なし',forecastSubsidyBasis:'架空の年間助成金見込0円',forecastTaxBasis:'架空の利益計画',forecastContinuousAssumed:'yes',forecastContinuousBasis:'架空の継続雇用を仮定'});invalidate();renderForm();notify('架空のサンプルです。実際の要件確認済みを意味しません。試算後にご自身の資料へ置き換えてください。');});
const fxImporter=mountFxImport({getInput:()=>input,onDirty:invalidate,onApply:out=>{input=mergeCsvInput({...input,mode:out.mode},out,'fxcloud');inputMethod='csv';invalidate();renderForm();renderInputMethod();tab('input');notify('FX仕訳の確認済み集計額を反映しました。帳簿額の対象範囲・補塡・助成金・法人税額・法人資格等を確認してください。税制の最新確認は計算時に別途行います。');}});
$('#demo').addEventListener('click',()=>fxImporter.reset());
document.addEventListener('input',e=>{if(['company','start','end','prevStart','prevEnd'].includes(e.target.dataset?.field))fxImporter.reset();});
renderForm();renderInputMethod();tab(entry.view);renderFreshness();refresh();


