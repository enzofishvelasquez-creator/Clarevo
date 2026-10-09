import type { IsoDate } from '../../dates';
import type { LearnSource } from '../types';

/**
 * Datas e fontes repetidas entre temas.
 *
 * Método de conferência (spec5_notes §2): os sites oficiais não abrem a partir do ambiente de trabalho; cada fato
 * citado (lei, artigo, limite, percentual, data) foi conferido em 09/10/2026 por trecho de resultado de busca da
 * própria fonte. `consultedOn` registra essa data; o endereço é o da página em que o trecho apareceu.
 */
export const REVIEWED_ON: IsoDate = '2026-10-09';
export const CONSULTED_ON: IsoDate = '2026-10-09';

export const clarevo = (...refs: string[]): LearnSource => ({ kind: 'clarevo', refs });

export const oficial = (publisher: string, title: string, url: string, locator: string | null = null): LearnSource => ({
  kind: 'oficial',
  publisher,
  title,
  url,
  locator,
  consultedOn: CONSULTED_ON,
});

export const mercado = (publisher: string, title: string, url: string, locator: string | null = null): LearnSource => ({
  kind: 'mercado',
  publisher,
  title,
  url,
  locator,
  consultedOn: CONSULTED_ON,
});

const PLANALTO = 'Presidência da República';
const CMN_BCB = 'Conselho Monetário Nacional e Banco Central do Brasil';
const BCB = 'Banco Central do Brasil';
const CVM = 'CVM, Portal do Investidor';

export const cdc = (locator: string): LearnSource =>
  oficial(PLANALTO, 'Código de Defesa do Consumidor (Lei nº 8.078/1990)', 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm', locator);

export const planalto = (title: string, url: string, locator: string | null = null): LearnSource => oficial(PLANALTO, title, url, locator);

export const cmn = (title: string, url: string, locator: string | null = null): LearnSource => oficial(CMN_BCB, title, url, locator);

export const bcb = (title: string, url: string, locator: string | null = null): LearnSource => oficial(BCB, title, url, locator);

export const cvm = (title: string, url: string, locator: string | null = null): LearnSource => oficial(CVM, title, url, locator);

export const CVM_RESERVAS = (locator: string): LearnSource =>
  cvm('Planejamento e gestão de reservas financeiras', 'https://www.gov.br/investidor/pt-br/penso-logo-invisto/planejamento-e-gestao-de-reservas-financeiras', locator);

export const CVM_EMERGENCIAS = (locator: string): LearnSource =>
  cvm('Emergências e aposentadoria', 'https://www.gov.br/investidor/pt-br/investir/antes-de-investir/defina-seus-objetivos/emergencias-e-aposentadoria', locator);

export const CVM_GUIA = (locator: string): LearnSource =>
  cvm(
    'Guia de Planejamento Financeiro',
    'https://www.gov.br/investidor/pt-br/educacional/publicacoes-educacionais/guias/guia-de-planejamento-financeiro/guia-planejamento-financeiro.pdf/@@display-file/file',
    locator,
  );

export const BCB_CADERNO = (locator: string): LearnSource =>
  bcb('Caderno de Educação Financeira: Gestão de Finanças Pessoais (Conteúdo Básico), 2013', 'https://www.bcb.gov.br/pre/pef/port/caderno_cidadania_financeira.pdf', locator);

export const BCB_GLOSSARIO = (locator: string): LearnSource =>
  bcb(
    'Glossário Simplificado de Termos Financeiros (2013)',
    'https://www.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/Informacoes_gerais/glossario_cidadania_financeira.pdf',
    locator,
  );

export const CALC_CIDADAO_FINANCIAMENTO = (locator: string): LearnSource =>
  bcb(
    'Calculadora do Cidadão: metodologia do financiamento com prestações fixas',
    'https://www3.bcb.gov.br/CALCIDADAO/publico/exibirMetodologiaFinanciamentoPrestacoesFixas.do?method=exibirMetodologiaFinanciamentoPrestacoesFixas',
    locator,
  );

export const CALC_CIDADAO_DEPOSITOS = (locator: string): LearnSource =>
  bcb(
    'Calculadora do Cidadão: metodologia da aplicação com depósitos regulares',
    'https://www3.bcb.gov.br/CALCIDADAO/publico/exibirMetodologiaAplicacaoDepositosRegulares.do?method=exibirMetodologiaAplicacaoDepositosRegulares',
    locator,
  );

export const RES_4881 = (locator: string): LearnSource =>
  cmn('Resolução CMN nº 4.881, de 23/12/2020 (Custo Efetivo Total)', 'https://www.bcb.gov.br/content/estabilidadefinanceira/especialnor/Resolu%C3%A7%C3%A3o4881.pdf', locator);

export const PROCON_GO_ROTATIVO = (locator: string): LearnSource =>
  oficial(
    'Procon Goiás',
    'Com nova regra, juros do rotativo do cartão não poderão ultrapassar dívida original',
    'https://goias.gov.br/procon/com-nova-regra-juros-do-rotativo-do-cartao-nao-poderao-ultrapassar-divida-original-a-partir-de-hoje/',
    locator,
  );

export const DECRETO_6306_CAMARA = (locator: string): LearnSource =>
  oficial(
    'Câmara dos Deputados',
    'Decreto nº 6.306/2007 (Regulamento do IOF), norma atualizada',
    'https://www2.camara.leg.br/legin/fed/decret/2007/decreto-6306-14-dezembro-2007-566561-normaatualizada-pe.html',
    locator,
  );

export const ANEEL_REN_1000 = (locator: string): LearnSource =>
  oficial('ANEEL', 'Resolução Normativa nº 1.000/2021 (texto consolidado)', 'https://www2.aneel.gov.br/cedoc/ren20211000.html', locator);
