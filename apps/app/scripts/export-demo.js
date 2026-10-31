// Gera a versão web em modo demonstração (acesso simulado, dados fictícios), para apresentação e testes.
// Uso: npm run export:demo   (o build de produção usa `npm run export:web` com o Supabase configurado)
const { spawnSync } = require('node:child_process');

// --clear: o cache do Metro guarda as variáveis EXPO_PUBLIC_* já embutidas; sem limpar, um build anterior
// com o Supabase configurado poderia vazar para a demonstração (ou o contrário).
// Leitura de imagem no aparelho (D-078 B): os arquivos do tesseract.js vão para public/ocr antes do export.
require('../../../scripts/copiar-ocr.js');

const result = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--clear'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  // Variáveis do Supabase vazias: o .env local não vale para a demonstração.
  // EXPO_PUBLIC_SITE_URL vazia (D-064): a demonstração nunca mostra os links para o site público (cadastro e Conta), mesmo com a
  // variável configurada no ambiente.
  env: { ...process.env, EXPO_PUBLIC_MODO_DEMO: '1', EXPO_PUBLIC_SUPABASE_URL: '', EXPO_PUBLIC_SUPABASE_KEY: '', EXPO_PUBLIC_SITE_URL: '', CI: '1' },
});
process.exit(result.status ?? 1);
