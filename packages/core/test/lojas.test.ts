/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

  // Desde 25/11/2026 (D-125): a promessa de marca é "Você decide o que entra" (só entra o que a pessoa anota, importa ou manda por
  // mensagem), e o fato de o app não se conectar a contas bancárias fica no fim das descrições, em IMPORTANTE, como informação.
  it('as descrições dizem que você decide o que entra, que o app não se conecta a contas bancárias e que a empresa não vê os dados', () => {
    for (const nome of ['apple-descricao', 'google-descricao-completa']) {
      const t = todos.find((c) => c.nome === nome)!.texto;
      expect(t, nome).toContain('Você decide o que entra: só aparece o que você anota, importa ou manda por mensagem.');
      expect(t, nome).toContain('não se conecta a contas bancárias');
      expect(t.indexOf('não se conecta a contas bancárias'), nome).toBeGreaterThan(t.indexOf('IMPORTANTE'));
      expect(t, nome).toContain('nunca vê seus gastos');
      expect(t, nome).toContain('Não é banco');
      expect(t, nome).toContain('não garantem resultado');
      expect(t, nome).not.toMatch(/segurança nível bancário|100% seguro|economiz|Open Finance|Clarevo Plus|plano anual/i);
    }
    expect(todos.find((c) => c.nome === 'apple-promocional')!.texto).toContain('Você decide o que entra');
    expect(todos.find((c) => c.nome === 'google-descricao-curta')!.texto).not.toMatch(/Sem ligar a contas bancárias/);
  });

  it('as descrições citam só o que o app faz: a exclusão da conta, o recibo sem foto guardada e os limites da Família', () => {
    const t = todos.find((c) => c.nome === 'apple-descricao')!.texto;
    expect(t).toContain('nenhuma foto é guardada');
    expect(t).toContain('até 6 pessoas');
    expect(t).toContain('excluir a conta dentro do app');
    expect(t).toContain('nunca o número inteiro');
  });

  // D-125 (25/11/2026): o subtítulo junta a palavra de busca e o benefício; as três primeiras linhas trazem a promessa, a privacidade e o
  // preço com o teste; a mensagem central de antes (D-068) continua como assinatura no fim das descrições e nas imagens.
  it('a promessa é concreta (D-125): subtítulo com palavra de busca, nome alternativo, descrição curta, as três primeiras linhas e a frase de marca, e a marca no feminino', () => {
    const campo = (n: string) => todos.find((c) => c.nome === n)!.texto;
    expect(campo('apple-subtitulo')).toBe('Controle de gastos e contas');
    expect(campo('apple-nome-alternativo')).toBe('Clarevo: controle de gastos');
    expect(campo('google-descricao-curta')).toBe('Controle de gastos e contas do mês, com pessoal, família e negócio separados.');
    expect(campo('mensagem-central')).toBe('Cuidar da vida financeira faz parte de cuidar de você.');
    expect(campo('frase-de-apoio')).toBe('Mais clareza para decidir');
    // As palavras do subtítulo não se repetem nas palavras-chave (a Apple junta os três campos).
    for (const w of ['controle', 'gastos', 'contas']) expect(campo('apple-palavras-chave').split(','), w).not.toContain(w);
    for (const nome of ['apple-descricao', 'google-descricao-completa']) {
      const d = campo(nome);
      const [promessa, privacidade, preco] = d.split('\n');
      expect(promessa, nome).toBe('Contas, cartões e gastos do mês em ordem, com o pessoal, a família e o negócio separados no mesmo app.');
      expect(privacidade, nome).toMatch(/^Você decide o que entra/);
      expect(preco, nome).toMatch(/R\$ 29,90 por mês.*R\$ 69,90 por mês.*14 dias grátis/);
      expect(d.trimEnd().endsWith('Cuidar da vida financeira faz parte de cuidar de você.'), nome).toBe(true);
      expect(d, nome).toContain('O QUE VOCÊ FAZ NA CLAREVO');
      expect(d.match(/^• /gm)?.length, nome).toBeLessThanOrEqual(13);
      // Sem promessa de saúde: a descrição diz que não é atendimento de saúde e não promete resultado financeiro nem de saúde.
      expect(d, nome).toContain('Não é atendimento de saúde, não substitui acompanhamento de profissionais e não promete resultado financeiro nem de saúde.');
      expect(d, nome).not.toMatch(/ansiedade|depress|terapia|tranquilidade|produtividade|sono\b|cura\b|trata(r|mento)\b/i);
    }
    for (const c of todos) expect(c.texto, c.nome).not.toMatch(/\b(?:o|O|do|no|ao|pelo|um)\s+Clarevo\b|NO CLAREVO/);
  });

  it('a tela de boas-vindas do app tem a mensagem central da ficha como título, o teste grátis e "Ver a demonstração" à vista (D-125)', () => {
    const tela = ler('apps/app/src/app/boas-vindas.tsx');
    const central = todos.find((c) => c.nome === 'mensagem-central')!.texto;
    // O título é WELCOME_TEXT.title, a mesma frase da ficha (a frase central fica para o fundador decidir; as duas mudam juntas).
    expect(tela).toMatch(/accessibilityRole="header">\s*\{WELCOME_TEXT\.title\}\s*<\/Txt>/);
    expect(ler('packages/core/src/welcome.ts')).toContain(`title: '${central}'`);
    // Estudo de 25/11/2026 (sinal 19): o teste grátis escrito na tela e a demonstração como segunda opção.
    expect(tela).toContain('{WELCOME_TEXT.trial}');
    expect(tela).toContain('WELCOME_TEXT.demo');
    expect(tela).not.toContain('Mais clareza');
    expect(tela).not.toContain('Seu dinheiro,');
  });

  it('as descrições da Apple e do Google contam a mesma história; só a seção ASSINATURA muda, cada uma citando só a própria loja', () => {
    const texto = (n: string) => todos.find((c) => c.nome === n)!.texto;
    const semAssinatura = (t: string) => t.replace(/ASSINATURA\n[\s\S]*?\n\nSEUS DADOS/, 'SEUS DADOS');
    expect(semAssinatura(texto('google-descricao-completa'))).toBe(semAssinatura(texto('apple-descricao')));
    const apple = texto('apple-descricao');
    const google = texto('google-descricao-completa');
    // Diretriz 2.3.10 da Apple: nada de outra plataforma nos textos dela; e o Google, o mesmo cuidado.
    expect(apple).not.toMatch(/Google|Android/);
    expect(google).not.toMatch(/App Store|Apple|iPhone/);
    // Assinatura automática (diretriz 3.1.2 da Apple): preço, período, renovação, como cancelar e o link dos Termos de uso.
    for (const [nome, t, loja] of [['apple', apple, 'App Store'], ['google', google, 'Google Play']] as const) {
      expect(t, nome).toContain('ASSINATURA');
      expect(t, nome).toContain('R$ 29,90 por mês');
      expect(t, nome).toContain('R$ 69,90 por mês');
      expect(t, nome).toContain('14 dias grátis');
      expect(t, nome).toContain('renova sozinha a cada mês');
      expect(t, nome).toContain(`pel${loja === 'App Store' ? 'a' : 'o'} ${loja}`);
      expect(t, nome).toContain('Termos de uso: https://clarevo.app.br/termos');
      expect(t, nome).toContain('Política de privacidade: https://clarevo.app.br/privacidade');
    }
  });

  it('as notas para a revisão da Apple dizem onde está a compra dentro do app e quais são os produtos', () => {
    const notas = todos.find((c) => c.nome === 'apple-notas-da-revisao')!.texto;
    expect(notas).toContain('Conta, Assinatura');
    expect(notas).toContain('clarevo_individual_mensal');
    expect(notas).toContain('clarevo_familia_mensal');
    expect(notas).toContain('Restaurar compras');
    expect(notas).not.toContain('não vende nada');
  });
});

describe('configuração de publicação', () => {
  const app = JSON.parse(ler('apps/app/app.json')).expo;
  const eas = JSON.parse(ler('apps/app/eas.json'));

  it('app.json: nome, versão, identificadores, orientação, esquema e fundo da marca', () => {
    expect(app.name).toBe('Clarevo');
    // 1.0.1 (16/11/2026): a primeira versão com atualização pelo ar (EAS Update) e a versão em Conta.
    expect(app.version).toBe('1.0.1');
    expect(app.orientation).toBe('portrait');
    expect(app.scheme).toBe('clarevo');
    expect(app.backgroundColor).toBe('#2457F5');
    expect(app.ios.bundleIdentifier).toBe(app.android.package);
    expect(app.ios.bundleIdentifier).toMatch(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/);
    expect(app.ios.buildNumber).toBe('1');
    expect(app.android.versionCode).toBe(1);
    expect(app.ios.supportsTablet).toBe(false);
  });

  it('app.json: textos de permissão do iOS em português, sem microfone (o app não usa)', () => {
    const plugins = Object.fromEntries((app.plugins as unknown[]).filter(Array.isArray).map((p) => [(p as unknown[])[0], (p as unknown[])[1]]));
    expect(plugins['expo-camera'].cameraPermission).toMatch(/^A Clarevo usa a câmera só para ler o código da nota fiscal/);
    expect(plugins['expo-camera'].microphonePermission).toBe(false);
    expect(plugins['expo-camera'].recordAudioAndroid).toBe(false);
    // A câmera do leitor de documentos (lib/image-pick.ts) é a do expo-image-picker: `false` aqui bloquearia a câmera do app inteiro.
    expect(plugins['expo-image-picker'].cameraPermission).toBe(plugins['expo-camera'].cameraPermission);
    expect(plugins['expo-local-authentication'].faceIDPermission).toMatch(/^A Clarevo usa o Face ID só para desbloquear o app/);
    expect(JSON.stringify(app)).not.toMatch(/NSPhotoLibrary|NSMicrophone|READ_MEDIA|ACCESS_FINE_LOCATION|RECORD_AUDIO/);
  });

  it('configuração nativa resolvida pelos plugins (o que o build gera): câmera liberada nas duas plataformas, sem microfone', () => {
    // `expo config --type introspect` roda os plugins como o build roda. Pegou um caso real: `cameraPermission: false` no plugin do
    // expo-image-picker bloqueava a CAMERA no Android e apagava o texto da câmera no iOS (o app fecharia ao abrir o leitor da nota).
    const cli = createRequire(raiz('apps/app/package.json')).resolve('expo/bin/cli');
    const out = execFileSync(process.execPath, [cli, 'config', '--type', 'introspect', '--json'], {
      cwd: raiz('apps/app'),
      env: { ...process.env, EXPO_NO_TELEMETRY: '1', EXPO_OFFLINE: '1', CLAREVO_WIDGET: '' },
      encoding: 'utf8',
      timeout: 60_000,
    });
    const mods = JSON.parse(out)._internal.modResults;
    const plist = mods.ios.infoPlist;
    expect(plist.NSCameraUsageDescription).toMatch(/^A Clarevo usa a câmera só para ler o código da nota fiscal/);
    expect(plist.NSFaceIDUsageDescription).toMatch(/^A Clarevo usa o Face ID só para desbloquear o app/);
    expect(plist.NSPhotoLibraryUsageDescription).toMatch(/^A Clarevo usa as suas fotos só quando você escolhe/);
    expect(plist.NSMicrophoneUsageDescription).toBeUndefined();
    expect(plist.ITSAppUsesNonExemptEncryption).toBe(false);
    // Português como único idioma do app: as telas do sistema dentro do app (escolher foto, compartilhar) saem em português. Sem
    // CFBundleAllowMixedLocalizations, que faria essas telas seguirem o idioma do aparelho.
    expect([plist.CFBundleDevelopmentRegion, plist.CFBundleLocalizations, plist.CFBundleAllowMixedLocalizations]).toEqual(['pt-BR', ['pt-BR'], undefined]);
    const perms = (mods.android.manifest.manifest['uses-permission'] as { $: Record<string, string> }[]).map((p) => p.$);
    const ativa = (n: string) => perms.some((p) => p['android:name'] === `android.permission.${n}` && p['tools:node'] !== 'remove');
    const bloqueada = (n: string) => perms.some((p) => p['android:name'] === `android.permission.${n}` && p['tools:node'] === 'remove');
    for (const n of ['CAMERA', 'INTERNET', 'USE_BIOMETRIC', 'VIBRATE']) expect(ativa(n), n).toBe(true);
    for (const n of ['CAMERA', 'INTERNET', 'USE_BIOMETRIC', 'VIBRATE']) expect(bloqueada(n), n).toBe(false);
    for (const n of ['RECORD_AUDIO', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'SYSTEM_ALERT_WINDOW']) expect(bloqueada(n), n).toBe(true);
    expect(mods.android.manifest.manifest.application[0].$['android:allowBackup']).toBe('false');
    // Marca dos modelos do ML Kit: o expo-camera declara a mesma no manifesto dele. Valores diferentes param a junção dos manifestos
    // no build; a do app precisa listar todo modelo da biblioteca e substituir a dela.
    const meta = (mods.android.manifest.manifest.application[0]['meta-data'] as { $: Record<string, string> }[])
      .map((m) => m.$)
      .find((m) => m['android:name'] === 'com.google.mlkit.vision.DEPENDENCIES');
    expect(meta?.['tools:replace']).toBe('android:value');
    expect(mods.android.manifest.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
    const camera = readFileSync(createRequire(raiz('apps/app/package.json')).resolve('expo-camera/android/src/main/AndroidManifest.xml'), 'utf8');
    const daBiblioteca = [...camera.matchAll(/com\.google\.mlkit\.vision\.DEPENDENCIES"\s+android:value="([^"]+)"/g)].flatMap((m) => (m[1] ?? '').split(','));
    expect(daBiblioteca.length).toBeGreaterThan(0);
    const doApp = (meta?.['android:value'] ?? '').split(',');
    for (const modelo of [...daBiblioteca, 'ocr']) expect(doApp, modelo).toContain(modelo);
  }, 90_000);

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

  it('eas.json: perfis preview e production (sem development, porque expo-dev-client não está instalado), com o widget ligado (D-093), e o preview-sem-widget de reserva; AAB e versões remotas somadas sozinhas, APK no preview; sem identificadores de conta', () => {
    expect(Object.keys(eas.build)).toEqual(['preview', 'preview-sem-widget', 'production']);
    // D-093: o widget entra no preview e no production; o preview-sem-widget parte do preview e só desliga (o resto está em widget-config.test.ts).
    expect(eas.build['preview-sem-widget']).toEqual({ extends: 'preview', channel: 'preview-sem-widget', env: { CLAREVO_WIDGET: '0' } });
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(JSON.stringify(eas)).not.toContain('developmentClient');
    // O preview gera build de loja no iOS (TestFlight) com versão remota: sem autoIncrement, o segundo envio repetiria o número de build.
    expect(eas.build.preview).toMatchObject({ distribution: 'internal', autoIncrement: true, android: { buildType: 'apk' }, ios: { distribution: 'store' } });
    expect(eas.build.production).toMatchObject({ distribution: 'store', autoIncrement: true, android: { buildType: 'app-bundle' } });
    // "Build from GitHub" (docs/40): a documentação do Expo pede a imagem de build declarada em cada perfil e plataforma usados pelo GitHub.
    for (const perfil of ['preview', 'production']) for (const plataforma of ['android', 'ios']) {
      expect(eas.build[perfil][plataforma].image, `${perfil}.${plataforma}.image`).toBe('latest');
    }
    // Nenhum segredo nem chave no repositório (o identificador do projeto EAS, que Enzo gera com `eas init`, não é segredo).
    // Os campos de conta da Apple e do Google ficam fora do arquivo: Enzo os informa no envio, nunca no repositório.
    const CONTA = 'appleId|ascAppId|appleTeamId|serviceAccountKeyPath';
    expect(JSON.stringify(eas)).not.toMatch(new RegExp(`password|secret|eyJ|sb_(publishable|secret)|${CONTA}`, 'i'));
    expect(JSON.stringify(app)).not.toMatch(new RegExp(`password|secret|supabase\\.co|eyJ|sb_(publishable|secret)|${CONTA}`, 'i'));
  });
});
