import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DELETE_CONFIRMATION_WORD,
  DELETE_ERROR_CODES,
  DELETE_ERROR_TEXT,
  DELETE_TEXT,
  FAMILY_DEPARTED_NAME,
  FAMILY_NEUTRAL_NAME,
  FAMILY_TEXT,
  authorLabel,
  canSubmitDelete,
  createDeletionIntent,
  deleteConfirmationError,
  deleteErrorText,
  deleteFamilyOutcome,
  deleteFamilyText,
  deleteOutcomeUncertain,
  normalizeDeleteConfirmation,
  sessionEndAfterDeletion,
  type FamilyMember,
} from '../src';

/** Termos proibidos (como em copy.test.ts): produto financeiro, travessões longos e a expressão vetada. */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[–—]/i;
/** Marcas de gênero nas palavras que descrevem pessoas (o texto do produto é neutro). */
const GENDERED = /\b(convidad[oa]s?|titulares?\s+[oa]|bem-vind[oa]|leitora?|membra|dono|dona|administrador[a]?|sozinh[oa]|únic[oa]\s+titular|obrigad[oa])\b/i;
/** Tom de alerta, culpa ou pressão para ficar: a exclusão é uma escolha da pessoa, sem apelo. */
const PRESSURE = /tem certeza|cuidado|atenção|perigo|irrevers|lamentamos|sentiremos|sentir[aã]o sua falta|fique|continue com a gente|volte atrás|vai perder|você perderá|não faça|última chance|\bapenas\b.*\bpense\b/i;

const member = (over: Partial<FamilyMember> & Pick<FamilyMember, 'personId' | 'firstName'>): FamilyMember => ({
  role: 'membro',
  status: 'ativo',
  isMe: false,
  joinedAt: '2026-10-01T12:00:00.000Z',
  leftAt: null,
  ...over,
});

describe('confirmação para excluir a conta (D-058)', () => {
  it('a palavra é EXCLUIR; o app aceita maiúsculas, minúsculas e espaços nas pontas', () => {
    expect(DELETE_CONFIRMATION_WORD).toBe('EXCLUIR');
    for (const ok of ['EXCLUIR', 'excluir', 'Excluir', '  excluir  ', 'ExCluIr', '\tEXCLUIR\n']) {
      expect(deleteConfirmationError(ok), JSON.stringify(ok)).toBeNull();
      expect(normalizeDeleteConfirmation(ok)).toBe('EXCLUIR');
    }
  });

  it('qualquer outra coisa não confirma', () => {
    for (const bad of ['', ' ', 'EXCLUI', 'EXCLUIRR', 'EXCLUIR!', 'EXCLUIR minha conta', 'E X C L U I R', 'sim', 'ok', 'EXCLUÍR', 'x', null, undefined, 7, {}, []]) {
      expect(deleteConfirmationError(bad), JSON.stringify(bad)).toBe('confirmacao_invalida');
    }
    expect(normalizeDeleteConfirmation(undefined)).toBe('');
  });
});

describe('o que acontece com a Família ao excluir a conta (regra 3)', () => {
  const me = (over: Partial<FamilyMember> = {}) => member({ personId: 'eu', firstName: 'Ana', role: 'titular', isMe: true, ...over });

  it('sem Família: nenhuma; membro ou leitor: sai; titular sem outra pessoa ativa: encerra; titular com outra pessoa ativa: bloqueia', () => {
    expect(deleteFamilyOutcome(null)).toBe('nenhuma');
    expect(deleteFamilyOutcome(undefined)).toBe('nenhuma');
    expect(deleteFamilyOutcome({ role: 'membro', members: [me({ role: 'membro' }), member({ personId: 'b', firstName: 'Bia', role: 'titular' })] })).toBe('sai');
    expect(deleteFamilyOutcome({ role: 'leitor', members: [me({ role: 'leitor' }), member({ personId: 'b', firstName: 'Bia', role: 'titular' })] })).toBe('sai');
    expect(deleteFamilyOutcome({ role: 'titular', members: [me()] })).toBe('encerra');
    // Ex-membros não seguram a titular: só pessoa ativa.
    expect(
      deleteFamilyOutcome({
        role: 'titular',
        members: [me(), member({ personId: 'b', firstName: 'Bia', status: 'ex-membro', leftAt: '2026-10-05T00:00:00.000Z' }), member({ personId: 'c', firstName: FAMILY_DEPARTED_NAME, status: 'ex-membro', leftAt: '2026-10-06T00:00:00.000Z' })],
      }),
    ).toBe('encerra');
    expect(deleteFamilyOutcome({ role: 'titular', members: [me(), member({ personId: 'b', firstName: 'Bia' })] })).toBe('bloqueia');
    expect(deleteFamilyOutcome({ role: 'titular', members: [me(), member({ personId: 'b', firstName: 'Bia', role: 'leitor' })] })).toBe('bloqueia');
  });

  it('só confirma com a palavra certa e sem o bloqueio da titular', () => {
    expect(canSubmitDelete('excluir', 'nenhuma')).toBe(true);
    expect(canSubmitDelete('excluir', 'sai')).toBe(true);
    expect(canSubmitDelete('excluir', 'encerra')).toBe(true);
    expect(canSubmitDelete('excluir', 'bloqueia')).toBe(false);
    expect(canSubmitDelete('exclui', 'nenhuma')).toBe(false);
    expect(canSubmitDelete('', 'sai')).toBe(false);
  });

  it('uma frase para cada resultado, com o nome da Família', () => {
    expect(deleteFamilyText('nenhuma', 'Casa')).toBe(DELETE_TEXT.familyNone);
    expect(deleteFamilyText('sai', 'Casa Lima')).toBe(DELETE_TEXT.familyLeaves('Casa Lima'));
    expect(deleteFamilyText('encerra', 'Casa Lima')).toBe(DELETE_TEXT.familyEnds('Casa Lima'));
    expect(deleteFamilyText('bloqueia', 'Casa Lima')).toBe(DELETE_TEXT.familyBlocked('Casa Lima'));
    expect(DELETE_TEXT.familyLeaves('Casa Lima')).toContain('"Pessoa que saiu"');
    expect(DELETE_TEXT.familyLeaves('Casa Lima')).toContain('nome e o seu e-mail são apagados');
    expect(DELETE_TEXT.familyEnds('Casa Lima')).toContain('apagados, como o seu Pessoal');
    expect(DELETE_TEXT.familyBlocked('Casa Lima')).toContain('passe a titularidade para outra pessoa ou remova as pessoas da Família');
    // O caminho para passar a titularidade usa os nomes reais da tela da Família.
    expect(DELETE_TEXT.familyBlockedHow).toContain(`"${FAMILY_TEXT.manage}"`);
    expect(DELETE_TEXT.familyBlockedHow).toContain(`"${FAMILY_TEXT.transfer}"`);
    expect(DELETE_TEXT.familyBlockedHow).toContain(`"${FAMILY_TEXT.remove}"`);
  });
});

describe('autoria de quem excluiu a conta (regra 3)', () => {
  it('"Pessoa que saiu" é o rótulo de quem excluiu, sem nome e sem prefixo de ex-membro', () => {
    expect(FAMILY_DEPARTED_NAME).toBe('Pessoa que saiu');
    expect(FAMILY_DEPARTED_NAME).not.toBe(FAMILY_NEUTRAL_NAME);
    const members = [
      member({ personId: 'a', firstName: 'Ana', isMe: true, role: 'titular' }),
      member({ personId: 'n', firstName: 'Nina', status: 'ex-membro', leftAt: '2026-10-05T00:00:00.000Z' }),
      member({ personId: 'x', firstName: FAMILY_DEPARTED_NAME, status: 'ex-membro', leftAt: '2026-10-06T00:00:00.000Z' }),
    ];
    expect(authorLabel(members, 'a')).toBe('Ana (você)');
    expect(authorLabel(members, 'n')).toBe('ex-membro · Nina');
    expect(authorLabel(members, 'x')).toBe('Pessoa que saiu');
    expect(FAMILY_TEXT.exMember(FAMILY_DEPARTED_NAME)).toBe('Pessoa que saiu');
    expect(FAMILY_TEXT.exMember('Nina')).toBe('ex-membro · Nina');
    expect(FAMILY_TEXT.exMemberA11y(FAMILY_DEPARTED_NAME)).toBe('Ex-membro, pessoa que excluiu a conta');
    expect(FAMILY_TEXT.exMemberA11y('Nina')).toBe('Ex-membro Nina');
    expect(FAMILY_TEXT.notedBy(authorLabel(members, 'x')!)).toBe('Anotado por Pessoa que saiu');
  });
});

describe('textos de excluir a conta (D-058)', () => {
  const all: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') all.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(DELETE_TEXT);
  walk(DELETE_ERROR_TEXT);
  all.push(DELETE_TEXT.familyLeaves('Casa Lima'), DELETE_TEXT.familyEnds('Casa Lima'), DELETE_TEXT.familyBlocked('Casa Lima'));
  for (const outcome of ['nenhuma', 'sai', 'encerra', 'bloqueia'] as const) all.push(deleteFamilyText(outcome, 'Casa'));

  it('português do Brasil, neutros quanto a gênero, sem travessão, sem a expressão vetada, sem produto financeiro', () => {
    expect(all.length).toBeGreaterThan(30);
    for (const t of all) {
      expect(t.trim(), t).not.toBe('');
      expect(t, t).not.toMatch(FORBIDDEN);
      expect(t, t).not.toMatch(GENDERED);
    }
  });

  it('sem julgamento, sem alerta e sem pressão para ficar', () => {
    for (const t of all) expect(t, t).not.toMatch(PRESSURE);
    // Nenhum ponto de exclamação: a tela explica, não grita.
    for (const t of all) expect(t, t).not.toContain('!');
  });

  it('o arquivo-fonte deletion.ts não tem travessão nem a expressão vetada', () => {
    const src = readFileSync(join(fileURLToPath(new URL('../src/', import.meta.url)), 'deletion.ts'), 'utf8');
    expect(src).not.toMatch(/[–—]/);
    expect(src).not.toMatch(/faz(er|endo)?\s+sentido/i);
  });

  it('diz o que a regra diz: perde o acesso na hora, não desfaz, e-mail livre, conta nova começa vazia', () => {
    expect(DELETE_TEXT.intro).toContain('perde o acesso na hora');
    expect(DELETE_TEXT.intro).toContain('não é possível desfazer');
    expect(DELETE_TEXT.intro).toContain('e-mail fica livre');
    expect(DELETE_TEXT.intro).toContain('começa vazia');
    expect(DELETE_TEXT.erased).toHaveLength(5);
    expect(DELETE_TEXT.erased.join(' ')).toContain('de verdade');
    expect(DELETE_TEXT.erased.join(' ')).toContain('A empresa vê só que a licença terminou');
    expect(DELETE_TEXT.keptNone).toBe('Nada fica guardado para uso depois. As cópias de segurança do banco de dados podem manter dados apagados por um tempo.');
    expect(DELETE_TEXT.familyGeneral).toContain('"Pessoa que saiu"');
    expect(DELETE_TEXT.exportButton).toBe('Exportar meus dados antes');
    expect(DELETE_TEXT.submit).toBe('Excluir minha conta');
    expect(DELETE_TEXT.confirmLabel).toContain(DELETE_CONFIRMATION_WORD);
    expect(DELETE_TEXT.done).toBe('Sua conta foi excluída.');
    expect(DELETE_TEXT.demo).toContain('nada é apagado');
    expect(DELETE_TEXT.whoSees).toContain('apaga o Pessoal inteiro, de verdade');
    expect(DELETE_TEXT.whoSees).toContain('"Pessoa que saiu"');
    expect(DELETE_TEXT.whoSees).toContain('só vê que a licença terminou');
  });

  it('cada erro conhecido tem texto; o que não é conhecido cai na mensagem geral', () => {
    expect([...DELETE_ERROR_CODES]).toEqual(['confirmacao_invalida', 'transferir_antes']);
    for (const code of DELETE_ERROR_CODES) expect(deleteErrorText(code)).toBe((DELETE_ERROR_TEXT as Record<string, string>)[code]);
    expect(deleteErrorText('transferir_antes')).toContain('passe a titularidade');
    expect(deleteErrorText('rede')).toBe(DELETE_ERROR_TEXT.rede);
    expect(deleteErrorText('qualquer_outro')).toBe(DELETE_ERROR_TEXT.failed);
    expect(deleteErrorText('')).toBe(DELETE_ERROR_TEXT.failed);
  });
});

describe('resposta perdida ao excluir a conta (D-058, revisão de segurança)', () => {
  it('a intenção é marcada antes do pedido e lida uma única vez, quando a sessão termina', () => {
    const intent = createDeletionIntent();
    expect(intent.consume()).toBe('nenhuma');
    intent.begin();
    expect(intent.consume()).toBe('em-andamento');
    expect(intent.consume()).toBe('nenhuma');
    intent.begin();
    intent.confirm();
    expect(intent.consume()).toBe('confirmada');
    expect(intent.consume()).toBe('nenhuma');
    // Recusa definitiva: a conta segue, e a sessão que terminar depois não é uma exclusão.
    intent.begin();
    intent.clear();
    expect(intent.consume()).toBe('nenhuma');
    // Cada marcador é independente.
    const other = createDeletionIntent();
    intent.begin();
    expect(other.consume()).toBe('nenhuma');
  });

  it('só a falta de resposta deixa o resultado incerto; qualquer recusa do banco é definitiva', () => {
    expect(deleteOutcomeUncertain('rede')).toBe(true);
    expect(deleteOutcomeUncertain('desconhecido')).toBe(true);
    for (const code of ['confirmacao_invalida', 'transferir_antes', 'chave_reutilizada', 'chave_invalida', 'sem_permissao', 'nao_autenticado', '']) {
      expect(deleteOutcomeUncertain(code), code).toBe(false);
    }
  });

  it('sessão que termina: confirmada abre "Sua conta foi excluída"; sem confirmação, limpa o aparelho e diz que não foi possível confirmar', () => {
    expect(sessionEndAfterDeletion('confirmada', true)).toEqual({ screen: 'excluida', forgetDevice: false });
    expect(sessionEndAfterDeletion('confirmada', false)).toEqual({ screen: 'excluida', forgetDevice: false });
    // A resposta se perdeu e a sessão caiu sozinha: o aparelho esquece a pessoa e a tela manda entrar de novo para conferir.
    expect(sessionEndAfterDeletion('em-andamento', false)).toEqual({ screen: 'nao-confirmada', forgetDevice: true });
    // Quem sai do aparelho por vontade própria não excluiu nada, mesmo com um pedido sem resposta pendente.
    expect(sessionEndAfterDeletion('em-andamento', true)).toBeNull();
    // Sem pedido de exclusão, vale o fluxo de sempre (sessão expirada ou saída manual).
    expect(sessionEndAfterDeletion('nenhuma', false)).toBeNull();
    expect(sessionEndAfterDeletion('nenhuma', true)).toBeNull();
  });

  it('o ciclo inteiro: pedido sem resposta e sessão caída; pedido recusado e sessão expirada; pedido confirmado', () => {
    const intent = createDeletionIntent();
    // A resposta se perde (rede) e a sessão cai: aparelho limpo, tela "não foi possível confirmar".
    intent.begin();
    expect(deleteOutcomeUncertain('rede')).toBe(true);
    expect(sessionEndAfterDeletion(intent.consume(), false)).toEqual({ screen: 'nao-confirmada', forgetDevice: true });
    // O banco recusa (titular com outras pessoas): a intenção é limpa, e uma sessão que expira depois segue o fluxo de sempre.
    intent.begin();
    expect(deleteOutcomeUncertain('transferir_antes')).toBe(false);
    intent.clear();
    expect(sessionEndAfterDeletion(intent.consume(), false)).toBeNull();
    // O banco confirma: "Sua conta foi excluída".
    intent.begin();
    intent.confirm();
    expect(sessionEndAfterDeletion(intent.consume(), true)).toEqual({ screen: 'excluida', forgetDevice: false });
  });

  it('o texto de "não foi possível confirmar" manda entrar de novo para conferir e não pressiona', () => {
    expect(DELETE_TEXT.unsureTitle).toBe('Não foi possível confirmar a exclusão');
    expect(DELETE_TEXT.unsureBody).toContain('Entre de novo para conferir');
    expect(DELETE_TEXT.unsureBody).toContain('e-mail está livre');
    expect(DELETE_TEXT.unsureBody).toContain('continuam como estavam');
    expect(DELETE_TEXT.unsureEnter).toBe('Entrar');
    expect(DELETE_TEXT.unsureTitle).not.toBe(DELETE_TEXT.doneTitle);
  });
});
