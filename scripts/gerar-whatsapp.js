#!/usr/bin/env node
/**
 * Gera supabase/functions/whatsapp/index.ts, a função do servidor que recebe as mensagens do WhatsApp (D-076), num arquivo só:
 * o código de packages/core/src/whatsapp (e o que ele usa do núcleo), sem tipos, mais a ligação com o Deno do Supabase. Um arquivo só
 * para colar no editor de funções do painel do Supabase, sem instalar nada (docs/05, passo 12j).
 *
 * Uso: npm run whatsapp            (gera)
 *      node scripts/gerar-whatsapp.js --conferir   (sai com erro se o arquivo gerado não é o do código atual; usado nos testes)
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'packages/core/src/whatsapp/index.ts');
const OUT = path.join(ROOT, 'supabase/functions/whatsapp/index.ts');

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

function generate() {
  const modules = bundle(ENTRY);
  const parts = [
    '// @ts-nocheck',
    '// GERADO por scripts/gerar-whatsapp.js a partir de packages/core/src/whatsapp. Não editar à mão: mude o núcleo e rode `npm run whatsapp`.',
    '// Clarevo · função do servidor "whatsapp" (Edge Function do Supabase, D-076): recebe as mensagens da Meta, confere a assinatura, lê o',
    '// texto (regras simples, sem IA), chama as funções whatsapp_* do banco com a chave de serviço e RESPONDE só a quem escreveu, em texto',
    '// simples. Nunca inicia conversa nem usa mensagem de modelo (as cobradas). Segredos no painel do Supabase (Edge Functions, Secrets):',
    '// WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_PHONE_KEY, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID e, opcional,',
    '// WHATSAPP_GRAPH_VERSION.',
    '// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY o próprio Supabase fornece. Publicar com "Verify JWT" desligado (a Meta não manda login).',
    '',
    'const __mods = [',
    ...modules.map((m) => `  // ${m.file}\n  function (module, exports, __req) {\n${m.code.trimEnd().replace(/^/gm, '    ')}\n  },`),
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
  ];
  return parts.join('\n');
}

const content = generate();
if (process.argv.includes('--conferir')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== content) {
    console.error('supabase/functions/whatsapp/index.ts está desatualizado: rode npm run whatsapp');
    process.exit(1);
  }
  console.log('supabase/functions/whatsapp/index.ts em dia');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, content);
  console.log(`gerado ${path.relative(ROOT, OUT)} (${content.length} caracteres)`);
}
