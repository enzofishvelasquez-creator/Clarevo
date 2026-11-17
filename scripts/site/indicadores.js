'use strict';
/**
 * O retrato dos indicadores oficiais que as páginas trazem prontas (D-106, `docs/22_SITE.md`, seção 16): sem JavaScript, ou quando a
 * consulta da página falha, é ele que a pessoa vê, com a hora em que foi feito e "Fonte: Banco Central do Brasil".
 *
 * O retrato fica em `site-src/indicadores/retrato.json` e é gravado por `node scripts/gerar-site.js --atualizar-indicadores`, que consulta
 * o Banco Central com o MESMO código do worker (`packages/core/src/indicadores/servidor.ts`) antes de gerar o site. O gerador comum não
 * consulta nada (gerar duas vezes dá os mesmos bytes, e o teste confere que `site/` está em dia): ele só lê o arquivo. Sem retrato, as
 * páginas dizem que ainda não há números salvos, e o `--final` recusa (o site não pode ir ao ar sem os números da geração).
 */
const fs = require('node:fs');
const path = require('node:path');
const { SITE_SRC } = require('./config');
const { catalogo, carregarTypescript, carregarTs } = require('./catalogo');

const ARQUIVO_RETRATO = path.join(SITE_SRC, 'indicadores', 'retrato.json');
/** O retrato pode ter até 7 dias na hora do `--final` (o site vai ao ar com números da semana). */
const DIAS_DO_RETRATO = 7;

/** Lê o retrato (ilegível ou ausente: vazio, com aviso). Só o que passa na conferência do núcleo fica (`retratoDeJson`). */
function lerRetrato(arquivo = ARQUIVO_RETRATO) {
  const { retratoDeJson } = catalogo().INDICADORES;
  if (!fs.existsSync(arquivo)) return { retrato: retratoDeJson(null), avisos: [`${path.relative(process.cwd(), arquivo)} não existe: as páginas de indicadores saem sem números (rode "node scripts/gerar-site.js --atualizar-indicadores")`] };
  let json;
  try {
    json = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (e) {
    return { retrato: retratoDeJson(null), avisos: [`o retrato dos indicadores não é um JSON válido (${e.message}): as páginas saem sem números`] };
  }
  return { retrato: retratoDeJson(json), avisos: [] };
}

/** "AAAA-MM-DD" de um instante, em Brasília. */
const diaEmBrasilia = (instante) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instante));

/** Dias entre duas datas "AAAA-MM-DD". */
const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

/**
 * O que o `--final` recusa no retrato: sem retrato, com algum dos cinco indicadores faltando ou feito mais de 7 dias antes da data de
 * referência (`referencia`, "AAAA-MM-DD", a mesma dos posts: hoje, se ninguém passar outra). Sem `--final`, cada um é só um aviso.
 */
function problemasDoRetrato(retrato, referencia) {
  const { INDICADOR_IDS, INDICADORES_TEXT } = catalogo().INDICADORES;
  const como = 'rode "node scripts/gerar-site.js --atualizar-indicadores" num computador que alcance o Banco Central';
  if (!retrato.consultadoEm) return [`indicadores sem retrato (site-src/indicadores/retrato.json): as páginas saem sem números; ${como}`];
  const problemas = [];
  const faltam = INDICADOR_IDS.filter((id) => !retrato.valores[id]);
  if (faltam.length) problemas.push(`o retrato dos indicadores não tem ${faltam.map((id) => INDICADORES_TEXT.nomes[id]).join(', ')}; ${como}`);
  const dias = diasEntre(diaEmBrasilia(retrato.consultadoEm), referencia);
  if (dias > DIAS_DO_RETRATO) problemas.push(`o retrato dos indicadores é de ${dias} dias antes de ${referencia} (o limite é ${DIAS_DO_RETRATO}); ${como}`);
  return problemas;
}

/** O módulo do servidor dos indicadores, carregado do TypeScript do core como o resto do catálogo. */
const servidorDosIndicadores = () => carregarTs(carregarTypescript(), ['indicadores/servidor.ts'])[0];

/**
 * Consulta o Banco Central agora e grava o retrato (`--atualizar-indicadores`). O que falhar fica com o número do retrato anterior (cada um
 * com a data dele), e nada é gravado se nenhum dos cinco vier. `fetch`: o do Node, ou um simulado nos testes.
 */
async function atualizarRetrato({ arquivo = ARQUIVO_RETRATO, fetch = globalThis.fetch, agora = Date.now() } = {}) {
  const { buscarRetrato } = servidorDosIndicadores();
  const doNode = async (url, init) => {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'clarevo-site' }, signal: AbortSignal.timeout(init.timeoutMs) });
    return { ok: r.ok, status: r.status, json: () => r.json() };
  };
  const { retrato, falhas } = await buscarRetrato({ fetch: doNode, agora });
  const novos = Object.keys(retrato.valores).length;
  if (novos === 0) return { gravado: false, falhas, retrato: lerRetrato(arquivo).retrato };
  const anterior = lerRetrato(arquivo).retrato;
  const junto = { consultadoEm: retrato.consultadoEm, valores: { ...anterior.valores, ...retrato.valores } };
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, `${JSON.stringify(junto, null, 2)}\n`);
  return { gravado: true, falhas, retrato: junto };
}

module.exports = { ARQUIVO_RETRATO, DIAS_DO_RETRATO, lerRetrato, problemasDoRetrato, atualizarRetrato, servidorDosIndicadores };
