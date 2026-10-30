// @ts-nocheck
// GERADO por scripts/gerar-whatsapp.js a partir de packages/core/src/whatsapp. Não editar à mão: mude o núcleo e rode `npm run whatsapp`.
// Clarevo · função do servidor "whatsapp" (Edge Function do Supabase, D-076): recebe as mensagens da Meta, confere a assinatura, lê o
// texto (regras simples, sem IA), chama as funções whatsapp_* do banco com a chave de serviço e RESPONDE só a quem escreveu, em texto
// simples. Nunca inicia conversa nem usa mensagem de modelo (as cobradas). Segredos no painel do Supabase (Edge Functions, Secrets):
// WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_PHONE_KEY, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID e, opcional,
// WHATSAPP_GRAPH_VERSION.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY o próprio Supabase fornece. Publicar com "Verify JWT" desligado (a Meta não manda login).

const __mods = [
  // packages/core/src/whatsapp/index.ts
  function (module, exports, __req) {
    "use strict";
    var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = { enumerable: true, get: function() { return m[k]; } };
        }
        Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __exportStar = (this && this.__exportStar) || function(m, exports) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(__req(1), exports);
    __exportStar(__req(8), exports);
    __exportStar(__req(10), exports);
    __exportStar(__req(11), exports);
  },
  // packages/core/src/whatsapp/mensagem.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WHATSAPP_DESCRIPTION_MAX = exports.WHATSAPP_CODE_LENGTH = exports.WHATSAPP_CODE_ALPHABET = void 0;
    exports.normalizeWhatsAppCode = normalizeWhatsAppCode;
    exports.formatWhatsAppCode = formatWhatsAppCode;
    exports.whatsappCategory = whatsappCategory;
    exports.readWhatsAppMessage = readWhatsAppMessage;
    const dates_1 = __req(2);
    const categorias_1 = __req(3);
    const dedupe_1 = __req(5);
    const money_1 = __req(7);
    const records_1 = __req(4);
    exports.WHATSAPP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    exports.WHATSAPP_CODE_LENGTH = 8;
    exports.WHATSAPP_DESCRIPTION_MAX = 80;
    function fold(text) {
        return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    }
    const EDGE_PUNCT = /^[\s"'“”‘’«»()[\]{}.,;:!?¿¡…*_~]+|[\s"'“”‘’«»()[\]{}.,;:!?¿¡…*_~]+$/gu;
    function trimPunct(word) {
        return word.replace(EDGE_PUNCT, '');
    }
    function commandForm(text) {
        return fold(text)
            .replace(/[^a-z0-9\s-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    const UNDO = new Set(['desfazer', 'desfaz', 'desfaca', 'desfazer ultimo', 'desfazer ultima', 'desfazer o ultimo', 'desfazer a ultima']);
    const UNLINK = new Set(['desligar', 'parar', 'sair', 'stop', 'descadastrar', 'desligar whatsapp']);
    const HELP = new Set([
        '', 'ajuda', 'oi', 'oie', 'ola', 'menu', 'inicio', 'comandos', 'help', 'exemplos', 'como funciona',
        'bom dia', 'boa tarde', 'boa noite',
    ]);
    const LINK_WORDS = new Set(['ativar', 'ligar', 'codigo']);
    function normalizeWhatsAppCode(text) {
        const code = text.toUpperCase().replace(/[\s-]+/g, '');
        if (code.length !== exports.WHATSAPP_CODE_LENGTH)
            return null;
        for (const ch of code)
            if (!exports.WHATSAPP_CODE_ALPHABET.includes(ch))
                return null;
        return code;
    }
    function formatWhatsAppCode(code) {
        return `${code.slice(0, 4)}-${code.slice(4)}`;
    }
    function readLink(text) {
        const words = commandForm(text).split(' ');
        if (words.length >= 2 && LINK_WORDS.has(words[0])) {
            const code = normalizeWhatsAppCode(words.slice(1).join(''));
            return code === null ? { type: 'erro', reason: 'codigo_invalido' } : { type: 'ligar', code };
        }
        const only = text.trim().replace(EDGE_PUNCT, '');
        if (/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/.test(only)) {
            const code = normalizeWhatsAppCode(only);
            if (code !== null)
                return { type: 'ligar', code };
        }
        return undefined;
    }
    const INCOME_WORDS = new Set(['recebi', 'recebido', 'recebimento', 'ganhei', 'entrou', 'entrada', 'caiu', 'receita']);
    const EXPENSE_WORDS = new Set(['gastei', 'gasto', 'paguei', 'pago', 'comprei', 'compra', 'despesa']);
    const EDGE_STOP = new Set([
        'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'em', 'com', 'pra', 'pro', 'para', 'por', 'o', 'a', 'os', 'as', 'um',
        'uma', 'e', 'reais', 'real', 'r$', 'rs', 'foi',
    ]);
    const isEdgeStop = (folded) => EDGE_STOP.has(folded) || /^[-+=\u2013\u2014]+$/.test(folded);
    function moneyOf(folded) {
        const t = folded.replace(/[.,]+$/, '');
        if (!/^(r\$)?\d[\d.,]*$/.test(t))
            return null;
        const cents = (0, money_1.parseBRL)(t);
        if (cents === null)
            return null;
        return { cents, strong: t.startsWith('r$') || /,\d{1,2}$/.test(t) };
    }
    function dateOf(word, today) {
        const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(word);
        if (!m)
            return undefined;
        const year = m[3] === undefined ? today.slice(0, 4) : m[3].length === 2 ? `20${m[3]}` : m[3];
        const iso = `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        return (0, dates_1.isValidIsoDate)(iso) ? iso : null;
    }
    function whatsappCategory(description, kind) {
        const padded = ` ${(0, dedupe_1.normalizeDescription)(description)} `;
        for (const category of records_1.CATEGORIES[kind]) {
            if (padded.includes(` ${(0, dedupe_1.normalizeDescription)(category)} `))
                return category;
        }
        return (0, categorias_1.categoryByRules)(description, kind);
    }
    function clip(text) {
        if (text.length <= exports.WHATSAPP_DESCRIPTION_MAX)
            return text;
        const cut = text.slice(0, exports.WHATSAPP_DESCRIPTION_MAX);
        const space = cut.lastIndexOf(' ');
        return (space >= 20 ? cut.slice(0, space) : cut).trim();
    }
    function readWhatsAppMessage(text, today) {
        const form = commandForm(text);
        if (UNDO.has(form))
            return { type: 'desfazer' };
        if (UNLINK.has(form))
            return { type: 'desligar' };
        if (HELP.has(form))
            return { type: 'ajuda' };
        const link = readLink(text);
        if (link)
            return link;
        let tokens = text
            .split(/\s+/)
            .filter((w) => w !== '')
            .map((raw) => {
            const word = trimPunct(raw);
            return { raw, word, folded: fold(word) };
        })
            .filter((t) => t.word !== '' || t.raw.startsWith('+') || t.raw.startsWith('-'));
        let kind = null;
        const first = tokens[0];
        if (first && (first.raw.startsWith('+') || first.raw.startsWith('-'))) {
            kind = first.raw.startsWith('+') ? 'receita' : 'despesa';
            const rest = first.raw.slice(1);
            const word = trimPunct(rest);
            tokens = word === '' ? tokens.slice(1) : [{ raw: rest, word, folded: fold(word) }, ...tokens.slice(1)];
        }
        const verb = tokens.findIndex((t) => INCOME_WORDS.has(t.folded) || EXPENSE_WORDS.has(t.folded));
        if (verb >= 0) {
            if (kind === null)
                kind = INCOME_WORDS.has(tokens[verb].folded) ? 'receita' : 'despesa';
            tokens = tokens.filter((_, i) => i !== verb);
        }
        let occurredOn = null;
        let daysAgo = null;
        const dateIdx = new Set();
        const setDate = (d, rel) => {
            if (occurredOn !== null && occurredOn !== d)
                return false;
            occurredOn = d;
            daysAgo = rel;
            return true;
        };
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            const rel = t.folded === 'hoje' ? 0 : t.folded === 'ontem' ? 1 : t.folded === 'anteontem' ? 2 : null;
            let d;
            if (rel !== null)
                d = (0, dates_1.addDays)(today, -rel);
            else if (t.folded === 'dia' && /^\d{1,2}$/.test(tokens[i + 1]?.folded ?? '')) {
                const day = tokens[i + 1].folded.padStart(2, '0');
                const iso = `${today.slice(0, 8)}${day}`;
                d = (0, dates_1.isValidIsoDate)(iso) ? iso : null;
                dateIdx.add(i);
                i++;
            }
            else
                d = dateOf(t.folded, today);
            if (d === undefined)
                continue;
            if (d === null || !setDate(d, rel))
                return { type: 'erro', reason: 'data_invalida' };
            dateIdx.add(i);
        }
        tokens = tokens.filter((_, i) => !dateIdx.has(i));
        const date = occurredOn ?? today;
        if (date > today)
            return { type: 'erro', reason: 'data_futura' };
        const candidates = [];
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if ((t.folded === 'r$' || t.folded === 'rs') && tokens[i + 1]) {
                const m = moneyOf(`r$${tokens[i + 1].folded}`);
                if (m) {
                    candidates.push({ idx: [i, i + 1], ...m });
                    i++;
                    continue;
                }
            }
            const m = moneyOf(t.folded);
            if (m)
                candidates.push({ idx: [i], ...m });
        }
        if (candidates.length === 0)
            return { type: 'erro', reason: 'sem_valor' };
        let chosen = candidates[0];
        if (candidates.length > 1) {
            const strong = candidates.filter((c) => c.strong);
            if (strong.length !== 1)
                return { type: 'erro', reason: 'valor_ambiguo' };
            chosen = strong[0];
        }
        if (chosen.cents < 1)
            return { type: 'erro', reason: 'valor_invalido' };
        if (chosen.cents > money_1.MAX_RECORD_CENTS)
            return { type: 'erro', reason: 'valor_acima_do_limite' };
        tokens = tokens.filter((_, i) => !chosen.idx.includes(i));
        while (tokens.length > 0 && isEdgeStop(tokens[0].folded))
            tokens = tokens.slice(1);
        while (tokens.length > 0 && isEdgeStop(tokens[tokens.length - 1].folded))
            tokens = tokens.slice(0, -1);
        const joined = tokens.map((t) => t.word).filter((w) => w !== '').join(' ');
        if (joined === '')
            return { type: 'erro', reason: 'sem_descricao' };
        const description = clip(joined.charAt(0).toUpperCase() + joined.slice(1));
        if (kind === null) {
            kind = whatsappCategory(description, 'receita') !== null && whatsappCategory(description, 'despesa') === null ? 'receita' : 'despesa';
        }
        return {
            type: 'anotar',
            kind,
            amountCents: chosen.cents,
            occurredOn: date,
            daysAgo: occurredOn === null ? 0 : daysAgo,
            description,
            category: whatsappCategory(description, kind),
        };
    }
  },
  // packages/core/src/dates.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isValidIsoDate = isValidIsoDate;
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
        return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
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
  // packages/core/src/importar/categorias.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MEMORY_LIMIT = void 0;
    exports.memoryKey = memoryKey;
    exports.categoryByRules = categoryByRules;
    exports.suggestCategory = suggestCategory;
    exports.rememberCategories = rememberCategories;
    const records_1 = __req(4);
    const dedupe_1 = __req(5);
    exports.MEMORY_LIMIT = 300;
    function memoryKey(description) {
        const words = (0, dedupe_1.descriptionTokens)(description).slice(0, 3);
        return words.length === 0 ? null : words.join(' ');
    }
    const EXPENSE_RULES = [
        { category: 'Saúde', words: ['farmacia', 'drogaria', 'clinica', 'consulta', 'laboratorio', 'exame', 'hospital', 'dentista', 'odontologia', 'medico', 'plano de saude', 'otica', 'psicologo', 'fisioterapia'] },
        { category: 'Educação', words: ['escola', 'faculdade', 'universidade', 'colegio', 'curso', 'matricula', 'livraria', 'papelaria', 'creche', 'mensalidade escolar'] },
        { category: 'Moradia', words: ['aluguel', 'condominio', 'iptu', 'energia', 'energia eletrica', 'luz', 'agua', 'esgoto', 'gas', 'internet', 'reforma', 'material de construcao', 'imobiliaria'] },
        { category: 'Transporte', words: ['combustivel', 'gasolina', 'etanol', 'posto', 'estacionamento', 'pedagio', 'onibus', 'metro', 'passagem', 'taxi', 'corrida', 'bilhete unico', 'oficina', 'mecanica', 'ipva', 'lavagem'] },
        { category: 'Mercado', words: ['mercado', 'supermercado', 'hipermercado', 'padaria', 'hortifruti', 'sacolao', 'acougue', 'feira', 'quitanda', 'mercearia', 'peixaria', 'emporio'] },
        { category: 'Lazer', words: ['restaurante', 'lanchonete', 'pizzaria', 'hamburgueria', 'churrascaria', 'sorveteria', 'cafeteria', 'cafe', 'bar', 'cinema', 'teatro', 'show', 'ingresso', 'viagem', 'hotel', 'pousada', 'lanche'] },
    ];
    const INCOME_RULES = [
        { category: 'Salário', words: ['salario', 'folha de pagamento', 'proventos', 'decimo terceiro', '13 salario', 'ferias'] },
        { category: 'Reembolso', words: ['reembolso', 'estorno', 'devolucao', 'ressarcimento'] },
        { category: 'Renda extra', words: ['freelance', 'comissao', 'bonus', 'venda', 'aluguel recebido'] },
    ];
    function ruleMatches(padded, word) {
        return padded.includes(` ${word} `) || padded.includes(` ${word}s `);
    }
    function categoryByRules(description, kind) {
        const padded = ` ${(0, dedupe_1.normalizeDescription)(description)} `;
        if (padded.trim() === '')
            return null;
        for (const rule of kind === 'despesa' ? EXPENSE_RULES : INCOME_RULES) {
            if (rule.words.some((w) => ruleMatches(padded, w)))
                return rule.category;
        }
        return null;
    }
    function suggestCategory(description, kind, memory) {
        const key = memoryKey(description);
        const remembered = key !== null ? memory[key] : undefined;
        if (remembered !== undefined && records_1.CATEGORIES[kind].includes(remembered))
            return { category: remembered, source: 'memoria' };
        const byRule = categoryByRules(description, kind);
        return byRule !== null ? { category: byRule, source: 'regra' } : { category: null, source: null };
    }
    function rememberCategories(memory, lines) {
        const next = { ...memory };
        for (const l of lines) {
            const key = memoryKey(l.description);
            if (key === null)
                continue;
            delete next[key];
            if (l.category !== null)
                next[key] = l.category;
        }
        const keys = Object.keys(next);
        for (const k of keys.slice(0, Math.max(0, keys.length - exports.MEMORY_LIMIT)))
            delete next[k];
        return next;
    }
  },
  // packages/core/src/records.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CATEGORIES = exports.NO_CATEGORY_LABEL = exports.MONTH_CHECK_KINDS = exports.INSTALLMENT_NATURES = exports.DEBT_NATURES = exports.PARTS_PER_YEAR_MAX = exports.ANNUAL_LEAD_MONTHS = void 0;
    exports.ANNUAL_LEAD_MONTHS = 2;
    exports.PARTS_PER_YEAR_MAX = 12;
    exports.DEBT_NATURES = ['financiamento', 'compra_parcelada'];
    exports.INSTALLMENT_NATURES = ['financiamento', 'compra_parcelada', 'outro_parcelamento'];
    exports.MONTH_CHECK_KINDS = ['recebimentos', 'pagamentos'];
    exports.NO_CATEGORY_LABEL = 'Sem categoria';
    exports.CATEGORIES = {
        despesa: ['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer'],
        receita: ['Salário', 'Renda extra', 'Reembolso'],
    };
  },
  // packages/core/src/importar/dedupe.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DUPLICATE_WINDOW_DAYS = void 0;
    exports.normalizeDescription = normalizeDescription;
    exports.descriptionTokens = descriptionTokens;
    exports.similarDescriptions = similarDescriptions;
    exports.occurrences = occurrences;
    exports.importKeys = importKeys;
    exports.importKey = importKey;
    exports.installmentMark = installmentMark;
    exports.findLookalikes = findLookalikes;
    const dates_1 = __req(2);
    const sha256_1 = __req(6);
    function normalizeDescription(text) {
        return text
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }
    const FILLER = new Set([
        'compra', 'compras', 'debito', 'credito', 'pagamento', 'pagto', 'pgto', 'pix', 'transferencia', 'transf', 'recebida', 'recebido',
        'enviada', 'enviado', 'cartao', 'online', 'line', 'em', 'de', 'da', 'do', 'das', 'dos', 'no', 'na', 'com', 'por', 'para', 'ltda',
        'sa', 'epp', 'cia', 'ted', 'doc', 'saque', 'tarifa', 'parcela', 'lancamento', 'deb', 'cred', 'aut', 'automatico', 'conta',
    ]);
    function descriptionTokens(text) {
        return normalizeDescription(text)
            .split(' ')
            .filter((w) => w.length >= 3 && /^[a-z]+$/.test(w) && !FILLER.has(w));
    }
    function sameToken(a, b) {
        return a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
    }
    function similarDescriptions(a, b) {
        const na = normalizeDescription(a);
        const nb = normalizeDescription(b);
        if (na === '' || nb === '')
            return false;
        if (na === nb)
            return true;
        const ta = descriptionTokens(a);
        const tb = descriptionTokens(b);
        if (ta.length === 0 || tb.length === 0)
            return false;
        if ((na.length >= 4 && nb.includes(na)) || (nb.length >= 4 && na.includes(nb)))
            return true;
        const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
        const shared = small.filter((w) => big.some((x) => sameToken(w, x))).length;
        return shared / small.length >= 0.5;
    }
    function occurrences(lines) {
        const seen = new Map();
        return lines.map((l) => {
            const id = l.fitId ? `f|${l.fitId}|${l.date}|${l.amountCents}` : `d|${l.date}|${l.amountCents}|${normalizeDescription(l.description)}`;
            const n = seen.get(id) ?? 0;
            seen.set(id, n + 1);
            return n;
        });
    }
    function importKeys(targetId, lines) {
        const occ = occurrences(lines);
        return lines.map((l, i) => importKey(targetId, l, occ[i]));
    }
    function importKey(targetId, line, occurrence) {
        const base = line.fitId
            ? `imp1|${targetId}|f|${line.fitId}|${line.date}|${line.amountCents}|${occurrence}`
            : `imp1|${targetId}|d|${line.date}|${line.amountCents}|${normalizeDescription(line.description)}|${occurrence}`;
        return (0, sha256_1.sha256Hex)(base);
    }
    function installmentMark(description, date) {
        const re = /(?:^|[^\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/g;
        const day = date ? Number(date.slice(8, 10)) : null;
        const month = date ? Number(date.slice(5, 7)) : null;
        for (let m = re.exec(description); m !== null; m = re.exec(description)) {
            const number = Number(m[1]);
            const count = Number(m[2]);
            const numberStart = m.index + m[0].length - (m[1].length + 1 + m[2].length);
            const marked = /PARC(?:ELA)?\.?\s*$/i.test(description.slice(0, numberStart));
            if (!marked && number === day && count === month)
                continue;
            if (count >= 2 && count <= 48 && number >= 1 && number <= count)
                return { number, count };
        }
        return null;
    }
    exports.DUPLICATE_WINDOW_DAYS = 3;
    function findLookalikes(lines, existing) {
        const pairs = [];
        lines.forEach((l, i) => {
            existing.forEach((e, j) => {
                if (e.kind !== l.kind || e.amountCents !== l.amountCents)
                    return;
                const gap = Math.abs((0, dates_1.daysBetween)(e.date, l.date));
                const mark = l.installment ?? null;
                const sameInstallment = mark !== null && e.installmentCount === mark.count && e.installmentNumber === mark.number;
                const sameInvoice = mark !== null && e.invoiceMonth !== undefined && e.invoiceMonth === l.invoiceMonth;
                if ((gap > exports.DUPLICATE_WINDOW_DAYS && !sameInstallment && !sameInvoice) || !similarDescriptions(e.description, l.description))
                    return;
                pairs.push({ line: i, entry: j, gap: sameInstallment || sameInvoice ? Math.min(gap, exports.DUPLICATE_WINDOW_DAYS) : gap });
            });
        });
        pairs.sort((a, b) => a.gap - b.gap || a.line - b.line || a.entry - b.entry);
        const flagged = lines.map(() => false);
        const used = new Set();
        for (const p of pairs) {
            if (flagged[p.line] || used.has(p.entry))
                continue;
            flagged[p.line] = true;
            used.add(p.entry);
        }
        return flagged;
    }
  },
  // packages/core/src/sha256.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.utf8Bytes = utf8Bytes;
    exports.sha256HexOfBytes = sha256HexOfBytes;
    exports.sha256Hex = sha256Hex;
    const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
        0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
        0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
        0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
        0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
        0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    function utf8Bytes(text) {
        const bytes = [];
        for (let i = 0; i < text.length; i++) {
            let code = text.charCodeAt(i);
            if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
                const low = text.charCodeAt(i + 1);
                if (low >= 0xdc00 && low <= 0xdfff) {
                    code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                    i++;
                }
            }
            if (code >= 0xd800 && code <= 0xdfff)
                code = 0xfffd;
            if (code < 0x80)
                bytes.push(code);
            else if (code < 0x800)
                bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
            else if (code < 0x10000)
                bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
            else
                bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
        return bytes;
    }
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    function sha256HexOfBytes(input) {
        const bytes = input.slice();
        const bitLength = bytes.length * 8;
        bytes.push(0x80);
        while (bytes.length % 64 !== 56)
            bytes.push(0);
        const high = Math.floor(bitLength / 0x100000000);
        const low = bitLength >>> 0;
        for (const word of [high, low])
            bytes.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
        const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        const w = new Array(64).fill(0);
        for (let offset = 0; offset < bytes.length; offset += 64) {
            for (let i = 0; i < 16; i++) {
                const j = offset + i * 4;
                w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
            }
            for (let i = 16; i < 64; i++) {
                const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
            }
            let [a, b, c, d, e, f, g, hh] = h;
            for (let i = 0; i < 64; i++) {
                const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
                const ch = (e & f) ^ (~e & g);
                const t1 = (hh + s1 + ch + K[i] + w[i]) >>> 0;
                const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const t2 = (s0 + maj) >>> 0;
                hh = g;
                g = f;
                f = e;
                e = (d + t1) >>> 0;
                d = c;
                c = b;
                b = a;
                a = (t1 + t2) >>> 0;
            }
            h[0] = (h[0] + a) >>> 0;
            h[1] = (h[1] + b) >>> 0;
            h[2] = (h[2] + c) >>> 0;
            h[3] = (h[3] + d) >>> 0;
            h[4] = (h[4] + e) >>> 0;
            h[5] = (h[5] + f) >>> 0;
            h[6] = (h[6] + g) >>> 0;
            h[7] = (h[7] + hh) >>> 0;
        }
        return h.map((x) => x.toString(16).padStart(8, '0')).join('');
    }
    function sha256Hex(text) {
        return sha256HexOfBytes(utf8Bytes(text));
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
  // packages/core/src/whatsapp/respostas.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WHATSAPP_REPLY = exports.WHATSAPP_CODE_MINUTES = void 0;
    exports.whatsappParseReply = whatsappParseReply;
    exports.whatsappOutcomeReply = whatsappOutcomeReply;
    const dates_1 = __req(2);
    const legal_1 = __req(9);
    const money_1 = __req(7);
    const records_1 = __req(4);
    exports.WHATSAPP_CODE_MINUTES = 15;
    function spaceLabel(space) {
        return space.kind === 'pessoal' ? 'espaço Pessoal' : `espaço ${space.name}`;
    }
    function dayLabel(date, today) {
        const shown = (0, dates_1.formatListDate)(date, today);
        if (date === today)
            return `hoje, ${shown}`;
        if (date === (0, dates_1.addDays)(today, -1))
            return `ontem, ${shown}`;
        return shown;
    }
    function recordLines(r, today) {
        const what = r.kind === 'despesa' ? 'Gasto' : 'Recebimento';
        const account = r.kind === 'despesa' ? 'Saiu de' : 'Entrou em';
        return [
            `${what}: ${r.description}, ${(0, money_1.formatBRL)(r.amount_cents)}`,
            `Categoria: ${r.category ?? records_1.NO_CATEGORY_LABEL}`,
            `Data: ${dayLabel(r.occurred_on, today)}`,
            `${account}: ${r.account_name}`,
        ].join('\n');
    }
    const EXAMPLES = [
        'Para anotar um gasto, escreva o que foi e o valor:',
        'mercado 52,30',
        '',
        'Para um recebimento:',
        'recebi 1500 salário',
        '',
        'A data é hoje, se você não disser outra: "farmácia 38 ontem" ou "luz 180 12/10".',
    ].join('\n');
    const WORDS = 'DESFAZER apaga a última anotação feita por aqui, AJUDA mostra os exemplos e DESLIGAR desliga este número da Clarevo.';
    const HOW_TO_LINK = 'No app da Clarevo, abra Conta, toque em WhatsApp e siga os passos.';
    exports.WHATSAPP_REPLY = {
        ajuda: `Oi! Por aqui você anota gastos e recebimentos na Clarevo.\n\n${EXAMPLES}\n\n${WORDS}\n\nSe este número ainda não está ligado: ${HOW_TO_LINK}`,
        midia: 'Por enquanto, a Clarevo entende só mensagens escritas. Dica: o microfone do teclado do celular transforma a sua fala em texto antes de enviar.',
        nao_ligado: `Este número ainda não está ligado a uma conta da Clarevo. ${HOW_TO_LINK}`,
        codigo_invalido: `Este código não vale mais ou não existe. No app, abra Conta, toque em WhatsApp e gere outro. Cada código vale por ${exports.WHATSAPP_CODE_MINUTES} minutos.`,
        muitas_tentativas: 'Muitas tentativas com códigos que não valem. Espere uma hora e gere um código novo no app.',
        muitas_mensagens: 'Muitas mensagens em pouco tempo. Espere alguns minutos e mande de novo.',
        nada_para_desfazer: 'Não há anotação recente feita por aqui para desfazer. Para mudar algo mais antigo, use o app.',
        desligado: 'Pronto, este WhatsApp foi desligado da Clarevo e nada mais será anotado por aqui. Para ligar de novo, use o app.',
        data_futura: 'A data fica no futuro. Para uma conta que ainda vai vencer, use Contas a pagar no app.',
        valor_invalido: 'O valor precisa ser maior que zero. Por exemplo: mercado 52,30',
        valor_acima_do_limite: `O valor passa do limite de ${(0, money_1.formatBRL)(money_1.MAX_RECORD_CENTS)} por registro.`,
        descricao_invalida: 'A descrição ficou longa demais. Escreva em poucas palavras o que foi e o valor, por exemplo: mercado 52,30',
        erro: `Não deu para anotar agora. Tente de novo em alguns minutos. Se continuar, escreva para ${legal_1.SUPPORT_EMAIL}.`,
    };
    const PARSE_REPLY = {
        sem_valor: 'Não encontrei o valor. Escreva o que foi e o valor, por exemplo: mercado 52,30',
        valor_ambiguo: 'Encontrei mais de um valor. Mande uma anotação por mensagem, por exemplo: mercado 52,30',
        valor_invalido: exports.WHATSAPP_REPLY.valor_invalido,
        valor_acima_do_limite: exports.WHATSAPP_REPLY.valor_acima_do_limite,
        sem_descricao: 'Faltou dizer o que foi. Por exemplo: mercado 52,30',
        data_invalida: 'Não entendi a data. Use hoje, ontem, anteontem ou dia/mês, por exemplo: mercado 52,30 ontem',
        data_futura: exports.WHATSAPP_REPLY.data_futura,
        codigo_invalido: exports.WHATSAPP_REPLY.codigo_invalido,
    };
    function whatsappParseReply(reason) {
        return PARSE_REPLY[reason];
    }
    function whatsappOutcomeReply(outcome, messageDay) {
        const today = outcome.today ?? messageDay;
        switch (outcome.result) {
            case 'repetida':
            case 'silencio':
            case 'registrada':
                return null;
            case 'ligado':
                return `Pronto, este WhatsApp está ligado à Clarevo, no ${spaceLabel(outcome.space)}.\n\n${EXAMPLES}\n\n${WORDS}`;
            case 'anotado':
                return `Anotado no ${spaceLabel(outcome.space)}:\n${recordLines(outcome.record, today)}\n\nSe algo ficou errado, responda DESFAZER.`;
            case 'desfeito':
                return `Desfeito. Saiu do ${spaceLabel(outcome.space)}:\n${recordLines(outcome.record, today)}`;
            case 'sem_permissao':
                return `Você não anota mais no ${spaceLabel(outcome.space)}. No app, abra Conta, toque em WhatsApp e ligue de novo, escolhendo o espaço.`;
            case 'sem_conta':
                return `O ${spaceLabel(outcome.space)} está sem conta de origem principal. No app, abra Conta e escolha a principal em Contas de origem.`;
            default:
                return exports.WHATSAPP_REPLY[outcome.result];
        }
    }
  },
  // packages/core/src/legal.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SIGNUP_CONSENT_TEXT = exports.LEGAL_TEXT = exports.SITE_PAGES = exports.SUPPORT_TEXT = exports.CONTACT_EMAIL = exports.PRIVACY_EMAIL = exports.SUPPORT_EMAIL = void 0;
    exports.normalizeSiteUrl = normalizeSiteUrl;
    exports.sitePageUrl = sitePageUrl;
    exports.signupConsentParts = signupConsentParts;
    exports.SUPPORT_EMAIL = 'suporte@clarevo.app.br';
    exports.PRIVACY_EMAIL = 'privacidade@clarevo.app.br';
    exports.CONTACT_EMAIL = 'contato@clarevo.app.br';
    exports.SUPPORT_TEXT = {
        title: 'Ajuda e contato',
        hint: `Dúvidas sobre o app ou um problema: escreva para ${exports.SUPPORT_EMAIL}. Pedidos sobre os seus dados: ${exports.PRIVACY_EMAIL}.`,
        write: 'Escrever para o suporte',
        writeFailed: `Não foi possível abrir o e-mail neste aparelho. Escreva para ${exports.SUPPORT_EMAIL}.`,
    };
    exports.SITE_PAGES = {
        privacidade: 'privacidade.html',
        termos: 'termos.html',
        exclusao: 'excluir-conta.html',
        suporte: 'suporte.html',
    };
    const SITE_URL_RE = /^(https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?|http:\/\/localhost(:\d{1,5})?)(\/[^\s?#]*)?$/i;
    function normalizeSiteUrl(raw) {
        const texto = (raw ?? '').trim();
        if (!texto || !SITE_URL_RE.test(texto))
            return null;
        return texto.replace(/\/+$/, '');
    }
    function sitePageUrl(siteUrl, page) {
        const base = normalizeSiteUrl(siteUrl);
        return base ? `${base}/${exports.SITE_PAGES[page]}` : null;
    }
    exports.LEGAL_TEXT = {
        signup: {
            before: 'Ao criar a conta, você confirma que tem 18 anos ou mais e concorda com os ',
            terms: 'Termos de uso',
            between: ' e a ',
            privacy: 'Política de privacidade',
            after: '.',
        },
        account: {
            title: 'Privacidade e termos',
            hint: 'Abrem o site da Clarevo no navegador.',
            privacy: 'Política de privacidade',
            terms: 'Termos de uso',
            deletion: 'Excluir conta: como funciona',
            openFailed: 'Não foi possível abrir a página agora. Tente de novo em instantes.',
        },
        whoSees: {
            personal: 'Única pessoa do app que vê, anota, edita e exclui registros em Pessoal.',
            team: 'A equipe da Clarevo não olha os seus dados no dia a dia. Só acessa quando a lei exigir ou para resolver um problema que você pediu.',
            security: 'Seus registros ficam protegidos por permissões no servidor: entre as pessoas do app, só você vê o espaço Pessoal. Na Família, cada pessoa vê o que o papel dela permite.',
        },
    };
    function signupConsentParts() {
        const t = exports.LEGAL_TEXT.signup;
        return [{ text: t.before }, { text: t.terms, page: 'termos' }, { text: t.between }, { text: t.privacy, page: 'privacidade' }, { text: t.after }];
    }
    exports.SIGNUP_CONSENT_TEXT = signupConsentParts()
        .map((p) => p.text)
        .join('');
  },
  // packages/core/src/whatsapp/servidor.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WhatsAppFinalError = exports.WHATSAPP_MAX_BODY_BYTES = exports.WHATSAPP_MAX_MESSAGES = exports.WHATSAPP_GRAPH_VERSION = exports.WHATSAPP_TIME_ZONE = void 0;
    exports.hmacSha256Hex = hmacSha256Hex;
    exports.verifyMetaSignature = verifyMetaSignature;
    exports.whatsappPhoneHash = whatsappPhoneHash;
    exports.whatsappInbound = whatsappInbound;
    exports.handleWhatsAppMessage = handleWhatsAppMessage;
    exports.whatsappConfigFrom = whatsappConfigFrom;
    exports.supabaseWhatsAppRpc = supabaseWhatsAppRpc;
    exports.sendWhatsAppReply = sendWhatsAppReply;
    exports.createWhatsAppHandler = createWhatsAppHandler;
    const dates_1 = __req(2);
    const sha256_1 = __req(6);
    const mensagem_1 = __req(1);
    const respostas_1 = __req(8);
    exports.WHATSAPP_TIME_ZONE = 'America/Sao_Paulo';
    exports.WHATSAPP_GRAPH_VERSION = 'v23.0';
    exports.WHATSAPP_MAX_MESSAGES = 100;
    exports.WHATSAPP_MAX_BODY_BYTES = 256 * 1024;
    function hexToBytes(hex) {
        const out = [];
        for (let i = 0; i < hex.length; i += 2)
            out.push(parseInt(hex.slice(i, i + 2), 16));
        return out;
    }
    function hmacSha256Hex(key, message) {
        const block = key.length > 64 ? hexToBytes((0, sha256_1.sha256HexOfBytes)(key)) : key.slice();
        while (block.length < 64)
            block.push(0);
        const inner = (0, sha256_1.sha256HexOfBytes)([...block.map((b) => b ^ 0x36), ...message]);
        return (0, sha256_1.sha256HexOfBytes)([...block.map((b) => b ^ 0x5c), ...hexToBytes(inner)]);
    }
    function sameText(a, b) {
        if (a.length !== b.length)
            return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++)
            diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
        return diff === 0;
    }
    function verifyMetaSignature(body, header, appSecret) {
        if (appSecret === '' || header === null || !/^sha256=[0-9a-fA-F]{64}$/.test(header))
            return false;
        return sameText(hmacSha256Hex((0, sha256_1.utf8Bytes)(appSecret), body), header.slice(7).toLowerCase());
    }
    function whatsappPhoneHash(waId, phoneKey) {
        return hmacSha256Hex((0, sha256_1.utf8Bytes)(phoneKey), (0, sha256_1.utf8Bytes)(waId.replace(/\D/g, '')));
    }
    function obj(v) {
        return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : null;
    }
    function list(v) {
        return Array.isArray(v) ? v : [];
    }
    function whatsappInbound(payload, phoneNumberId) {
        const root = obj(payload);
        if (!root || root.object !== 'whatsapp_business_account')
            return [];
        const out = [];
        for (const entry of list(root.entry)) {
            for (const change of list(obj(entry)?.changes)) {
                const c = obj(change);
                const value = obj(c?.value);
                if (c?.field !== 'messages' || !value || obj(value.metadata)?.phone_number_id !== phoneNumberId)
                    continue;
                for (const m of list(value.messages)) {
                    const msg = obj(m);
                    const id = msg?.id;
                    const from = msg?.from;
                    const ts = Number(msg?.timestamp);
                    if (typeof id !== 'string' || id === '' || id.length > 200)
                        continue;
                    if (typeof from !== 'string' || !/^\d{8,15}$/.test(from) || !Number.isFinite(ts))
                        continue;
                    const type = typeof msg?.type === 'string' ? msg.type : 'unsupported';
                    const body = obj(msg?.text)?.body;
                    const system = obj(msg?.system)?.type;
                    out.push({
                        id,
                        from,
                        timestamp: ts,
                        type,
                        text: type === 'text' && typeof body === 'string' ? body : null,
                        ...(type === 'system' ? { systemType: typeof system === 'string' ? system : null } : {}),
                    });
                }
            }
        }
        return out;
    }
    const SILENT_TYPES = new Set(['reaction', 'system', 'unsupported', 'errors']);
    async function handleWhatsAppMessage(msg, rpc, phoneKey) {
        const base = { p_message_id: msg.id, p_phone_hash: whatsappPhoneHash(msg.from, phoneKey) };
        if (msg.type === 'system' && msg.systemType === 'user_changed_number') {
            await rpc('whatsapp_unlink', base);
            return null;
        }
        if (SILENT_TYPES.has(msg.type))
            return null;
        const today = (0, dates_1.todayIn)(exports.WHATSAPP_TIME_ZONE, new Date(msg.timestamp * 1000));
        const sentAt = new Date(msg.timestamp * 1000).toISOString();
        const noted = async (outcome, reply) => {
            const r = await rpc('whatsapp_note', { ...base, p_outcome: outcome });
            return r.result === 'registrada' ? reply : (0, respostas_1.whatsappOutcomeReply)(r, today);
        };
        if (msg.type === 'request_welcome')
            return noted('ajuda', respostas_1.WHATSAPP_REPLY.ajuda);
        if (msg.type !== 'text' || msg.text === null)
            return noted('midia', respostas_1.WHATSAPP_REPLY.midia);
        const cmd = (0, mensagem_1.readWhatsAppMessage)(msg.text, today);
        let outcome;
        switch (cmd.type) {
            case 'ajuda':
                return noted('ajuda', respostas_1.WHATSAPP_REPLY.ajuda);
            case 'erro':
                return noted('nao_entendi', (0, respostas_1.whatsappParseReply)(cmd.reason));
            case 'ligar':
                outcome = await rpc('whatsapp_link', { ...base, p_code: cmd.code });
                break;
            case 'desfazer':
                outcome = await rpc('whatsapp_undo', { ...base, p_sent_at: sentAt });
                break;
            case 'desligar':
                outcome = await rpc('whatsapp_unlink', base);
                break;
            case 'anotar':
                outcome = await rpc('whatsapp_add_record', {
                    ...base,
                    p_sent_at: sentAt,
                    p_kind: cmd.kind,
                    p_amount_cents: cmd.amountCents,
                    p_days_ago: cmd.daysAgo,
                    p_occurred_on: cmd.daysAgo === null ? cmd.occurredOn : null,
                    p_description: cmd.description,
                    p_category: cmd.category,
                });
                break;
        }
        return (0, respostas_1.whatsappOutcomeReply)(outcome, today);
    }
    const REQUIRED_ENV = [
        'WHATSAPP_VERIFY_TOKEN',
        'WHATSAPP_APP_SECRET',
        'WHATSAPP_PHONE_KEY',
        'WHATSAPP_ACCESS_TOKEN',
        'WHATSAPP_PHONE_NUMBER_ID',
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
    ];
    function whatsappConfigFrom(env) {
        const v = (name) => (env(name) ?? '').trim();
        if (REQUIRED_ENV.some((name) => v(name) === ''))
            return null;
        return {
            verifyToken: v('WHATSAPP_VERIFY_TOKEN'),
            appSecret: v('WHATSAPP_APP_SECRET'),
            phoneKey: v('WHATSAPP_PHONE_KEY'),
            accessToken: v('WHATSAPP_ACCESS_TOKEN'),
            phoneNumberId: v('WHATSAPP_PHONE_NUMBER_ID'),
            supabaseUrl: v('SUPABASE_URL').replace(/\/+$/, ''),
            serviceKey: v('SUPABASE_SERVICE_ROLE_KEY'),
            graphVersion: v('WHATSAPP_GRAPH_VERSION') || exports.WHATSAPP_GRAPH_VERSION,
        };
    }
    const RESULTS = new Set([
        'ligado', 'anotado', 'desfeito', 'sem_permissao', 'sem_conta', 'nada_para_desfazer', 'desligado', 'nao_ligado', 'codigo_invalido',
        'muitas_tentativas', 'muitas_mensagens', 'data_futura', 'valor_invalido', 'valor_acima_do_limite', 'descricao_invalida', 'repetida',
        'silencio', 'registrada',
    ]);
    class WhatsAppFinalError extends Error {
    }
    exports.WhatsAppFinalError = WhatsAppFinalError;
    function supabaseWhatsAppRpc(config, fetcher) {
        return async (fn, args) => {
            const headers = { apikey: config.serviceKey, 'Content-Type': 'application/json' };
            if (config.serviceKey.startsWith('eyJ'))
                headers.Authorization = `Bearer ${config.serviceKey}`;
            const res = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
            const text = await res.text();
            if (res.status >= 400 && res.status < 500)
                throw new WhatsAppFinalError(`banco recusou (${res.status}) em ${fn}`);
            if (res.status !== 200)
                throw new Error(`banco respondeu ${res.status} em ${fn}`);
            const outcome = obj(JSON.parse(text));
            if (!outcome || typeof outcome.result !== 'string' || !RESULTS.has(outcome.result))
                throw new Error(`resposta inesperada de ${fn}`);
            return outcome;
        };
    }
    async function sendWhatsAppReply(config, fetcher, to, replyTo, body) {
        const res = await fetcher(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                context: { message_id: replyTo },
                type: 'text',
                text: { preview_url: false, body },
            }),
        });
        if (res.status !== 200)
            throw new Error(`a Meta respondeu ${res.status} ao envio`);
    }
    function queryParam(url, name) {
        const q = url.indexOf('?');
        if (q < 0)
            return null;
        for (const pair of url.slice(q + 1).split('#')[0].split('&')) {
            const eq = pair.indexOf('=');
            const key = eq < 0 ? pair : pair.slice(0, eq);
            try {
                if (decodeURIComponent(key.replace(/\+/g, ' ')) === name)
                    return decodeURIComponent((eq < 0 ? '' : pair.slice(eq + 1)).replace(/\+/g, ' '));
            }
            catch {
                return null;
            }
        }
        return null;
    }
    function createWhatsAppHandler(deps) {
        const log = deps.log ?? (() => { });
        return async (req) => {
            const config = deps.config;
            if (!config) {
                log('configuração incompleta: faltam segredos da função');
                return { status: 503, body: 'indisponível' };
            }
            if (req.method === 'GET') {
                const ok = queryParam(req.url, 'hub.mode') === 'subscribe' && sameText(queryParam(req.url, 'hub.verify_token') ?? '', config.verifyToken);
                const challenge = queryParam(req.url, 'hub.challenge');
                return ok && challenge !== null ? { status: 200, body: challenge } : { status: 403, body: 'recusado' };
            }
            if (req.method !== 'POST')
                return { status: 405, body: 'método não aceito' };
            if (Number(req.header('content-length') ?? 0) > exports.WHATSAPP_MAX_BODY_BYTES)
                return { status: 413, body: 'grande demais' };
            const { bytes, text } = await req.body();
            if (bytes.length > exports.WHATSAPP_MAX_BODY_BYTES)
                return { status: 413, body: 'grande demais' };
            if (!verifyMetaSignature(bytes, req.header('x-hub-signature-256'), config.appSecret))
                return { status: 401, body: 'assinatura inválida' };
            let payload;
            try {
                payload = JSON.parse(text);
            }
            catch {
                return { status: 400, body: 'corpo inválido' };
            }
            const rpc = supabaseWhatsAppRpc(config, deps.fetch);
            const messages = whatsappInbound(payload, config.phoneNumberId);
            if (messages.length > exports.WHATSAPP_MAX_MESSAGES)
                log(`entrega com ${messages.length} mensagens: só as primeiras ${exports.WHATSAPP_MAX_MESSAGES} tratadas`);
            for (const msg of messages.slice(0, exports.WHATSAPP_MAX_MESSAGES)) {
                let reply;
                try {
                    reply = await handleWhatsAppMessage(msg, rpc, config.phoneKey);
                }
                catch (e) {
                    log(`falha ao tratar uma mensagem: ${e instanceof Error ? e.message : 'erro'}`);
                    if (!(e instanceof WhatsAppFinalError))
                        return { status: 500, body: 'tente de novo' };
                    reply = respostas_1.WHATSAPP_REPLY.erro;
                }
                if (reply === null)
                    continue;
                try {
                    await sendWhatsAppReply(config, deps.fetch, msg.from, msg.id, reply);
                }
                catch (e) {
                    log(`falha ao responder: ${e instanceof Error ? e.message : 'erro'}`);
                }
            }
            return { status: 200, body: 'ok' };
        };
    }
  },
  // packages/core/src/whatsapp/app.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WHATSAPP_TEXT = exports.WHATSAPP_UNLINKED = exports.WHATSAPP_IN_ACCOUNT = exports.WHATSAPP_NUMBER = void 0;
    exports.whatsappActivationText = whatsappActivationText;
    exports.whatsappChatLink = whatsappChatLink;
    exports.formatWhatsAppNumber = formatWhatsAppNumber;
    const mensagem_1 = __req(1);
    const respostas_1 = __req(8);
    exports.WHATSAPP_NUMBER = '15552087378';
    exports.WHATSAPP_IN_ACCOUNT = false;
    exports.WHATSAPP_UNLINKED = {
        linked: false,
        contextId: null,
        linkedAt: null,
        codeContextId: null,
        codeExpiresAt: null,
    };
    function whatsappActivationText(code) {
        return `Ativar ${(0, mensagem_1.formatWhatsAppCode)(code)}`;
    }
    function whatsappChatLink(number, code) {
        return `https://wa.me/${number}?text=${encodeURIComponent(whatsappActivationText(code))}`;
    }
    function formatWhatsAppNumber(number) {
        const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(number);
        if (br)
            return `+55 ${br[1]} ${br[2]}-${br[3]}`;
        const us = /^1(\d{3})(\d{3})(\d{4})$/.exec(number);
        return us ? `+1 (${us[1]}) ${us[2]}-${us[3]}` : `+${number}`;
    }
    exports.WHATSAPP_TEXT = {
        cardTitle: 'WhatsApp',
        cardBody: 'Anote gastos e recebimentos mandando uma mensagem para a Clarevo.',
        cardOpen: 'Anotar pelo WhatsApp',
        cardLinked: (space) => `Ligado ao espaço ${space}.`,
        title: 'WhatsApp',
        intro: 'Mande uma mensagem como "mercado 52,30" para a Clarevo e o gasto entra no app na hora. Para um recebimento: "recebi 1500 salário".',
        textOnly: 'Por enquanto, só mensagens escritas. O microfone do teclado do celular transforma a sua fala em texto antes de enviar.',
        spaceLabel: 'Anotar no espaço',
        generate: 'Gerar código',
        generating: 'Gerando…',
        codeTitle: 'Seu código',
        codeHelp: `Mande "Ativar" e o código para a Clarevo no WhatsApp, do número que você vai usar. O código vale por ${respostas_1.WHATSAPP_CODE_MINUTES} minutos e serve uma vez.`,
        openWhatsApp: 'Abrir o WhatsApp com a mensagem pronta',
        numberLabel: (n) => `Número da Clarevo: ${formatWhatsAppNumber(n)}`,
        codeLost: 'O código já foi mostrado. Gere outro.',
        checkLinked: 'Já mandei a mensagem',
        linkedTitle: 'WhatsApp ligado',
        linkedBody: (space) => `As mensagens deste número anotam no espaço ${space}.`,
        linkedGone: 'Ligado a um espaço em que você não anota mais. Gere um código novo para escolher outro.',
        changeSpace: 'Trocar o espaço ou o número',
        examplesTitle: 'O que dá para mandar',
        examples: [
            'mercado 52,30',
            'farmácia 38 ontem',
            'luz 180 12/10',
            'recebi 1500 salário',
            'DESFAZER: apaga a última anotação feita por lá',
            'DESLIGAR: desliga o número',
        ],
        unlink: 'Desligar o WhatsApp',
        unlinkTitle: 'Desligar o WhatsApp?',
        unlinkBody: 'As mensagens deste número deixam de anotar. O que já foi anotado continua no app.',
        unlinkConfirm: 'Desligar',
        unlinked: 'WhatsApp desligado.',
        privacyTitle: 'Privacidade',
        privacy: 'As mensagens passam pelos servidores da Meta, empresa dona do WhatsApp. A Clarevo guarda só o que você anotou, como qualquer registro do app. O texto das mensagens e o seu número não ficam guardados: do número, só um resumo feito com uma chave secreta, para reconhecer quem escreve.',
        error: 'Não deu para concluir agora. Tente de novo.',
        demo: 'Na demonstração, o WhatsApp não é ligado.',
        notReady: 'O número da Clarevo no WhatsApp ainda está sendo preparado.',
        openFailed: 'Não deu para abrir o WhatsApp neste aparelho. Mande a mensagem com o código para o número acima.',
        linkedNow: 'Pronto, o WhatsApp está ligado.',
        notYet: 'Ainda não chegou a mensagem com o código. Confira se mandou do número que vai usar e tente de novo em alguns segundos.',
    };
  },
];
const __cache = [];
function __req(i) {
  if (__cache[i]) return __cache[i].exports;
  const module = { exports: {} };
  __cache[i] = module;
  __mods[i](module, module.exports, __req);
  return module.exports;
}

const whatsapp = __req(0);
const handler = whatsapp.createWhatsAppHandler({
  config: whatsapp.whatsappConfigFrom((name) => Deno.env.get(name)),
  fetch: (url, init) => fetch(url, init),
  log: (message) => console.error(message),
});

Deno.serve(async (req) => {
  const res = await handler({
    method: req.method,
    url: req.url,
    header: (name) => req.headers.get(name),
    body: async () => {
      const buf = new Uint8Array(await req.arrayBuffer());
      return { bytes: Array.from(buf), text: new TextDecoder().decode(buf) };
    },
  });
  return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
});
