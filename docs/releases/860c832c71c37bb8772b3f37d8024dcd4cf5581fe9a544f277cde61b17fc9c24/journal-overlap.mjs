// A voucher number or a row's contents is not a unique transaction ID.
export async function fingerprintBytes(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
const fileId=(f,i)=>f.sourceFile??i+1;
function payroll(file,lines,period,mapping){const result={current:0n,previous:0n,currentAbsolute:0n,previousAbsolute:0n};for(const e of file.entries){if(!lines.has(e.line)||!['regular','bonus'].includes(mapping[e.key]??e.suggestion))continue;const m=e.date.slice(0,7),p=period?.current.includes(m)?'current':period?.previous.includes(m)?'previous':null;if(!p)continue;const n=BigInt(e.value);result[p]+=n;result[p+'Absolute']+=n<0n?-n:n;}return Object.fromEntries(Object.entries(result).map(([k,v])=>[k,String(v)]));}
export function inspectJournalOverlap(files,{period,mapping={}}={}){
 const hashes=new Map(),uniqueFiles=[],duplicateFiles=[],within=[],overlaps=[];
 files.forEach((file,i)=>{const id=fileId(file,i);if(/^[a-f0-9]{64}$/.test(file.byteHash??'')){if(hashes.has(file.byteHash)){duplicateFiles.push({file:id,keptFile:hashes.get(file.byteHash),rows:file.rows});return;}hashes.set(file.byteHash,id);}uniqueFiles.push({...file,sourceFile:id});});
 for(const file of uniqueFiles){const groups=new Map();for(const t of file.transactions){if(!groups.has(t.identity))groups.set(t.identity,[]);groups.get(t.identity).push(t);}const repeated=[...groups.values()].filter(g=>g.length>1),rows=repeated.flat();if(rows.length)within.push({file:file.sourceFile,rows:rows.length,extraRows:rows.length-repeated.length,lines:rows.map(t=>t.line),payroll:payroll(file,new Set(rows.map(t=>t.line)),period,mapping)});}
 for(let i=0;i<uniqueFiles.length;i++)for(let j=i+1;j<uniqueFiles.length;j++){const a=uniqueFiles[i],b=uniqueFiles[j],from=a.from>b.from?a.from:b.from,through=a.through<b.through?a.through:b.through;if(!from||!through||from>through)continue;const identities=new Set(a.transactions.map(t=>t.identity)),rows=b.transactions.filter(t=>t.date>=from&&t.date<=through),matches=rows.filter(t=>identities.has(t.identity));overlaps.push({file1:a.sourceFile,file2:b.sourceFile,from,through,rows:rows.length,matchingRows:matches.length,payroll:payroll(b,new Set(rows.map(t=>t.line)),period,mapping),matchingPayroll:payroll(b,new Set(matches.map(t=>t.line)),period,mapping)});}
 return{uniqueFiles,duplicateFiles,within,overlaps,requiresConfirmation:overlaps.length>0};
}
const money=n=>new Intl.NumberFormat('ja-JP').format(BigInt(n));
const amounts=p=>`給与候補の差引額（年換算前）：当期${money(p.current)}円・前期${money(p.previous)}円。増減の絶対額は当期${money(p.currentAbsolute)}円・前期${money(p.previousAbsolute)}円`;
export function overlapWarnings(d){return[
 ...d.duplicateFiles.map(x=>`CSV${x.file}はCSV${x.keptFile}と同一ファイルの内容です。二重取込を防ぐため1回分だけ集計します（${x.rows}行）。`),
 ...d.within.map(x=>`CSV${x.file}内に内容が一致する行が${x.rows}行あります。別仕訳の可能性があるため全行を保持して集計します。${amounts(x.payroll)}。`),
 ...d.overlaps.map(x=>`CSV${x.file1}とCSV${x.file2}の期間が重なります（${x.from}〜${x.through}）。後のCSVの重なり範囲は${x.rows}行、内容一致の疑いは${x.matchingRows}行です。${amounts(x.payroll)}。内容一致行のみの差引額は当期${money(x.matchingPayroll.current)}円・前期${money(x.matchingPayroll.previous)}円、増減の絶対額は当期${money(x.matchingPayroll.currentAbsolute)}円・前期${money(x.matchingPayroll.previousAbsolute)}円です。`),
 ...(d.within.length||d.overlaps.length?['内容一致は重複の確定ではありません。金額は科目分類後の給与候補額で、控除額への影響額ではありません。伝票番号だけを明細行の一意IDとはみなしません。']:[])
 ];}
