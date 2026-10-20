// Public endpoint only. No API key, payroll, company or file data is sent here.
export const CHECK_SERVICE_ORIGIN='https://wage-tax-rule-check.takatrp0222.chatgpt.site';
export function checkEndpoint(page=globalThis.location){if(['127.0.0.1','localhost','[::1]'].includes(page.hostname))return'/api/check';if(!CHECK_SERVICE_ORIGIN.startsWith('https://'))throw new Error('公式確認バックエンドの公開設定が未完了です');return CHECK_SERVICE_ORIGIN+'/api/check';}
