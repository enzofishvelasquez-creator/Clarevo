// _worker.js do site da Clarevo (D-066), para o Cloudflare Pages em modo avançado. Gerado por scripts/gerar-site.js a partir de
// site-src/worker/worker.js: não edite o arquivo gerado.
//
// Só existe no projeto `clarevo-site` (a pasta `site/` é só dele). O app tem outro projeto e não é afetado.
// Duas rotas recebem formulários e NÃO gravam nada (sem KV, D1, R2 nem log): cada envio vira uma chamada a um serviço de e-mail e acabou.
//   POST /api/contato     envia a mensagem do formulário de "Para empresas" ao e-mail de contato, pelo Resend.
//   POST /api/newsletter  cadastra o e-mail, com consentimento, no Brevo, pela API de dupla confirmação.
// Uma rota só lê dados públicos (D-106), sem variável, sem chave e sem gravar nada fora da memória:
//   GET /api/indicadores  busca no Banco Central a Selic (meta), o CDI, o IPCA, a poupança e o dólar PTAX, guarda uma cópia na memória por
//                         uma hora e devolve ao site. O navegador de quem visita só fala com o próprio site; o Banco Central não vê ninguém.
// Qualquer outra rota cai nos arquivos estáticos (env.ASSETS.fetch).
//
// Uma rota só existe se o interruptor dela estiver ligado em site/dados-da-empresa.json NA GERAÇÃO (`ROTAS`, abaixo): desligada, responde
// 404 mesmo com todas as variáveis configuradas. Ligada, ainda confere, nesta ordem: o endereço (SITE_HOST), o método, a origem do pedido
// e as variáveis do serviço.
//
// Variáveis (painel da Cloudflare, nunca no repositório): SITE_HOST (o endereço do site, sem https://, como clarevo.com.br; qualquer outro
// endereço, como o clarevo-site.pages.dev, é recusado), RESEND_API_KEY (segredo), CONTATO_DESTINO, CONTATO_REMETENTE, BREVO_API_KEY
// (segredo), BREVO_LISTA_ID, BREVO_MODELO_CONFIRMACAO_ID e, opcional, BREVO_URL_RETORNO.
// Sem SITE_HOST ou sem as variáveis de uma rota, ela responde 503 com mensagem clara: o formulário continua "pronto e desligado".

// Tamanhos, faixas e nome do campo-isca: os mesmos que o gerador usa para desenhar os formulários.
const LIMITES = {"tamanhos":{"nome":100,"email":254,"empresa":120,"mensagem":2000},"faixas":{"ate-50":"Até 50 pessoas","51-200":"De 51 a 200 pessoas","201-1000":"De 201 a 1.000 pessoas","mais-de-1000":"Mais de 1.000 pessoas","nao-sei":"Ainda não sei"},"isca":"website","campos":{"contato":["nome","email","empresa","faixa","mensagem"],"newsletter":["email","consentimento"]}};
// Os cabeçalhos de segurança do _headers, para as respostas que o worker devolve (o _headers não vale para elas).
const CABECALHOS = {"Content-Security-Policy":"default-src 'none'; img-src 'self'; media-src 'self'; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"same-origin","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Strict-Transport-Security":"max-age=31536000"};
// Quais rotas existem: os interruptores `formulario_contato` e `newsletter` de site/dados-da-empresa.json, lidos pelo gerador.
const ROTAS = {"contato":false,"newsletter":false};
// O núcleo de /api/indicadores (packages/core/src/indicadores/servidor.ts e o que ele usa), num pacote só, montado pelo gerador: os códigos
// das séries, a leitura das respostas, as contas e a cópia de uma hora são os mesmos do gerador do site e dos testes do núcleo.
const NUCLEO_INDICADORES = (() => {
const __mods = [
  // packages/core/src/indicadores/servidor.ts
  function (module, exports, __req) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INDICADORES_TIMEOUT_MS = exports.INDICADORES_NAVEGADOR_S = exports.INDICADORES_FALHA_MS = exports.INDICADORES_CACHE_MS = void 0;
exports.enderecosDosIndicadores = enderecosDosIndicadores;
exports.buscarRetrato = buscarRetrato;
exports.corpoDosIndicadores = corpoDosIndicadores;
exports.createIndicadoresHandler = createIndicadoresHandler;
const dates_1 = __req(1);
const investments_1 = __req(2);
const index_1 = __req(4);
exports.INDICADORES_CACHE_MS = 60 * 60 * 1000;
exports.INDICADORES_FALHA_MS = 5 * 60 * 1000;
exports.INDICADORES_NAVEGADOR_S = 15 * 60;
exports.INDICADORES_TIMEOUT_MS = 8000;
function enderecosDosIndicadores(hoje) {
    const ha30dias = (0, dates_1.addDays)(hoje, -30);
    return {
        selic: (0, investments_1.bcbSeriesUrl)(index_1.SGS_INDICADORES.selic, ha30dias, hoje),
        cdi: (0, investments_1.bcbSeriesUrl)(index_1.SGS_INDICADORES.cdi, ha30dias, hoje),
        ipca: (0, investments_1.bcbSeriesUrl)(index_1.SGS_INDICADORES.ipca, `${(0, dates_1.addMonths)((0, dates_1.monthOf)(hoje), -15)}-01`, hoje),
        poupanca: (0, investments_1.bcbSeriesUrl)(index_1.SGS_INDICADORES.poupanca, ha30dias, hoje),
        ptax: (0, investments_1.bcbSeriesUrl)(index_1.SGS_INDICADORES.ptax, ha30dias, hoje),
    };
}
async function buscarRetrato(deps) {
    const instante = new Date(deps.agora);
    const hoje = (0, dates_1.todayIn)(index_1.INDICADORES_FUSO, instante);
    const enderecos = enderecosDosIndicadores(hoje);
    const lidos = await Promise.all(index_1.INDICADOR_IDS.map(async (id) => {
        try {
            const r = await deps.fetch(enderecos[id], { timeoutMs: exports.INDICADORES_TIMEOUT_MS });
            if (!r.ok)
                return [id, null];
            return [id, (0, index_1.lerIndicador)(id, await r.json(), hoje)];
        }
        catch {
            return [id, null];
        }
    }));
    const valores = {};
    const falhas = [];
    for (const [id, v] of lidos) {
        if (v)
            valores[id] = v;
        else
            falhas.push(id);
    }
    return { retrato: { consultadoEm: instante.toISOString(), valores }, falhas };
}
function corpoDosIndicadores(retrato) {
    return JSON.stringify({
        fonte: index_1.INDICADORES_TEXT.fonte,
        consultadoEm: retrato.consultadoEm,
        atualizado: retrato.consultadoEm ? index_1.INDICADORES_TEXT.atualizado(retrato.consultadoEm) : null,
        valores: retrato.valores,
        exibicao: (0, index_1.exibirRetrato)(retrato),
    });
}
const JSON_TYPE = 'application/json; charset=utf-8';
function createIndicadoresHandler(deps) {
    const agora = deps.agora ?? (() => Date.now());
    const cacheMs = deps.cacheMs ?? exports.INDICADORES_CACHE_MS;
    const falhaMs = deps.falhaMs ?? exports.INDICADORES_FALHA_MS;
    let copia = null;
    let emCurso = null;
    const consultar = async () => {
        const t = agora();
        const { retrato, falhas } = await buscarRetrato({ fetch: deps.fetch, agora: t });
        const novos = index_1.INDICADOR_IDS.length - falhas.length;
        if (novos === 0) {
            if (copia)
                copia = { retrato: copia.retrato, ate: t + falhaMs };
            else
                copia = null;
            return;
        }
        const valores = { ...(copia?.retrato.valores ?? {}), ...retrato.valores };
        copia = { retrato: { consultadoEm: retrato.consultadoEm, valores }, ate: t + (falhas.length === 0 ? cacheMs : falhaMs) };
    };
    let semNadaAte = 0;
    return async (req) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return { status: 405, body: JSON.stringify({ erro: 'metodo' }), headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': 'no-store', Allow: 'GET, HEAD' } };
        }
        const t = agora();
        const valida = copia !== null && t < copia.ate;
        if (!valida && t >= semNadaAte) {
            emCurso ??= consultar().finally(() => {
                emCurso = null;
            });
            await emCurso;
            if (copia === null)
                semNadaAte = agora() + falhaMs;
        }
        if (copia === null) {
            return { status: 503, body: JSON.stringify({ erro: 'indisponivel' }), headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': 'no-store' } };
        }
        const body = corpoDosIndicadores(copia.retrato);
        return { status: 200, body: req.method === 'HEAD' ? '' : body, headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': `public, max-age=${exports.INDICADORES_NAVEGADOR_S}` } };
    };
}
  },
  // packages/core/src/dates.ts
  function (module, exports, __req) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidIsoDate = isValidIsoDate;
exports.daysInMonth = daysInMonth;
exports.parseDateBR = parseDateBR;
exports.formatDateBR = formatDateBR;
exports.formatDayMonth = formatDayMonth;
exports.formatListDate = formatListDate;
exports.formatShortDate = formatShortDate;
exports.deviceTimeZone = deviceTimeZone;
exports.todayIn = todayIn;
exports.addDays = addDays;
exports.maskDateBR = maskDateBR;
exports.monthOf = monthOf;
exports.isValidIsoMonth = isValidIsoMonth;
exports.monthsBetween = monthsBetween;
exports.dateInMonth = dateInMonth;
exports.parseMonthBR = parseMonthBR;
exports.formatMonthInputBR = formatMonthInputBR;
exports.maskMonthBR = maskMonthBR;
exports.addMonths = addMonths;
exports.addMonthsToDate = addMonthsToDate;
exports.addYearsClamped = addYearsClamped;
exports.daysBetween = daysBetween;
exports.monthRange = monthRange;
exports.formatDateTimeBR = formatDateTimeBR;
exports.formatDayHeader = formatDayHeader;
exports.formatMonthName = formatMonthName;
exports.formatMonthBR = formatMonthBR;
exports.formatMonthYearBR = formatMonthYearBR;
exports.formatMonthSpanBR = formatMonthSpanBR;
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function isValidIsoDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m)
        return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo < 1 || mo > 12 || d < 1)
        return false;
    return d <= daysInMonth(y, mo);
}
function daysInMonth(y, mo) {
    return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
function parseDateBR(input) {
    const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(input);
    if (!m)
        return null;
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isValidIsoDate(iso) ? iso : null;
}
function formatDateBR(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}
function formatDayMonth(iso) {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
}
function formatListDate(iso, today) {
    return iso.slice(0, 4) === today.slice(0, 4) ? formatDayMonth(iso) : formatDateBR(iso);
}
function formatShortDate(iso) {
    const [, m, d] = iso.split('-');
    return `${Number(d)} ${(MONTHS[Number(m) - 1] ?? '').slice(0, 3)}`;
}
function deviceTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    }
    catch {
        return 'America/Sao_Paulo';
    }
}
function todayIn(timeZone, now = new Date()) {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            calendar: 'gregory',
            numberingSystem: 'latn',
        }).formatToParts(now);
        const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
        const iso = `${get('year')}-${get('month').padStart(2, '0')}-${get('day').padStart(2, '0')}`;
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && isValidIsoDate(iso))
            return iso;
    }
    catch {
    }
    return localIsoDate(now);
}
function localIsoDate(now) {
    return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function addDays(date, delta) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}
function maskDateBR(text) {
    const d = text.replace(/\D/g, '').slice(0, 8);
    return d.slice(0, 2) + (d.length > 2 ? `/${d.slice(2, 4)}` : '') + (d.length > 4 ? `/${d.slice(4)}` : '');
}
function monthOf(date) {
    return date.slice(0, 7);
}
function isValidIsoMonth(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
function monthsBetween(from, to) {
    const [y1, m1] = from.split('-').map(Number);
    const [y2, m2] = to.split('-').map(Number);
    return y2 * 12 + m2 - (y1 * 12 + m1);
}
function dateInMonth(month, day) {
    const [y, m] = month.split('-').map(Number);
    return `${month}-${String(Math.min(day, daysInMonth(y, m))).padStart(2, '0')}`;
}
function parseMonthBR(input) {
    const m = /^\s*(\d{1,2})\/(\d{4})\s*$/.exec(input);
    if (!m)
        return null;
    const month = `${m[2]}-${m[1].padStart(2, '0')}`;
    return isValidIsoMonth(month) ? month : null;
}
function formatMonthInputBR(month) {
    const [y, m] = month.split('-');
    return `${m}/${y}`;
}
function maskMonthBR(text) {
    const d = text.replace(/\D/g, '').slice(0, 6);
    return d.slice(0, 2) + (d.length > 2 ? `/${d.slice(2)}` : '');
}
function addMonths(month, delta) {
    const [y, m] = month.split('-').map(Number);
    const total = y * 12 + (m - 1) + delta;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
function addMonthsToDate(date, delta) {
    const month = addMonths(monthOf(date), delta);
    const [y, m] = month.split('-').map(Number);
    const d = Math.min(Number(date.slice(8, 10)), daysInMonth(y, m));
    return `${month}-${String(d).padStart(2, '0')}`;
}
function addYearsClamped(date, delta) {
    return addMonthsToDate(date, delta * 12);
}
function daysBetween(from, to) {
    const utc = (iso) => {
        const [y, m, d] = iso.split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    };
    return Math.round((utc(to) - utc(from)) / 86_400_000);
}
function monthRange(month) {
    return { start: `${month}-01`, endExclusive: `${addMonths(month, 1)}-01` };
}
function formatDateTimeBR(isoInstant, timeZone) {
    const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(isoInstant));
    const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('day')}/${get('month')}/${get('year')} às ${get('hour')}:${get('minute')}`;
}
function formatDayHeader(date, today) {
    if (date === today)
        return 'Hoje';
    if (date === addDays(today, -1))
        return 'Ontem';
    const [, m, d] = date.split('-');
    return `${Number(d)} de ${MONTHS[Number(m) - 1] ?? ''}`;
}
function formatMonthName(month) {
    return MONTHS[Number(month.slice(5, 7)) - 1] ?? '';
}
function formatMonthBR(month) {
    const [y, m] = month.split('-');
    const name = MONTHS[Number(m) - 1] ?? '';
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}
function formatMonthYearBR(month) {
    return `${formatMonthName(month)} de ${month.slice(0, 4)}`;
}
function formatMonthSpanBR(from, to) {
    if (from === to)
        return `em ${formatMonthYearBR(from)}`;
    if (from.slice(0, 4) === to.slice(0, 4))
        return `de ${formatMonthName(from)} a ${formatMonthYearBR(to)}`;
    return `de ${formatMonthYearBR(from)} a ${formatMonthYearBR(to)}`;
}
  },
  // packages/core/src/investments.ts
  function (module, exports, __req) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INVESTMENT_TEXT = exports.INVESTMENT_FIELD_ORDER = exports.BCB_SERIES = exports.INVESTMENT_KIND_LABEL = exports.INVESTMENT_ACTIVE_MAX = exports.INVESTMENT_NOTE_MAX = exports.INVESTMENT_NAME_MAX = exports.INVESTMENT_MOVEMENT_KINDS = exports.INVESTMENT_STATUSES = exports.INVESTMENT_KINDS = void 0;
exports.normalizeInvestmentName = normalizeInvestmentName;
exports.investmentInputError = investmentInputError;
exports.newInvestmentError = newInvestmentError;
exports.investmentMovementError = investmentMovementError;
exports.investmentValueOn = investmentValueOn;
exports.investmentNegativeDay = investmentNegativeDay;
exports.applyInvestmentChange = applyInvestmentChange;
exports.investmentTotals = investmentTotals;
exports.investmentGain = investmentGain;
exports.monthlyReturns = monthlyReturns;
exports.investmentsMissingValue = investmentsMissingValue;
exports.joinNamesBR = joinNamesBR;
exports.chainRates = chainRates;
exports.parseBcbSeries = parseBcbSeries;
exports.bcbSeriesUrl = bcbSeriesUrl;
exports.indexOverMonths = indexOverMonths;
exports.exampleIndices = exampleIndices;
exports.compareLastClosedMonths = compareLastClosedMonths;
exports.validateInvestmentDraft = validateInvestmentDraft;
exports.investmentErrorText = investmentErrorText;
const dates_1 = __req(1);
const money_1 = __req(3);
exports.INVESTMENT_KINDS = ['renda_fixa', 'titulos_publicos', 'acoes', 'fundos', 'previdencia', 'cripto', 'outro'];
exports.INVESTMENT_STATUSES = ['ativo', 'encerrado'];
exports.INVESTMENT_MOVEMENT_KINDS = ['aporte', 'resgate', 'rendimento', 'valor'];
exports.INVESTMENT_NAME_MAX = 40;
exports.INVESTMENT_NOTE_MAX = 80;
exports.INVESTMENT_ACTIVE_MAX = 50;
exports.INVESTMENT_KIND_LABEL = {
    renda_fixa: 'Renda fixa',
    titulos_publicos: 'Títulos públicos',
    acoes: 'Ações',
    fundos: 'Fundos',
    previdencia: 'Previdência',
    cripto: 'Criptoativos',
    outro: 'Outro',
};
const INCOME_KINDS = ['juros', 'dividendo', 'jcp', 'fii', 'outro'];
const charCount = (text) => [...text].length;
function normalizeInvestmentName(name) {
    return name.trim().replace(/\s+/g, ' ');
}
function investmentInputError(input) {
    const name = normalizeInvestmentName(input.name ?? '');
    if (charCount(name) < 1 || charCount(name) > exports.INVESTMENT_NAME_MAX)
        return 'nome_invalido';
    if (!exports.INVESTMENT_KINDS.includes(input.kind))
        return 'tipo_invalido';
    return null;
}
const validAmount = (c, min) => Number.isSafeInteger(c) && c >= min && c <= money_1.MAX_RECORD_CENTS;
function newInvestmentError(input, today) {
    const base = investmentInputError(input);
    if (base)
        return base;
    if (!validAmount(input.investedCents, 1))
        return 'valor_invalido';
    if (input.currentCents !== null && !validAmount(input.currentCents, 0))
        return 'valor_invalido';
    if (!(0, dates_1.isValidIsoDate)(input.startOn))
        return 'data_invalida';
    if (input.startOn > today)
        return 'data_futura';
    return null;
}
function investmentMovementError(kind, input, today) {
    if (!exports.INVESTMENT_MOVEMENT_KINDS.includes(kind))
        return 'tipo_invalido';
    if (!validAmount(input.amountCents, kind === 'valor' ? 0 : 1))
        return 'valor_invalido';
    if (!(0, dates_1.isValidIsoDate)(input.occurredOn))
        return 'data_invalida';
    if (input.occurredOn > today)
        return 'data_futura';
    if (input.note !== null && (charCount(input.note.trim()) < 1 || charCount(input.note.trim()) > exports.INVESTMENT_NOTE_MAX))
        return 'observacao_invalida';
    const income = input.incomeKind ?? null;
    if (income !== null && (kind !== 'rendimento' || !INCOME_KINDS.includes(income)))
        return 'tipo_rendimento_invalido';
    return null;
}
const FLOW_SIGN = { aporte: 1, resgate: -1, rendimento: 0, valor: 0 };
function sorted(movements) {
    const cmp = (x, y) => (x === y ? 0 : x === undefined ? 1 : y === undefined ? -1 : x < y ? -1 : 1);
    return [...movements].sort((a, b) => {
        if (a.occurredOn !== b.occurredOn)
            return a.occurredOn < b.occurredOn ? -1 : 1;
        const kind = (a.kind === 'valor' ? 1 : 0) - (b.kind === 'valor' ? 1 : 0);
        return kind !== 0 ? kind : cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id);
    });
}
function investmentValueOn(movements, date) {
    let value = 0;
    for (const m of sorted(movements)) {
        if (m.occurredOn > date)
            break;
        value = m.kind === 'valor' ? m.amountCents : value + FLOW_SIGN[m.kind] * m.amountCents;
    }
    return value;
}
function investmentNegativeDay(movements) {
    let value = 0;
    const list = sorted(movements);
    for (let i = 0; i < list.length; i += 1) {
        const m = list[i];
        value = m.kind === 'valor' ? m.amountCents : value + FLOW_SIGN[m.kind] * m.amountCents;
        const endOfDay = i === list.length - 1 || list[i + 1].occurredOn !== m.occurredOn;
        if (endOfDay && value < 0)
            return m.occurredOn;
    }
    return null;
}
function applyInvestmentChange(movements, change) {
    if (!change)
        return [...movements];
    if (change.op === 'add')
        return [...movements, { kind: change.kind, amountCents: change.amountCents, occurredOn: change.occurredOn }];
    if (change.op === 'delete')
        return movements.filter((m) => m.id !== change.id);
    return movements.map((m) => (m.id === change.id ? { ...m, amountCents: change.amountCents, occurredOn: change.occurredOn } : m));
}
function investmentTotals(movements, today) {
    const live = movements.filter((m) => m.occurredOn <= today);
    const sum = (k) => live.filter((m) => m.kind === k).reduce((a, m) => a + m.amountCents, 0);
    const depositsCents = sum('aporte');
    const withdrawalsCents = sum('resgate');
    const incomeCents = sum('rendimento');
    const valueCents = investmentValueOn(live, today);
    const lastValue = live.filter((m) => m.kind === 'valor').map((m) => m.occurredOn).sort().pop() ?? null;
    return { depositsCents, withdrawalsCents, incomeCents, valueCents, gainCents: valueCents + withdrawalsCents + incomeCents - depositsCents, lastValueOn: lastValue };
}
function investmentGain(i) {
    return i.valueCents + i.withdrawalsCents + i.incomeCents - i.depositsCents;
}
function monthlyReturns(groups, today) {
    const live = groups.map((g) => sorted(g.filter((m) => m.occurredOn <= today))).filter((g) => g.length > 0);
    if (live.length === 0)
        return [];
    const first = live.map((g) => g[0].occurredOn).sort()[0];
    const out = [];
    const last = (0, dates_1.monthOf)(today);
    for (let month = (0, dates_1.monthOf)(first); (0, dates_1.monthsBetween)(month, last) >= 0; month = (0, dates_1.addMonths)(month, 1)) {
        const [y, mo] = month.split('-').map(Number);
        const days = (0, dates_1.daysInMonth)(y, mo);
        const start = `${month}-01`;
        const prevStart = `${(0, dates_1.addMonths)(month, -1)}-01`;
        const partial = month === last;
        const end = partial ? today : `${month}-${String(days).padStart(2, '0')}`;
        const len = partial ? Number(today.slice(8, 10)) : days;
        const dayOf = (d) => Number(d.slice(8, 10));
        let v0 = 0;
        let v1 = 0;
        let flows = 0;
        let weighted = 0;
        let income = 0;
        let measurable = true;
        for (const g of live) {
            if (g[0].occurredOn > end)
                continue;
            v1 += investmentValueOn(g, end);
            const inMonth = g.filter((m) => m.occurredOn >= start && m.occurredOn <= end);
            income += inMonth.filter((m) => m.kind === 'rendimento').reduce((a, m) => a + m.amountCents, 0);
            if (!inMonth.some((m) => m.kind === 'valor'))
                measurable = false;
            const flow = (m, at) => {
                const f = FLOW_SIGN[m.kind] * m.amountCents;
                if (f === 0)
                    return;
                flows += f;
                weighted += ((len - at) / len) * f;
            };
            if (g[0].occurredOn < start) {
                if (!g.some((m) => m.kind === 'valor' && m.occurredOn >= prevStart && m.occurredOn < start))
                    measurable = false;
                v0 += investmentValueOn(g, (0, dates_1.addDays)(start, -1));
                for (const m of inMonth)
                    flow(m, dayOf(m.occurredOn));
                continue;
            }
            const k = g[0].occurredOn;
            const firstDay = inMonth.filter((m) => m.occurredOn === k);
            if (firstDay.some((m) => m.kind === 'valor')) {
                const entry = investmentValueOn(g, k);
                flows += entry;
                weighted += ((len - dayOf(k)) / len) * entry;
            }
            else
                for (const m of firstDay)
                    flow(m, dayOf(k) - 1);
            for (const m of inMonth)
                if (m.occurredOn > k)
                    flow(m, dayOf(m.occurredOn));
        }
        const base = v0 + weighted;
        const rate = measurable && len > 0 && base > 0 ? (v1 - v0 - flows + income) / base : null;
        out.push({ month, rate: rate !== null && Number.isFinite(rate) && rate > -1 ? rate : null, endValueCents: v1, partial });
    }
    return out;
}
function investmentsMissingValue(items, today) {
    const month = (0, dates_1.monthOf)(today);
    const start = `${month}-01`;
    const previousMonth = (0, dates_1.addMonths)(month, -1);
    const prevStart = `${previousMonth}-01`;
    const thisMonth = [];
    const lastMonth = [];
    const prevEnd = (0, dates_1.addDays)(start, -1);
    const fixed = [];
    for (const { name, movements } of items) {
        const live = movements.filter((m) => m.occurredOn <= today);
        if (live.length === 0)
            continue;
        const first = live.reduce((a, m) => (m.occurredOn < a ? m.occurredOn : a), live[0].occurredOn);
        const extra = [];
        if (!live.some((m) => m.kind === 'valor' && m.occurredOn >= start)) {
            thisMonth.push(name);
            extra.push({ kind: 'valor', amountCents: investmentValueOn(live, today), occurredOn: today });
        }
        if (first < start && !live.some((m) => m.kind === 'valor' && m.occurredOn >= prevStart && m.occurredOn < start)) {
            lastMonth.push(name);
            extra.push({ kind: 'valor', amountCents: investmentValueOn(live, prevEnd), occurredOn: prevEnd });
        }
        fixed.push([...live, ...extra]);
    }
    if (thisMonth.length + lastMonth.length > 0 && monthlyReturns(fixed, today).at(-1)?.rate == null)
        return { thisMonth: [], lastMonth: [], previousMonth };
    return { thisMonth, lastMonth, previousMonth };
}
function joinNamesBR(names, max = 3) {
    if (names.length <= 1)
        return names[0] ?? '';
    if (names.length > max)
        return `${names.slice(0, max).join(', ')} e mais ${names.length - max}`;
    return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}
function chainRates(rates) {
    const valid = rates.filter((r) => r !== null && Number.isFinite(r));
    if (valid.length === 0)
        return null;
    return valid.reduce((acc, r) => acc * (1 + r), 1) - 1;
}
exports.BCB_SERIES = { cdi: 4391, ipca: 433, selic: 4390, poupanca: 195 };
function parseBcbSeries(json) {
    const out = {};
    if (!Array.isArray(json))
        return out;
    for (const row of json) {
        if (typeof row !== 'object' || row === null)
            continue;
        const r = row;
        if (typeof r.data !== 'string' || (typeof r.valor !== 'string' && typeof r.valor !== 'number'))
            continue;
        const date = (0, dates_1.parseDateBR)(r.data);
        if (!date || !date.endsWith('-01'))
            continue;
        const value = typeof r.valor === 'number' ? r.valor : Number(r.valor.replace(',', '.'));
        if (!Number.isFinite(value) || value < -10 || value > 10)
            continue;
        out[(0, dates_1.monthOf)(date)] = value;
    }
    return out;
}
function bcbSeriesUrl(code, from, to) {
    return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${(0, dates_1.formatDateBR)(from)}&dataFinal=${(0, dates_1.formatDateBR)(to)}`;
}
function indexOverMonths(series, months) {
    if (months.length === 0)
        return null;
    let acc = 1;
    for (const m of months) {
        const v = series[m];
        if (v === undefined)
            return null;
        acc *= 1 + v / 100;
    }
    return acc - 1;
}
function exampleIndices() {
    const cdi = {};
    const ipca = {};
    const selic = {};
    const poupanca = {};
    for (let m = '2024-01'; (0, dates_1.monthsBetween)(m, '2027-12') >= 0; m = (0, dates_1.addMonths)(m, 1)) {
        cdi[m] = 0.9;
        ipca[m] = 0.35;
        selic[m] = 0.89;
        poupanca[m] = 0.6;
    }
    return { cdi, ipca, selic, poupanca, fetchedOn: null, example: true };
}
function compareLastClosedMonths(returns, indices, max = 12) {
    const closed = returns.filter((r) => !r.partial);
    const chosen = [];
    for (let i = closed.length - 1; i >= 0 && chosen.length < max; i -= 1) {
        if (closed[i].rate === null)
            break;
        chosen.unshift(closed[i]);
    }
    if (chosen.length === 0)
        return null;
    const months = chosen.map((r) => r.month);
    return {
        months,
        rate: chainRates(chosen.map((r) => r.rate)),
        cdi: indices ? indexOverMonths(indices.cdi, months) : null,
        ipca: indices ? indexOverMonths(indices.ipca, months) : null,
    };
}
exports.INVESTMENT_FIELD_ORDER = ['name', 'kind', 'investedText', 'currentText', 'startText'];
function validateInvestmentDraft(draft, today, mode) {
    const T = exports.INVESTMENT_TEXT.errors;
    const errors = {};
    const name = normalizeInvestmentName(draft.name);
    if (charCount(name) < 1)
        errors.name = T.nameEmpty;
    else if (charCount(name) > exports.INVESTMENT_NAME_MAX)
        errors.name = T.nameLong;
    if (draft.kind === null || !exports.INVESTMENT_KINDS.includes(draft.kind))
        errors.kind = T.kind;
    let investedCents = 0;
    let currentCents = null;
    let startOn = today;
    if (mode === 'criar') {
        const invested = (0, money_1.parseBRL)(draft.investedText);
        if (invested === null || invested < 1 || invested > money_1.MAX_RECORD_CENTS)
            errors.investedText = draft.investedText.trim() === '' ? T.investedEmpty : T.amount;
        else
            investedCents = invested;
        if (draft.currentText.trim() !== '') {
            const current = (0, money_1.parseBRL)(draft.currentText);
            if (current === null || current < 0 || current > money_1.MAX_RECORD_CENTS)
                errors.currentText = T.amount;
            else
                currentCents = current;
        }
        if (draft.startText.trim() !== '') {
            const d = (0, dates_1.parseDateBR)(draft.startText);
            if (!d)
                errors.startText = T.date;
            else if (d > today)
                errors.startText = T.future;
            else
                startOn = d;
        }
    }
    if (Object.keys(errors).length > 0)
        return { ok: false, errors };
    return { ok: true, input: { name, kind: draft.kind, investedCents, startOn, currentCents } };
}
const pctText = (fraction) => {
    const v = Math.round(fraction * 10000) / 100;
    const s = Math.abs(v).toFixed(2).replace('.', ',');
    return `${v < 0 ? '-' : v > 0 ? '+' : ''}${s}%`;
};
exports.INVESTMENT_TEXT = {
    tabTitle: 'Investir',
    tabLabel: 'Investir',
    intro: 'Acompanhe o que você já investe: registre aportes, resgates e o valor que aparece no seu extrato. A Clarevo calcula quanto rendeu.',
    totalTitle: 'Seus investimentos hoje',
    value: (c) => (0, money_1.formatBRL)(c),
    invested: (c) => `Aportado: ${(0, money_1.formatBRL)(c)}`,
    withdrawn: (c) => `Resgatado: ${(0, money_1.formatBRL)(c)}`,
    income: (c) => `Rendimentos recebidos: ${(0, money_1.formatBRL)(c)}`,
    gain: (c) => (c < 0 ? `Perda: ${(0, money_1.formatBRL)(-c)}` : `Ganho: ${(0, money_1.formatBRL)(c)}`),
    percent: pctText,
    comparison: (c) => {
        const first = c.months[0];
        const head = c.months.length === 1 ? `No mês fechado de ${(0, dates_1.formatMonthYearBR)(first)}` : `Nos ${c.months.length} meses fechados, ${(0, dates_1.formatMonthSpanBR)(first, c.months[c.months.length - 1])}`;
        return `${head}: ${c.rate === null ? 'sem taxa' : pctText(c.rate)}.`;
    },
    cdi: (v) => (v === null ? 'CDI: sem dados para todos os meses' : `CDI no mesmo período: ${pctText(v)}`),
    ipca: (v) => (v === null ? 'IPCA: sem dados para todos os meses' : `IPCA no mesmo período: ${pctText(v)}`),
    thisMonth: (rate) => (rate === null ? 'Neste mês: sem taxa ainda' : `Neste mês, até hoje: ${pctText(rate)}`),
    sinceStart: (rate, from) => (rate === null ? null : `Desde ${(0, dates_1.formatMonthYearBR)(from)}: ${pctText(rate)}`),
    noValueYet: 'Atualize o valor com o que aparece no seu extrato para ver quanto rendeu.',
    monthlyHint: 'Para ver quanto rendeu em cada mês, atualize o valor de cada investimento pelo menos uma vez por mês.',
    missingThisMonth: (names) => `Para ter a taxa deste mês, falta atualizar o valor de ${joinNamesBR(names)}.`,
    missingLastMonth: (month, names) => `Falta o valor de ${(0, dates_1.formatMonthName)(month)} para ${joinNamesBR(names)}: em "Atualizar valor", use a data ${(0, dates_1.formatDateBR)((0, dates_1.addDays)(`${(0, dates_1.addMonths)(month, 1)}-01`, -1))}.`,
    lastValue: (d) => `Valor atualizado em ${(0, dates_1.formatDateBR)(d)}`,
    indicesSource: (fetchedOn) => `Fonte do CDI, da Selic, do IPCA e da poupança: Banco Central do Brasil, séries ${exports.BCB_SERIES.cdi}, ${exports.BCB_SERIES.selic}, ${exports.BCB_SERIES.ipca} e ${exports.BCB_SERIES.poupanca}${fetchedOn ? `, consulta em ${(0, dates_1.formatDateBR)(fetchedOn)}` : ''}.`,
    indicesExample: 'Na demonstração, o CDI, o IPCA e a poupança são valores de exemplo, não os índices reais.',
    indicesError: 'Não foi possível buscar o CDI e o IPCA agora. A sua rentabilidade continua aqui.',
    compare: 'Comparar com CDI, IPCA e poupança',
    closingNote: 'Os valores são os que você registra, e a Clarevo não indica investimentos.',
    disclaimer: 'A rentabilidade vem dos valores que você registra; o que rendeu antes não garante o futuro.',
    rule: 'Aportes, resgates e rendimentos não entram em Pago nem em Recebido: o dinheiro continua seu, só mudou de lugar.',
    footer: 'A Clarevo não guarda, não movimenta nem indica investimentos. Os valores mostram só o que você registrou.',
    emptyTitle: 'Nenhum investimento ainda',
    emptyBody: 'Cadastre o que você já tem investido, com quanto aplicou e quanto vale hoje. Dá para atualizar o valor quando quiser.',
    newInvestment: 'Novo investimento',
    closedTitle: 'Encerrados',
    whoSees: 'Seus investimentos ficam só no seu Pessoal. Ninguém da Família nem a empresa que oferece o benefício vê.',
    form: {
        newTitle: 'Novo investimento',
        editTitle: 'Editar investimento',
        nameLabel: 'Nome',
        nameHint: 'Um nome curto que você reconheça, como Reserva no banco ou Ações.',
        kindLabel: 'Tipo',
        investedLabel: 'Quanto você aplicou até hoje?',
        investedHint: 'A soma do que você colocou, sem os rendimentos.',
        currentLabel: 'Quanto vale hoje? (opcional)',
        currentHint: 'O valor que aparece no extrato. Sem ele, a Clarevo usa o valor aplicado.',
        startLabel: 'Desde quando? (opcional)',
        startHint: 'A data da primeira aplicação. Sem ela, hoje.',
        create: 'Criar investimento',
        save: 'Salvar investimento',
        created: 'Investimento criado.',
        saved: 'Investimento salvo.',
    },
    detail: {
        addDeposit: 'Registrar aporte',
        addWithdrawal: 'Registrar resgate',
        addIncome: 'Registrar rendimento recebido',
        updateValue: 'Atualizar valor',
        edit: 'Editar',
        close: 'Encerrar investimento',
        reopen: 'Reabrir investimento',
        delete: 'Excluir investimento',
        deleteTitle: (name) => `Excluir ${name}?`,
        deleteBody: 'Os movimentos registrados nele também deixam de aparecer.',
        deleteConfirm: 'Excluir investimento',
        cancel: 'Cancelar',
        closed: 'Investimento encerrado.',
        reopened: 'Investimento reaberto.',
        deleted: 'Investimento excluído.',
        historyTitle: 'Histórico',
        historyEmpty: 'Nenhum movimento registrado.',
        monthsTitle: 'Valor no fim de cada mês',
    },
    movement: {
        aporte: { title: 'Registrar aporte', saved: 'Aporte registrado.', hint: 'O dinheiro que você colocou no investimento.' },
        resgate: { title: 'Registrar resgate', saved: 'Resgate registrado.', hint: 'O dinheiro que você tirou do investimento.' },
        rendimento: {
            title: 'Registrar rendimento recebido',
            saved: 'Rendimento registrado.',
            hint: 'O que o investimento pagou e caiu na sua conta, como dividendos ou juros pagos. O que fica no investimento entra ao atualizar o valor.',
        },
        valor: { title: 'Atualizar valor', saved: 'Valor atualizado.', hint: 'O valor total que aparece no extrato nesta data, já com os aportes e resgates do dia.' },
        amountLabel: 'Valor',
        valueLabel: 'Valor no extrato',
        dateLabel: 'Data',
        noteLabel: 'Observação (opcional)',
        save: 'Salvar',
        updated: 'Movimento salvo.',
        deleted: 'Movimento excluído.',
        delete: 'Excluir movimento',
    },
    movementLabel: { aporte: 'Aporte', resgate: 'Resgate', rendimento: 'Rendimento recebido', valor: 'Valor atualizado' },
    errors: {
        nameEmpty: 'Informe um nome.',
        nameLong: `Use até ${exports.INVESTMENT_NAME_MAX} caracteres.`,
        kind: 'Escolha o tipo.',
        investedEmpty: 'Informe quanto você aplicou.',
        amount: 'Informe um valor válido.',
        date: 'Informe uma data válida, como 15/03/2025.',
        future: 'A data não pode ser depois de hoje.',
        negative: (d) => `Com este movimento, o investimento ficaria com valor negativo em ${(0, dates_1.formatDateBR)(d)}. Confira o valor e a data.`,
        closed: 'O investimento está encerrado. Reabra para registrar.',
        limit: `Você chegou a ${exports.INVESTMENT_ACTIVE_MAX} investimentos ativos. Encerre um para criar outro.`,
        personalOnly: 'Investimentos ficam só no seu Pessoal.',
        save: 'Não foi possível salvar. Tente de novo.',
        notFound: 'Este investimento não existe mais.',
    },
};
function investmentErrorText(code, negativeDay = null) {
    const E = exports.INVESTMENT_TEXT.errors;
    switch (code) {
        case 'nome_invalido':
            return E.nameEmpty;
        case 'tipo_invalido':
            return E.kind;
        case 'valor_invalido':
            return E.amount;
        case 'data_invalida':
            return E.date;
        case 'data_futura':
            return E.future;
        case 'investimento_encerrado':
            return E.closed;
        case 'valor_insuficiente':
            return negativeDay ? E.negative(negativeDay) : E.save;
        case 'limite_de_investimentos':
            return E.limit;
        case 'contexto_invalido':
            return E.personalOnly;
        case 'nao_encontrado':
            return E.notFound;
        case 'tipo_rendimento_invalido':
            return 'Escolha o tipo do rendimento.';
        default:
            return E.save;
    }
}
  },
  // packages/core/src/money.ts
  function (module, exports, __req) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_RECORD_CENTS = void 0;
exports.formatBRL = formatBRL;
exports.centsToInput = centsToInput;
exports.parseBRL = parseBRL;
exports.roundDiv = roundDiv;
exports.ceilDiv = ceilDiv;
exports.MAX_RECORD_CENTS = 999_999_999;
const BRL = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
function formatBRL(cents) {
    return BRL.format(cents / 100).replace(/ /g, ' ');
}
function centsToInput(cents) {
    return formatBRL(cents).replace(/^-?R\$\s?/, '');
}
function parseBRL(input) {
    const raw = input.trim().replace(/^R\$\s*/i, '');
    if (raw === '')
        return null;
    let intPart;
    let decPart = '';
    const brl = /^([1-9]\d{0,2}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(raw);
    const dotDecimal = /^(\d+)\.(\d{1,2})$/.exec(raw);
    if (brl) {
        intPart = brl[1].replace(/\./g, '');
        decPart = brl[2] ?? '';
    }
    else if (dotDecimal) {
        intPart = dotDecimal[1];
        decPart = dotDecimal[2];
    }
    else {
        return null;
    }
    const intDigits = intPart.replace(/^0+(?=\d)/, '');
    if (intDigits.length > 13)
        return exports.MAX_RECORD_CENTS + 1;
    return Number(intDigits) * 100 + Number(decPart.padEnd(2, '0'));
}
function roundDiv(a, b) {
    return Math.floor((2 * a + b) / (2 * b));
}
function ceilDiv(a, b) {
    return Math.floor((a + b - 1) / b);
}
  },
  // packages/core/src/indicadores/index.ts
  function (module, exports, __req) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.indicadoresNoRetrato = exports.INDICADORES_TEXT = exports.FAIXAS_INDICADORES = exports.INDICADORES_FUSO = exports.SGS_INDICADORES = exports.INDICADOR_IDS = void 0;
exports.lerLinhasSgs = lerLinhasSgs;
exports.anualizarTaxaDiaria = anualizarTaxaDiaria;
exports.ipcaDozeMeses = ipcaDozeMeses;
exports.lerIndicador = lerIndicador;
exports.instanteValido = instanteValido;
exports.retratoDeJson = retratoDeJson;
exports.numeroBR = numeroBR;
exports.exibirIndicador = exibirIndicador;
exports.exibirRetrato = exibirRetrato;
const dates_1 = __req(1);
const investments_1 = __req(2);
const format_1 = __req(5);
exports.INDICADOR_IDS = ['selic', 'cdi', 'ipca', 'poupanca', 'ptax'];
exports.SGS_INDICADORES = { selic: 432, cdi: 12, ipca: investments_1.BCB_SERIES.ipca, poupanca: investments_1.BCB_SERIES.poupanca, ptax: 1 };
exports.INDICADORES_FUSO = 'America/Sao_Paulo';
exports.FAIXAS_INDICADORES = {
    selic: [0, 50],
    cdi: [0, 60],
    cdiDia: [0, 0.2],
    ipca: [-20, 100],
    ipcaMes: [-10, 10],
    poupanca: [0, 3],
    ptax: [0.5, 50],
};
const dentro = (faixa, v) => typeof v === 'number' && Number.isFinite(v) && v >= faixa[0] && v <= faixa[1];
function lerLinhasSgs(json) {
    if (!Array.isArray(json))
        return [];
    const linhas = [];
    for (const row of json) {
        if (typeof row !== 'object' || row === null)
            continue;
        const r = row;
        const data = typeof r.data === 'string' ? (0, dates_1.parseDateBR)(r.data) : null;
        const valor = typeof r.valor === 'number' ? r.valor : typeof r.valor === 'string' && /^-?\d+(?:[.,]\d+)?$/.test(r.valor.trim()) ? Number(r.valor.trim().replace(',', '.')) : NaN;
        if (!data || !Number.isFinite(valor))
            continue;
        const fimBruto = typeof r.dataFim === 'string' ? r.dataFim : r.datafim;
        const fim = typeof fimBruto === 'string' ? (0, dates_1.parseDateBR)(fimBruto) : null;
        linhas.push({ data, valor, fim });
    }
    return linhas.sort((a, b) => a.data.localeCompare(b.data));
}
function arredondar(valor, casas) {
    const f = 10 ** casas;
    return Math.round(Number((valor * f).toFixed(6))) / f;
}
function anualizarTaxaDiaria(percentualAoDia) {
    return arredondar(Math.expm1(252 * Math.log1p(percentualAoDia / 100)) * 100, 2);
}
function ipcaDozeMeses(serie) {
    const meses = Object.keys(serie).sort();
    const ultimo = meses[meses.length - 1];
    if (!ultimo)
        return null;
    const doze = Array.from({ length: 12 }, (_, i) => (0, dates_1.addMonths)(ultimo, i - 11));
    const acumulado = (0, investments_1.indexOverMonths)(serie, doze);
    if (acumulado === null)
        return null;
    return { valor: arredondar(acumulado * 100, 2), ultimoMes: ultimo, mes: serie[ultimo] };
}
const ultimaAte = (linhas, hoje) => linhas.filter((l) => l.data <= hoje).pop() ?? null;
function lerIndicador(id, json, hoje) {
    const linhas = lerLinhasSgs(json);
    if (id === 'ipca') {
        const serie = {};
        for (const l of linhas)
            if (l.data.endsWith('-01') && l.data <= hoje && dentro(exports.FAIXAS_INDICADORES.ipcaMes, l.valor))
                serie[(0, dates_1.monthOf)(l.data)] = l.valor;
        const ac = ipcaDozeMeses(serie);
        if (!ac || !dentro(exports.FAIXAS_INDICADORES.ipca, ac.valor))
            return null;
        return { valor: ac.valor, data: `${ac.ultimoMes}-01`, mes: ac.mes };
    }
    const l = ultimaAte(linhas, hoje);
    if (!l)
        return null;
    if (id === 'cdi') {
        if (!dentro(exports.FAIXAS_INDICADORES.cdiDia, l.valor))
            return null;
        const anual = anualizarTaxaDiaria(l.valor);
        return dentro(exports.FAIXAS_INDICADORES.cdi, anual) ? { valor: anual, data: l.data, dia: l.valor } : null;
    }
    if (!dentro(exports.FAIXAS_INDICADORES[id], l.valor))
        return null;
    if (id === 'poupanca')
        return l.fim && l.fim > l.data ? { valor: l.valor, data: l.data, fim: l.fim } : null;
    return { valor: l.valor, data: l.data };
}
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
function instanteValido(valor) {
    return typeof valor === 'string' && INSTANTE.test(valor) && !Number.isNaN(Date.parse(valor));
}
function retratoDeJson(json) {
    const vazio = { consultadoEm: null, valores: {} };
    if (typeof json !== 'object' || json === null)
        return vazio;
    const j = json;
    const valores = {};
    const brutos = typeof j.valores === 'object' && j.valores !== null ? j.valores : {};
    for (const id of exports.INDICADOR_IDS) {
        const v = brutos[id];
        if (!v || typeof v !== 'object' || typeof v.data !== 'string' || !(0, dates_1.isValidIsoDate)(v.data) || !dentro(exports.FAIXAS_INDICADORES[id], v.valor))
            continue;
        const item = { valor: v.valor, data: v.data };
        if (id === 'cdi') {
            if (!dentro(exports.FAIXAS_INDICADORES.cdiDia, v.dia))
                continue;
            item.dia = v.dia;
        }
        if (id === 'ipca') {
            if (!dentro(exports.FAIXAS_INDICADORES.ipcaMes, v.mes) || !v.data.endsWith('-01'))
                continue;
            item.mes = v.mes;
        }
        if (id === 'poupanca') {
            if (typeof v.fim !== 'string' || !(0, dates_1.isValidIsoDate)(v.fim) || v.fim <= v.data)
                continue;
            item.fim = v.fim;
        }
        valores[id] = item;
    }
    const consultadoEm = instanteValido(j.consultadoEm) ? j.consultadoEm : null;
    return consultadoEm ? { consultadoEm, valores } : vazio;
}
function numeroBR(valor, casas) {
    const f = 10 ** casas;
    const escalado = Math.round(Number((Math.abs(valor) * f).toFixed(6)));
    const inteiro = (0, format_1.formatInteger)(Math.floor(escalado / f));
    const decimais = casas > 0 ? `,${String(escalado % f).padStart(casas, '0')}` : '';
    return `${valor < 0 && escalado > 0 ? '-' : ''}${inteiro}${decimais}`;
}
exports.INDICADORES_TEXT = {
    tituloPainel: 'Indicadores oficiais',
    fonte: 'Fonte: Banco Central do Brasil.',
    avisoMercado: 'Conteúdo educativo. Não é recomendação nem análise de valores mobiliários.',
    nomes: {
        selic: 'Selic (meta)',
        cdi: 'CDI',
        ipca: 'IPCA em 12 meses',
        poupanca: 'Rendimento da poupança',
        ptax: 'Dólar PTAX (Banco Central)',
    },
    retrato: (instante) => `Retrato de ${(0, dates_1.formatDateTimeBR)(instante, exports.INDICADORES_FUSO)}, horário de Brasília.`,
    atualizado: (instante) => `Atualizado em ${(0, dates_1.formatDateTimeBR)(instante, exports.INDICADORES_FUSO)}, horário de Brasília.`,
    semRetrato: 'Ainda não há um retrato salvo destes números. Com o JavaScript ligado, a página busca os números do Banco Central quando abre.',
    numeroAusente: 'Sem número',
    naoAoVivo: 'São os últimos números que o Banco Central publicou, cada um com a data dele. Não são cotações ao vivo nem previsões.',
    comoAtualiza: 'Quando você abre a página, ela pergunta ao próprio site da Clarevo, uma vez só. O servidor do site consulta o Banco Central em geral uma vez por hora (depois de uma falha, de novo em alguns minutos) e guarda uma cópia. O seu navegador não fala com nenhum outro site.',
};
const dataBR = (iso) => (0, dates_1.formatDateBR)(iso);
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function exibirIndicador(id, v) {
    const nome = exports.INDICADORES_TEXT.nomes[id];
    if (!v)
        return { nome, numero: exports.INDICADORES_TEXT.numeroAusente, unidade: '', data: '', extra: null };
    switch (id) {
        case 'selic':
            return { nome, numero: `${numeroBR(v.valor, 2)}%`, unidade: 'ao ano', data: `Meta em vigor em ${dataBR(v.data)}`, extra: null };
        case 'cdi':
            return { nome, numero: `${numeroBR(v.valor, 2)}%`, unidade: 'ao ano', data: `Taxa de ${dataBR(v.data)}, em 252 dias úteis`, extra: null };
        case 'ipca': {
            const mes = (0, dates_1.monthOf)(v.data);
            return {
                nome,
                numero: `${numeroBR(v.valor, 2)}%`,
                unidade: 'em 12 meses',
                data: `Acumulado ${(0, dates_1.formatMonthSpanBR)((0, dates_1.addMonths)(mes, -11), mes)}`,
                extra: v.mes === undefined ? null : `${maiuscula((0, dates_1.formatMonthYearBR)(mes))}: ${numeroBR(v.mes, 2)}% no mês`,
            };
        }
        case 'poupanca':
            return {
                nome,
                numero: `${numeroBR(v.valor, 4)}%`,
                unidade: 'no mês',
                data: `De ${dataBR(v.data)} a ${dataBR(v.fim ?? v.data)}, para depósitos com aniversário no dia ${Number(v.data.slice(8, 10))}`,
                extra: null,
            };
        case 'ptax':
            return { nome, numero: `R$ ${numeroBR(v.valor, 4)}`, unidade: 'por dólar, na venda', data: `Fechamento de ${dataBR(v.data)}`, extra: null };
    }
}
function exibirRetrato(retrato) {
    return Object.fromEntries(exports.INDICADOR_IDS.map((id) => [id, exibirIndicador(id, retrato.valores[id])]));
}
const indicadoresNoRetrato = (retrato) => exports.INDICADOR_IDS.filter((id) => retrato.valores[id]).length;
exports.indicadoresNoRetrato = indicadoresNoRetrato;
  },
  // packages/core/src/learn/format.ts
  function (module, exports, __req) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatInteger = formatInteger;
exports.formatBp = formatBp;
exports.formatBpCompact = formatBpCompact;
exports.formatRate = formatRate;
exports.formatTenths = formatTenths;
const math_1 = __req(6);
function formatInteger(value) {
    const sign = value < 0 ? '-' : '';
    return sign + String(Math.abs(Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function decimalText(scaled, casas) {
    const negative = scaled < 0n;
    const abs = negative ? -scaled : scaled;
    const unit = 10n ** BigInt(casas);
    const intPart = formatInteger(Number(abs / unit));
    const dec = casas > 0 ? `,${String(abs % unit).padStart(casas, '0')}` : '';
    return `${negative ? '-' : ''}${intPart}${dec}`;
}
function formatBp(bp, casas = 2) {
    if (!Number.isSafeInteger(bp))
        throw new RangeError(`bp inválido: ${bp}`);
    if (!Number.isInteger(casas) || casas < 0 || casas > 2)
        throw new RangeError(`casas inválidas: ${casas}`);
    const scaled = (0, math_1.roundDivBig)(BigInt(bp), 10n ** BigInt(2 - casas));
    return `${decimalText(scaled, casas)}%`;
}
function formatBpCompact(bp) {
    return formatBp(bp, 2).replace(/,00%$/, '%').replace(/(,\d)0%$/, '$1%');
}
function formatRate(rate, casas = 2) {
    if (!Number.isFinite(rate))
        throw new RangeError(`taxa inválida: ${rate}`);
    const bp = rate * 10_000;
    const clean = Number(bp.toFixed(6));
    const unit = 10 ** (2 - casas);
    const scaled = Math.sign(clean) * Math.floor(Math.abs(clean) / unit + 0.5);
    return formatBp(scaled * unit, casas);
}
function formatTenths(tenths) {
    if (!Number.isSafeInteger(tenths))
        throw new RangeError(`décimos inválidos: ${tenths}`);
    const negative = tenths < 0;
    const abs = Math.abs(tenths);
    const text = abs % 10 === 0 ? formatInteger(abs / 10) : `${formatInteger(Math.floor(abs / 10))},${abs % 10}`;
    return `${negative ? '-' : ''}${text}%`;
}
  },
  // packages/core/src/learn/math.ts
  function (module, exports, __req) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JCP_WITHHOLDING_BP = exports.DIVIDEND_WITHHOLDING_ABOVE_CENTS = exports.DIVIDEND_WITHHOLDING_BP = exports.INCOME_TAX_SINGLE_PAYMENT_BELOW_CENTS = exports.INCOME_TAX_MIN_QUOTA_CENTS = exports.INCOME_TAX_MAX_QUOTAS = exports.IOF_MAX_DAYS = exports.IOF_DAILY_PPM = exports.IOF_FIXED_PPM = void 0;
exports.roundDivBig = roundDivBig;
exports.simpleTotalCents = simpleTotalCents;
exports.compoundTotalBig = compoundTotalBig;
exports.compoundTotalCents = compoundTotalCents;
exports.equivalentAnnualBp = equivalentAnnualBp;
exports.equivalentMonthlyBp = equivalentMonthlyBp;
exports.equivalentAnnualRate = equivalentAnnualRate;
exports.installmentCents = installmentCents;
exports.sacTotals = sacTotals;
exports.presentValueCents = presentValueCents;
exports.impliedMonthlyRate = impliedMonthlyRate;
exports.iofCents = iofCents;
exports.lateChargesCents = lateChargesCents;
exports.realValueCents = realValueCents;
exports.percentTenths = percentTenths;
exports.sharesCents = sharesCents;
exports.monthlyShareCents = monthlyShareCents;
exports.averageCents = averageCents;
exports.medianCents = medianCents;
exports.monthsToReach = monthsToReach;
exports.thirteenthFirstCents = thirteenthFirstCents;
exports.thirteenthCents = thirteenthCents;
exports.thirteenthMonthsCount = thirteenthMonthsCount;
exports.vacationPayCents = vacationPayCents;
exports.incomeTaxMaxQuotas = incomeTaxMaxQuotas;
exports.incomeTaxQuotas = incomeTaxQuotas;
exports.fixedIncomeTaxBp = fixedIncomeTaxBp;
exports.fixedIncomeTaxCents = fixedIncomeTaxCents;
exports.shareOfCents = shareOfCents;
exports.dividendWithholdingCents = dividendWithholdingCents;
exports.realRateBp = realRateBp;
const BP = 10000n;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
function int(value, name, min = 0) {
    if (!Number.isSafeInteger(value) || value < min)
        throw new RangeError(`${name} inválido: ${value}`);
    return BigInt(value);
}
function toNumber(value) {
    if (value > MAX_SAFE || value < -MAX_SAFE)
        throw new RangeError('resultado grande demais');
    return Number(value);
}
function roundDivBig(a, b) {
    if (b === 0n)
        throw new RangeError('divisão por zero');
    if (b < 0n) {
        a = -a;
        b = -b;
    }
    if (a >= 0n)
        return (2n * a + b) / (2n * b);
    return -((2n * -a + b) / (2n * b));
}
function simpleTotalCents(principalCents, monthlyBp, months) {
    const p = int(principalCents, 'principal');
    return toNumber(p + roundDivBig(p * int(monthlyBp, 'taxa') * int(months, 'meses'), BP));
}
function compoundTotalBig(principalCents, monthlyBp, months) {
    const n = int(months, 'meses');
    return roundDivBig(int(principalCents, 'principal') * (BP + int(monthlyBp, 'taxa')) ** n, BP ** n);
}
function compoundTotalCents(principalCents, monthlyBp, months) {
    return toNumber(compoundTotalBig(principalCents, monthlyBp, months));
}
function equivalentAnnualBp(monthlyBp) {
    const q = BP + int(monthlyBp, 'taxa');
    return toNumber(roundDivBig(q ** 12n - BP ** 12n, BP ** 11n));
}
function equivalentMonthlyBp(annualBp) {
    const a = int(annualBp, 'taxa');
    const limit = 2n ** 12n * BP ** 11n * (BP + a);
    const fits = (r) => (20000n + 2n * BigInt(r) - 1n) ** 12n <= limit;
    let r = Math.max(0, Math.floor(10_000 * (Math.pow(1 + annualBp / 10_000, 1 / 12) - 1) + 0.5));
    while (fits(r + 1))
        r += 1;
    while (r > 0 && !fits(r))
        r -= 1;
    return r;
}
function equivalentAnnualRate(monthlyRate) {
    if (!Number.isFinite(monthlyRate) || monthlyRate <= -1)
        throw new RangeError(`taxa inválida: ${monthlyRate}`);
    return Math.expm1(12 * Math.log1p(monthlyRate));
}
function installmentCents(principalCents, monthlyBp, installments) {
    const p = int(principalCents, 'principal');
    const bp = int(monthlyBp, 'taxa');
    const n = int(installments, 'parcelas', 1);
    if (bp === 0n)
        return toNumber(roundDivBig(p, n));
    const qn = (BP + bp) ** n;
    return toNumber(roundDivBig(p * bp * qn, BP * (qn - BP ** n)));
}
function sacTotals(principalCents, monthlyBp, installments) {
    const p = int(principalCents, 'principal');
    const bp = int(monthlyBp, 'taxa');
    const n = int(installments, 'parcelas', 1);
    const base = p / n;
    const extra = p % n;
    let balance = p;
    let interestSum = 0n;
    let totalSum = 0n;
    const rows = [];
    for (let k = 0n; k < n; k++) {
        const amortization = base + (k < extra ? 1n : 0n);
        const interest = roundDivBig(balance * bp, BP);
        balance -= amortization;
        interestSum += interest;
        totalSum += amortization + interest;
        rows.push({ amortizationCents: toNumber(amortization), interestCents: toNumber(interest), paymentCents: toNumber(amortization + interest) });
    }
    return {
        rows,
        interestCents: toNumber(interestSum),
        totalCents: toNumber(totalSum),
        firstCents: rows[0].paymentCents,
        lastCents: rows[rows.length - 1].paymentCents,
    };
}
function presentValueCents(paymentCents, monthlyBp, times) {
    const pay = int(paymentCents, 'parcela');
    const bp = int(monthlyBp, 'taxa');
    for (const t of times)
        if (!Number.isFinite(t) || t < 0)
            throw new RangeError(`prazo inválido: ${t}`);
    if (times.length === 0)
        return 0;
    if (times.every((t) => Number.isSafeInteger(t))) {
        const q = BP + bp;
        const max = BigInt(Math.max(...times));
        let numerator = 0n;
        for (const t of times) {
            const tt = BigInt(t);
            numerator += pay * BP ** tt * q ** (max - tt);
        }
        return toNumber(roundDivBig(numerator, q ** max));
    }
    const rate = monthlyBp / 10_000;
    let sum = 0;
    for (const t of times)
        sum += paymentCents / Math.pow(1 + rate, t);
    return Math.floor(sum + 0.5);
}
function annuityFactor(rate, n) {
    if (rate === 0)
        return n;
    return -Math.expm1(-n * Math.log1p(rate)) / rate;
}
function impliedMonthlyRate(principalCents, paymentCents, installments) {
    int(principalCents, 'principal');
    int(paymentCents, 'parcela');
    int(installments, 'parcelas', 1);
    const total = paymentCents * installments;
    if (principalCents <= 0 || total < principalCents)
        return null;
    if (total === principalCents)
        return 0;
    const f = (rate) => paymentCents * annuityFactor(rate, installments) - principalCents;
    let lo = 0;
    let hi = 1;
    while (f(hi) > 0) {
        hi *= 2;
        if (hi > 2 ** 60)
            return null;
    }
    for (let k = 0; k < 400; k++) {
        const mid = (lo + hi) / 2;
        if (mid <= lo || mid >= hi)
            break;
        if (f(mid) > 0)
            lo = mid;
        else
            hi = mid;
    }
    return (lo + hi) / 2;
}
exports.IOF_FIXED_PPM = 3_800;
exports.IOF_DAILY_PPM = 82;
exports.IOF_MAX_DAYS = 365;
function iofCents(principalCents, days) {
    const p = int(principalCents, 'principal');
    const d = BigInt(Math.min(Number(int(days, 'dias')), exports.IOF_MAX_DAYS));
    const fixedCents = toNumber(roundDivBig(p * BigInt(exports.IOF_FIXED_PPM), 1000000n));
    const dailyCents = toNumber(roundDivBig(p * BigInt(exports.IOF_DAILY_PPM) * d, 1000000n));
    return { fixedCents, dailyCents, totalCents: fixedCents + dailyCents };
}
function lateChargesCents(valueCents, fineBp, monthlyInterestBp, days) {
    const v = int(valueCents, 'valor');
    const fineCents = toNumber(roundDivBig(v * int(fineBp, 'multa'), BP));
    const interestCents = toNumber(roundDivBig(v * int(monthlyInterestBp, 'juros') * int(days, 'dias'), BP * 30n));
    return { fineCents, interestCents, totalCents: valueCents + fineCents + interestCents };
}
function realValueCents(valueCents, inflationBp) {
    return toNumber(roundDivBig(int(valueCents, 'valor') * BP, BP + int(inflationBp, 'inflação')));
}
function percentTenths(part, whole) {
    const p = int(part, 'parte');
    if (!Number.isSafeInteger(whole) || whole <= 0)
        return 0;
    const w = BigInt(whole);
    return toNumber((2000n * p + w) / (2n * w));
}
function sharesCents(totalCents, weights) {
    const total = int(totalCents, 'total');
    const w = weights.map((x) => int(x, 'peso'));
    const sum = w.reduce((a, b) => a + b, 0n);
    if (sum === 0n)
        throw new RangeError('pesos sem soma');
    const base = w.map((x) => (total * x) / sum);
    const rest = w.map((x, i) => ({ i, r: (total * x) % sum }));
    let left = total - base.reduce((a, b) => a + b, 0n);
    rest.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
    for (const { i } of rest) {
        if (left === 0n)
            break;
        base[i] = base[i] + 1n;
        left -= 1n;
    }
    return base.map(toNumber);
}
function monthlyShareCents(totalCents, months) {
    const total = int(totalCents, 'total');
    const n = int(months, 'meses', 1);
    return toNumber((total + n - 1n) / n);
}
const statMin = (options) => (options.signed === true ? Number.MIN_SAFE_INTEGER : 0);
function averageCents(values, options = {}) {
    if (values.length === 0)
        throw new RangeError('lista vazia');
    const min = statMin(options);
    const sum = values.reduce((acc, v) => acc + int(v, 'valor', min), 0n);
    return toNumber(roundDivBig(sum, BigInt(values.length)));
}
function medianCents(values, options = {}) {
    if (values.length === 0)
        throw new RangeError('lista vazia');
    const min = statMin(options);
    const sorted = values.map((v) => int(v, 'valor', min)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1)
        return toNumber(sorted[middle]);
    return toNumber(roundDivBig(sorted[middle - 1] + sorted[middle], 2n));
}
function monthsToReach(targetCents, monthlyCents) {
    const m = int(monthlyCents, 'por mês', 1);
    if (!Number.isSafeInteger(targetCents))
        throw new RangeError(`alvo inválido: ${targetCents}`);
    if (targetCents <= 0)
        return 0;
    const t = BigInt(targetCents);
    return toNumber((t + m - 1n) / m);
}
function thirteenthFirstCents(monthlySalaryCents) {
    return toNumber(roundDivBig(int(monthlySalaryCents, 'salário'), 2n));
}
function thirteenthCents(monthlyCents, months) {
    const m = int(months, 'meses');
    if (m > 12n)
        throw new RangeError(`meses inválidos: ${months}`);
    return toNumber(roundDivBig(int(monthlyCents, 'remuneração') * m, 12n));
}
function thirteenthMonthsCount(workedDays) {
    return workedDays.filter((d) => {
        if (int(d, 'dias') > 31n)
            throw new RangeError(`dias inválidos: ${d}`);
        return d >= 15;
    }).length;
}
function vacationPayCents(monthlySalaryCents, days = 30) {
    const d = int(days, 'dias', 1);
    if (d > 30n)
        throw new RangeError(`dias inválidos: ${days}`);
    const baseCents = toNumber(roundDivBig(int(monthlySalaryCents, 'salário') * d, 30n));
    const thirdCents = toNumber(roundDivBig(BigInt(baseCents), 3n));
    return { baseCents, thirdCents, totalCents: baseCents + thirdCents };
}
exports.INCOME_TAX_MAX_QUOTAS = 8;
exports.INCOME_TAX_MIN_QUOTA_CENTS = 5_000;
exports.INCOME_TAX_SINGLE_PAYMENT_BELOW_CENTS = 10_000;
function incomeTaxMaxQuotas(taxCents) {
    const tax = int(taxCents, 'imposto');
    if (tax === 0n)
        return 0;
    if (tax < BigInt(exports.INCOME_TAX_SINGLE_PAYMENT_BELOW_CENTS))
        return 1;
    return Math.min(exports.INCOME_TAX_MAX_QUOTAS, Number(tax / BigInt(exports.INCOME_TAX_MIN_QUOTA_CENTS)));
}
function incomeTaxQuotas(taxCents, quotas) {
    const n = int(quotas, 'quotas', 1);
    if (Number(n) > incomeTaxMaxQuotas(taxCents))
        throw new RangeError(`quotas demais para o imposto: ${quotas}`);
    return sharesCents(taxCents, Array.from({ length: Number(n) }, () => 1));
}
function fixedIncomeTaxBp(days) {
    const d = int(days, 'dias');
    if (d <= 180n)
        return 2_250;
    if (d <= 360n)
        return 2_000;
    if (d <= 720n)
        return 1_750;
    return 1_500;
}
function fixedIncomeTaxCents(yieldCents, days) {
    return toNumber(roundDivBig(int(yieldCents, 'rendimento') * BigInt(fixedIncomeTaxBp(days)), BP));
}
function shareOfCents(valueCents, bp) {
    return toNumber(roundDivBig(int(valueCents, 'valor') * int(bp, 'alíquota'), BP));
}
exports.DIVIDEND_WITHHOLDING_BP = 1_000;
exports.DIVIDEND_WITHHOLDING_ABOVE_CENTS = 5_000_000;
function dividendWithholdingCents(monthTotalCents) {
    const total = int(monthTotalCents, 'total do mês');
    if (total <= BigInt(exports.DIVIDEND_WITHHOLDING_ABOVE_CENTS))
        return 0;
    return toNumber(roundDivBig(total * BigInt(exports.DIVIDEND_WITHHOLDING_BP), BP));
}
exports.JCP_WITHHOLDING_BP = 1_750;
function realRateBp(nominalBp, inflationBp) {
    const n = BP + int(nominalBp, 'rentabilidade');
    const i = BP + int(inflationBp, 'inflação');
    return toNumber(roundDivBig(n * BP, i) - BP);
}
  }
];
const __cache = [];
function __req(i) {
  if (__cache[i]) return __cache[i].exports;
  const module = { exports: {} };
  __cache[i] = module;
  __mods[i](module, module.exports, __req);
  return module.exports;
}
return __req(0);
})();

const LIMITE_DO_CORPO = 20 * 1024;
/** Os serviços de e-mail pedem que quem chama diga quem é (o Resend recusa o pedido sem `User-Agent`). */
const AGENTE = 'clarevo-site';
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/** Cabeçalhos de toda resposta do worker: os de segurança do site, sem cache e sem adivinhar tipo. */
const cabecalhosDaApi = (extra = {}) => ({ ...CABECALHOS, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });

const MENSAGENS = {
  metodo: 'Use o formulário da página para enviar.',
  origem: 'O envio só vale a partir das páginas deste site.',
  host: 'Este endereço não recebe envios. Use o endereço oficial do site.',
  desligado: 'Esta rota não existe.',
  indisponivel: 'O envio ainda não está ligado neste site. Use o e-mail de contato da página.',
  grande: 'O envio é grande demais.',
  dados: 'Confira os campos: algum está vazio, grande demais ou fora do formato.',
  consentimento: 'Marque a caixa de consentimento para receber as Novidades.',
  falha: 'Não foi possível enviar agora. Tente de novo mais tarde ou use o e-mail de contato da página.',
  ok: 'Enviado.',
};
const STATUS = { metodo: 405, origem: 403, host: 404, desligado: 404, indisponivel: 503, grande: 413, dados: 400, consentimento: 400, falha: 502, ok: 200 };

/** O navegador pede HTML num envio comum de formulário: ele ganha um redirecionamento para a página de resposta. */
const pedeHtml = (request) => {
  const aceita = request.headers.get('accept') || '';
  return aceita.includes('text/html') && !aceita.includes('application/json');
};

/**
 * `codigo`: uma chave de MENSAGENS. `destinos`: para onde o navegador vai no sucesso (`ok`) e na falha (`erro`), e os campos do formulário
 * (`campos`). Quando `extra.campos` diz qual campo falhou, o navegador vai para a página de erro daquele campo (`erro-<campo>`, que o
 * gerador cria para cada campo): é como a página diz o que conferir sem JavaScript e sem repetir na página nada do que a pessoa escreveu.
 */
function responder(request, codigo, destinos, extra = {}) {
  const ok = codigo === 'ok';
  if (pedeHtml(request) && codigo !== 'metodo') {
    const campo = Array.isArray(extra.campos) ? extra.campos[0] : undefined;
    const erro = typeof campo === 'string' && destinos.campos.includes(campo) ? `${destinos.erro}-${campo}` : destinos.erro;
    return new Response(null, { status: 303, headers: cabecalhosDaApi({ Location: ok ? destinos.ok : erro }) });
  }
  return new Response(JSON.stringify({ ok, erro: ok ? null : codigo, mensagem: MENSAGENS[codigo], ...extra }), {
    status: STATUS[codigo],
    headers: cabecalhosDaApi({ 'Content-Type': 'application/json; charset=utf-8', ...(codigo === 'metodo' ? { Allow: 'POST' } : {}) }),
  });
}

/** A rota desligada se comporta como uma rota que não existe: 404, sem redirecionar (as páginas de resposta também não existem). */
const naoExiste = () =>
  new Response(JSON.stringify({ ok: false, erro: 'desligado', mensagem: MENSAGENS.desligado }), {
    status: 404,
    headers: cabecalhosDaApi({ 'Content-Type': 'application/json; charset=utf-8' }),
  });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Texto de uma linha: sem quebra de linha nem caractere de controle, sem espaço sobrando. */
const umaLinha = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Texto de várias linhas: mantém as quebras, tira o resto dos caracteres de controle. */
const variasLinhas = (s) =>
  String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Lê o corpo em partes, parando no teto: o `Content-Length` pode faltar (envio em pedaços) ou mentir, então o que vale é quanto chegou de
 * verdade. Acima do teto o resto nem é lido. Devolve o texto, `{ grande: true }` ou `null` se o corpo for ilegível.
 */
async function lerComTeto(request) {
  if (!request.body) return '';
  const leitor = request.body.getReader();
  const partes = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMITE_DO_CORPO) {
        leitor.cancel().catch(() => {});
        return { grande: true };
      }
      partes.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    bytes.set(parte, posicao);
    posicao += parte.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Lê o corpo (formulário comum ou JSON) com limite de tamanho. Devolve `null` se for ilegível e `{ grande: true }` se passar do teto. */
async function lerCorpo(request) {
  const declarado = Number(request.headers.get('content-length') || 0);
  if (declarado > LIMITE_DO_CORPO) return { grande: true };
  const tipo = request.headers.get('content-type') || '';
  const bruto = await lerComTeto(request);
  if (bruto === null) return null;
  if (typeof bruto === 'object') return bruto;
  try {
    if (tipo.includes('application/json')) {
      const json = JSON.parse(bruto);
      return json && typeof json === 'object' && !Array.isArray(json) ? { campos: json } : null;
    }
    return { campos: Object.fromEntries(new URLSearchParams(bruto)) };
  } catch {
    return null;
  }
}

/**
 * Só o próprio site pode enviar. Os dois sinais que o navegador manda sozinho e que uma página de outro site não consegue trocar:
 * `Sec-Fetch-Site` (quando vem, tem de ser `same-origin`) e `Origin` (quando vem, tem de ser o endereço deste site, e `null`, que é
 * o que sai de uma página sem origem, como um `iframe` com `sandbox` ou um `data:`, não vale). O site pede `Referrer-Policy: same-origin`
 * justamente para o navegador mandar o `Origin` de verdade nos formulários: com `no-referrer` ele mandaria `null`. Sem nenhum dos dois
 * cabeçalhos (cliente que não é navegador), o pedido passa: quem não é navegador não é alvo de um ataque feito por outra página.
 */
function origemValida(request, url) {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') return false;
  const origem = request.headers.get('origin');
  return origem === null || origem === url.origin;
}

/** O endereço do site que o painel configurou (`SITE_HOST`), sem esquema nem barra no fim, em minúsculas. Vazio se não houver. */
const enderecoDoSite = (env) => umaLinha(env.SITE_HOST).toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');

/**
 * Confere, nesta ordem, se a rota está ligada, se o endereço é o do site (assim `clarevo-site.pages.dev/api/*` não serve de atalho),
 * o método e a origem. Devolve `{ resposta }` quando o envio já deve ser recusado.
 */
function prepararEnvio(rota, request, env, url, destinos) {
  if (ROTAS[rota] !== true) return { resposta: naoExiste() };
  const site = enderecoDoSite(env);
  if (site === '') return { resposta: responder(request, 'indisponivel', destinos) };
  if (url.host !== site) return { resposta: responder(request, 'host', destinos) };
  if (request.method !== 'POST') return { resposta: responder(request, 'metodo', destinos) };
  if (!origemValida(request, url)) return { resposta: responder(request, 'origem', destinos) };
  return {};
}

/** Lê os campos do envio. Com o campo-isca preenchido, o envio é descartado sem enviar nada. */
async function lerCampos(request, destinos) {
  const corpo = await lerCorpo(request);
  if (corpo === null) return { resposta: responder(request, 'dados', destinos) };
  if (corpo.grande) return { resposta: responder(request, 'grande', destinos) };
  const campos = corpo.campos;
  // Robô preenche tudo. A resposta é igual à de um envio de verdade, para ele não aprender nada, e nada é enviado.
  if (umaLinha(campos[LIMITES.isca]) !== '') return { resposta: responder(request, 'ok', destinos), descartado: true };
  return { campos };
}

// --------------------------------------------------------------------------------------------------------------------
// Contato (Resend)

const DESTINOS_CONTATO = { ok: '/contato-enviado', erro: '/contato-erro', campos: LIMITES.campos.contato };

function validarContato(campos) {
  const d = {
    nome: umaLinha(campos.nome),
    email: umaLinha(campos.email).toLowerCase(),
    empresa: umaLinha(campos.empresa),
    faixa: umaLinha(campos.faixa),
    mensagem: variasLinhas(campos.mensagem),
  };
  const erros = [];
  const T = LIMITES.tamanhos;
  if (d.nome === '' || d.nome.length > T.nome) erros.push('nome');
  if (d.email === '' || d.email.length > T.email || !EMAIL.test(d.email)) erros.push('email');
  if (d.empresa === '' || d.empresa.length > T.empresa) erros.push('empresa');
  if (!Object.prototype.hasOwnProperty.call(LIMITES.faixas, d.faixa)) erros.push('faixa');
  if (d.mensagem === '' || d.mensagem.length > T.mensagem) erros.push('mensagem');
  return { d, erros };
}

/** O corpo do pedido ao Resend: só os campos do formulário, com o texto escapado no HTML. Nada de IP, navegador nem cabeçalhos. */
function emailDeContato(d, env) {
  const faixa = LIMITES.faixas[d.faixa];
  const linhas = [
    ['Nome', d.nome],
    ['E-mail', d.email],
    ['Empresa', d.empresa],
    ['Número aproximado de pessoas', faixa],
    ['Mensagem', d.mensagem],
  ];
  return {
    from: env.CONTATO_REMETENTE,
    to: [env.CONTATO_DESTINO],
    reply_to: d.email,
    subject: `Contato pelo site: ${d.empresa}`,
    text: linhas.map(([r, v]) => `${r}: ${v}`).join('\n\n'),
    html: linhas.map(([r, v]) => `<p><strong>${esc(r)}:</strong> ${esc(v).replace(/\n/g, '<br>')}</p>`).join('\n'),
  };
}

async function contato(request, env, url) {
  const previo = prepararEnvio('contato', request, env, url, DESTINOS_CONTATO);
  if (previo.resposta) return previo.resposta;
  if (!env.RESEND_API_KEY || !env.CONTATO_DESTINO || !env.CONTATO_REMETENTE) return responder(request, 'indisponivel', DESTINOS_CONTATO);
  const lido = await lerCampos(request, DESTINOS_CONTATO);
  if (lido.resposta) return lido.resposta;
  const { d, erros } = validarContato(lido.campos);
  if (erros.length > 0) return responder(request, 'dados', DESTINOS_CONTATO, { campos: erros });
  let resposta;
  try {
    resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': AGENTE },
      body: JSON.stringify(emailDeContato(d, env)),
    });
  } catch {
    return responder(request, 'falha', DESTINOS_CONTATO);
  }
  return responder(request, resposta.ok ? 'ok' : 'falha', DESTINOS_CONTATO);
}

// --------------------------------------------------------------------------------------------------------------------
// Novidades por e-mail (Brevo, dupla confirmação)

const DESTINOS_NEWSLETTER = { ok: '/novidades/receber-enviado', erro: '/novidades/receber-erro', campos: LIMITES.campos.newsletter };

/** Número inteiro positivo escrito em texto (os ids do Brevo), ou `null`. */
const inteiro = (v) => (/^\d{1,12}$/.test(String(v ?? '').trim()) && Number(v) > 0 ? Number(v) : null);

/** O que o Brevo diz quando o e-mail já está cadastrado (a conferir no primeiro teste real, `docs/22_SITE.md`, seção 9). */
const JA_CADASTRADO = /already|exist|duplicate/i;

/**
 * O Brevo responde 201 (contato novo) ou 204 (contato que já existia, atualizado), e para um contato que já existe pode também dar 400 com
 * a mensagem de que ele já existe. Os três valem como sucesso para a pessoa: o site não mostra se um e-mail já estava na lista, porque isso
 * deixaria qualquer um descobrir quem está cadastrado. Outro 400 (lista ou modelo errados, e-mail recusado) e qualquer outro status são falha.
 */
async function brevoAceitou(resposta) {
  if (resposta.ok) return true;
  if (resposta.status !== 400) return false;
  try {
    return JA_CADASTRADO.test(await resposta.text());
  } catch {
    return false;
  }
}

async function newsletter(request, env, url) {
  const previo = prepararEnvio('newsletter', request, env, url, DESTINOS_NEWSLETTER);
  if (previo.resposta) return previo.resposta;
  const lista = inteiro(env.BREVO_LISTA_ID);
  const modelo = inteiro(env.BREVO_MODELO_CONFIRMACAO_ID);
  if (!env.BREVO_API_KEY || lista === null || modelo === null) return responder(request, 'indisponivel', DESTINOS_NEWSLETTER);
  const lido = await lerCampos(request, DESTINOS_NEWSLETTER);
  if (lido.resposta) return lido.resposta;
  const email = umaLinha(lido.campos.email).toLowerCase();
  if (email === '' || email.length > LIMITES.tamanhos.email || !EMAIL.test(email)) return responder(request, 'dados', DESTINOS_NEWSLETTER, { campos: ['email'] });
  // O consentimento é uma caixa que a pessoa marca: sem ela, nada é cadastrado.
  const consentiu = ['sim', 'on', 'true'].includes(umaLinha(lido.campos.consentimento).toLowerCase());
  if (!consentiu) return responder(request, 'consentimento', DESTINOS_NEWSLETTER, { campos: ['consentimento'] });
  const retorno = env.BREVO_URL_RETORNO || `${url.origin}/novidades/receber-confirmado`;
  let resposta;
  try {
    resposta = await fetch('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': AGENTE },
      body: JSON.stringify({ email, includeListIds: [lista], templateId: modelo, redirectionUrl: retorno }),
    });
  } catch {
    return responder(request, 'falha', DESTINOS_NEWSLETTER);
  }
  return responder(request, (await brevoAceitou(resposta)) ? 'ok' : 'falha', DESTINOS_NEWSLETTER);
}

// --------------------------------------------------------------------------------------------------------------------
// Indicadores oficiais (Banco Central, D-106)

/**
 * O atendimento de /api/indicadores, criado uma vez por instância do worker: a cópia de uma hora fica na memória dele. Cada consulta ao
 * Banco Central tem prazo e leva só `Accept` e `User-Agent`: nada de quem visita (IP, navegador, cabeçalhos) vai junto.
 */
const atenderIndicadores = NUCLEO_INDICADORES.createIndicadoresHandler({
  fetch: async (url, init) => {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': AGENTE }, signal: AbortSignal.timeout(init.timeoutMs) });
    return { ok: r.ok, status: r.status, json: () => r.json() };
  },
});

async function indicadores(request) {
  const r = await atenderIndicadores({ method: request.method });
  return new Response(request.method === 'HEAD' ? null : r.body, { status: r.status, headers: { ...CABECALHOS, 'X-Content-Type-Options': 'nosniff', ...r.headers } });
}

// --------------------------------------------------------------------------------------------------------------------

/** O arquivo estático de sempre, com os cabeçalhos de segurança do site (sem trocar os que o Pages já pôs). */
async function estatico(request, env) {
  const resposta = await env.ASSETS.fetch(request);
  const cabecalhos = new Headers(resposta.headers);
  for (const [nome, valor] of Object.entries(CABECALHOS)) if (!cabecalhos.has(nome)) cabecalhos.set(nome, valor);
  return new Response(resposta.body, { status: resposta.status, statusText: resposta.statusText, headers: cabecalhos });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contato') return contato(request, env, url);
    if (url.pathname === '/api/newsletter') return newsletter(request, env, url);
    if (url.pathname === '/api/indicadores') return indicadores(request);
    return estatico(request, env);
  },
};
