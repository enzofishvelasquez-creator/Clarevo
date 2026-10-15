import type { Topic } from '../types';
import { EPOCA_REVIEWED_ON, clarevo, oficialEpoca } from './common';

/**
 * Temas de época (Ciclo K2, D-053), na seção "Organizar o mês": 13º salário, férias, volta às aulas e Imposto de Renda.
 * Escritos e conferidos em 15/10/2026; os fatos de norma (prazos, percentuais, limites) vêm de trechos de resultados de
 * busca das próprias fontes, e o que não abriu está anotado no locator e em `docs/09_APRENDER.md`. O calendário que diz em
 * que mês cada tema aparece em "Neste mês" fica em `learn/epoca.ts`.
 */
const MTE = 'Ministério do Trabalho e Emprego';
const RECEITA = 'Receita Federal';
const PLANALTO = 'Presidência da República';
const CAMARA = 'Câmara dos Deputados';

export const EPOCA_TOPICS: Topic[] = [
  {
    slug: 'decimo-terceiro',
    section: 'organizar',
    kind: 'tema',
    status: 'publicado',
    title: '13º salário',
    subtitle: 'Duas parcelas, o proporcional e os descontos',
    question: 'Quando o 13º salário é pago e como é calculado?',
    short:
      'Quem trabalha com carteira assinada recebe o 13º salário em duas parcelas: a primeira entre fevereiro e 30 de novembro, a segunda até 20 de dezembro. Os descontos de INSS e de Imposto de Renda ficam na segunda.',
    paragraphs: [
      'O 13º salário, ou gratificação natalina, é pago em duas parcelas. A primeira pode ser paga entre fevereiro e 30 de novembro e corresponde à metade do salário do mês anterior. A segunda é paga até 20 de dezembro e completa o valor do ano, descontada a primeira. Confira os prazos do ano no site do Ministério do Trabalho e Emprego.',
      'Quem trabalhou só parte do ano recebe o 13º proporcional: 1/12 da remuneração por mês de serviço, e uma fração de 15 dias ou mais conta como mês inteiro. A primeira parcela também pode vir junto com as férias, se a pessoa pedir em janeiro.',
      'A primeira parcela sai sem desconto. Na segunda entram o INSS e o Imposto de Renda. O INSS do 13º não se soma ao salário do mês para achar a faixa, e o Imposto de Renda é cobrado na fonte, à parte dos outros rendimentos. As faixas mudam com o tempo: confira as tabelas do ano.',
      'O Clarevo não calcula os descontos. Para anotar, registre cada parcela como recebimento: ela entra no mês em que o valor chega.',
    ],
    example:
      'Com salário de R$ 3.000,00 e o ano inteiro de trabalho, a primeira parcela é de R$ 1.500,00 e a segunda, de R$ 1.500,00 antes dos descontos. Para quem trabalhou 7 meses, o proporcional é de R$ 250,00 por mês, ou R$ 1.750,00 no total.',
    calculation: '3.000,00 ÷ 2 = 1.500,00 · 3.000,00 − 1.500,00 = 1.500,00 · 3.000,00 ÷ 12 = 250,00 · 250,00 × 7 = 1.750,00.',
    hypotheses: 'Exemplo fictício: salário fixo de R$ 3.000,00, sem horas extras nem adicionais, em valores brutos, antes do INSS e do Imposto de Renda.',
    facts: [],
    keywords: ['décimo terceiro', '13o', 'décimo terceiro salário', 'gratificação natalina', 'primeira parcela', 'segunda parcela', 'fim de ano', 'natal', 'avos'],
    related: ['ferias', 'imposto-de-renda', 'contas-do-ano'],
    sources: [
      oficialEpoca(
        MTE,
        'Décimo terceiro salário: entenda o direito, regras e prazos de pagamento (novembro de 2025)',
        'https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo/2025/novembro/decimo-terceiro-salario-entenda-o-direito-regras-e-prazos-de-pagamento',
        'Primeira parcela entre fevereiro e novembro, com prazo máximo até 30 de novembro, e metade da remuneração do mês anterior; segunda parcela até 20 de dezembro. Trecho de resultado de busca; a página não abriu',
      ),
      oficialEpoca(
        MTE,
        'Décimo terceiro salário: entenda o direito, regras e prazos de pagamento (dezembro de 2024)',
        'https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo/2024/Dezembro/decimo-terceiro-salario-entenda-o-direito-regras-e-prazos-de-pagamento',
        'Fração igual ou superior a 15 dias conta como mês completo; a primeira parcela sai sem tributos, e os descontos de Imposto de Renda e INSS incidem na segunda. Trecho de resultado de busca misturado com páginas de prefeituras; a página não abriu',
      ),
      oficialEpoca(
        PLANALTO,
        'Lei nº 4.090, de 13 de julho de 1962 (gratificação de Natal)',
        'https://www.planalto.gov.br/ccivil_03/leis/l4090.htm',
        'Art. 1º, § 1º: um doze avos da remuneração devida em dezembro por mês de serviço; § 2º: a fração igual ou superior a 15 dias de trabalho conta como mês integral. Trecho de resultado de busca; a página não abriu',
      ),
      oficialEpoca(
        PLANALTO,
        'Lei nº 4.749, de 12 de agosto de 1965 (pagamento da gratificação de Natal)',
        'https://www.planalto.gov.br/ccivil_03/leis/l4749.htm',
        'Art. 1º: pagamento até 20 de dezembro, compensado o adiantamento; art. 2º: adiantamento entre fevereiro e novembro, de metade do salário do mês anterior, junto com as férias quando a pessoa pedir em janeiro. Trecho de resultado de busca; a página não abriu',
      ),
      oficialEpoca(
        'Instituto Nacional do Seguro Social',
        'Tabela de contribuição mensal',
        'https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal',
        'Nota: o 13º salário não é somado à remuneração mensal para o enquadramento na tabela de salários de contribuição. Trecho de resultado de busca; a página não abriu',
      ),
      oficialEpoca(
        RECEITA,
        'Meu Imposto de Renda: rendimentos do trabalho',
        'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/manual-mir/rendimentos/rendimentos-do-trabalho',
        'O décimo terceiro salário tem a forma de tributação exclusiva na fonte. Trecho de resultado de busca; a página não abriu',
      ),
      clarevo('D-011', 'D-053'),
    ],
    reviewedOn: EPOCA_REVIEWED_ON,
    reviewEveryMonths: 12,
  },
  {
    slug: 'ferias',
    section: 'organizar',
    kind: 'tema',
    status: 'publicado',
    title: 'Férias: pagamento, um terço e abono',
    subtitle: 'O que a lei prevê para quem tem carteira assinada',
    question: 'Como são pagas as férias de quem tem carteira assinada?',
    short:
      'Depois de 12 meses de trabalho, quem tem carteira assinada tem direito a férias, pagas com pelo menos um terço a mais que o salário normal. O pagamento deve chegar até dois dias antes do início.',
    paragraphs: [
      'Depois de cada período de 12 meses de trabalho, quem tem carteira assinada tem direito a férias. São 30 dias corridos para quem não faltou mais de cinco vezes sem justificativa, e a Constituição garante o pagamento com pelo menos um terço a mais que o salário normal.',
      'O pagamento das férias deve ser feito até dois dias antes do início. A pessoa pode pedir para converter um terço das férias em dinheiro, o abono pecuniário, até 15 dias antes do fim do período aquisitivo, que são os 12 meses de trabalho que dão direito às férias.',
      'Com a concordância da pessoa, as férias podem ser divididas em até três períodos, e um deles precisa ter pelo menos 14 dias corridos. A primeira parcela do 13º salário pode vir junto com as férias, se a pessoa pedir em janeiro (veja "13º salário").',
      'Se as férias já têm data, dá para somar o que se pretende gastar com viagem e passeios e dividir pelos meses que faltam. No Clarevo, a calculadora "Juntar para um objetivo" faz essa conta com os seus números.',
    ],
    example: 'Com salário de R$ 3.000,00, as férias de 30 dias pagam o salário mais um terço: R$ 3.000,00 mais R$ 1.000,00, ou seja, R$ 4.000,00 antes dos descontos.',
    calculation: '3.000,00 ÷ 3 = 1.000,00 · 3.000,00 + 1.000,00 = 4.000,00.',
    hypotheses: 'Exemplo fictício: salário fixo, 30 dias de férias, sem horas extras, adicionais nem abono, em valores brutos.',
    facts: [],
    keywords: ['férias', 'terço de férias', 'um terço', 'abono pecuniário', 'vender férias', 'período aquisitivo', 'descanso', 'viagem'],
    related: ['decimo-terceiro', 'reserva-imprevistos'],
    sources: [
      oficialEpoca(
        MTE,
        'Férias Anuais e Coletivas (perguntas frequentes do Portal FAT)',
        'https://portalfat.trabalho.gov.br/programas-e-acoes-2/programa-de-protecao-do-emprego-ppe/perguntas-frequentes/ferias-anuais-e-coletivas/',
        'Férias anuais de 30 dias corridos para quem não faltou injustificadamente mais de 5 vezes; Constituição, art. 7º, XVII: remuneração superior em pelo menos um terço ao salário normal; pagamento até 2 dias antes do início. Trecho de resultado de busca; a página não abriu',
      ),
      oficialEpoca(
        PLANALTO,
        'Decreto-Lei nº 1.535, de 13 de abril de 1977 (arts. 143 e 145 da CLT)',
        'https://www.planalto.gov.br/ccivil_03/decreto-lei/del1535.htm',
        'Art. 143: conversão de um terço das férias em abono pecuniário, pedida até 15 dias antes do fim do período aquisitivo; art. 145: pagamento da remuneração e do abono até 2 dias antes do início. Trecho de resultado de busca; a página não abriu',
      ),
      oficialEpoca(
        CAMARA,
        'Consolidação das Leis do Trabalho (texto atualizado)',
        'https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-5452-1-maio-1943-415500-normaatualizada-pe.html',
        'Art. 134, § 1º: desde que haja concordância, as férias podem ser usufruídas em até três períodos, um deles com pelo menos 14 dias corridos (redação da Lei 13.467/2017). Trecho de resultado de busca; a página não abriu',
      ),
      oficialEpoca(
        PLANALTO,
        'Lei nº 4.749, de 12 de agosto de 1965 (pagamento da gratificação de Natal)',
        'https://www.planalto.gov.br/ccivil_03/leis/l4749.htm',
        'Art. 2º, § 2º: o adiantamento do 13º é pago junto com as férias quando a pessoa o requerer em janeiro. Trecho de resultado de busca; a página não abriu',
      ),
      clarevo('D-053'),
    ],
    reviewedOn: EPOCA_REVIEWED_ON,
    reviewEveryMonths: 12,
    calculator: { slug: 'juntar-para-objetivo', params: {} },
  },
  {
    slug: 'volta-as-aulas',
    section: 'organizar',
    kind: 'tema',
    status: 'publicado',
    title: 'Volta às aulas: mensalidade e material',
    subtitle: 'O que a lei diz sobre a anuidade e a lista de material',
    question: 'A escola pode pedir qualquer item na lista de material?',
    short:
      'A anuidade escolar é dividida em 12 parcelas iguais, e a escola divulga o valor com 45 dias de antecedência do fim da matrícula. A lista de material não pode incluir itens de uso coletivo.',
    paragraphs: [
      'Nas escolas particulares, o valor da anuidade vale por um ano e é dividido em 12 parcelas mensais iguais, ou em 6, no caso de semestralidade. A escola também pode oferecer outros planos de pagamento, desde que a soma não passe do valor total.',
      'O texto da proposta de contrato, o valor da anuidade e o número de vagas por sala precisam ser divulgados em local de fácil acesso pelo menos 45 dias antes do fim do prazo de matrícula. Com essas informações, dá para somar o ano e comparar antes de decidir.',
      'A lista de material pode pedir itens de uso individual. Itens de uso coletivo, como material de limpeza e de escritório, não podem entrar na lista: o custo deles já está na anuidade (Lei 12.886/2013). Segundo os Procons, a escola também não escolhe a marca nem o local de compra dos itens de uso individual.',
      'Os Procons lembram que não é preciso comprar todo o material no começo do ano. No Clarevo, a parcela da escola pode ser um gasto fixo mensal, e a matrícula e a lista de material entram como conta do ano ou como gasto, na data em que forem pagas.',
    ],
    example:
      'Com anuidade de R$ 14.400,00 em 12 parcelas iguais, cada parcela é de R$ 1.200,00. Se a lista de material custar R$ 600,00 e for comprada no primeiro mês, as saídas desse mês somam R$ 1.800,00.',
    calculation: '14.400,00 ÷ 12 = 1.200,00 · 1.200,00 + 600,00 = 1.800,00.',
    hypotheses: 'Exemplo fictício: anuidade sem desconto, sem matrícula à parte e sem outros itens, como uniforme e transporte.',
    facts: [],
    keywords: ['volta às aulas', 'matrícula', 'material escolar', 'lista de material', 'mensalidade escolar', 'anuidade escolar', 'escola', 'colégio', 'procon'],
    related: ['contas-do-ano', 'gasto-fixo-variavel', 'parcelado-ou-a-vista'],
    sources: [
      oficialEpoca(
        CAMARA,
        'Lei nº 9.870, de 23 de novembro de 1999 (valor total das anuidades escolares), texto atualizado',
        'https://www2.camara.leg.br/legin/fed/lei/1999/lei-9870-23-novembro-1999-369698-normaatualizada-pl.html',
        'Art. 1º: valor anual ou semestral com vigência de um ano, dividido em doze ou seis parcelas mensais iguais, com planos alternativos que não excedam o total; art. 2º: divulgação da proposta de contrato, do valor e do número de alunos por sala pelo menos 45 dias antes da data final da matrícula. Trecho de resultado de busca; a página não abriu',
      ),
      oficialEpoca(
        CAMARA,
        'Lei nº 12.886, de 26 de novembro de 2013 (material de uso coletivo nas anuidades escolares)',
        'https://www2.camara.leg.br/legin/fed/lei/2013/lei-12886-26-novembro-2013-777456-publicacaooriginal-141976-pl.html',
        'Acrescenta o § 7º ao art. 1º da Lei 9.870/1999: é nula a cláusula que imponha pagamento extra, ou o fornecimento, de material de uso coletivo, cujo custo entra no cálculo da anuidade ou da semestralidade. Trecho de resultado de busca; a página não abriu',
      ),
      oficialEpoca(
        'Procon de Mato Grosso',
        'Confira recomendações do Procon-MT para a volta às aulas',
        'https://www.procon.mt.gov.br/en/w/confira-recomenda%C3%A7%C3%B5es-do-procon-mt-para-volta-%C3%A0s-aulas',
        'Itens de uso coletivo não entram na lista (Lei 12.886/2013); a escola não pode indicar marcas, direcionar o local de compra nem exigir a compra na própria instituição. Trecho de resultado de busca; a página não abriu',
      ),
      oficialEpoca(
        'Prefeitura de Sinop, Procon',
        'Procon Sinop orienta consumidores sobre direitos e economia na volta às aulas',
        'https://www.sinop.mt.gov.br/portal/noticias/0/3/12931/procon-sinop-orienta-consumidores-sobre-direitos-e-economia-na-volta-as-aulas',
        'Não há necessidade de comprar todo o material escolar no início do ano. Trecho de resultado de busca; a página não abriu',
      ),
      clarevo('D-029', 'D-053'),
    ],
    reviewedOn: EPOCA_REVIEWED_ON,
    reviewEveryMonths: 12,
  },
  {
    slug: 'imposto-de-renda',
    section: 'organizar',
    kind: 'tema',
    status: 'publicado',
    title: 'Declaração do Imposto de Renda',
    subtitle: 'Prazo, informe de rendimentos e pagamento em quotas',
    question: 'Quando entregar a declaração do Imposto de Renda e como pagar?',
    short:
      'A Receita define o prazo de cada ano. Em 2026, foi de 23 de março a 29 de maio. Quem precisa declarar e entrega depois paga multa, e o imposto a pagar pode ser dividido em até 8 quotas mensais de pelo menos R$ 50,00.',
    paragraphs: [
      'A declaração do Imposto de Renda da Pessoa Física é entregue uma vez por ano, com os rendimentos e as despesas do ano anterior. A Receita Federal publica as datas de cada ano: em 2026, o prazo foi de 23 de março a 29 de maio. Confira a data oficial do ano no site da Receita.',
      'Quem precisa declarar muda de um ano para o outro, e a Receita lista os critérios na página "Quem deve declarar". Para preencher, ajuda guardar durante o ano os informes de rendimentos, que as fontes pagadoras fornecem até o último dia útil de fevereiro, e os comprovantes de despesas.',
      'Quem precisa declarar e entrega depois do prazo paga multa de 1% ao mês ou fração de atraso sobre o imposto devido, com mínimo de R$ 165,74 e máximo de 20% do imposto.',
      'O imposto a pagar pode ser quitado de uma vez ou dividido em até 8 quotas mensais, e nenhuma quota pode ser menor que R$ 50,00. Imposto menor que R$ 100,00 é pago de uma só vez. A primeira quota, paga no prazo, não tem juros, e as demais recebem juros pela taxa Selic (veja "Selic, a taxa básica de juros").',
      'O Clarevo não calcula nem entrega a declaração. Se houver imposto a pagar, cada quota pode ser anotada como conta a pagar, com o vencimento de cada mês.',
    ],
    example:
      'Com imposto a pagar de R$ 1.200,00, a quota única é de R$ 1.200,00. Em 8 quotas, cada uma é de R$ 150,00, acima do mínimo de R$ 50,00, sem contar os juros das quotas depois da primeira.',
    calculation: '1.200,00 ÷ 8 = 150,00 · 1.200,00 ÷ 50,00 = 24 quotas possíveis, limitadas a 8.',
    hypotheses: 'Exemplo fictício: imposto a pagar de R$ 1.200,00, sem juros nem multa.',
    facts: [
      { text: '1%', source: 1 },
      { text: '20%', source: 1 },
      { text: 'R$ 165,74', source: 1 },
      { text: 'R$ 50,00', source: 2 },
      { text: 'R$ 100,00', source: 2 },
    ],
    keywords: ['imposto de renda', 'irpf', 'dirpf', 'declaração', 'declarar', 'receita federal', 'restituição', 'informe de rendimentos', 'multa por atraso', 'quotas', 'leão'],
    related: ['decimo-terceiro', 'selic', 'contas-do-ano'],
    sources: [
      oficialEpoca(
        RECEITA,
        'Receita começa a receber declarações do IRPF no dia 23 de março; prazo de entrega se encerra em 29 de maio',
        'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/marco/receita-comeca-a-receber-declaracoes-do-irpf-no-dia-23-de-marco-prazo-de-entrega-se-encerra-em-29-de-maio',
        'Prazo de entrega da declaração de 2026: de 23 de março a 29 de maio (IN RFB nº 2.312/2026); as datas são definidas por instrução normativa a cada ano. Título da página e trecho de resultado de busca; a página não abriu',
      ),
      oficialEpoca(
        RECEITA,
        'Multa por Atraso (Meu Imposto de Renda)',
        'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/multa',
        'Multa de 1% ao mês-calendário ou fração de atraso sobre o imposto devido, ainda que integralmente pago, limitada a 20% do imposto; valor mínimo de R$ 165,74. Trecho de resultado de busca das perguntas frequentes da Receita; a página não abriu',
      ),
      oficialEpoca(
        RECEITA,
        'Perguntas e Respostas IRPF 2026',
        'https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf',
        'Pergunta 063: o saldo do imposto pode ser pago em até 8 quotas mensais e sucessivas, nenhuma inferior a R$ 50,00, e o imposto inferior a R$ 100,00 é pago em quota única; a primeira quota ou a quota única vence no último dia do prazo, sem juros, e as demais recebem a Selic acumulada. Trecho de resultado de busca; o arquivo não abriu',
      ),
      oficialEpoca(
        PLANALTO,
        'Lei nº 9.250, de 26 de dezembro de 1995 (Imposto de Renda das pessoas físicas)',
        'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm',
        'Pagamento em quotas: nenhuma quota será inferior a R$ 50,00, e o imposto de valor inferior a R$ 100,00 será pago de uma só vez. Trecho de resultado de busca; a página não abriu e o artigo não foi confirmado',
      ),
      oficialEpoca(
        RECEITA,
        'Quem deve declarar (Meu Imposto de Renda)',
        'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/quem',
        'Critérios e limites de valor de cada exercício, como rendimentos tributáveis, bens e atividade rural; mudam a cada ano. Trecho de resultado de busca; a página não abriu',
      ),
      oficialEpoca(
        RECEITA,
        'Aprovado o novo modelo de Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte (dezembro de 2021)',
        'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2021/dezembro/aprovado-o-novo-modelo-de-comprovante-de-rendimentos-pagos-e-de-imposto-sobre-a-renda-retido-na-fonte',
        'O comprovante de rendimentos é fornecido até o último dia útil de fevereiro do ano seguinte ao pagamento, ou na rescisão do contrato, se ocorrer antes. Trecho de resultado de busca; a página não abriu',
      ),
      clarevo('D-029', 'D-053'),
    ],
    reviewedOn: EPOCA_REVIEWED_ON,
    reviewEveryMonths: 6,
  },
];
