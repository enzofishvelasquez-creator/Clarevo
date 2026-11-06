#!/usr/bin/env node
/**
 * Gera as funções do servidor, cada uma num arquivo só: supabase/functions/whatsapp/index.ts (D-076), supabase/functions/telegram/index.ts
 * (D-080) e supabase/functions/assinatura-web/index.ts (D-084). Cada arquivo leva o código do núcleo (packages/core/src/whatsapp ou
 * packages/core/src/telegram/servidor.ts, e o que eles usam), sem tipos, mais a ligação com o Deno do Supabase. Um arquivo só para colar no editor de
 * funções do painel do Supabase, sem instalar nada (docs/05, passos 12j e 12l).
 *
 * Uso: npm run whatsapp, npm run telegram ou npm run assinatura-web   (geram as três)
 *      node scripts/gerar-funcoes.js --conferir   (sai com erro se algum arquivo gerado não é o do código atual; usado nos testes)
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

function resolveImport(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`não achei ${spec} (de ${path.relative(ROOT, from)})`);
}

/** Módulos em CommonJS, na ordem em que aparecem; cada import relativo vira __req(n). Import de pacote não é aceito. */
function bundle(entry) {
  const ids = new Map();
  const modules = [];
  const add = (file) => {
    if (ids.has(file)) return ids.get(file);
    const id = ids.size;
    ids.set(file, id);
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, removeComments: true },
    }).outputText;
    const code = out.replace(/require\("([^"]+)"\)/g, (_, spec) => {
      if (!spec.startsWith('.')) throw new Error(`import de pacote não cabe na função: ${spec} (${path.relative(ROOT, file)})`);
      return `__req(${add(resolveImport(file, spec))})`;
    });
    modules[id] = { file: path.relative(ROOT, file).split(path.sep).join('/'), code };
    return id;
  };
  add(entry);
  return modules;
}

const BUNDLE_START = [
  'const __mods = [',
];
const BUNDLE_END = [
  '];',
  'const __cache = [];',
  'function __req(i) {',
  '  if (__cache[i]) return __cache[i].exports;',
  '  const module = { exports: {} };',
  '  __cache[i] = module;',
  '  __mods[i](module, module.exports, __req);',
  '  return module.exports;',
  '}',
  '',
];

/** As funções geradas: o ponto de entrada no núcleo, o arquivo de saída, o cabeçalho e a ligação com o Deno. */
const FUNCTIONS = [
  {
    entry: 'packages/core/src/whatsapp/index.ts',
    out: 'supabase/functions/whatsapp/index.ts',
    header: [
      '// GERADO por scripts/gerar-funcoes.js a partir de packages/core/src/whatsapp. Não editar à mão: mude o núcleo e rode `npm run whatsapp`.',
      '// Clarevo · função do servidor "whatsapp" (Edge Function do Supabase, D-076): recebe as mensagens da Meta, confere a assinatura, lê o',
      '// texto (regras simples, sem IA), chama as funções whatsapp_* do banco com a chave de serviço e RESPONDE só a quem escreveu, em texto',
      '// simples. Nunca inicia conversa nem usa mensagem de modelo (as cobradas). Segredos no painel do Supabase (Edge Functions, Secrets):',
      '// WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_PHONE_KEY, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID e, opcional,',
      '// WHATSAPP_GRAPH_VERSION.',
      '// SUPABASE_URL e a chave de serviço (SUPABASE_SECRET_KEYS ou, sem ela, SUPABASE_SERVICE_ROLE_KEY) o próprio Supabase fornece.',
      '// Publicar com "Verify JWT" desligado (a Meta não manda login).',
    ],
    serve: [
      'const whatsapp = __req(0);',
      'const handler = whatsapp.createWhatsAppHandler({',
      '  config: whatsapp.whatsappConfigFrom((name) => Deno.env.get(name)),',
      '  fetch: (url, init) => fetch(url, init),',
      '  log: (message) => console.error(message),',
      '});',
      '',
      'Deno.serve(async (req) => {',
      '  const res = await handler({',
      '    method: req.method,',
      '    url: req.url,',
      '    header: (name) => req.headers.get(name),',
      '    body: async () => {',
      '      const buf = new Uint8Array(await req.arrayBuffer());',
      '      return { bytes: Array.from(buf), text: new TextDecoder().decode(buf) };',
      '    },',
      '  });',
      "  return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });",
      '});',
      '',
    ],
  },
  {
    // Só o servidor: os textos e o nome do bot da tela do app (telegram/app.ts) não entram na função, então mudar a tela não muda a função.
    entry: 'packages/core/src/telegram/servidor.ts',
    out: 'supabase/functions/telegram/index.ts',
    header: [
      '// GERADO por scripts/gerar-funcoes.js a partir de packages/core/src/telegram. Não editar à mão: mude o núcleo e rode `npm run telegram`.',
      '// Clarevo · função do servidor "telegram" (Edge Function do Supabase, D-080): recebe as mensagens do bot da Clarevo no Telegram,',
      '// confere o segredo do endereço, lê o texto (as mesmas regras do WhatsApp, sem IA), chama as funções telegram_* do banco com a chave de',
      '// serviço e RESPONDE só a quem escreveu, em texto simples, no corpo da resposta à entrega. Não tem o token do bot: nunca inicia',
      '// conversa. Segredos no painel do Supabase (Edge Functions, Secrets): TELEGRAM_WEBHOOK_SECRET e TELEGRAM_ID_KEY.',
      '// SUPABASE_URL e a chave de serviço (SUPABASE_SECRET_KEYS ou, sem ela, SUPABASE_SERVICE_ROLE_KEY) o próprio Supabase fornece.',
      '// Publicar com "Verify JWT" desligado (o Telegram não manda login; manda o segredo no cabeçalho).',
    ],
    serve: [
      'const telegram = __req(0);',
      'const handler = telegram.createTelegramHandler({',
      '  config: telegram.telegramConfigFrom((name) => Deno.env.get(name)),',
      '  fetch: (url, init) => fetch(url, init),',
      '  log: (message) => console.error(message),',
      '});',
      '',
      'Deno.serve(async (req) => {',
      '  const res = await handler({',
      '    method: req.method,',
      '    header: (name) => req.headers.get(name),',
      '    body: () => req.text(),',
      '  });',
      "  return new Response(res.body, { status: res.status, headers: { 'Content-Type': res.contentType } });",
      '});',
      '',
    ],
  },
  {
    // Só o servidor: os textos da tela (assinatura-web/app.ts) não entram na função.
    entry: 'packages/core/src/assinatura-web/servidor.ts',
    out: 'supabase/functions/assinatura-web/index.ts',
    header: [
      '// GERADO por scripts/gerar-funcoes.js a partir de packages/core/src/assinatura-web. Não editar à mão: mude o núcleo e rode `npm run assinatura-web`.',
      '// Clarevo · função do servidor "assinatura-web" (Edge Function do Supabase, D-084): para o app na web, com a sessão da pessoa, cria o',
      '// Checkout recorrente do Asaas (cartão, mensal) e cancela a assinatura; para o Asaas, recebe os avisos (webhooks) com o token no',
      '// cabeçalho asaas-access-token, consulta o estado atual da assinatura e das cobranças e chama billing_apply no banco com a chave de',
      '// serviço. Segredos no painel do Supabase (Edge Functions, Secrets): ASAAS_API_KEY ($aact_prod_ ou $aact_hmlg_, que define o',
      '// ambiente) e ASAAS_WEBHOOK_TOKEN; opcional CLAREVO_APP_URL. SUPABASE_URL e a chave de serviço o próprio Supabase fornece.',
      '// Publicar com "Verify JWT" desligado (o Asaas não manda login; a função confere o token da sessão do app ela mesma).',
    ],
    serve: [
      'const assinatura = __req(0);',
      'const handler = assinatura.createAssinaturaWebHandler({',
      '  config: assinatura.assinaturaWebConfigFrom((name) => Deno.env.get(name)),',
      '  // Cada chamada tem prazo (o Asaas conta como falha a resposta depois de 10 segundos).',
      '  fetch: (url, init) => fetch(url, { method: init.method, headers: init.headers, body: init.body, signal: AbortSignal.timeout(init.timeoutMs) }),',
      '  log: (message) => console.error(message),',
      '});',
      '',
      'Deno.serve(async (req) => {',
      '  const res = await handler({',
      '    method: req.method,',
      '    header: (name) => req.headers.get(name),',
      '    body: () => req.text(),',
      '  });',
      '  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: res.headers });',
      '});',
      '',
    ],
  },
];

function generate(fn) {
  const modules = bundle(path.join(ROOT, fn.entry));
  return [
    '// @ts-nocheck',
    ...fn.header,
    '',
    ...BUNDLE_START,
    ...modules.map((m) => `  // ${m.file}\n  function (module, exports, __req) {\n${m.code.trimEnd().replace(/^/gm, '    ')}\n  },`),
    ...BUNDLE_END,
    ...fn.serve,
  ].join('\n');
}

let stale = false;
for (const fn of FUNCTIONS) {
  const content = generate(fn);
  const out = path.join(ROOT, fn.out);
  if (process.argv.includes('--conferir')) {
    const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (current !== content) {
      console.error(`${fn.out} está desatualizado: rode npm run whatsapp`);
      stale = true;
    } else console.log(`${fn.out} em dia`);
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content);
    console.log(`gerado ${fn.out} (${content.length} caracteres)`);
  }
}
if (stale) process.exit(1);
