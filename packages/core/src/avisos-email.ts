/**
 * Avisos por e-mail (D-131, item E; `docs/53_AVISOS_POR_EMAIL.md`): os textos do aviso de fim do teste grátis, o único e-mail de serviço da
 * Clarevo além dos do login (confirmação de cadastro e nova senha, que o Supabase Auth manda pelo SMTP do Resend). Ele sai uma vez, 2 dias
 * antes do fim do teste, pela função do servidor "aviso-fim-do-teste" (gerada do núcleo por `scripts/gerar-funcoes.js`), e só quando o
 * Enzo ligar (desligado no banco e sem a chave do Resend até lá).
 *
 * Regras do texto: e-mail de serviço, sem propaganda, sem pressa nem palavra de urgência, sem preço (aponta a tela Assinatura), neutro quanto a
 * gênero, "a Clarevo" no feminino, sem travessão e sem a expressão vetada, sem recomendar produto financeiro. Usa só a data do fim do teste:
 * nem o nome da pessoa entra. Texto puro e HTML simples, sem imagem, sem pixel de abertura e sem link rastreado (o endereço vai inteiro, como
 * aparece). Sem dependências além de `legal.ts`, para a função gerada levar só isto e o servidor.
 */
import { SUPPORT_EMAIL } from './legal';

/** Remetente: o mesmo dos e-mails do login (docs/05, seção 3; P-008). */
export const NOTICE_EMAIL_FROM_ADDRESS = 'nao-responda@clarevo.app.br';
export const NOTICE_EMAIL_FROM = `Clarevo <${NOTICE_EMAIL_FROM_ADDRESS}>`;
/** Resposta ao e-mail vai para o suporte (o mesmo de `site/dados-da-empresa.json`, conferido em legal.test). */
export const NOTICE_EMAIL_REPLY_TO = SUPPORT_EMAIL;
/** A tela Assinatura do app na web (Conta, Assinatura). */
export const SUBSCRIPTION_PATH = '/conta/assinatura';
/** Quantos dias antes do fim do teste o aviso sai (D-131 E; o banco usa o mesmo número, migração 0051). */
export const TRIAL_NOTICE_DAYS_BEFORE = 2;

export interface NoticeEmail {
  subject: string;
  text: string;
  html: string;
}

/** "AAAA-MM-DD" para "DD/MM/AAAA". Fora do formato: erro (a função não manda aviso com data errada). */
export function noticeDate(isoDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!m) throw new Error('data inválida');
  const [, y, mo, d] = m;
  const check = new Date(`${isoDay}T12:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== isoDay) throw new Error('data inválida');
  return `${d}/${mo}/${y}`;
}

/** O endereço da tela Assinatura a partir da origem do app (sem barra no fim). */
export function subscriptionUrl(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}${SUBSCRIPTION_PATH}`;
}

export const TRIAL_ENDING_EMAIL_TEXT = {
  subject: (date: string) => `O teste grátis da sua conta na Clarevo termina em ${date}`,
  greeting: 'Olá,',
  ends: (date: string) => `O teste grátis da sua conta na Clarevo termina em ${date}.`,
  after:
    'Quando o teste terminar, sem assinatura, a conta fica só para ver e exportar; nada é apagado. Tudo o que você anotou continua guardado, ' +
    'e você pode assinar quando quiser para voltar a anotar.',
  howTo: 'Para assinar, abra Conta, Assinatura, no app ou na web:',
  oneTime: 'Este é um aviso único sobre a sua conta.',
  signature: 'Clarevo',
  support: (email: string) => `Dúvidas: ${email}`,
} as const;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * O aviso de fim do teste: assunto, texto puro e HTML simples, com a data do fim do teste (dia de Brasília, "AAAA-MM-DD") e a origem do app
 * na web (`https://app.clarevo.app.br`). As duas versões dizem o mesmo.
 */
export function trialEndingEmail(trialEndsOn: string, appUrl: string): NoticeEmail {
  const t = TRIAL_ENDING_EMAIL_TEXT;
  const date = noticeDate(trialEndsOn);
  const url = subscriptionUrl(appUrl);
  if (!/^https:\/\/[a-z0-9.-]+\/conta\/assinatura$/.test(url) && !/^http:\/\/localhost(:\d+)?\/conta\/assinatura$/.test(url)) {
    throw new Error('endereço do app inválido');
  }
  const subject = t.subject(date);
  const text = [t.greeting, '', t.ends(date), '', t.after, '', t.howTo, url, '', t.oneTime, '', t.signature, t.support(SUPPORT_EMAIL), ''].join('\n');
  const p = (inner: string, style = '') => `<p style="margin:0 0 16px${style}">${inner}</p>`;
  const html = [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(subject)}</title></head>`,
    '<body style="margin:0;padding:24px;background:#ffffff;color:#17223B;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">',
    p(escapeHtml(t.greeting)),
    p(escapeHtml(t.ends(date))),
    p(escapeHtml(t.after)),
    p(`${escapeHtml(t.howTo)}<br><a href="${escapeHtml(url)}" style="color:#2457F5">${escapeHtml(url)}</a>`),
    p(escapeHtml(t.oneTime)),
    p(`${escapeHtml(t.signature)}<br>${escapeHtml(t.support(''))}<a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#2457F5">${escapeHtml(SUPPORT_EMAIL)}</a>`, ';font-size:14px'),
    '</body>',
    '</html>',
    '',
  ].join('\n');
  return { subject, text, html };
}
