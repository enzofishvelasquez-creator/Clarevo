import { CATEGORIES, type RecordKind } from '../records';
import { descriptionTokens, normalizeDescription } from './dedupe';

/**
 * Categoria sugerida para cada linha importada e, desde a D-086, para o que a pessoa digita em Anotar gasto e Registrar recebimento.
 * Duas fontes, nessa ordem: a memória do aparelho (a categoria que a pessoa escolheu da última vez para uma descrição parecida; fica
 * só neste aparelho, como a memória das notas fiscais, e vale para a importação e para os formulários) e regras simples por palavra em
 * português. Sem marcas e sem produto: só palavras comuns de extrato. Sem pista, "Sem categoria" (null). A pessoa pode trocar a
 * categoria de cada linha antes de importar, e no formulário a sugestão é só um atalho para tocar.
 */

/** Memória do aparelho: chave da descrição → categoria. No máximo `MEMORY_LIMIT` entradas, das mais recentes. */
export type ImportMemory = Record<string, string>;
export const MEMORY_LIMIT = 300;

/**
 * Chave da memória: as três primeiras palavras que distinguem a descrição e, com o tipo, "despesa:" ou "receita:" na frente (D-086:
 * gasto e recebimento com o mesmo nome não se sobrescrevem; as chaves sem tipo, de antes, continuam lidas). null sem palavra útil.
 */
export function memoryKey(description: string, kind?: RecordKind): string | null {
  const words = descriptionTokens(description).slice(0, 3);
  if (words.length === 0) return null;
  const base = words.join(' ');
  return kind ? `${kind}:${base}` : base;
}

interface Rule {
  category: string;
  words: readonly string[];
}

/** Gastos: a primeira regra que combina vence. Palavras sem acento, minúsculas; "x" também combina com "xs" (plural simples). */
const EXPENSE_RULES: readonly Rule[] = [
  // D-086: antes das outras, porque "parcela do carro" e "consórcio do imóvel" são dívida, não transporte nem moradia. "Prestação" e
  // "consórcio" só em frase: "prestação de serviços" (nota de serviço, pagamento a autônomo) e o consórcio de uma empresa de ônibus não são dívida.
  {
    category: 'Crédito e parcelas',
    words: [
      'emprestimo', 'financiamento', 'refinanciamento', 'consignado', 'crediario', 'cdc', 'credito pessoal', 'cheque especial',
      'consorcio do carro', 'consorcio da casa', 'consorcio do imovel', 'consorcio da moto', 'parcela do consorcio',
      'prestacao do carro', 'prestacao da casa', 'prestacao do apartamento', 'prestacao da moto', 'prestacao do emprestimo', 'prestacao do financiamento',
      'parcela do carro', 'parcela da casa', 'parcela do apartamento', 'parcela da moto', 'parcela do emprestimo', 'parcela do financiamento',
      'quitacao', 'amortizacao', 'juros do emprestimo',
    ],
  },
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

/** O texto do atalho da sugestão no formulário ("Sugestão: Mercado") e o que o leitor de tela diz ao tocar. */
export function categorySuggestionLabel(category: string): { label: string; a11y: string } {
  return { label: `Sugestão: ${category}`, a11y: `Usar a categoria sugerida, ${category}` };
}

export interface CategorySuggestion {
  category: string | null;
  source: 'memoria' | 'regra' | null;
}

/** Sugestão para uma linha: a memória do aparelho (se a categoria ainda serve ao tipo) e, depois, as regras. */
export function suggestCategory(description: string, kind: RecordKind, memory: ImportMemory): CategorySuggestion {
  const typed = memoryKey(description, kind);
  const legacy = memoryKey(description);
  const remembered = (typed !== null ? memory[typed] : undefined) ?? (legacy !== null ? memory[legacy] : undefined);
  if (remembered !== undefined && CATEGORIES[kind].includes(remembered)) return { category: remembered, source: 'memoria' };
  const byRule = categoryByRules(description, kind);
  return byRule !== null ? { category: byRule, source: 'regra' } : { category: null, source: null };
}

/**
 * Memória depois de importar: cada descrição importada com categoria passa a lembrar dela (a mais recente vence), até
 * `MEMORY_LIMIT` entradas. Linha sem categoria apaga o que a memória tinha para ela (a pessoa quis "Sem categoria").
 */
export function rememberCategories(
  memory: ImportMemory,
  lines: readonly { description: string; category: string | null; kind?: RecordKind }[],
): ImportMemory {
  const next: ImportMemory = { ...memory };
  for (const l of lines) {
    const key = memoryKey(l.description, l.kind);
    if (key === null) continue;
    delete next[key];
    // Com o tipo, a chave sem tipo (de antes da D-086) deixa de valer para este nome: a nova vence.
    const legacy = l.kind ? memoryKey(l.description) : null;
    if (legacy !== null) delete next[legacy];
    if (l.category !== null) next[key] = l.category;
  }
  const keys = Object.keys(next);
  // A ordem de inserção é a da recência: o que sobra do limite são as últimas.
  for (const k of keys.slice(0, Math.max(0, keys.length - MEMORY_LIMIT))) delete next[k];
  return next;
}
