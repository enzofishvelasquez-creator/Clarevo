Rascunho preparado pela equipe do Clarevo para revisão jurídica. Não é parecer jurídico.

# Resumo para a revisão jurídica

21/10/2026. Tudo abaixo foi conferido no código e nas decisões do produto nessa data. Onde documento e código divergem, vale o código, e a divergência está na seção d. O que não está decidido aparece como [A DEFINIR] nos textos e vira pergunta na seção e. Para cada pergunta, trazemos a nossa proposta: basta confirmar ou corrigir.

## a) O produto em 5 linhas

1. O Clarevo é um aplicativo (iPhone e Android) e uma versão web para organizar finanças pessoais e familiares: mostra o que a pessoa anotou (Recebido, Pago, contas a pagar, cartões, metas) e traz conteúdo educativo com fonte.
2. Não é banco, não movimenta dinheiro, não concede crédito, não recomenda produto financeiro e não se conecta a bancos. Os dados entram por digitação ou por arquivo lido no aparelho (nota, comprovante, extrato).
3. Dois contextos: Pessoal (só a pessoa) e Família (até 6 pessoas, três papéis, convite por link de uso único).
4. Empresas podem oferecer o Clarevo como benefício (licenças). A empresa vê só e-mails convidados, situação, datas e contagens, nunca finanças.
5. Estágio: pré-lançamento, sem contas nas lojas e sem cobrança. Pensado para maiores de 18 anos (P-002 ainda é recomendação, não decisão). Banco e autenticação no Supabase, hospedagem web na Cloudflare.

## b) Mapa de dados

| Dado | De onde vem | Onde fica | Quem vê | Por quanto tempo | Base proposta |
|---|---|---|---|---|---|
| E-mail, senha, login | Cadastro | Autenticação do Supabase | A pessoa; equipe técnica; a empresa vê só o e-mail que ela convidou | Até excluir a conta | Contrato (art. 7º, V) |
| Nome (1 a 80), fuso do aparelho, idioma | Cadastro e aparelho | Tabela `persons` | A pessoa; a Família vê só o primeiro nome | Até excluir; vira linha anônima ("Pessoa que saiu") só se ainda é autora de algo numa Família que continua | Contrato |
| Gastos, recebimentos, contas a pagar, gastos fixos, parcelamentos, contas de origem, descrições livres | A pessoa (digitação ou arquivo lido no aparelho) | Tabelas do banco | A pessoa; na Família, conforme o papel; nunca a empresa | Até excluir a conta. Registro excluído fica com marca de exclusão sem prazo (P-010). Família encerrada fica sem leitura, sem prazo | Contrato |
| Cartões: apelido, 4 últimos dígitos (opcional), dias, limite, lançamentos | A pessoa | `cards`, `card_entries` | Como a linha acima | Como a linha acima | Contrato |
| Metas, orçamento, renda de referência, plano de guardar, "Conferi este mês", data da última anotação | A pessoa | Tabelas do banco | A pessoa. Plano de guardar, atividade e revisão: só a própria pessoa, nem a Família | Até excluir a conta | Contrato |
| Resumo SHA-256 da chave da nota e de cada linha importada | Calculado no aparelho | `receipt_key`, `import_key` | Quem lê o registro | Como o registro | Contrato |
| Família: vínculo, papel, convite (só o resumo do código) | A pessoa | Tabelas do banco | Pessoas da Família (primeiro nome); só quem é Titular lê convites | Até sair, encerrar ou excluir. O que a pessoa anotou fica com autoria anônima ou com o primeiro nome | Contrato; legítimo interesse (histórico) |
| Benefício: e-mail informado pela empresa, situação, datas, direito ao plano | Empresa e pessoa | `licenses`, `plan_entitlements` | Empresa (e-mail, situação, datas); a pessoa lê a própria | O e-mail da empresa fica na licença encerrada mesmo após a exclusão da conta | Contrato; [A DEFINIR] |
| Rastro técnico: quem, qual operação, quando, resumo do pedido | Funções de escrita | `record_operations` | Só o sistema e a equipe técnica | Apagado junto com a conta da pessoa | Legítimo interesse |
| Registros de acesso (IP, navegador) | Infraestrutura | Supabase e Cloudflare (a conferir nos painéis) | Equipe técnica | A conferir | Obrigação legal; legítimo interesse |
| Sessão, preferências, memórias de preenchimento | Aparelho | Só no aparelho | A pessoa | Até excluir a conta | Não chega ao Clarevo |
| Fotos da câmera, PDF de nota e de comprovante, extrato | Aparelho | Não são guardados | Ninguém | Lidos e descartados | Não se aplica |

## c) Serviços de terceiros e país

| Serviço | Para quê | O que recebe | País ou região | Situação |
|---|---|---|---|---|
| Supabase | Autenticação e banco | Todos os dados da seção b | Projeto em São Paulo (docs/05); sede no exterior (confirmar) | Em uso |
| Cloudflare | Hospedagem da web e do site | IP e dados de acesso; não o que a pessoa anota | Rede global; sede no exterior (confirmar) | Em uso |
| Expo (EAS) | Gerar os builds | Código do app; nenhum dado de quem usa (sem atualização remota nem push) | Sede no exterior (confirmar) | Quando houver builds |
| Google, no Android | Leitura de código (ML Kit) | Possíveis dados técnicos do aparelho e de uso | Exterior | Embutido no app; a confirmar |
| Sentry | Relatório de falhas | Só o erro técnico, IP desligado | A escolher | Previsto, não ligado |
| Provedor de e-mail (Resend sugerido) | E-mails de confirmação e nova senha | E-mail e conteúdo da mensagem | A escolher | Previsto (P-008) |
| Site da Fazenda do RJ | Leitura opcional da nota, feita pelo aparelho | Endereço da nota e IP | Brasil | Direto da pessoa, sem o Clarevo |

## d) Já decidido e implementado (conferido no código)

- **Exclusão da conta (D-058).** Pelo app, com a palavra EXCLUIR. Apaga o Pessoal de verdade, na hora. Em Família de outras pessoas, o que a pessoa anotou fica como "Pessoa que saiu", sem nome e sem e-mail. Titular com outras pessoas precisa passar a titularidade antes. A licença termina e o rastro técnico da pessoa é apagado. Marcada como "a confirmar com advogado".
- **Empresa sem finanças (D-056).** Testado no banco. A empresa lê só licenças (e-mail, situação, datas) e contagens. O indicador de uso saiu em revisão de segurança, pelo risco de identificar pessoas.
- **Família (D-055).** Até 6 pessoas, uma Família por pessoa, convite por link de 7 dias, só o resumo do código guardado.
- **Dados de cartão e nota (D-037, D-038, D-051).** Nunca número completo, CVV, validade, CPF de nota, imagem nem PDF. Comprovante de Pix: lido no aparelho, sem guardar CPF, chave Pix, banco, conta nem identificador da transação.
- **Segurança.** Permissão aplicada no banco, escrita só por funções, senha de 8 caracteres com letras e números, HTTPS. Revisão de segurança interna em 16/10/2026; sem auditoria externa.
- **Sem anúncios, venda de dados, analytics de terceiros ou decisão automatizada.**

**Pontos em que documentos e código divergem** (a política segue o código):

- A ficha das lojas diz que a empresa "só vê se a licença está ativa". O código também mostra à empresa o e-mail convidado, outras situações (convidada, encerrada) e datas.
- A tela de exclusão e a decisão D-058 dizem que nada é guardado por garantia. O e-mail informado pela empresa fica na licença encerrada, e há cópias de segurança e registros de infraestrutura.
- A tela "Quem vê estes dados?" diz que no Pessoal só a pessoa vê. Quem opera o painel do banco acessa tudo, e o registro de acesso interno não existe.
- O cadastro não pede aceite dos termos nem declaração de maioridade, e o app não tem acesso à política.
- A ficha diz que o fuso é digitado. Ele vem do aparelho.
- Nome do projeto do Supabase: `clarevo-producao` em docs/05, outro nome no painel em docs/07. A região precisa ser conferida.

## e) Perguntas ao advogado

1. **Pequeno porte e alto risco (Res. CD/ANPD 2/2022).** O Clarevo se enquadra como agente de pequeno porte? Nossa leitura: sim, e não há tratamento de alto risco. Dados financeiros não são sensíveis na LGPD, não há decisão só automatizada nem menores. Atenção: o app aceita qualquer adulto, e idosos são critério específico; a categoria "Saúde" e descrições livres podem revelar dado sensível. Larga escala pode surgir com empresas grandes. Proposta: tratar como pequeno porte hoje e reavaliar com o crescimento.
2. **Encarregado.** Nomear ou manter só canal? Proposta: só o canal `[E-MAIL DE PRIVACIDADE]`, com o enquadramento da pergunta 1.
3. **Prazos de guarda e rastro técnico (P-010).** Hoje registros excluídos ficam marcados, sem eliminação, e a Família encerrada guarda dados sem leitura, sem prazo. Proposta: eliminar ambos em 6 meses e não apagar contas inativas. Exige código depois.
4. **Marco Civil, art. 15.** Somos obrigados a guardar registros de acesso por 6 meses? O app não grava logs; Supabase e Cloudflare guardam os deles. Como isso convive com a exclusão (D-058)? Proposta: não criar logs próprios, aceitar o que a infraestrutura guarda por até 6 meses e dizer isso na política.
5. **Cópias de segurança.** Previsão de 7 dias no plano Pro (a confirmar no painel). Dado apagado pode ficar nelas; se uma cópia for restaurada, reexcluímos as contas. Proposta: informar o prazo na política.
6. **Exclusão e "Pessoa que saiu" (D-058).** O que a pessoa anotou numa Família de outros fica sem nome e sem e-mail. Isso é anonimização suficiente (arts. 5º, XI, e 12) e base de legítimo interesse da Família? Quem sai sem excluir a conta continua como "ex-membro" e primeiro nome: isso exige eliminar o nome ao sair? Proposta: manter como está e informar; apagar o nome do ex-membro se a pessoa pedir.
7. **Papel da empresa (M-5).** A empresa é só pagadora e o Clarevo é controlador dos dados financeiros? E o e-mail que a empresa informa no convite? Proposta: sim; a empresa controla a lista de convidados, e o Clarevo a trata só para validar convite e licença. Hoje o e-mail fica na licença encerrada depois da exclusão da conta: proposta de anonimizar.
8. **Canal para pedidos da pessoa titular dos dados (P-023).** E-mail dedicado, sem formulário. Prazo de resposta? Proposta: 15 dias (art. 19, II). Confirmação de identidade? Proposta: resposta ao e-mail cadastrado, sem pedir documentos.
9. **Transferência internacional (art. 33).** O banco fica em São Paulo, mas Supabase, Cloudflare, Google (ML Kit), Sentry e o provedor de e-mail têm sede ou processamento fora do Brasil. Qual mecanismo e qual contrato exigir de cada um? Proposta: usar os contratos padrão dos fornecedores e citar os países na política.
10. **Bases legais.** Confirmar o quadro: contrato (art. 7º, V) para conta, Família e benefício; legítimo interesse (IX) para segurança e rastro; obrigação legal (II) para registros de acesso. Consentimento só onde o sistema pede (câmera, notificação, biometria), dados que não chegam ao Clarevo. Proposta: manter assim.
11. **Família: dados de outra pessoa.** Quem anota "Pix para Maria" grava nome de terceiro, que a Família vê. Proposta: cláusula nos termos de que a pessoa anota só o necessário e responde pelo que anota; sem aviso ao terceiro.
12. **Idade mínima e aceite (P-002).** 18 anos, sem menores. O cadastro hoje não registra aceite nem declaração de idade. Proposta: incluir caixa de aceite e declaração no cadastro, com versão e data guardadas, e a Apple classificar 18+. Isso exige código.
13. **Boleto e Pix copia e cola (P-013).** O app reconhece o código de boleto colado, avisa e não guarda. Pix copia e cola não é tratado. Proposta: não guardar nenhum dos dois; o cadastro de contas a pagar fica sem esse campo.
14. **Acesso da equipe e suporte.** Hoje quem opera o banco acessa tudo, sem registro. Proposta: texto honesto na política (acesso técnico limitado a manutenção, segurança, pedido da pessoa e obrigação legal), regra interna escrita e registro de acessos antes do lançamento.
15. **Responsabilidade e foro dos termos.** A cláusula 9 dos termos é compatível com o CDC (art. 51)? Proposta: sem excluir responsabilidade; limitar só o que a lei permite. Foro do domicílio da pessoa consumidora; para empresas, comarca da sede.
16. **Fim do benefício e plano gratuito (P-005).** 30 dias de acesso pleno, depois plano gratuito com leitura do histórico, sem apagar nada. O app ainda não limita recursos por plano. Proposta: manter o texto e definir o plano gratuito com o preço (P-005). Se houver cobrança, incluir arrependimento (CDC, art. 49).
17. **Divulgações específicas.** A política cita a consulta opcional à Fazenda do RJ e o ML Kit do Google no Android. O texto basta, ou precisa de aviso no momento da leitura? Proposta: manter na política e na tela de permissão da câmera.

## f) O que pedimos e o que não precisa

**Pedimos:** responder as 17 perguntas; revisar e corrigir a política, os termos, a página de exclusão e os pontos do contrato; resolver o que é [A DEFINIR] jurídico; indicar quais ajustes viram trabalho de produto (aceite no cadastro, rotina de eliminação, registro de acesso interno). Uma rodada de ajustes depois da nossa resposta.

**Não precisa:** escrever os textos do zero; redigir a minuta completa do contrato com empresas (basta validar os pontos); parecer sobre integração bancária, cobrança ou inteligência artificial (fora do ciclo atual); revisar código; preencher as declarações das lojas (a equipe preenche e ajusta ao que for decidido); redigir o conteúdo do site.

## g) Referências (usadas em 21/10/2026)

Citadas a partir da especificação interna. O texto oficial não pôde ser reaberto neste ambiente, então a redação e a numeração vigentes devem ser conferidas.

- LGPD (Lei 13.709/2018), arts. 6º, 7º, 9º, 15 e 16, 18, 33, 37 a 41 e 46 a 49.
- Resolução CD/ANPD nº 2/2022 (agentes de tratamento de pequeno porte): dispensa de encarregado com canal de comunicação; não vale para tratamento de alto risco (critério geral e critério específico ao mesmo tempo).
- Guia de Elaboração de Termo de Uso e Política de Privacidade (Secretaria de Governo Digital, gov.br): só como referência de estrutura e de linguagem simples, por ser para serviços públicos.
- Marco Civil da Internet (Lei 12.965/2014), art. 15.
- Código de Defesa do Consumidor (Lei 8.078/1990), arts. 49 e 51.
- Apple App Review Guidelines, 5.1.1 (política acessível no app e na ficha, exclusão de conta no app) e Google Play (Segurança dos dados e URL para pedir exclusão de conta e dados).
- Internas: `docs/00_VISAO_E_DECISOES.md` (decisões e pendências citadas), `docs/13_FAMILIA_E_EMPRESAS.md`, `docs/lojas/privacidade.md` e `docs/lojas/ficha.md`.
