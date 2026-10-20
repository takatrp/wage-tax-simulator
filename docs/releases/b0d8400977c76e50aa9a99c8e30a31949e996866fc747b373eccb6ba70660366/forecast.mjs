import{amount,annualPair}from'./calc.mjs';import{validDate,selectRules}from'./rules.mjs';
export function signedAmount(value,label='追加補正'){const s=String(value??'').trim();if(!/^-?(0|[1-9]\d*)$/.test(s))throw new Error(label+'は符号付き整数（円）で入力してください。');amount(s.startsWith('-')?s.slice(1):s,label);return BigInt(s);}
function monthEnd(start,months){const d=new Date(start+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+months);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
export function forecastInput(input){
 if(!annualPair(input.start,input.end))throw new Error('着地予測は12か月事業年度の期中データ専用です。短期事業年度の法定換算ではありません。');
 if(!input.start.endsWith('-01'))throw new Error('初版の着地予測は月初開始・月末終了の12か月年度に限定します。月途中開始の年度は専門確認が必要です。');
 if(input.forecastCoverageComplete!=='yes')throw new Error('年度開始から欠落なく完了月がそろっていることを確認してください。');
 if(input.forecastPreviousAnnual!=='yes')throw new Error('前期比較には前期通年実績が必要です。期中比較額を年額として扱いません。');
 const hasStart=!!input.observationStart,hasEnd=!!input.observationEnd;
 if(hasStart!==hasEnd)throw new Error('集計開始・終了日は両方を指定するか、両方空欄にして完了月数を指定してください。');
 let fromDates=null;
 if(hasStart){if(!validDate(input.observationStart)||!validDate(input.observationEnd)||input.observationStart!==input.start||input.observationEnd>input.end)throw new Error('集計期間は対象事業年度の開始日から年度内の完了月末までにしてください。期中開始データ・部分月は換算しません。');for(let m=1;m<=12;m++)if(monthEnd(input.start,m)===input.observationEnd)fromDates=m;if(!fromDates)throw new Error('集計終了日が完了月末ではありません。欠落・部分月を確認してください。');}
 let months=input.completedMonths!==''&&input.completedMonths!==undefined?Number(amount(input.completedMonths,'完了月数')):fromDates;
 if(!Number.isInteger(months)||months<1||months>12)throw new Error('完了月数は1〜12か月にしてください。');
 if(fromDates&&fromDates!==months)throw new Error('集計期間と完了月数が一致しません。');
 const start=input.start,end=hasEnd?input.observationEnd:monthEnd(start,months);
 if(input.observedMonths){const listed=input.observedMonths.split('|').map(x=>x.trim()),expected=Array.from({length:months},(_,i)=>{const d=new Date(start+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+i);return d.toISOString().slice(0,7);});if(listed.length!==expected.length||listed.some((x,i)=>x!==expected[i]))throw new Error('月一覧に欠落・重複・開始位置の相違があります。');}
 const basis=(key,label)=>{if(typeof input[key]!=='string'||!input[key].trim())throw new Error(label+'の根拠を入力してください。');return input[key].trim();};
 const adjustmentBasis=basis('forecastAdjustmentBasis','補正・残月給与・通常補塡の年末見込'),subsidyBasis=basis('forecastSubsidyBasis','助成金の年末見込'),taxBasis=basis('forecastTaxBasis','調整前法人税額の年末見込');
 const cumulative=amount(input.grossCurrent,'当期給与累計'),adjustment=signedAmount(input.annualAdjustment);
 let regularAnnual,bonus=0n,formula,assumptions=[];
 if(input.bonusSeparated==='yes'){
  const paid=amount(input.paidBonus,'既払い賞与'),planned=amount(input.plannedBonus,'予定賞与');
  if(months===12&&planned>0n)throw new Error('12か月完了後の予定賞与は0にしてください。');
  if(input.remainingRegular!==''&&input.remainingRegular!==undefined){const remaining=amount(input.remainingRegular,'残月の通常給与');if(months===12&&remaining>0n)throw new Error('12か月完了後の残月給与は0にしてください。');regularAnnual=cumulative+remaining;formula=`通常給与累計 ${cumulative}円 + 残月給与見込 ${remaining}円 + 既払賞与 ${paid}円 + 予定賞与 ${planned}円 + 補正 ${adjustment}円`;}
  else{regularAnnual=cumulative*12n/BigInt(months);formula=`通常給与累計 ${cumulative}円 ÷ ${months}月 × 12月（円未満切捨て） + 既払賞与 ${paid}円 + 予定賞与 ${planned}円 + 補正 ${adjustment}円`;}
  bonus=paid+planned;assumptions.push('既払い賞与は12/月数を掛けず、その実額と今後の予定賞与を加算。');
 }else if(input.bonusSeparated==='no'){
  if(input.forecastSimpleAssumption!=='yes')throw new Error('賞与を分離できないCSVでは、単純換算の仮定と補正の確認が必要です。');
  if(input.remainingRegular)throw new Error('賞与を分離できない場合は残月通常給与を使わず、年間追加補正で補正してください。');
  regularAnnual=cumulative*12n/BigInt(months);formula=`賞与を含む給与累計 ${cumulative}円 ÷ ${months}月 × 12月（円未満切捨て） + 補正 ${adjustment}円`;
  assumptions.push('賞与を分離できない単純換算。既払い賞与も膨らむ可能性があり、追加補正で調整した仮定に依存。');
 }else throw new Error('給与累計から賞与を分離できるか指定してください。');
 const annual=regularAnnual+bonus+adjustment;if(annual<0n)throw new Error('追加補正後の年間給与が負数です。');amount(String(annual),'年間見込給与');
 const projected={...input,grossCurrent:String(annual)};
 const continuousKnown=input.forecastContinuousAssumed==='yes'&&!!input.forecastContinuousBasis?.trim();
 projected.continuousReviewed=input.continuousReviewed==='no'?'no':continuousKnown?'yes':'unknown';
 if(selectRules(input.start)?.training&&input.trainingClaim==='yes'&&!input.forecastTrainingBasis?.trim())projected.trainingReviewed='unknown';
 assumptions.push('前期の給与・通常補塡・助成金は前期通年実績を使用。');
 assumptions.push('継続雇用者の全月支給・被保険者等の全期間要件は期中には確定しない。'+(continuousKnown?'入力した年末見込の仮定により算定。':'この枠は根拠未確認。'));
 assumptions.push('継続給与・補塡・助成金・教育費・法人税額は入力された年末見込を使い、機械的に年換算していない。');
 return{input:projected,meta:{label:'年間見込・確定判定ではない',start,end,months,cumulative:String(cumulative),annual:String(annual),adjustment:String(adjustment),formula,assumptions,basis:{'補正・通常補塡':adjustmentBasis,'助成金':subsidyBasis,'法人税額':taxBasis,'継続雇用者':input.forecastContinuousBasis||'未確認','教育訓練費':input.forecastTrainingBasis||'未確認'}}};
}
