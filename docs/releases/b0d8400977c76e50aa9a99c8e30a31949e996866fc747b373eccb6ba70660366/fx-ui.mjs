import {decodeCsv} from './csv.mjs';
import {readFxCloud,fxAccounts,inspectFxFiles,applyFxReview} from './fxcloud.mjs';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const labels={regular:'通常給与候補',bonus:'賞与候補',exclude:'給与から除外',support:'補助金等の参考・給与に加算しない',unknown:'要確認'};
export function mountFxImport({getInput,onApply,onDirty}){
 $('#csvPanel .section-intro').insertAdjacentHTML('afterend',`<section class="card fx-import"><h3>FXクラウドの仕訳CSVから開始</h3><p>借方・貸方の仕訳一覧を自動識別します。残高表や月次累計表を仕訳として加算しません。資料をまとめて選び、当期・前期・参考資料の用途と根拠を確認します。</p><p class="scope-note">FX取込は試行対応です。対応列を再現した架空CSVで検証していますが、提供原本のバイトによる互換性検証は未実施です。元帳・給与台帳と照合してご利用ください。</p>
 <label>文字コード<select id="fxEncoding"><option value="utf-8">UTF-8 / UTF-8 BOM</option><option value="shift_jis">Shift_JIS（CP932）</option></select></label>
 <label class="dropzone">FX仕訳CSVを選択（複数可）<input id="fxFiles" type="file" multiple accept=".csv,text/csv,text/plain"><small>1件5MB・10,000行、最大8件・合計20MB。元ファイル・摘要・取引先・入力者は保存・送信しません。</small></label>
 <div id="fxFileList"></div><div class="fields fx-periods">
 <label>対象事業年度 開始<input type="date" id="fx-start" data-fx-period></label><label>対象事業年度 終了<input type="date" id="fx-end" data-fx-period></label><label>前事業年度 開始<input type="date" id="fx-prevStart" data-fx-period></label><label>前事業年度 終了<input type="date" id="fx-prevEnd" data-fx-period></label><label>当期の最終完了月<input type="month" id="fx-cutoff" data-fx-period></label></div>
 <p>仕訳の最終日から完了月・決算期を推定しません。期中は年間見込に連携し、前期には通年12か月が必要です。年度・用途変更後は再確認します。</p><button id="fxAnalyze">読取内容・期間・重複を確認</button><div id="fxStatus" role="status"></div>
 <section id="fxReview" hidden><h4>読取候補を確認</h4><p id="fxSummary"></p><pre id="fxIssues" class="fx-issues"></pre><details open><summary>科目の分類（コードの税務的意味は固定しません）</summary><div id="fxAccountMap"></div></details>
 <details><summary>元CSVの行・列と集計根拠</summary><div id="fxEvidence"></div><button id="fxPrev">前の根拠</button><button id="fxNext">次の根拠</button></details><p id="fxPayrollGaps"></p>
 <div class="fields"><label>確認した法人・案件名<input id="fxCompany" type="text" maxlength="120" autocomplete="off"></label><label>給与台帳との照合・調整根拠<textarea id="fxBasis" maxlength="280" placeholder="役員・特殊関係者・国外・未払・支給時期・製造原価等の範囲と調整"></textarea></label></div>
 <p>帳簿候補への加減算（円）。減額はマイナス、差額なしは必ず0を入力。通常給与・賞与ごとに、役員・特殊関係者・国外・損金算入・未払/支給時期・原価振替・資産計上等を照合してください。通常補塡・雇用安定助成金はここに含めず、次画面で別入力します。</p>
 <div class="fields">${['current','previous'].flatMap(p=>['regular','bonus'].map(k=>'<label>'+(p==='current'?'当期':'前期')+' '+(k==='regular'?'通常給与':'賞与')+' 調整<input type="text" inputmode="numeric" id="fx-adjust-'+p+'-'+k+'" placeholder="未確認（差額なしは0）" maxlength="30"></label>')).join('')}</div>
 <div class="fx-checks"><label><input type="checkbox" id="fxSameCompany">全資料が上記の同一法人であると確認した（会社名列がない資料も含む）</label><label><input type="checkbox" id="fxComplete">全科目の仕訳出力で、当期は年度開始から最終完了月まで、前期は通年であり、未入力・部分月・月次累計・不足資料がないと確認した</label><label><input type="checkbox" id="fxScope">全科目を確認し、通常給与・賞与を漏れなく分類した。帳簿候補を給与台帳と照合し、役員・特殊関係者・国内雇用・損金・支給実績・未払/振替等の差額を上記調整に含めた</label><label><input type="checkbox" id="fxZeroMonths">給与候補仕訳のない月がある場合、支給なし又は上記給与調整で補完したと確認した</label></div>
 <p>継続雇用者・補塡・助成金・税額・法人資格は仕訳から確定しません。反映後も「未確認」とし、不足条件を補完するまで計算できません。今後の賞与・残月給与・助成金等の予測は別途入力します。</p><button id="fxApply" class="primary" disabled>確認した集計額を反映して不足条件へ</button></section></section>`);
 let files=[],generation=0,inspection=null,page=0;
 const config=()=>Object.fromEntries(['start','end','prevStart','prevEnd','cutoff'].map(k=>[k,$('#fx-'+k).value]));
 const sync=()=>{const input=getInput();for(const k of ['start','end','prevStart','prevEnd'])$('#fx-'+k).value=input[k];$('#fx-cutoff').value='';};
 const status=(s,error=false)=>{$('#fxStatus').textContent=s;$('#fxStatus').className=error?'notice error':'notice';};
 const clearReview=()=>{for(const id of ['fxCompany','fxBasis','fx-adjust-current-regular','fx-adjust-current-bonus','fx-adjust-previous-regular','fx-adjust-previous-bonus'])$('#'+id).value='';for(const id of ['fxSameCompany','fxComplete','fxScope','fxZeroMonths'])$('#'+id).checked=false;};
 const reset=()=>{generation++;files=[];inspection=null;$('#fxFiles').value='';$('#fxFileList').innerHTML='';$('#fxReview').hidden=true;$('#fxEvidence').innerHTML='';$('#fxStatus').textContent='';clearReview();sync();};
 function mapping(){return Object.fromEntries($$('[data-fx-account]').map(el=>[inspection.accounts[Number(el.dataset.fxAccount)].key,el.value]));}
 function drawEvidence(){if(!inspection)return;const map=mapping(),items=inspection.evidence.filter(e=>map[e.key]!=='exclude'||e.suggestion);page=Math.min(page,Math.max(0,Math.ceil(items.length/30)-1));const shown=items.slice(page*30,(page+1)*30);$('#fxEvidence').innerHTML='<p>集計根拠：借方は加算、貸方は減算。給与候補は税込額と税抜額が一致することを確認します。補助金等の参考区分は給与・補塡・助成金欄に自動反映しません。</p><div class="table-scroll"><table><thead><tr><th>資料・元CSV行</th><th>日付 / 年度</th><th>科目 / 区分</th><th>列・借貸</th><th>帳簿増減（円）</th></tr></thead><tbody>'+shown.map(e=>'<tr><td>資料'+e.file+' / '+e.line+'行</td><td>'+escape(e.date)+' / '+(e.period==='current'?'当期':'前期')+'</td><td>'+escape(e.code)+' '+escape(e.name)+'<br>'+escape(labels[map[e.key]])+'</td><td>'+e.column+'列・'+e.side+'取引金額<br>'+e.netColumn+'列・税抜き金額</td><td>'+escape(e.value)+'<br>税抜 '+escape(e.netValue)+'</td></tr>').join('')+'</tbody></table></div><p>'+items.length+'件の根拠 / '+(page+1)+'ページ（30件ずつ）</p>';
 $('#fxPrev').disabled=page===0;$('#fxNext').disabled=(page+1)*30>=items.length;
 const payroll={current:new Set(),previous:new Set()};for(const e of inspection.evidence)if(['regular','bonus'].includes(map[e.key]))payroll[e.period].add(e.date.slice(0,7));const missing=Object.entries(inspection.coverage).flatMap(([p,months])=>months.filter(m=>!payroll[p].has(m)).map(m=>(p==='current'?'当期 ':'前期 ')+m));$('#fxPayrollGaps').textContent=missing.length?'給与候補仕訳のない月：'+missing.join(' / ')+'。自動で支給なしとは扱いません。':'各仕訳月に給与候補があります。支給対象者の網羅性は別途確認してください。';
 }
 function analyze(){try{
  const previousMapping=inspection?mapping():{};files=files.map((f,i)=>({...f,role:$('[data-fx-role="'+i+'"]').value}));inspection=inspectFxFiles(files,config());page=0;
  $('#fxReview').hidden=false;$('#fxSummary').textContent=`${inspection.mode==='forecast'?'年間見込に連携':'通年実績に連携'}：当期 ${inspection.options.start}〜${inspection.through}（${inspection.months}か月） / 前期 ${inspection.options.prevStart}〜${inspection.options.prevEnd}。法人識別列 ${inspection.hasCompanyIdentity?'あり（値の混在を検査）':'なし（同一法人の確認が必要）'}。`;
  $('#fxIssues').textContent=inspection.issues.length?inspection.issues.slice(0,20).join('\n')+(inspection.issues.length>20?'\nほか '+(inspection.issues.length-20)+'件':''):'重複・指定期間外・仕訳月の欠落は検出されませんでした。元帳の出力範囲・給与の網羅性を確認してください。';
  $('#fxAccountMap').innerHTML='<p>科目名による候補です。独自の科目も含め全科目を見直してください。役員報酬・法定福利費は雇用者給与に含めません。</p><div class="mapping-grid">'+inspection.accounts.map((a,i)=>'<label>'+escape(a.code)+' '+escape(a.name)+'<select data-fx-account="'+i+'">'+['unknown','regular','bonus','exclude','support'].map(v=>'<option value="'+v+'" '+((previousMapping[a.key]??a.suggestion??'exclude')===v?'selected':'')+'>'+labels[v]+'</option>').join('')+'</select></label>').join('')+'</div>';
  $$('[data-fx-account]').forEach(el=>el.addEventListener('change',()=>{$('#fxScope').checked=false;$('#fxZeroMonths').checked=false;onDirty();drawEvidence();}));$('#fxApply').disabled=!inspection.canApply;drawEvidence();status('読取候補を確認してください。帳簿額は税制対象給与と一致するとは限りません。',inspection.issues.length>0);
 }catch(e){inspection=null;$('#fxReview').hidden=true;status(e.message,true);}}
 $('#fxFiles').addEventListener('change',async e=>{
  const selected=[...e.target.files],own=++generation;files=[];inspection=null;clearReview();$('#fxReview').hidden=true;$('#fxFileList').innerHTML='';onDirty();if(!selected.length)return;
  try{if(selected.length>8||selected.some(f=>f.size>5*1024*1024)||selected.reduce((n,f)=>n+f.size,0)>20*1024*1024)throw new Error('最大8件、合計20MB以内で選択してください。1件は5MB以内です。');const loaded=[];const encoding=$('#fxEncoding').value;for(const f of selected){const bytes=await f.arrayBuffer();if(own!==generation)return;const data=readFxCloud(decodeCsv(bytes,encoding));loaded.push({data,role:'auto'});}files=loaded;
   $('#fxFileList').innerHTML=files.map((f,i)=>'<div class="fx-file"><strong>資料'+(i+1)+'：FX仕訳一覧 / '+f.data.rows+'行</strong><span>'+escape(f.data.from)+'〜'+escape(f.data.through)+'</span><label>用途<select data-fx-role="'+i+'">'+[['auto','日付で当期・前期に振分け'],['current','当期のみ'],['previous','前期のみ'],['support','参考資料（給与には加算しない）'],['ignore','取込対象から除外（重複コピー等）']].map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')+'</select></label></div>').join('');
   $$('[data-fx-role]').forEach(el=>el.addEventListener('change',()=>{inspection=null;clearReview();$('#fxReview').hidden=true;onDirty();status('用途を変更しました。期間と重複を再確認してください。');}));status(files.length+'件を仕訳一覧として読み取りました。対象年度・最終完了月を指定して読取内容を確認してください。原本・会社名・摘要・取引先・入力者を外部送信しません。');
  }catch(err){if(own!==generation)return;files=[];status('取込停止：'+err.message,true);}
 });
 $('#fxAnalyze').addEventListener('click',analyze);$('#fxEncoding').addEventListener('change',reset);
 $$('[data-fx-period]').forEach(el=>el.addEventListener('input',()=>{inspection=null;clearReview();$('#fxReview').hidden=true;onDirty();}));
 $('#fxPrev').addEventListener('click',()=>{page--;drawEvidence();});$('#fxNext').addEventListener('click',()=>{page++;drawEvidence();});
 $('#fxApply').addEventListener('click',()=>{try{
  if(!inspection)throw new Error('期間と重複を再確認してください。');const checked=id=>$('#'+id).checked;
  const review={company:$('#fxCompany').value,sameCompany:checked('fxSameCompany'),complete:checked('fxComplete'),payrollScope:checked('fxScope'),zeroMonthsConfirmed:checked('fxZeroMonths'),basis:$('#fxBasis').value,mapping:mapping(),adjustments:Object.fromEntries(['current','previous'].map(p=>[p,Object.fromEntries(['regular','bonus'].map(k=>[k,$('#fx-adjust-'+p+'-'+k).value]))]))};
  const reviewed=applyFxReview(inspection,review);onApply(reviewed.input);files=[];generation++;$('#fxFiles').value='';status('確認した集計額を反映しました。補塡・助成金・法人税額・資格等の不足条件を入力してください。原本は保存していません。復元後は必要に応じ再取込してください。');
 }catch(e){status(e.message,true);}});
 sync();return {reset};
}
