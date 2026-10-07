// Gera a versão web em modo demonstração (acesso simulado, dados fictícios), para apresentação e testes.
// Uso: npm run export:demo   (o build de produção usa `npm run export:web` com o Supabase configurado)
const { spawnSync } = require('node:child_process');

const result = spawnSync('npx', ['expo', 'export', '--platform', 'web'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, EXPO_PUBLIC_MODO_DEMO: '1', CI: '1' },
});
process.exit(result.status ?? 1);
