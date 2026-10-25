/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Ciclo R (D-060 item 1): a ficha das lojas (`docs/lojas/ficha.md`) respeita os limites de cada campo e as regras de redação, e a
 * configuração de publicação (`app.json`, `eas.json` e os ícones) tem o que as lojas pedem. Nada aqui chama a rede nem exige conta
 * de desenvolvedor; o que depende de decisão de Enzo continua como campo vazio na ficha.
 */
const raiz = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const ler = (p: string) => readFileSync(raiz(p), 'utf8');

interface Campo {
  nome: string;
  limite: number;
  unidade: 'caracteres' | 'bytes';
  texto: string;
}

function campos(): Campo[] {
  const md = ler('docs/lojas/ficha.md');
  const re = /<!-- campo: (\S+) \| limite: (\d+) \| unidade: (caracteres|bytes) -->\s*```[^\n]*\n([\s\S]*?)\n```/g;
  return [...md.matchAll(re)].map((m) => ({ nome: m[1]!, limite: Number(m[2]), unidade: m[3] as Campo['unidade'], texto: m[4]! }));
}

const tamanho = (c: Campo) => (c.unidade === 'bytes' ? Buffer.byteLength(c.texto, 'utf8') : [...c.texto].length);

// Termos proibidos (spec2 §5, como em copy.test.ts e no roteiro web) e travessões; a expressão proibida é montada por partes.
const PROIBIDOS = new RegExp(
  '\\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\\b|fundo de investimento|rentabilidade garantida|' +
    'rendimento garantido|retorno garantido|enriquec|' + ['faz(er|endo)?', 'sentido'].join('\\s+') + '|[\\u2013\\u2014]',
  'i',
);
// A ficha não cita banco nem produto financeiro pelo nome.
const INSTITUICOES = /nubank|ita[uú]|bradesco|santander|banco do brasil|caixa econ[oô]mica|c6 bank|picpay|mercado pago|\bbtg\b|\bxp\b|tesouro direto/i;

const ESPERADOS = [
  'apple-nome',
  'apple-nome-alternativo',
  'apple-subtitulo',
  'mensagem-central',
  'frase-de-apoio',
  'apple-promocional',
  'apple-palavras-chave',
  'apple-descricao',
  'google-descricao-curta',
  'google-descricao-completa',
  'google-notas-da-versao',
  'apple-notas-da-revisao',
];

describe('ficha das lojas (docs/lojas/ficha.md)', () => {
  const todos = campos();

  it('tem todos os campos, cada um uma vez, com os limites da Apple conferidos na página oficial', () => {
    expect(todos.map((c) => c.nome)).toEqual(ESPERADOS);
    const limite = (n: string) => todos.find((c) => c.nome === n)!;
    expect([limite('apple-nome').limite, limite('apple-subtitulo').limite, limite('apple-promocional').limite, limite('apple-descricao').limite]).toEqual([30, 30, 170, 4000]);
    expect(limite('apple-palavras-chave')).toMatchObject({ limite: 100, unidade: 'bytes' });
    expect(limite('apple-notas-da-revisao')).toMatchObject({ limite: 4000, unidade: 'bytes' });
    expect([limite('google-descricao-curta').limite, limite('google-descricao-completa').limite]).toEqual([80, 4000]);
  });

  it.each(ESPERADOS)('%s cabe no limite da loja e não está vazio', (nome) => {
    const c = todos.find((x) => x.nome === nome)!;
    expect(c.texto.trim().length).toBeGreaterThan(0);
    expect(tamanho(c)).toBeLessThanOrEqual(c.limite);
  });

  it('palavras-chave: sem espaço depois da vírgula, sem o nome do app e cada palavra com mais de duas letras', () => {
    const k = todos.find((c) => c.nome === 'apple-palavras-chave')!.texto;
    expect(k).not.toMatch(/, /);
    expect(k.toLowerCase()).not.toContain('clarevo');
    for (const w of k.split(',')) expect([...w].length).toBeGreaterThan(2);
  });

  it('nenhum campo usa termo proibido, travessão ou nome de banco e produto financeiro', () => {
    for (const c of todos) {
      expect(c.texto, c.nome).not.toMatch(PROIBIDOS);
      expect(c.texto, c.nome).not.toMatch(INSTITUICOES);
    }
  });

  it('o arquivo inteiro respeita a regra de redação (sem travessão nem a expressão proibida)', () => {
    for (const arquivo of ['docs/lojas/ficha.md', 'docs/lojas/privacidade.md', 'docs/16_PUBLICACAO_LOJAS.md']) {
      expect(ler(arquivo), arquivo).not.toMatch(/[–—]/);
      expect(ler(arquivo), arquivo).not.toMatch(new RegExp(['faz(er|endo)?', 'sentido'].join('\\s+'), 'i'));
    }
  });

  it('as descrições dizem que o app não se conecta a contas bancárias e que a empresa não vê os dados', () => {
    for (const nome of ['apple-descricao', 'google-descricao-completa']) {
      const t = todos.find((c) => c.nome === nome)!.texto;
      expect(t, nome).toContain('não se conecta a contas bancárias');
      expect(t, nome).toContain('nunca vê seus gastos');
      expect(t, nome).toContain('Não é banco');
      expect(t, nome).toContain('não garantem resultado');
    }
    expect(todos.find((c) => c.nome === 'apple-promocional')!.texto).toContain('não se conecta a contas bancárias');
    expect(todos.find((c) => c.nome === 'google-descricao-curta')!.texto).toContain('contas bancárias');
  });

  it('as descrições citam só o que o app faz: a exclusão da conta, o recibo sem foto guardada e os limites da Família', () => {
    const t = todos.find((c) => c.nome === 'apple-descricao')!.texto;
    expect(t).toContain('nenhuma foto é guardada');
    expect(t).toContain('até 6 pessoas');
    expect(t).toContain('excluir a conta dentro do app');
    expect(t).toContain('nunca o número inteiro');
  });

  it('o posicionamento é o de bem-estar financeiro (D-068): subtítulo, nome alternativo, descrição curta, mensagem central e frase de apoio, e a marca no feminino', () => {
    const campo = (n: string) => todos.find((c) => c.nome === n)!.texto;
    expect(campo('apple-subtitulo')).toBe('Bem-estar financeiro');
    expect(campo('apple-nome-alternativo')).toBe('Clarevo: bem-estar financeiro');
    expect(campo('google-descricao-curta')).toMatch(/^Bem-estar financeiro: /);
    expect(campo('mensagem-central')).toBe('Cuidar da vida financeira faz parte de cuidar de você.');
    expect(campo('frase-de-apoio')).toBe('Mais clareza para decidir');
    for (const nome of ['apple-descricao', 'google-descricao-completa']) {
      const d = campo(nome);
      expect(d, nome).toContain('A Clarevo é uma solução de bem-estar financeiro para pessoas e famílias, apoiada por um app');
      expect(d, nome).toContain('Cuidar da vida financeira faz parte de cuidar de você');
      expect(d, nome).toContain('Mais clareza para decidir.');
      expect(d, nome).toContain('O QUE VOCÊ FAZ NA CLAREVO');
      // Sem promessa de saúde: a descrição diz que não é atendimento de saúde e não promete resultado financeiro nem de saúde.
      expect(d, nome).toContain('Não é atendimento de saúde, não substitui acompanhamento de profissionais e não promete resultado financeiro nem de saúde.');
      expect(d, nome).not.toMatch(/ansiedade|depress|terapia|tranquilidade|produtividade|sono\b|cura\b|trata(r|mento)\b/i);
    }
    for (const c of todos) expect(c.texto, c.nome).not.toMatch(/\b(?:o|O|do|no|ao|pelo|um)\s+Clarevo\b|NO CLAREVO/);
  });

  it('a tela de boas-vindas do app tem a mensagem central da ficha como título, seguida da linha prática de antes, sem texto a mais', () => {
    const tela = ler('apps/app/src/app/boas-vindas.tsx');
    const central = todos.find((c) => c.nome === 'mensagem-central')!.texto;
    expect(tela).toMatch(new RegExp(`accessibilityRole="header">\\s*${central.replace(/\./g, '\\.')}\\s*</Txt>`));
    expect(tela).toContain('Acompanhe o seu mês e construa planos para você e sua família.');
    expect(tela).not.toContain('Mais clareza');
    expect(tela).not.toContain('Seu dinheiro,');
    // A estrutura de antes: o título, uma linha, a nota de privacidade, os dois botões e a demonstração.
    expect(tela.match(/<Txt\b/g)).toHaveLength(3);
  });

  it('as descrições da Apple e do Google contam a mesma história (mesmo corpo, de "O QUE VOCÊ FAZ" até o fim)', () => {
    const corpo = (n: string) => todos.find((c) => c.nome === n)!.texto;
    expect(corpo('google-descricao-completa')).toBe(corpo('apple-descricao'));
  });
});

describe('configuração de publicação', () => {
  const app = JSON.parse(ler('apps/app/app.json')).expo;
  const eas = JSON.parse(ler('apps/app/eas.json'));

  it('app.json: nome, versão, identificadores, orientação, esquema e fundo da marca', () => {
    expect(app.name).toBe('Clarevo');
    expect(app.version).toBe('1.0.0');
    expect(app.orientation).toBe('portrait');
    expect(app.scheme).toBe('clarevo');
    expect(app.backgroundColor).toBe('#2457F5');
    expect(app.ios.bundleIdentifier).toBe(app.android.package);
    expect(app.ios.bundleIdentifier).toMatch(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/);
    expect(app.ios.buildNumber).toBe('1');
    expect(app.android.versionCode).toBe(1);
    expect(app.ios.supportsTablet).toBe(false);
  });

  it('app.json: textos de permissão do iOS em português, sem microfone nem fotos (o app não usa)', () => {
    const plugins = Object.fromEntries((app.plugins as unknown[]).filter(Array.isArray).map((p) => [(p as unknown[])[0], (p as unknown[])[1]]));
    expect(plugins['expo-camera'].cameraPermission).toMatch(/^A Clarevo usa a câmera só para ler o código da nota fiscal/);
    expect(plugins['expo-camera'].microphonePermission).toBe(false);
    expect(plugins['expo-camera'].recordAudioAndroid).toBe(false);
    expect(plugins['expo-local-authentication'].faceIDPermission).toMatch(/^A Clarevo usa o Face ID só para desbloquear o app/);
    expect(JSON.stringify(app)).not.toMatch(/NSPhotoLibrary|NSMicrophone|READ_MEDIA|ACCESS_FINE_LOCATION|RECORD_AUDIO/);
  });

  it('app.json: no Android, as permissões que vêm por padrão e o app não usa ficam bloqueadas', () => {
    expect(app.android.blockedPermissions).toEqual([
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ]);
  });

  it('app.json: ícones e abertura existem e são PNG de 1024 x 1024 (a comparação pixel a pixel com os SVG é `node scripts/gerar-icones.js --verificar`)', () => {
    const imagens = [
      app.icon,
      app.ios.icon,
      app.android.adaptiveIcon.foregroundImage,
      app.android.adaptiveIcon.backgroundImage,
      app.android.adaptiveIcon.monochromeImage,
      ...(app.plugins as unknown[]).filter(Array.isArray).map((p) => (p as { image?: string }[])[1]?.image).filter(Boolean),
    ] as string[];
    expect(imagens).toHaveLength(6);
    for (const rel of imagens) {
      const arquivo = `apps/app/${rel.replace(/^\.\//, '')}`;
      expect(existsSync(raiz(arquivo)), arquivo).toBe(true);
      const png = readFileSync(raiz(arquivo));
      expect(png.toString('ascii', 1, 4)).toBe('PNG');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], arquivo).toEqual([1024, 1024]);
    }
    // iOS: 1024 x 1024 sem canal alfa (PNG RGB, tipo de cor 2). Google Play: 512 x 512, PNG de 32 bits (RGBA, tipo 6).
    expect(readFileSync(raiz('apps/app/assets/images/icon.png'))[25]).toBe(2);
    const play = readFileSync(raiz('apps/app/assets/loja/icone-play-512.png'));
    expect([play.readUInt32BE(16), play.readUInt32BE(20), play[24], play[25]]).toEqual([512, 512, 8, 6]);
  });

  it('eas.json: perfis preview e production (sem development, porque expo-dev-client não está instalado) e o preview-widget do Ciclo AA, que só liga o widget; AAB e versões remotas somadas sozinhas, APK no preview; sem identificadores de conta', () => {
    expect(Object.keys(eas.build)).toEqual(['preview', 'preview-widget', 'production']);
    // D-063 item 3: o perfil do widget parte do preview e só acrescenta CLAREVO_WIDGET=1 (o resto está em widget-config.test.ts).
    expect(eas.build['preview-widget']).toEqual({ extends: 'preview', env: { CLAREVO_WIDGET: '1' } });
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(JSON.stringify(eas)).not.toContain('developmentClient');
    // O preview gera build de loja no iOS (TestFlight) com versão remota: sem autoIncrement, o segundo envio repetiria o número de build.
    expect(eas.build.preview).toMatchObject({ distribution: 'internal', autoIncrement: true, android: { buildType: 'apk' }, ios: { distribution: 'store' } });
    expect(eas.build.production).toMatchObject({ distribution: 'store', autoIncrement: true, android: { buildType: 'app-bundle' } });
    // Nenhum segredo nem chave no repositório (o identificador do projeto EAS, que Enzo gera com `eas init`, não é segredo).
    // Os campos de conta da Apple e do Google ficam fora do arquivo: Enzo os informa no envio, nunca no repositório.
    const CONTA = 'appleId|ascAppId|appleTeamId|serviceAccountKeyPath';
    expect(JSON.stringify(eas)).not.toMatch(new RegExp(`password|secret|eyJ|sb_(publishable|secret)|${CONTA}`, 'i'));
    expect(JSON.stringify(app)).not.toMatch(new RegExp(`password|secret|supabase\\.co|eyJ|sb_(publishable|secret)|${CONTA}`, 'i'));
  });
});
