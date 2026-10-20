const normalize = value => String(value ?? '').normalize('NFKC').replace(/[\s　]/g, '');

// These are editable bookkeeping candidates, never a finding of tax eligibility.
export function classifyPayrollName(name) {
  const n = normalize(name);
  if (/役員|取締役|監査役|法定福利|福利厚生|社会保険|雇用保険|労働保険|厚生年金|外注|業務委託|派遣料/.test(n)) return {kind:'exclude',reason:'役員・福利費・外注等の名称のため初期選択から除外'};
  if (n==='雑収入'||/助成|補助金|補填|補塡/.test(n)) return {kind:'support',reason:'補助金等の参考科目。給与に加算せず、補塡等は別途確認'};
  if (/給与|給料|賃金|雑給|基本給|賞与|人件費/.test(n)) {
    if (/未払|未収|前払|前受|預り|預かり|預金|預け|口座|立替|仮払|仮受|貸付|借入|引当|積立|退職|源泉|所得税|徴収|給与税|賞与税|負担金|受取|戻入|調整|振替|手数料|振込料|計算料|還付/.test(n)) return {kind:'unknown',reason:'負債・精算・税金・退職等を含む名称。内容確認まで未選択'};
    if (/賞与/.test(n) && /給与|給料|賃金|雑給|基本給/.test(n)) return {kind:'unknown',reason:'通常給与と賞与が混在する名称。内訳確認まで未選択'};
    if (/賞与/.test(n)) return {kind:'bonus',reason:'賞与を含む名称から候補選択。年換算しない'};
    if (/給与|給料|賃金|雑給|基本給/.test(n)) return {kind:'regular',reason:'給与・給料・賃金・雑給・基本給を含む名称から候補選択'};
    return {kind:'unknown',reason:'人件費の内訳が不明なため未選択'};
  }
  return {kind:null,reason:'給与等を示す名称を検出しなかったため未選択'};
}

export function payrollAccountKey(code,name,departmentCode='',departmentName='') {
  return JSON.stringify(departmentCode || departmentName ? [code,name,departmentCode,departmentName] : [code,name]);
}

// Entries remain immutable: byte-identical files can share their parsed arrays.
export function payrollAccounts(files,{period,mapping={}}={}) {
  const accounts = new Map(), current = new Set(period?.current ?? []), previous = new Set(period?.previous ?? []);
  for (const [index,file] of files.entries()) {
    const data=file.data ?? file, source=file.sourceFile ?? index+1;
    for (const e of data.entries) {
      let a=accounts.get(e.key);
      if (!a) {
        const classified=classifyPayrollName(e.name),suggestion=e.suggestion ?? classified.kind;
        a={key:e.key,code:e.code,name:e.name,departmentCode:e.departmentCode??'',departmentName:e.departmentName??'',suggestion,reason:e.classificationReason??classified.reason,kind:mapping[e.key]??suggestion??'exclude',sourceFiles:new Set(),current:0n,previous:0n,currentMonths:new Set(),previousMonths:new Set(),netMismatch:false};
        accounts.set(e.key,a);
      }
      a.sourceFiles.add(source);
      const month=e.date.slice(0,7), side=!period||current.has(month)?'current':previous.has(month)?'previous':null;
      if (!side) continue;
      a[side]+=BigInt(e.value);a[side+'Months'].add(month);
      if(e.value!==e.netValue)a.netMismatch=true;
    }
  }
  return [...accounts.values()].map(a=>({...a,current:String(a.current),previous:String(a.previous),sourceFiles:[...a.sourceFiles].sort((x,y)=>x-y),currentMonths:[...a.currentMonths].sort(),previousMonths:[...a.previousMonths].sort()}));
}

export function accountNameWarnings(accounts) {
  const names=new Map();let conflict=false;
  for(const a of accounts){if(names.has(a.code)&&names.get(a.code)!==a.name)conflict=true;names.set(a.code,a.name);}
  return conflict?['同じ科目コードに異なる科目名があります。名称・部門ごとに分けて表示しています。資料番号と金額を確認して選択してください。']:[];
}

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const isPayrollKind=kind=>['regular','bonus','pending'].includes(kind);
export function checkedPayrollKind(account,checked) {
  return !checked?'exclude':['regular','bonus'].includes(account.kind)?account.kind:['regular','bonus'].includes(account.suggestion)?account.suggestion:'pending';
}
export function accountTable(accounts,{prefix,page=0,query=''}={}) {
  const needle=normalize(query).toLocaleLowerCase('ja-JP');
  const matches=accounts.map((a,index)=>({a,index})).filter(({a})=>!needle||normalize([a.name,a.code,a.departmentName,a.departmentCode].join(' ')).toLocaleLowerCase('ja-JP').includes(needle));
  const pages=Math.max(1,Math.ceil(matches.length/50)),safePage=Math.max(0,Math.min(page,pages-1)),shown=matches.slice(safePage*50,(safePage+1)*50);
  const options=[['regular','通常給与'],['bonus','賞与'],['pending','選択中・区分を要確認'],['exclude','集計しない'],['unknown','未分類・集計しない'],['support','補助金等・給与に加算しない']];
  const yen=value=>new Intl.NumberFormat('ja-JP').format(BigInt(value));
  const html='<div class="table-scroll"><table class="account-table"><thead><tr><th scope="col">集計</th><th scope="col">科目名 / コード / 部門</th><th scope="col">資料</th><th scope="col">当期入力期間（円）</th><th scope="col">前年通年（円）</th><th scope="col">扱い / 候補の理由</th></tr></thead><tbody>'+shown.map(({a,index})=>'<tr><td><input type="checkbox" data-'+prefix+'-account="'+index+'" aria-label="'+escape(a.name+' '+a.code+' '+(a.departmentName||a.departmentCode||'部門なし')+'を集計')+'" '+(isPayrollKind(a.kind)?'checked':'')+'></td><td><strong>'+escape(a.name)+'</strong><br>コード '+escape(a.code)+'<br>'+escape(a.departmentName||a.departmentCode?'部門 '+[a.departmentCode,a.departmentName].filter(Boolean).join(' '):'部門なし')+'</td><td>'+a.sourceFiles.map(n=>'資料'+n).join(' / ')+'</td><td class="money">'+yen(a.current)+'</td><td class="money">'+yen(a.previous)+'</td><td><label><span class="account-control-label">'+escape(a.name+' '+a.code+' '+(a.departmentName||a.departmentCode||'部門なし')+'の扱い')+'</span><select data-'+prefix+'-map="'+index+'">'+options.map(([value,label])=>'<option value="'+value+'" '+(a.kind===value?'selected':'')+'>'+label+'</option>').join('')+'</select></label><small>'+escape(a.reason)+'</small></td></tr>').join('')+'</tbody></table></div>';
  return {html:matches.length?html:'<p>該当する科目がありません。</p>',page:safePage,pages,count:matches.length,total:accounts.length};
}
