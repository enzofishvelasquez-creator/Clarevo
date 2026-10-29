import { describe, expect, it } from 'vitest';
import {
  FAMILY_ACTIONS,
  FAMILY_ERROR_CODES,
  FAMILY_ERROR_TEXT,
  FAMILY_MAX_PEOPLE,
  FAMILY_NAME_MAX,
  FAMILY_NEUTRAL_NAME,
  FAMILY_ROLE_HELP,
  FAMILY_ROLE_LABEL,
  FAMILY_TEXT,
  INVITE_BASE_URL,
  INVITE_CODE_PATTERN,
  INVITE_TEXT,
  INVITE_VALID_DAYS,
  authorLabel,
  canEndFamily,
  contextLabelFor,
  contextKindOfItem,
  contextName,
  familyErrorText,
  familyNameError,
  firstNameOf,
  inviteCodeFromText,
  inviteCodeHash,
  inviteExpiryDay,
  inviteIsValid,
  inviteLink,
  inviteRoleError,
  isFamilyAction,
  isInviteRole,
  memberIsActionable,
  normalizeFamilyName,
  normalizeInviteCode,
  roleCanWrite,
  roleIsOwner,
  seatsLeft,
  sha256Hex,
  unsavedChangesText,
  type FamilyInvite,
  type FamilyMember,
} from '../src';

/** Termos proibidos (como em copy.test.ts): produto financeiro, promessa de rendimento, travessões longos e a expressão vetada. */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[–—]/i;
/** Marcas de gênero nas palavras que descrevem pessoas (o texto do produto é neutro). */
const GENDERED = /\b(convidad[oa]s?|titulares?\s+[oa]|bem-vind[oa]|leitora?|membra|dono|dona|administrador[a]?)\b/i;

const member = (over: Partial<FamilyMember> & Pick<FamilyMember, 'personId' | 'firstName'>): FamilyMember => ({
  role: 'membro',
  status: 'ativo',
  isMe: false,
  joinedAt: '2026-10-01T12:00:00.000Z',
  leftAt: null,
  ...over,
});

const invite = (over: Partial<FamilyInvite> = {}): FamilyInvite => ({
  id: 'conv-1',
  contextId: 'fam-1',
  role: 'membro',
  createdBy: 'p1',
  expiresAt: '2026-10-14T12:00:00.000Z',
  usedAt: null,
  cancelledAt: null,
  createdAt: '2026-10-07T12:00:00.000Z',
  ...over,
});

describe('Família: constantes e validação', () => {
  it('seis pessoas, convite de 7 dias, nome de até 60 caracteres', () => {
    expect(FAMILY_MAX_PEOPLE).toBe(6);
    expect(INVITE_VALID_DAYS).toBe(7);
    expect(FAMILY_NAME_MAX).toBe(60);
    expect(INVITE_BASE_URL).toBe('https://app.clarevo.app.br');
  });

  it('nome da Família: de 1 a 60 caracteres, sem os espaços das pontas (a mesma regra do banco)', () => {
    expect(familyNameError('Casa')).toBeNull();
    expect(familyNameError('  Casa  ')).toBeNull();
    expect(familyNameError('x'.repeat(60))).toBeNull();
    expect(familyNameError('x'.repeat(61))).toBe('nome_da_familia_invalido');
    // Contado em caracteres, como o banco (char_length): emoji vale 1, não 2.
    expect(familyNameError('🏠'.repeat(31))).toBeNull();
    expect(familyNameError('🏠'.repeat(60))).toBeNull();
    expect(familyNameError('🏠'.repeat(61))).toBe('nome_da_familia_invalido');
    expect(familyNameError('')).toBe('nome_da_familia_invalido');
    expect(familyNameError('   ')).toBe('nome_da_familia_invalido');
    expect(familyNameError('\t\n')).toBe('nome_da_familia_invalido');
    expect(familyNameError(undefined as unknown as string)).toBe('nome_da_familia_invalido');
    expect(normalizeFamilyName('  Casa Lima \n')).toBe('Casa Lima');
  });

  it('papel do convite: só membro ou leitor', () => {
    expect(inviteRoleError('membro')).toBeNull();
    expect(inviteRoleError('leitor')).toBeNull();
    for (const bad of ['titular', '', null, undefined, 'MEMBRO', 3]) expect(inviteRoleError(bad)).toBe('papel_invalido');
    expect(isInviteRole('leitor')).toBe(true);
    expect(isInviteRole('titular')).toBe(false);
  });

  it('as nove ações da Família', () => {
    expect(FAMILY_ACTIONS).toHaveLength(9);
    for (const a of FAMILY_ACTIONS) expect(isFamilyAction(a)).toBe(true);
    expect(isFamilyAction('criar')).toBe(false);
    expect(isFamilyAction('sair_da_familia')).toBe(false);
  });

  it('primeiro nome: a primeira palavra, no máximo 40 caracteres; e-mail, vazio e início do e-mail viram "Pessoa da Família"', () => {
    expect(FAMILY_NEUTRAL_NAME).toBe('Pessoa da Família');
    expect(firstNameOf('Maria da Silva')).toBe('Maria');
    expect(firstNameOf('  João   Pedro ')).toBe('João');
    expect(firstNameOf('Zé')).toBe('Zé');
    expect(firstNameOf('a'.repeat(60))).toBe('a'.repeat(40));
    expect(firstNameOf('Maria maria@exemplo.test')).toBe('Maria');
    for (const neutral of ['maria@exemplo.test', '@maria', '', '   ', undefined as unknown as string]) expect(firstNameOf(neutral)).toBe(FAMILY_NEUTRAL_NAME);
    // O nome que é o início do e-mail (o que o banco grava quando a pessoa não informa um): exato, no nome inteiro e na primeira palavra.
    const email = 'maria.lopes@exemplo.test';
    expect(firstNameOf('maria.lopes', email)).toBe(FAMILY_NEUTRAL_NAME);
    expect(firstNameOf('  maria.lopes ', email)).toBe(FAMILY_NEUTRAL_NAME);
    expect(firstNameOf('maria.lopes Souza', email)).toBe(FAMILY_NEUTRAL_NAME);
    expect(firstNameOf('Maria Lopes', email)).toBe('Maria');
    expect(firstNameOf('maria', 'maria@exemplo.test')).toBe(FAMILY_NEUTRAL_NAME);
    expect(firstNameOf('Maria', 'maria@exemplo.test')).toBe('Maria');
    expect(firstNameOf('Maria', null)).toBe('Maria');
    expect(firstNameOf('Maria', '')).toBe('Maria');
  });
});

describe('Família: código e link do convite', () => {
  const code = '0123456789abcdef0123456789abcdef';

  it('o código tem 128 bits em 32 hexadecimais; maiúsculas e espaços nas pontas valem', () => {
    expect(INVITE_CODE_PATTERN.test(code)).toBe(true);
    expect(normalizeInviteCode(code)).toBe(code);
    expect(normalizeInviteCode(`  ${code.toUpperCase()}\n`)).toBe(code);
    for (const bad of ['', 'abc', code.slice(1), `${code}0`, 'zz'.repeat(16), null, undefined, 12]) expect(normalizeInviteCode(bad)).toBeNull();
  });

  it('o resumo é o SHA-256 do código normalizado (o que o banco guarda); formato inválido não tem resumo', () => {
    expect(inviteCodeHash(code)).toBe(sha256Hex(code));
    expect(inviteCodeHash(code.toUpperCase())).toBe(sha256Hex(code));
    expect(inviteCodeHash(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(inviteCodeHash('abc')).toBeNull();
  });

  it('o link é o endereço do app mais /convite/<código>, e o código sai de um link colado', () => {
    expect(inviteLink(code)).toBe(`https://app.clarevo.app.br/convite/${code}`);
    expect(inviteLink(code, 'http://localhost:8199/')).toBe(`http://localhost:8199/convite/${code}`);
    expect(inviteCodeFromText(inviteLink(code))).toBe(code);
    expect(inviteCodeFromText(`Convite para a Família Casa na Clarevo: ${inviteLink(code)} obrigado`)).toBe(code);
    expect(inviteCodeFromText(code)).toBe(code);
    expect(inviteCodeFromText(`https://clarevo.pages.dev/convite/${code.toUpperCase()}`)).toBe(code);
    expect(inviteCodeFromText('https://clarevo.pages.dev/convite/abc')).toBeNull();
    expect(inviteCodeFromText(`https://clarevo.pages.dev/convite/${code}0`)).toBeNull();
    expect(inviteCodeFromText('sem link')).toBeNull();
    expect(inviteCodeFromText(null)).toBeNull();
  });

  it('o convite vale enquanto não for usado, cancelado nem vencido; o dia de vencimento é o do fuso da pessoa', () => {
    const now = Date.parse('2026-10-07T12:00:00.000Z');
    expect(inviteIsValid(invite(), now)).toBe(true);
    expect(inviteIsValid(invite({ usedAt: '2026-10-08T00:00:00.000Z' }), now)).toBe(false);
    expect(inviteIsValid(invite({ cancelledAt: '2026-10-08T00:00:00.000Z' }), now)).toBe(false);
    expect(inviteIsValid(invite({ expiresAt: '2026-10-07T12:00:00.000Z' }), now)).toBe(false);
    expect(inviteIsValid(invite({ expiresAt: '2026-10-07T12:00:00.001Z' }), now)).toBe(true);
    expect(inviteExpiryDay('2026-10-14T12:00:00.000Z', 'America/Sao_Paulo')).toBe('2026-10-14');
    // 01:00 UTC ainda é o dia anterior em São Paulo.
    expect(inviteExpiryDay('2026-10-15T01:00:00.000Z', 'America/Sao_Paulo')).toBe('2026-10-14');
  });
});

describe('Família: vagas, papéis e ações possíveis', () => {
  const now = Date.parse('2026-10-07T12:00:00.000Z');
  const me = member({ personId: 'p1', firstName: 'Vera', role: 'titular', isMe: true });

  it('vagas = 6 menos as pessoas ativas e os convites ainda válidos (ex-membros e convites vencidos, usados ou cancelados não contam)', () => {
    const base = { members: [me], invites: [] as FamilyInvite[] };
    expect(seatsLeft(base, now)).toBe(5);
    const withEx = { members: [me, member({ personId: 'p2', firstName: 'Mauro', status: 'ex-membro', leftAt: '2026-10-05T00:00:00.000Z' })], invites: [] };
    expect(seatsLeft(withEx, now)).toBe(5);
    const invites = [
      invite({ id: 'a' }),
      invite({ id: 'b', cancelledAt: '2026-10-06T00:00:00.000Z' }),
      invite({ id: 'c', usedAt: '2026-10-06T00:00:00.000Z' }),
      invite({ id: 'd', expiresAt: '2026-10-01T00:00:00.000Z' }),
    ];
    expect(seatsLeft({ members: [me], invites }, now)).toBe(4);
    const full = { members: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => member({ personId: id, firstName: id })), invites: [invite()] };
    expect(seatsLeft(full, now)).toBe(0);
  });

  it('o leitor não escreve; só o titular administra', () => {
    expect(roleCanWrite('titular')).toBe(true);
    expect(roleCanWrite('membro')).toBe(true);
    expect(roleCanWrite('leitor')).toBe(false);
    expect(roleIsOwner('titular')).toBe(true);
    expect(roleIsOwner('membro')).toBe(false);
  });

  it('remover, mudar papel e passar a titularidade valem para pessoa ativa que não é quem consulta; encerrar, só sem outra pessoa ativa', () => {
    expect(memberIsActionable(member({ personId: 'p2', firstName: 'Mauro' }))).toBe(true);
    expect(memberIsActionable(member({ personId: 'p2', firstName: 'Mauro', isMe: true }))).toBe(false);
    expect(memberIsActionable(member({ personId: 'p2', firstName: 'Mauro', status: 'ex-membro' }))).toBe(false);
    expect(canEndFamily([me])).toBe(true);
    expect(canEndFamily([me, member({ personId: 'p2', firstName: 'Mauro', status: 'ex-membro' })])).toBe(true);
    expect(canEndFamily([me, member({ personId: 'p2', firstName: 'Mauro' })])).toBe(false);
  });

  it('quem anotou: o primeiro nome, "você" para quem consulta e "ex-membro · Nome" para quem saiu', () => {
    const members = [
      me,
      member({ personId: 'p2', firstName: 'Mauro' }),
      member({ personId: 'p3', firstName: 'Nina', status: 'ex-membro', leftAt: '2026-10-05T00:00:00.000Z' }),
    ];
    expect(authorLabel(members, 'p1')).toBe('Vera (você)');
    expect(authorLabel(members, 'p2')).toBe('Mauro');
    expect(authorLabel(members, 'p3')).toBe('ex-membro · Nina');
    expect(authorLabel(members, 'p9')).toBeNull();
  });
});

describe('Família: contexto das telas', () => {
  it('a pílula diz onde a anotação vai ficar: com a Família, o último "Pessoal" vira "Família"', () => {
    expect(contextName('pessoal')).toBe('Pessoal');
    expect(contextName('familia')).toBe('Família');
    expect(contextLabelFor('Salvando em Pessoal', 'pessoal')).toBe('Salvando em Pessoal');
    expect(contextLabelFor('Salvando em Pessoal', 'familia')).toBe('Salvando em Família');
    expect(contextLabelFor('Importando em Pessoal', 'familia')).toBe('Importando em Família');
    expect(contextLabelFor('Pessoal', 'familia')).toBe('Família');
    expect(contextLabelFor('Família', 'familia')).toBe('Família');
    expect(unsavedChangesText('pessoal')).toBe('Você tem alterações que ainda não foram salvas em Pessoal.');
    expect(unsavedChangesText('familia')).toBe('Você tem alterações que ainda não foram salvas em Família.');
  });

  it('o contexto de um item vem do contexto DELE, não do seletor: Pessoal, Família ou nenhum dos dois', () => {
    expect(contextKindOfItem('ctx-pessoal', 'ctx-pessoal', 'ctx-familia')).toBe('pessoal');
    expect(contextKindOfItem('ctx-familia', 'ctx-pessoal', 'ctx-familia')).toBe('familia');
    expect(contextKindOfItem('ctx-familia', 'ctx-pessoal', undefined)).toBeNull();
    expect(contextKindOfItem('ctx-familia', undefined, null)).toBeNull();
    expect(contextKindOfItem('ctx-outro', 'ctx-pessoal', 'ctx-familia')).toBeNull();
    expect(contextKindOfItem(undefined, 'ctx-pessoal', 'ctx-familia')).toBeNull();
    expect(contextKindOfItem('', '', '')).toBeNull();
  });
});

describe('Família: textos', () => {
  /** Os textos fixos e os montados (cada função com valores de exemplo escolhidos para ela). */
  const collect = (): string[] => {
    const out: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') out.push(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(FAMILY_TEXT);
    walk(INVITE_TEXT);
    walk(FAMILY_ERROR_TEXT);
    walk(FAMILY_ROLE_LABEL);
    walk(FAMILY_ROLE_HELP);
    const day = '2026-10-14';
    const link = 'https://clarevo.pages.dev/convite/0123456789abcdef0123456789abcdef';
    for (const role of ['titular', 'membro', 'leitor'] as const) {
      out.push(FAMILY_TEXT.yourRole(role), FAMILY_TEXT.memberA11y('Mauro', role, false), FAMILY_TEXT.memberA11y('Vera', role, true), FAMILY_TEXT.accountHintIn('Casa', role));
    }
    for (const role of ['membro', 'leitor'] as const) {
      out.push(FAMILY_TEXT.inviteRow(role, day), FAMILY_TEXT.inviteRowA11y(role, day), FAMILY_TEXT.cancelInviteA11y(role, day), INVITE_TEXT.roleLine(role));
    }
    out.push(
      FAMILY_TEXT.exMember('Nina'),
      FAMILY_TEXT.exMemberA11y('Nina'),
      FAMILY_TEXT.memberLine('Vera', true),
      FAMILY_TEXT.memberLine('Mauro', false),
      FAMILY_TEXT.removeTitle('Mauro'),
      FAMILY_TEXT.transferTitle('Mauro'),
      FAMILY_TEXT.manageTitle('Mauro'),
      FAMILY_TEXT.manageA11y('Mauro', 'leitor'),
      FAMILY_TEXT.shareMessage('Casa Lima', link),
      FAMILY_TEXT.notedBy('ex-membro · Nina'),
      FAMILY_TEXT.switchTo('Família'),
      INVITE_TEXT.invitedBy('Vera'),
      INVITE_TEXT.validUntil(day),
      INVITE_TEXT.accepted('Casa Lima'),
      unsavedChangesText('pessoal'),
      unsavedChangesText('familia'),
    );
    for (const n of [0, 1, 2, 5]) out.push(FAMILY_TEXT.seats(n));
    return out;
  };

  it('sem travessão, sem a expressão vetada, sem produto financeiro e neutros quanto a gênero', () => {
    const texts = collect();
    expect(texts.length).toBeGreaterThan(80);
    for (const t of texts) {
      expect(t, t).not.toMatch(FORBIDDEN);
      expect(t, t).not.toMatch(GENDERED);
    }
  });

  it('o aviso de privacidade e a regra de uma Família por vez estão à vista', () => {
    expect(FAMILY_TEXT.privacy).toContain('Pessoal');
    expect(FAMILY_TEXT.privacy).toContain('ninguém da Família');
    expect(INVITE_TEXT.privacy).toContain('Aceitar não mostra nem copia o seu Pessoal');
    expect(FAMILY_TEXT.oneAtATime).toContain('uma Família por vez');
    expect(FAMILY_TEXT.inviteNote).toContain('7 dias');
    expect(FAMILY_TEXT.inviteNote).toContain('uma única vez');
  });

  it('cada código de erro da Família tem texto próprio; o desconhecido cai em "Não foi possível salvar"', () => {
    for (const code of FAMILY_ERROR_CODES) expect(FAMILY_ERROR_TEXT, code).toHaveProperty(code);
    expect(familyErrorText('ja_em_familia')).toContain('uma Família por vez');
    expect(familyErrorText('familia_cheia')).toContain('6 pessoas');
    expect(familyErrorText('convite_invalido')).toBe(INVITE_TEXT.invalid);
    expect(familyErrorText('codigo_inexistente')).toBe(FAMILY_ERROR_TEXT.salvar_falhou);
  });

  it('o convite inválido não revela o motivo (usado, cancelado, vencido ou inexistente dizem o mesmo)', () => {
    expect(INVITE_TEXT.invalid).not.toMatch(/usad|cancelad|venc|expir|existe/i);
    expect(FAMILY_ERROR_TEXT.convite_invalido).toBe(INVITE_TEXT.invalid);
  });

  it('linhas e avisos montados', () => {
    expect(FAMILY_TEXT.exMember('Nina')).toBe('ex-membro · Nina');
    expect(FAMILY_TEXT.memberLine('Vera', true)).toBe('Vera (você)');
    expect(FAMILY_TEXT.memberLine('Mauro', false)).toBe('Mauro');
    expect(FAMILY_TEXT.inviteRow('membro', '2026-10-14')).toBe('Anota e vê · vale até 14/10');
    expect(FAMILY_TEXT.inviteRow('leitor', '2026-10-14')).toBe('Só vê · vale até 14/10');
    expect(FAMILY_TEXT.seats(0)).toContain('completa');
    expect(FAMILY_TEXT.seats(1)).toBe('Cabe mais 1 pessoa, contando os convites pendentes.');
    expect(FAMILY_TEXT.seats(4)).toBe('Cabem mais 4 pessoas, contando os convites pendentes.');
    expect(FAMILY_TEXT.shareMessage('Casa', 'https://x.test/convite/abc')).toBe('Convite para a Família Casa na Clarevo: https://x.test/convite/abc');
    expect(FAMILY_TEXT.yourRole('leitor')).toBe('Seu papel: Só vê');
    // O nome acessível de um botão contém o rótulo que se vê (WCAG 2.5.3).
    expect(FAMILY_TEXT.manageA11y('Mauro', 'leitor')).toContain(FAMILY_TEXT.manage);
    expect(FAMILY_TEXT.cancelInviteA11y('membro', '2026-10-14')).toContain(FAMILY_TEXT.cancelInvite);
    expect(FAMILY_TEXT.cancelInviteA11y('leitor', '2026-10-14')).toBe('Cancelar convite para Só vê, que vale até 14/10/2026');
    expect(FAMILY_TEXT.manageTitle('Mauro')).toBe('Ações para Mauro');
    expect(FAMILY_TEXT.manageA11y('Mauro', 'membro')).toBe('Gerenciar Mauro, Anota e vê');
    expect(FAMILY_TEXT.notedBy('ex-membro · Nina')).toBe('Anotado por ex-membro · Nina');
    expect(INVITE_TEXT.roleLine('membro')).toBe('Você poderá ver e anotar.');
    expect(INVITE_TEXT.roleLine('leitor')).toBe('Você poderá só ver.');
    expect(INVITE_TEXT.validUntil('2026-10-14')).toBe('Vale até 14/10/2026.');
    expect(FAMILY_ROLE_LABEL).toEqual({ titular: 'Titular', membro: 'Anota e vê', leitor: 'Só vê' });
  });
});
