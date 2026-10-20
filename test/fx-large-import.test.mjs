import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
import {createCsvParser}from'../public/csv-parser.mjs';import {parseCsv}from'../public/csv.mjs';
import {importFxFiles}from'../public/fx-import-core.mjs';import {readFxCloud,detectCsvKind}from'../public/fxcloud.mjs';
import {inspectJournalOverlap}from'../public/journal-overlap.mjs';import {analyzeQuick}from'../public/quick.mjs';
import {FX_HEADERS,journal,journalRow,encodeRows}from'./fx-fixtures.mjs';
const file=text=>new Blob([text]);
function many(n){const h=FX_HEADERS.join(',');return h+'\r\n'+Array.from({length:n},(_,i)=>{const r=journalRow({伝票番号:i%3===0?'':'S'+i,月日:'2026/'+String(4+i%6).padStart(2,'0')+'/25',元帳摘要:'架空メモ'+i});return FX_HEADERS.map(k=>r[k]??'').join(',');}).join('\r\n');}
test('番号空欄・番号列欠落とも有効仕訳を保持し件数と物理行を警告する',()=>{
 const text=journal({months:1,extra:[journalRow({伝票番号:'',元帳摘要:'引用\n内改行'}),journalRow({伝票番号:''})]}),r=readFxCloud(text);
 assert.equal(r.rows,3);assert.equal(r.entries.length,6);assert.equal(r.missingVoucher,2);assert.deepEqual(r.missingVoucherLines,[3,5]);assert.match(r.warnings[0],/削除せず保持/);
 const headers=FX_HEADERS.filter(h=>h!=='伝票番号');assert.equal(detectCsvKind(headers),'fxcloud');const missing=readFxCloud(journal({headers}));assert.equal(missing.rows,6);assert.match(missing.warnings[0],/番号列がありません/);
});
test('空番号を合計行や重複として除外しない。明示/曖昧な合計らしい不正行は停止',()=>{
 const same=journalRow({伝票番号:'',元帳摘要:'合計という文言を含む有効な支給'}),r=readFxCloud(journal({months:1,extra:[same,same]}));assert.equal(r.rows,3);
 const d=inspectJournalOverlap([r],{period:{current:['2026-04'],previous:[]}});assert.equal(d.within[0].rows,2);
 for(const change of [{月日:'合計',伝票番号:''},{月日:'2026/04/25',伝票番号:'',借方科目コード:'',借方科目名:'',貸方科目コード:'',貸方科目名:''},{月日:'2026/02/30',伝票番号:''},{伝票番号:'',借方取引金額:'1.5'}])assert.throws(()=>readFxCloud(journal({extra:[journalRow(change)]})));
});
test('CSV状態機械は全ての文字境界で引用符・CRLF・物理行を同じに保持する',()=>{
 const text='a,b\r\n"あ,い\r\nう","x""y"\r\nq,r\r\ns,t';const expected=parseCsv(text);
 for(let split=0;split<=text.length;split++){const p=createCsvParser();p.write(text.slice(0,split));p.write(text.slice(split));const {count,...actual}=p.finish();assert.equal(count,3);assert.deepEqual(actual,expected);}
 const p=createCsvParser();for(const c of text)p.write(c);assert.deepEqual(p.finish().lineNumbers,[2,4,5]);
});
test('UTF-8とCP932を1バイトずつ復号し、自動判定・BOM・文字途中を扱う',async()=>{
 const utf=file(journal({months:1,extra:[journalRow({伝票番号:'',元帳摘要:'架空,メモ\r\n"引用"'})]}));const [a]=await importFxFiles([utf],{chunkBytes:1});assert.equal(a.rows,2);assert.match(a.transactions[0].identity,/^sha256:[a-f0-9]{64}$/);assert.ok(!JSON.stringify(a).includes('架空,メモ'));
 const cp=new Blob([readFileSync(new URL('../examples/fx-synthetic-current-cp932.csv',import.meta.url))]);const [b]=await importFxFiles([cp],{chunkBytes:1});assert.equal(b.rows,7);assert.equal(b.entries[0].name,'給料手当');
 await assert.rejects(importFxFiles([cp],{encoding:'utf-8',chunkBytes:1}),/文字コード/);
});
test('チャンク境界末尾の不正引用符・不正UTF8・式は全件rejectし途中採用しない',async()=>{
 const text=journal({months:1});for(const bytes of [text+'"unfinished',text.replace('架空の支給','=SUM(A1)'),new Uint8Array([...new TextEncoder().encode(text),0xe3,0x81])])await assert.rejects(importFxFiles([new Blob([bytes])],{encoding:'utf-8',chunkBytes:7}));
});
test('Worker内ハッシュでも同一byteコピー1回、内容一致行全保持、期間重複確認を維持',async()=>{
 const text=journal({extra:[journalRow({伝票番号:''}),journalRow({伝票番号:''})]});const files=await importFxFiles([file(text),file(text),file(text+'\r\n')]);const d=inspectJournalOverlap(files,{period:{current:['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09'],previous:[]}});
 assert.equal(d.duplicateFiles.length,1);assert.equal(d.within.length,2);assert.equal(d.within[0].rows,2);assert.equal(d.requiresConfirmation,true);assert.equal(d.overlaps[0].matchingRows,8);
 const q=analyzeQuick(files,{start:'2026-04',through:'2026-09'});assert.equal(q.currentRegular,'1600000');assert.match(q.warnings.join(' '),/番号が空欄/);
});
test('10,001行と50,001行を実coreで全行読取、全列原文を返さず給与総額一致',async()=>{
 for(const n of [10001,50001]){let reports=0;const [r]=await importFxFiles([file(many(n))],{onProgress(){reports++;}});assert.equal(r.rows,n);assert.equal(r.transactions.length,n);assert.equal(r.entries.length,n*2);assert.ok(reports>2);assert.ok(r.transactions.every(t=>/^sha256:[a-f0-9]{64}$/.test(t.identity)));const q=analyzeQuick([r],{start:'2026-04',through:'2026-09'});assert.equal(q.currentRegular,String(BigInt(n)*100000n));}
});
test('100,000行境界はパーサで受理し100,001行は停止、標準CSVの10,000行制限を維持',()=>{
 const line='2026/04/25,S,5001,給料手当,1,1,1000,普通預金,1,1\n';const headers='月日,伝票番号,借方科目コード,借方科目名,借方取引金額,借方税抜き金額,貸方科目コード,貸方科目名,貸方取引金額,貸方税抜き金額\n';
 const p=createCsvParser({maxRows:100000,retainRows:false});p.write(headers);for(let i=0;i<100;i++)p.write(line.repeat(1000));assert.equal(p.finish().count,100000);
 assert.throws(()=>readFxCloud(headers+line.repeat(100001)),/100,000/);assert.throws(()=>parseCsv('a\n'+'1\n'.repeat(10001)),/10,000/);
});
test('取消信号と文字コード選択の不正を拒否し、進行中の読取も中断',async()=>{
 const c=new AbortController();await assert.rejects(importFxFiles([file(journal())],{signal:c.signal,onProgress:p=>{if(p.phase==='parse')c.abort();}}),{name:'AbortError'});
 await assert.rejects(importFxFiles([file(journal())],{encoding:'unknown'}),/文字コード/);
});
test('200,000行を合計境界として受理し、次の1行で全件をrejectする',async()=>{
 const text=many(100000),same=file(text);const accepted=await importFxFiles([same,same]);assert.equal(accepted.reduce((n,f)=>n+f.rows,0),200000);assert.equal(accepted[0].entries,accepted[1].entries);
 await assert.rejects(importFxFiles([same,same,file(journal({months:1}))]),/合計200,000/);
});
