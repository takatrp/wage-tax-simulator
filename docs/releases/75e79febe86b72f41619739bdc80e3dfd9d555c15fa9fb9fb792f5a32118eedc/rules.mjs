// All rules remain draft until an independent tax reviewer approves code + source hashes.
export const TOOL_NAME = '賃上げ促進税制シミュレーター';
export const RULE_VERSION = 'jp-corp-wage-2026.10.20-web.9';
export const SOURCES = [
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
export const RULESETS = [
  { id: 'r6', from: '2024-04-01', through: '2026-03-31', name: '令和6年度改正 / 2026年4月1日前開始', training: true,
    sme: [[150,15],[250,30]], mid: [[300,10],[400,25]], all: [[300,10],[400,15],[500,20],[700,25]] },
  { id: 'r8', from: '2026-04-01', through: '2027-03-31', name: '令和8年度改正 / 教育訓練費上乗せ廃止', training: false,
    sme: [[150,15],[250,30]], mid: [[400,10],[500,15],[600,25]], all: null }
];
export function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s; }
export function selectRules(start) { return validDate(start) ? RULESETS.find(r => start >= r.from && start <= r.through) ?? null : null; }
export const FRAME_NAMES = { sme:'中小企業者等向け', mid:'中堅企業向け', all:'全企業向け' };
// Current NTA 5432 describes FY starts from 2025-04-01; it cannot approve 2024 eligibility.
export const FEATURES = {
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
export function baseFeature(frame,start){const r=selectRules(start);if(!r||!r[frame])return null;if(frame==='sme')return start<'2025-04-01'?'smeR6Early':r.id==='r6'?'smeR6':'smeR8';return frame+(r.id==='r6'?'R6':'R8');}
