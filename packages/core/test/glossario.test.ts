/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * D-072 (29/10/2026): um nome só para cada coisa (glossário em `docs/31_GLOSSARIO.md`). Este teste varre o que a pessoa lê (telas do
 * app, textos do núcleo e o site gerado) e recusa os nomes aposentados. Comentários de código ficam de fora, assim como as palavras de
 * busca (`keywords`, onde o nome antigo ajuda a achar a tela), os códigos de erro (`contexto_invalido`) e os rótulos de comprovante
 * que o leitor procura no PDF do banco.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FORA = '(?![\\p{L}\\p{N}_])';
const DENTRO = '(?<![\\p{L}\\p{N}_])';

const APOSENTADOS: readonly { nome: RegExp; usar: string }[] = [
  { nome: new RegExp(`${DENTRO}[Mm]ovimentações${FORA}`, 'u'), usar: 'Movimentos' },
  { nome: /Suas contas/u, usar: 'Contas de origem' },
  { nome: /Gerenciar contas(?! de origem)/u, usar: 'Gerenciar contas de origem' },
  { nome: /[Cc]onta de destino/u, usar: 'Conta de origem' },
  { nome: new RegExp(`${DENTRO}[Cc]ontextos?${FORA}`, 'u'), usar: 'espaço (Pessoal ou Família)' },
  { nome: new RegExp(`${DENTRO}[Ee]sconder${FORA}`, 'u'), usar: 'Ocultar' },
];

/** Rótulos que o leitor de comprovante procura no PDF do banco: são texto do banco, não da Clarevo. */
const PERMITIDOS = [/packages\/core\/src\/comprovante\//];

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (/node_modules|\/dist\//.test(caminho)) continue;
    if (statSync(caminho).isDirectory()) arquivos(caminho, saida);
    else if (['.ts', '.tsx', '.html'].includes(extname(nome))) saida.push(caminho);
  }
  return saida;
}

const ehComentario = (linha: string) => /^\s*(\/\/|\*|\/\*|\{\/\*|<!--)/.test(linha);

function achados(): string[] {
  const saida: string[] = [];
  const todos = [join(ROOT, 'apps/app/src'), join(ROOT, 'packages/core/src'), join(ROOT, 'site')].flatMap((d) => arquivos(d));
  for (const caminho of todos) {
    const rel = relative(ROOT, caminho);
    if (PERMITIDOS.some((re) => re.test(rel))) continue;
    readFileSync(caminho, 'utf8')
      .split('\n')
      .forEach((linha, i) => {
        if (ehComentario(linha) || /keywords\s*:/.test(linha)) return;
        for (const { nome, usar } of APOSENTADOS) {
          const m = nome.exec(linha);
          if (m) saida.push(`${rel}:${i + 1}: "${m[0]}" (use ${usar})`);
        }
      });
  }
  return saida;
}

describe('glossário: um nome só para cada coisa (D-072)', () => {
  it('as telas, os textos do núcleo e o site não usam os nomes aposentados', () => {
    expect(achados()).toEqual([]);
  });

  it('a varredura pega cada nome aposentado e deixa passar o nome certo', () => {
    const pega = (texto: string) => APOSENTADOS.filter(({ nome }) => nome.test(texto)).map((a) => a.usar);
    expect(pega('Ir para Movimentações')).toEqual(['Movimentos']);
    expect(pega('Ir para Movimentos')).toEqual([]);
    expect(pega('Gerenciar contas')).toEqual(['Gerenciar contas de origem']);
    expect(pega('Gerenciar contas de origem')).toEqual([]);
    expect(pega('o contexto Pessoal')).toEqual(['espaço (Pessoal ou Família)']);
    expect(pega("'contexto_invalido'")).toEqual([]);
    expect(pega('Esconder as parcelas')).toEqual(['Ocultar']);
  });
});
