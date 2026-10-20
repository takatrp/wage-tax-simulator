import {startFxImport,fxProgressText} from './fx-import-client.mjs';
import {accountTable,checkedPayrollKind,payrollAccounts} from './payroll-accounts.mjs';
import {FX_LIMITS,FX_LIMIT_TEXT} from './fx-limits.mjs';
import {fingerprintBytes} from './journal-overlap.mjs';
import {readFxCloud} from './fxcloud.mjs';
import {decodeCsv} from './csv.mjs';
import {analyzeQuick,estimateQuick,quickPeriods,QUICK_ASSUMPTIONS} from './quick.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=v=>new Intl.NumberFormat('ja-JP').format(BigInt(v));
const VALUES=['start','through','regular','paidBonus','previousAnnual','futureBonus','adjustment','corporateTax'];
export function validateQuickSaved(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!VALUES.includes(k))||VALUES.some(k=>typeof data[k]!=='string'||data[k].length>40))throw Error('かんたん試算の保存形式が不正です。');
  quickPeriods(data.start,data.through);for(const k of VALUES.filter(k=>!['start','through'].includes(k))){const v=data[k];if(v!==''&&!(k==='adjustment'?/^-?(0|[1-9]\d{0,14})$/:/^(0|[1-9]\d{0,14})$/).test(v))throw Error('保存した概算金額が不正です。');}
  return Object.fromEntries(VALUES.map(k=>[k,data[k]]));
}
export function decodeQuickCsv(bytes,encoding){if(encoding!=='auto')return decodeCsv(bytes,encoding,{maxBytes:FX_LIMITS.fileBytes});try{return decodeCsv(bytes,'utf-8',{maxBytes:FX_LIMITS.fileBytes});}catch{return decodeCsv(bytes,'shift_jis',{maxBytes:FX_LIMITS.fileBytes});}}
export function mountQuick({root,refresh,isReady,onPeriod=()=>{},getEvidence=()=>({})}){
  root.insertAdjacentHTML('afterbegin',`<section class="card quick-card"><div class="card-heading"><span class="step-num">01</span><div><h2>CSVから、賃上げの控除額をざっくり見る</h2><p>中小企業の基本控除を前提にした経営判断用の概算です。資格・加算・繰越の詳しい確認は後から行えます。</p></div></div>
  <label class="field">FXクラウドの仕訳CSV（複数可）<input id="q-files" type="file" accept=".csv,text/csv" multiple></label><label class="field">文字コード<select id="q-encoding"><option value="auto">自動判定</option><option value="utf-8">UTF-8</option><option value="shift_jis">Shift_JIS / CP932</option></select></label><p class="muted">CSV・摘要・個人情報はブラウザ内だけで処理します。原本のバイト単位の実証は未完了です。端末保存には金額と期間だけを含めます。</p><p class="muted">${FX_LIMIT_TEXT}</p><button id="q-cancelImport" hidden>CSV取込を取り消す</button><div id="q-status" role="status" aria-live="polite"></div><div id="q-fileList"></div>
  <div class="fields"><label class="field">事業年度の開始月<input id="q-start" type="month"></label><label class="field">給与の入力が完了した最終月<input id="q-through" type="month"></label></div><p id="q-periodNote">CSVの最終日から完了月を確定しません。対象年度と入力済み月を確認してください。</p><button id="q-analyze" class="primary">この期間で集計する</button>
  <div id="q-overlap" class="result-warning" hidden><strong>複数CSVの期間が重なっています</strong><div id="q-overlapText"></div><p>同じ取引を含む場合は上のファイルのチェックを外して再集計できます。CSVを編集する必要はありません。別仕訳であれば、行を削除せず全行を含めて進めます。</p><button id="q-confirmOverlap">別仕訳として全行を含めて進む</button></div><section id="q-accounts" hidden><h3>集計する科目を選ぶ</h3><p>給与・給料・賃金・雑給・基本給・賞与を含む名称から候補を選択しています。違う科目はチェックを外し、必要な科目は追加してください。通常給与だけを年換算し、賞与は年換算しません。名称は税制対象者の確認を代替しません。</p><p>同じ名称・コード・部門は資料をまたいでまとめ、チェックはその行の全資料に適用します。部門や名称が違う場合は別行です。金額は借方から貸方を差し引き、同一ファイルのコピーは除いて表示します。</p><label class="field">科目名・コード・部門で絞り込む<input id="q-accountSearch" type="search" autocomplete="off"></label><button id="q-addAccounts" aria-expanded="false">他の科目を追加</button><p id="q-accountScope">名称から抽出した候補だけを表示しています。</p><div id="q-mapping"></div><p id="q-accountPage"></p><button id="q-accountPrev">前の科目</button><button id="q-accountNext">次の科目</button><p>選択・区分・期間を変えると集計額と試算へ自動反映します。役員報酬・役員賞与・法定福利費・外注費は初期選択しません。曖昧な科目の追加時は通常給与／賞与の指定が必要です。</p><button id="q-reanalyze" class="primary">集計を更新する（通常は自動）</button></section><div id="q-inputs" hidden><div id="q-warnings" class="result-warning"></div><div class="fields"><label class="field">当期の通常給与累計（賞与を除く・円）<input id="q-regular" type="text" inputmode="numeric" placeholder="選択した科目から自動反映"></label><label class="field">前年通年の対象給与（賞与を含む・円）<input id="q-previousAnnual" type="text" inputmode="numeric" placeholder="不明を0円にしないでください"></label></div>
  <p id="q-annualRegular" class="scope-note" aria-live="polite"></p>
  <details><summary>賞与・見込補正・法人税額を補う（任意）</summary><div class="fields"><label class="field">既払賞与（円・年換算しません）<input id="q-paidBonus" type="text" inputmode="numeric" value="0"></label><label class="field">これから支払う賞与見込（円）<input id="q-futureBonus" type="text" inputmode="numeric" placeholder="空欄なら見込に含めません"></label><label class="field">年間見込の補正（増減・円）<input id="q-adjustment" type="text" inputmode="numeric" placeholder="例：-1000000"></label><label class="field">調整前法人税額の見込（円）<input id="q-corporateTax" type="text" inputmode="numeric" placeholder="任意。不明なら税額上限前だけ表示"></label></div><p>通常給与に賞与が含まれる場合は、通常給与累計から分離して既払賞与に入力してください。12か月入力済みの場合、今後の賞与は0円です。</p></details>

  <div class="result-warning"><strong>今回の概算の前提</strong><ul>${QUICK_ASSUMPTIONS.map(s=>'<li>'+esc(s)+'</li>').join('')}</ul></div><button id="q-calculate" class="primary">公式情報を再確認して概算する</button></div><div id="q-result" aria-live="polite"></div><button id="q-print" hidden>この概算を印刷</button></section>`);
  const $=s=>root.querySelector(s);
  let files=[],mapping={},inspection=null,generation=0,revision=0,last=null,lastInput=null,printing=false,
    overlapPending=false,pendingRevision=null,importJob=null,loading=false,pickerAccounts=[],accountPage=0,
    otherAccounts=false,addedKeys=new Set(),periodConfirmed=false,aggregateReady=false,manualPrevious='',manualRegular=false,verificationPending=null,resultAllowed=false;
  function stopImport(){importJob?.cancel();importJob=null;loading=false;$('#q-cancelImport').hidden=true;$('#q-analyze').disabled=false;}
  function values(){return Object.fromEntries(VALUES.map(k=>[k,$('#q-'+k).value]));}
  function status(s,error=false){$('#q-status').textContent=s;$('#q-status').className=error?'notice error':'notice';}
  function clear(){revision++;last=null;lastInput=null;resultAllowed=false;$('#q-result').innerHTML='';$('#q-print').hidden=true;}
  function invalidate(){clear();aggregateReady=false;inspection=null;overlapPending=false;pendingRevision=null;$('#q-overlap').hidden=true;$('#q-inputs').hidden=true;$('#q-annualRegular').textContent='';for(const k of ['regular','previousAnnual'])$('#q-'+k).value='';$('#q-paidBonus').value='0';onPeriod($('#q-start').value?$('#q-start').value+'-01':null);}
  function reset(){generation++;stopImport();files=[];mapping={};pickerAccounts=[];accountPage=0;otherAccounts=false;addedKeys=new Set();periodConfirmed=false;manualPrevious='';manualRegular=false;invalidate();for(const k of VALUES)$('#q-'+k).value=k==='paidBonus'?'0':'';$('#q-periodNote').textContent='対象年度と入力済み月を確認してください。';$('#q-files').value='';$('#q-fileList').innerHTML='';$('#q-mapping').innerHTML='';$('#q-accountSearch').value='';$('#q-accounts').hidden=true;status('CSVを選んでください。');onPeriod(null);}
  // A deliberate re-selection of the same file must start a new import as well.
  $('#q-files').addEventListener('click',()=>{$('#q-files').value='';});
  $('#q-files').addEventListener('change',async()=>{
    stopImport();const own=++generation;files=[];mapping={};pickerAccounts=[];accountPage=0;otherAccounts=false;addedKeys=new Set();periodConfirmed=false;manualPrevious='';manualRegular=false;$('#q-accountSearch').value='';$('#q-mapping').innerHTML='';$('#q-fileList').innerHTML='';$('#q-accounts').hidden=true;for(const k of VALUES)$('#q-'+k).value=k==='paidBonus'?'0':'';invalidate();
    $('#q-periodNote').textContent='対象年度と入力済み月を確認してください。CSV最終月は仮表示で、完了月の確認が必要です。';
    status('CSVをブラウザ内で読み込んでいます。前の案件の金額・税額・期間はリセットしました。');
    try{
      const selected=[...$('#q-files').files],encoding=$('#q-encoding').value;
      loading=true;$('#q-cancelImport').hidden=false;$('#q-analyze').disabled=true;
      importJob=startFxImport(selected,{encoding,onProgress:p=>{if(own===generation)status(fxProgressText(p));}});
      const read=await importJob.promise;if(own!==generation)return;
      files=read.map((data,i)=>({...data,sourceFile:i+1,name:selected[i].name??'CSV',included:true}));drawFiles();
      const months=files.flatMap(f=>f.months).sort();$('#q-through').value=months.at(-1)||'';
      pickerAccounts=payrollAccounts(files,{mapping});$('#q-accounts').hidden=false;drawAccounts();
      status(files.length+'個のCSVを読み込みました。名称の候補を表示しています。年度開始月と入力済み最終月を選ぶと金額を自動反映します。最終月は選び直すか「この期間で集計する」で確認してください。'+files.flatMap(f=>f.warnings??[]).join(' '));
    }catch(e){if(own!==generation)return;files=[];$('#q-files').value='';status(e.name==='AbortError'?e.message:'取込を停止しました：'+e.message,e.name!=='AbortError');}
    finally{if(own===generation){importJob=null;loading=false;$('#q-cancelImport').hidden=true;$('#q-analyze').disabled=false;}}
  });
  $('#q-cancelImport').addEventListener('click',()=>{reset();status('CSV取込を取り消しました。未完了の資料・金額は採用していません。');});
  $('#q-encoding').addEventListener('change',reset);
  for(const k of ['start','through'])$('#q-'+k).addEventListener('input',()=>{
    if(loading){generation++;stopImport();files=[];$('#q-files').value='';$('#q-fileList').innerHTML='';invalidate();status('期間を変更したため、進行中のCSV取込を取り消しました。再選択してください。');return;}
    if(k==='through')periodConfirmed=true;
    manualRegular=false;return analyze(false);
  });
  for(const k of VALUES.filter(k=>!['start','through'].includes(k)))$('#q-'+k).addEventListener('input',()=>{
    if(k==='previousAnnual')manualPrevious=$('#q-previousAnnual').value;
    if(k==='regular')manualRegular=true;
    annualPreview();void calculate(false);
  });
  function drawFiles(){$('#q-fileList').innerHTML=files.map((f,i)=>'<label class="field"><span><input type="checkbox" data-q-include="'+i+'" '+(f.included?'checked':'')+'> CSV'+f.sourceFile+' '+esc(f.name)+' / '+f.rows+'行 / '+esc(f.from)+'〜'+esc(f.through)+'</span>集計に含める（同一ファイルは1回分だけ集計）</label>').join('');root.querySelectorAll('[data-q-include]').forEach(el=>el.addEventListener('change',()=>{files[Number(el.dataset.qInclude)].included=el.checked;manualRegular=false;return analyze(false);}));}
  function changeAccount(index,kind){const a=pickerAccounts[index];if(!a)return;mapping[a.key]=kind;if(['regular','bonus','pending'].includes(kind)&&!['regular','bonus'].includes(a.suggestion))addedKeys.add(a.key);manualRegular=false;return analyze(false);}
  function drawAccounts(){const table=accountTable(pickerAccounts,{prefix:'q',page:accountPage,query:$('#q-accountSearch').value,candidatesOnly:!otherAccounts,addedKeys,periodKnown:Boolean(inspection)});accountPage=table.page;$('#q-mapping').innerHTML=table.html;$('#q-accountPage').textContent=table.count+'科目 / 全'+table.total+'科目・'+(table.page+1)+' / '+table.pages+'ページ（50科目ずつ）';$('#q-accountScope').textContent=otherAccounts?'他の科目を含めて表示しています。必要な科目だけを選び、通常給与／賞与を指定してください。':'名称から抽出した候補と、追加済みの科目を表示しています。';$('#q-addAccounts').textContent=otherAccounts?'候補と追加済み科目だけに戻す':'他の科目を追加';$('#q-addAccounts').setAttribute?.('aria-expanded',String(otherAccounts));$('#q-accountPrev').disabled=table.page===0;$('#q-accountNext').disabled=table.page+1>=table.pages;root.querySelectorAll('[data-q-map]').forEach(el=>el.addEventListener('change',()=>changeAccount(Number(el.dataset.qMap),el.value)));root.querySelectorAll('[data-q-account]').forEach(el=>el.addEventListener('change',()=>{const index=Number(el.dataset.qAccount);return changeAccount(index,checkedPayrollKind(pickerAccounts[index],el.checked));}));}
  $('#q-addAccounts').addEventListener('click',()=>{otherAccounts=!otherAccounts;accountPage=0;drawAccounts();});
  $('#q-accountSearch').addEventListener('input',()=>{accountPage=0;drawAccounts();});$('#q-accountPrev').addEventListener('click',()=>{accountPage--;drawAccounts();});$('#q-accountNext').addEventListener('click',()=>{accountPage++;drawAccounts();});
  function annualPreview(){
    try{const p=quickPeriods($('#q-start').value,$('#q-through').value),v=$('#q-regular').value;if(!periodConfirmed||! /^(0|[1-9]\d{0,14})$/.test(v))throw Error();const annual=BigInt(v)*12n/BigInt(p.months);$('#q-annualRegular').textContent='通常給与の年換算額：'+yen(annual)+'円（累計 '+yen(v)+'円 ×12÷'+p.months+'か月、円未満切捨て）。賞与は別途1回だけ加算します。'+(aggregateReady?'':' 未確認事項があるため参考値です。');}catch{$('#q-annualRegular').textContent='期間・通常給与累計が確定すると年換算額を自動表示します。';}
  }
  function showInspection(){
    $('#q-regular').value=inspection.selectedCurrentRegular;$('#q-paidBonus').value=inspection.paidBonus;$('#q-previousAnnual').value=inspection.previousAnnual??manualPrevious;
    $('#q-inputs').hidden=false;$('#q-periodNote').textContent=inspection.period.start+'〜'+inspection.period.end+'の年度 / '+inspection.period.months+'か月入力済みとして計算します。';$('#q-warnings').innerHTML=inspection.warnings.map(esc).join('<br>');
    aggregateReady=!inspection.errors.length&&inspection.currentComplete&&inspection.selectedRegularCount>0&&!overlapPending;
    annualPreview();onPeriod(inspection.period.start);
    if(!inspection.selectedRegularCount)status('通常給与科目が未選択です。選択帳簿合計は0円ですが、給与なしとは確定せず試算・保存・印刷を保留します。',true);
    else if(!inspection.currentComplete)status('選択科目の帳簿小計を自動反映しました。通常給与仕訳のない月があるため、期間・科目・不足CSVを確認してください。',true);
    else status('選択科目の累計・年換算を自動反映しました。前年通年額が不足する場合だけ補完してください。');
    void calculate(false);
  }
  function analyze(confirmPeriod=false){
    if(loading){status('CSVの読取完了を待つか、取り消してください。');return;}
    if(confirmPeriod===true)periodConfirmed=true;
    invalidate();
    try{
      const selected=files.filter(f=>f.included);if(!selected.length)throw Error('集計するFX仕訳CSVを選んでください。');
      if(!periodConfirmed){pickerAccounts=payrollAccounts(selected,{mapping});drawAccounts();throw Error('年度開始月と入力済み最終月を確認してください。最終月を選び直すか「この期間で集計する」で確認できます。');}
      inspection=analyzeQuick(selected,{...values(),mapping});pickerAccounts=inspection.accounts;$('#q-accounts').hidden=false;drawAccounts();
      if(inspection.errors.length)throw Error(inspection.errors.join(' / '));
      if(inspection.requiresOverlapConfirmation){overlapPending=true;pendingRevision=revision;$('#q-overlap').hidden=false;$('#q-overlapText').innerHTML=inspection.warnings.map(esc).join('<br>');status('重なる期間の資料を確認してください。内容一致の行は自動削除していません。未確認の集計額は保存しません。');return;}
      return showInspection();
    }catch(e){aggregateReady=false;$('#q-inputs').hidden=true;$('#q-periodNote').textContent=inspection?inspection.period.start+'〜'+inspection.period.end+'の年度 / '+inspection.period.months+'か月（要確認）':'対象年度と入力済み月を確認してください。';if(!inspection){pickerAccounts=payrollAccounts(files.filter(f=>f.included),{mapping});drawAccounts();}status(e.message,true);}
  }
  $('#q-confirmOverlap').addEventListener('click',()=>{if(!inspection||!overlapPending||pendingRevision!==revision){status('現在のファイルと期間の確認待ちはありません。',true);return;}clear();overlapPending=false;pendingRevision=null;$('#q-overlap').hidden=true;inspection.warnings.push('期間が重なる複数CSVを、別仕訳として全行含めることを確認した条件付き概算です。');return showInspection();});
  $('#q-analyze').addEventListener('click',()=>analyze(true));$('#q-reanalyze').addEventListener('click',()=>analyze(true));
  function show(r,allowed){resultAllowed=allowed;const evidence=getEvidence(),v=lastInput??values();const tax=!r.supported?'この事業年度の概算ルールは未対応のため、控除額を表示しません。':r.theoretical===null?'前年通年額が0円のため、増加率要件を満たす控除額を算定できません。':!allowed?'制度情報の確認が完了していないため、控除額の表示を保留しています。':`<div class="result-number">${yen(r.taxKnown?r.usable:r.theoretical)}<small>円</small></div><p>${r.taxKnown?'法人税額20%上限を反映した控除の目安':'控除の目安（税額上限前）'}</p><p>基本控除率 ${r.rate}%${r.taxKnown?' / 税額上限 '+yen(r.cap)+'円':' / 法人税額が不明なため、当期に使える額は未計算'}</p>`;$('#q-result').innerHTML=`<section class="card"><h3>年間見込・条件付き概算</h3><p>対象年度 ${esc(r.period.start)}〜${esc(r.period.end)} / ${r.period.months}か月入力済み</p><div class="result-grid"><article><h4>年間給与見込</h4><div class="result-number">${yen(r.annual)}<small>円</small></div></article><article><h4>前年通年比</h4><div class="result-number">${r.growth===null?'算定不可':r.growth.toFixed(2)+'%'}</div><p>前年 ${yen(r.previousAnnual)}円</p></article><article><h4>中小企業の基本控除</h4>${tax}</article></div><p class="result-warning">適用資格の判定・申告確定額ではありません。以下の前提に基づく経営判断用の目安です。</p><ul>${[...r.assumptions,...(inspection?.warnings??[])].map(s=>'<li>'+esc(s)+'</li>').join('')}</ul><details><summary>計算根拠・制度確認の詳細</summary><p>給与増加額 ${yen(r.delta)}円。増加率1.5%以上で15%、2.5%以上で30%。税額上限を反映する場合は理論額と調整前法人税額20%の小さい額。境界判定は整数の交差積で行います。</p><p>年間給与見込：${esc(v.regular)}円×12÷${r.period.months}＋既払賞与${esc(v.paidBonus)}円＋今後賞与${esc(v.futureBonus||'0')}円＋補正${esc(v.adjustment||'0')}円＝${yen(r.annual)}円。前年通年給与 ${yen(r.previousAnnual)}円。</p><p>公式情報の確認日時：${esc(evidence.checkedAt??'未確認')}<br>取得確認期限：${esc(evidence.expiresAt??'未設定')}<br>実装ルール版：${esc(evidence.ruleVersion??'未確認')}<br>レビュー適用範囲：${esc(evidence.scope??'未確認')}</p><ul>${(evidence.sources??[]).map(s=>'<li><a href="'+esc(s.url)+'">'+esc(s.title)+'</a></li>').join('')}</ul></details></section>`;$('#q-print').hidden=!allowed||r.theoretical===null;}
  async function calculate(force=false){
    if(!aggregateReady||overlapPending){return;}
    clear();const own=revision;
    try{
      const v=values(),r=estimateQuick(v);last=r;lastInput=v;
      if(!force&&!verificationPending&&isReady(r.period.start)){show(r,true);return;}
      show(r,false);
      if(!verificationPending){const request=(async()=>refresh())();verificationPending=request;request.finally(()=>{if(verificationPending===request)verificationPending=null;}).catch(()=>{});}
      await verificationPending;if(own!==revision)return;
      const allowed=isReady(r.period.start);show(r,allowed);if(!allowed)status('公式情報の確認待ちです。年間給与見込を表示し、控除額を保留しました。',true);
    }catch(e){if(own!==revision)return;if(last)show(last,false);status(e.message,true);}
  }
  $('#q-calculate').addEventListener('click',()=>calculate(true));
  $('#q-print').addEventListener('click',()=>{if(!beforePrint()){clear();status('公式確認の有効期限が切れました。再計算してください。',true);return;}printing=true;try{window.print();}finally{printing=false;document.querySelector('#printArea').innerHTML='';}});
  function checkState(){if(last&&!isReady(last.period.start)){show(last,false);$('#q-print').hidden=true;}}
  function restore(data){const v=validateQuickSaved(data);reset();aggregateReady=true;periodConfirmed=true;for(const k of VALUES)$('#q-'+k).value=v[k];quickPeriods(v.start,v.through);$('#q-inputs').hidden=false;$('#q-warnings').textContent='保存した金額を復元しました。CSV原本と科目分類は保存していません。期間・対象給与と前提を再確認してください。';annualPreview();onPeriod(v.start+'-01');status('保存値を復元しました。結果・公式確認・資格確認は復元していません。');}
  function beforePrint(){if(!aggregateReady||overlapPending||!resultAllowed||!last||!isReady(last.period.start)||last.theoretical===null)return false;show(last,true);const area=document.querySelector('#printArea');area.innerHTML=$('#q-result').innerHTML;area.querySelectorAll('details').forEach(el=>el.open=true);return true;}
  return{reset,clear,checkState,beforePrint,printing:()=>printing,snapshot:()=>aggregateReady&&!overlapPending&&$('#q-start').value&&$('#q-through').value?values():null,restore};
}
