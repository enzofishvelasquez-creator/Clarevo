import { CATEGORIES, type RecordKind } from '../records';
import { descriptionTokens, normalizeDescription } from './dedupe';

/**
 * Categoria sugerida para cada linha importada. Duas fontes, nessa ordem: a memória do aparelho (a categoria que a pessoa escolheu
 * da última vez para uma descrição parecida; fica só neste aparelho, como a memória das notas fiscais) e regras simples por
 * palavra em português. Sem marcas e sem produto: só palavras comuns de extrato. Sem pista, "Sem categoria" (null). A pessoa pode
 * trocar a categoria de cada linha antes de importar.
 */

/** Memória do aparelho: chave da descrição → categoria. No máximo `MEMORY_LIMIT` entradas, das mais recentes. */
export type ImportMemory = Record<string, string>;
export const MEMORY_LIMIT = 300;

/** Chave da memória: as três primeiras palavras que distinguem a descrição. null quando não sobra palavra útil. */
export function memoryKey(description: string): string | null {
  const words = descriptionTokens(description).slice(0, 3);
  return words.length === 0 ? null : words.join(' ');
}

interface Rule {
  category: string;
  words: readonly string[];
}

/** Gastos: a primeira regra que combina vence. Palavras sem acento, minúsculas; "x" também combina com "xs" (plural simples). */
const EXPENSE_RULES: readonly Rule[] = [
  { category: 'Saúde', words: ['farmacia', 'drogaria', 'clinica', 'consulta', 'laboratorio', 'exame', 'hospital', 'dentista', 'odontologia', 'medico', 'plano de saude', 'otica', 'psicologo', 'fisioterapia'] },
  { category: 'Educação', words: ['escola', 'faculdade', 'universidade', 'colegio', 'curso', 'matricula', 'livraria', 'papelaria', 'creche', 'mensalidade escolar'] },
  { category: 'Moradia', words: ['aluguel', 'condominio', 'iptu', 'energia', 'energia eletrica', 'luz', 'agua', 'esgoto', 'gas', 'internet', 'reforma', 'material de construcao', 'imobiliaria'] },
  { category: 'Transporte', words: ['combustivel', 'gasolina', 'etanol', 'posto', 'estacionamento', 'pedagio', 'onibus', 'metro', 'passagem', 'taxi', 'corrida', 'bilhete unico', 'oficina', 'mecanica', 'ipva', 'lavagem'] },
  { category: 'Mercado', words: ['mercado', 'supermercado', 'hipermercado', 'padaria', 'hortifruti', 'sacolao', 'acougue', 'feira', 'quitanda', 'mercearia', 'peixaria', 'emporio'] },
  { category: 'Lazer', words: ['restaurante', 'lanchonete', 'pizzaria', 'hamburgueria', 'churrascaria', 'sorveteria', 'cafeteria', 'cafe', 'bar', 'cinema', 'teatro', 'show', 'ingresso', 'viagem', 'hotel', 'pousada', 'lanche'] },
];

const INCOME_RULES: readonly Rule[] = [
  { category: 'Salário', words: ['salario', 'folha de pagamento', 'proventos', 'decimo terceiro', '13 salario', 'ferias'] },
  { category: 'Reembolso', words: ['reembolso', 'estorno', 'devolucao', 'ressarcimento'] },
  { category: 'Renda extra', words: ['freelance', 'comissao', 'bonus', 'venda', 'aluguel recebido'] },
];

function ruleMatches(padded: string, word: string): boolean {
  return padded.includes(` ${word} `) || padded.includes(` ${word}s `);
}

/** Categoria pelas regras de palavras; null quando nenhuma combina. */
export function categoryByRules(description: string, kind: RecordKind): string | null {
  const padded = ` ${normalizeDescription(description)} `;
  if (padded.trim() === '') return null;
  for (const rule of kind === 'despesa' ? EXPENSE_RULES : INCOME_RULES) {
    if (rule.words.some((w) => ruleMatches(padded, w))) return rule.category;
  }
  return null;
}

export interface CategorySuggestion {
  category: string | null;
  source: 'memoria' | 'regra' | null;
}

/** Sugestão para uma linha: a memória do aparelho (se a categoria ainda serve ao tipo) e, depois, as regras. */
export function suggestCategory(description: string, kind: RecordKind, memory: ImportMemory): CategorySuggestion {
  const key = memoryKey(description);
  const remembered = key !== null ? memory[key] : undefined;
  if (remembered !== undefined && CATEGORIES[kind].includes(remembered)) return { category: remembered, source: 'memoria' };
  const byRule = categoryByRules(description, kind);
  return byRule !== null ? { category: byRule, source: 'regra' } : { category: null, source: null };
}

/**
 * Memória depois de importar: cada descrição importada com categoria passa a lembrar dela (a mais recente vence), até
 * `MEMORY_LIMIT` entradas. Linha sem categoria apaga o que a memória tinha para ela (a pessoa quis "Sem categoria").
 */
export function rememberCategories(memory: ImportMemory, lines: readonly { description: string; category: string | null }[]): ImportMemory {
  const next: ImportMemory = { ...memory };
  for (const l of lines) {
    const key = memoryKey(l.description);
    if (key === null) continue;
    delete next[key];
    if (l.category !== null) next[key] = l.category;
  }
  const keys = Object.keys(next);
  // A ordem de inserção é a da recência: o que sobra do limite são as últimas.
  for (const k of keys.slice(0, Math.max(0, keys.length - MEMORY_LIMIT))) delete next[k];
  return next;
}
