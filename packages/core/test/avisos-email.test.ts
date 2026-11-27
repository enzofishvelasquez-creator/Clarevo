/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NOTICE_EMAIL_FROM,
  NOTICE_EMAIL_REPLY_TO,
  SUBSCRIPTION_PATH,
  SUPPORT_EMAIL,
  TRIAL_ENDING_EMAIL_TEXT,
  TRIAL_NOTICE_DAYS_BEFORE,
  noticeDate,
  subscriptionUrl,
  trialEndingEmail,
} from '../src';

/**
 * Aviso de fim do teste por e-mail (D-131, item E; docs/53): o texto do e-mail único, 2 dias antes do fim do teste. Serviço, sem propaganda,
 * sem pressa nem urgência, sem preço, neutro quanto a gênero, "a Clarevo" no feminino, sem travessão e sem a expressão vetada, sem produto
 * financeiro. Texto puro e HTML simples, sem imagem, sem pixel e sem link rastreado.
 */
const APP = 'https://app.clarevo.app.br';
const msg = trialEndingEmail('2026-12-12', APP);

/** As mesmas regras de copy.test (produto financeiro, travessões e a expressão vetada, montada aqui para não aparecer escrita). */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[\u2013\u2014]/i;
/** Pressa, urgência, propaganda e preço: nada disso no aviso. */
const PRESSURE =
  /\b(últimos? dias?|última chance|não perca|corra|urgente|imediatamente|agora|apenas|só hoje|aproveite|oferta|desconto|promoção|promo|garanta|exclusiv\w*|expira\w*|perder|perca|grátis por pouco tempo)\b|R\$|\d+%|!/i;
/** Gênero marcado na pessoa que lê, e o masculino diante de "Clarevo". */
const GENDER = /\b(obrigad[oa]|bem-vind[oa]|car[oa] (cliente|usuári)|prezad[oa]|usuári[oa]s?|client[ea]s?|pront[oa] para|atent[oa])\b|(?<![\p{L}])(o|do|no|ao|pelo)\s+Clarevo/iu;
const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

describe('aviso de fim do teste por e-mail (D-131 E): o texto', () => {
  it('o texto puro, inteiro (qualquer mudança no texto passa por aqui)', () => {
    expect(msg.subject).toBe('O teste grátis da sua conta na Clarevo termina em 12/12/2026');
    expect(msg.text).toBe(
      [
        'Olá,',
        '',
        'O teste grátis da sua conta na Clarevo termina em 12/12/2026.',
        '',
        'Quando o teste terminar, sem assinatura, a conta fica só para ver e exportar; nada é apagado. Tudo o que você anotou continua guardado, e você pode assinar quando quiser para voltar a anotar.',
        '',
        'Para assinar, abra Conta, Assinatura, no app ou na web:',
        'https://app.clarevo.app.br/conta/assinatura',
        '',
        'Este é um aviso único sobre a sua conta.',
        '',
        'Clarevo',
        'Dúvidas: suporte@clarevo.app.br',
        '',
      ].join('\n'),
    );
  });

  it('tem o que o aviso precisa dizer: a data, o que acontece depois, como assinar, aviso único e quem manda', () => {
    for (const body of [msg.text, strip(msg.html)]) {
      expect(body).toContain('termina em 12/12/2026');
      expect(body).toContain('a conta fica só para ver e exportar; nada é apagado');
      expect(body).toContain('Conta, Assinatura');
      expect(body).toContain('https://app.clarevo.app.br/conta/assinatura');
      expect(body).toContain('Este é um aviso único sobre a sua conta.');
      expect(body).toContain('Clarevo');
      expect(body).toContain(SUPPORT_EMAIL);
    }
    expect(TRIAL_NOTICE_DAYS_BEFORE).toBe(2);
    expect(SUBSCRIPTION_PATH).toBe('/conta/assinatura');
  });

  it('o HTML diz o mesmo que o texto puro, e o assunto vai no título', () => {
    const textLines = msg.text.split('\n').filter((l) => l !== '');
    const html = strip(msg.html);
    for (const line of textLines) expect(html).toContain(line);
    expect(msg.html).toContain(`<title>${msg.subject}</title>`);
    expect(msg.html).toContain('<html lang="pt-BR">');
  });

  it('sem imagem, pixel, script, folha de estilo externa nem link rastreado: só o endereço da tela Assinatura e o e-mail do suporte', () => {
    expect(msg.html).not.toMatch(/<img|<script|<link|<iframe|<object|<form|src=|url\(|background-image/i);
    const hrefs = [...msg.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['https://app.clarevo.app.br/conta/assinatura', `mailto:${SUPPORT_EMAIL}`]);
    // Nenhum parâmetro de rastreio nem redirecionamento: o endereço aparece inteiro, como é.
    for (const body of [msg.text, msg.html]) expect(body).not.toMatch(/utm_|[?&](ref|src|cid|mc_)=|click\.|track/i);
    const urls = [...msg.text.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
    expect(urls).toEqual(['https://app.clarevo.app.br/conta/assinatura']);
  });

  it('passa nas regras de texto: sem produto financeiro, travessão, a expressão vetada, pressa, preço nem gênero marcado', () => {
    for (const body of [msg.subject, msg.text, strip(msg.html), ...Object.values(TRIAL_ENDING_EMAIL_TEXT).map((v) => (typeof v === 'function' ? v('12/12/2026') : v))]) {
      expect(body, body).not.toMatch(FORBIDDEN);
      expect(body, body).not.toMatch(PRESSURE);
      expect(body, body).not.toMatch(GENDER);
    }
    // Nenhum número além da data (nem preço, nem prazo): tirada a data, sobra nenhum algarismo.
    expect(msg.text.replaceAll('12/12/2026', '')).not.toMatch(/\d/);
    expect(msg.subject.replace('12/12/2026', '')).not.toMatch(/\d/);
    // As listas reprovam o que devem.
    for (const bad of ['Últimos dias!', 'Não perca', 'Assine agora', 'R$ 29,90', 'Obrigado', 'o Clarevo', 'a \u2014 b']) {
      expect(PRESSURE.test(bad) || GENDER.test(bad) || FORBIDDEN.test(bad), bad).toBe(true);
    }
  });

  it('remetente e resposta: os da Clarevo (o mesmo remetente do login; a resposta vai ao suporte de site/dados-da-empresa.json)', () => {
    expect(NOTICE_EMAIL_FROM).toBe('Clarevo <nao-responda@clarevo.app.br>');
    expect(NOTICE_EMAIL_REPLY_TO).toBe(SUPPORT_EMAIL);
    const dados = JSON.parse(readFileSync(join(__dirname, '../../../site/dados-da-empresa.json'), 'utf8')) as Record<string, string>;
    expect(dados['E-MAIL DE SUPORTE']).toBe(SUPPORT_EMAIL);
  });

  it('a data e o endereço: DD/MM/AAAA de um dia real; o endereço da tela Assinatura a partir da origem do app', () => {
    expect(noticeDate('2026-01-05')).toBe('05/01/2026');
    expect(noticeDate('2028-02-29')).toBe('29/02/2028');
    for (const bad of ['2026-02-30', '2026-13-01', '12/12/2026', '2026-12-1', '']) expect(() => noticeDate(bad), bad).toThrow();
    expect(subscriptionUrl('https://app.clarevo.app.br/')).toBe('https://app.clarevo.app.br/conta/assinatura');
    expect(trialEndingEmail('2026-12-12', 'http://localhost:8081').text).toContain('http://localhost:8081/conta/assinatura');
    for (const bad of ['javascript:alert(1)', 'https://app.clarevo.app.br/x?y', 'ftp://app.clarevo.app.br', 'https://a b']) {
      expect(() => trialEndingEmail('2026-12-12', bad), bad).toThrow();
    }
  });

  it('o HTML escapa o que entra (a data e o endereço vêm de fora do módulo)', () => {
    expect(msg.html).not.toMatch(/<(?!\/?(html|head|meta|title|body|p|br|a)\b|!doctype)/i);
  });
});
