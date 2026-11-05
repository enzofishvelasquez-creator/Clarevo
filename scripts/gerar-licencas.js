#!/usr/bin/env node
'use strict';
/**
 * Lista das licenças de código aberto dos pacotes que vão no app (D5 de docs/legal/pendencias-do-lancamento.md; termos, seção de
 * propriedade intelectual). Parte das dependências de produção de apps/app e de packages/core e segue as dependências de cada pacote no
 * package-lock.json (como o npm resolve: node_modules mais perto primeiro), sem as de desenvolvimento. Grava site-src/licencas.json,
 * que o gerador do site usa para a página licencas.html.
 *
 * Uso: node scripts/gerar-licencas.js            grava o arquivo
 *      node scripts/gerar-licencas.js --conferir confere se o arquivo está em dia (sai com 1 se não estiver)
 */
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const SAIDA = path.join(RAIZ, 'site-src', 'licencas.json');

function lista() {
  const lock = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package-lock.json'), 'utf8'));
  const pacotes = lock.packages;
  /** Onde o npm acha `nome` a partir de `de` (a pasta do pacote que pede): sobe pelas pastas node_modules. */
  const resolver = (de, nome) => {
    let base = de;
    for (;;) {
      const chave = `${base ? `${base}/` : ''}node_modules/${nome}`;
      if (pacotes[chave]) return chave;
      if (!base) return null;
      const i = base.lastIndexOf('/node_modules/');
      base = i === -1 ? '' : base.slice(0, i);
    }
  };
  const vistos = new Set();
  const fila = [];
  for (const ws of ['apps/app', 'packages/core']) {
    for (const nome of Object.keys(pacotes[ws].dependencies ?? {})) fila.push([ws, nome]);
  }
  while (fila.length) {
    const [de, nome] = fila.shift();
    const chave = resolver(de, nome);
    if (!chave || vistos.has(chave)) continue;
    const p = pacotes[chave];
    if (p.link) {
      // Pacote do próprio repositório (@clarevo/core): segue as dependências dele, sem listar.
      for (const d of Object.keys(pacotes[p.resolved]?.dependencies ?? {})) fila.push([p.resolved, d]);
      vistos.add(chave);
      continue;
    }
    vistos.add(chave);
    for (const d of Object.keys(p.dependencies ?? {})) fila.push([chave, d]);
    for (const d of Object.keys(p.optionalDependencies ?? {})) fila.push([chave, d]);
  }
  const itens = new Map();
  for (const chave of vistos) {
    const p = pacotes[chave];
    if (p.link) continue;
    const nome = chave.slice(chave.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const item = { nome, versao: p.version, licenca: p.license ?? 'Ver o pacote' };
    itens.set(`${nome}@${p.version}`, item);
  }
  return [...itens.values()].sort((a, b) => (a.nome === b.nome ? a.versao.localeCompare(b.versao) : a.nome.localeCompare(b.nome)));
}

const conteudo = `${JSON.stringify(lista(), null, 1)}\n`;
if (process.argv.includes('--conferir')) {
  const atual = fs.existsSync(SAIDA) ? fs.readFileSync(SAIDA, 'utf8') : '';
  if (atual !== conteudo) {
    console.error('site-src/licencas.json não está em dia: rode node scripts/gerar-licencas.js');
    process.exit(1);
  }
  console.log('site-src/licencas.json em dia');
} else {
  fs.writeFileSync(SAIDA, conteudo);
  console.log(`gravado site-src/licencas.json (${JSON.parse(conteudo).length} pacotes)`);
}
