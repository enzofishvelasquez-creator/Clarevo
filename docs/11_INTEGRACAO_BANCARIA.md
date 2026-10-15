# Integração bancária no Clarevo via Open Finance: memorando de decisão

Data: 11/10/2026. Escopo: leitura (somente leitura) de contas, saldos, transações e cartões de crédito de pessoas no Brasil.

**Como ler este memorando.** Cada fato traz o número da fonte entre colchetes. O ambiente de pesquisa bloqueou a abertura direta dos sites (pluggy.ai, finsidersbrasil.com.br e outros); os fatos vêm dos trechos devolvidos pela busca na web, não da leitura integral das páginas. Itens marcados **[não verificado]** precisam ser confirmados com a fonte primária ou com o fornecedor antes de qualquer contrato. Nada aqui é parecer jurídico.

## 1. Caminho regulatório

- **Quem participa.** O Open Finance é implementado por instituições financeiras, instituições de pagamento e demais instituições autorizadas pelo Banco Central (BC) (Resolução Conjunta nº 1/2020) [1][2]. A "instituição receptora" é a participante que pede os dados; a "transmissora" é o banco que os compartilha [1][13].
- **App sem autorização pode consumir dados?** Sim, hoje, como **entidade parceira**: o art. 36 permite que participantes autorizados contratem parcerias com entidades não autorizadas para compartilhar dados cadastrais e transacionais [2][14]. A instituição autorizada responde perante cliente e regulador pelos dados [14]. É o modelo usado pela maioria das empresas de software [3].
- **Parceiro autorizado x autorização própria.** Com parceiro: sem licença, integração por API, custo mensal do fornecedor, mas dependência contratual e regulatória dele. Própria: o Clarevo teria de virar instituição autorizada (por exemplo, instituição de pagamento) e passar pela certificação do diretório. Para ITP, o capital mínimo subiu de R$ 1 milhão para R$ 17 milhões (Resolução Conjunta nº 14), com piso de cerca de R$ 30 milhões somando o patrimônio exigido, segundo reportagem [5] **[norma primária não verificada]**. Conclusão: autorização própria está fora do alcance agora.
- **Risco regulatório em curso.** O BC está revisando o modelo de parcerias, com conclusão prevista para dezembro de 2026 [6][7]. Propostas em discussão (ainda não vigentes): modelo "1x1x1" (uma instituição integradora, uma entidade parceira, um consentimento), proibição de repasse dos dados a terceiros e de revenda, e veto a parcerias com empresas autorizadas fora do sistema [4][6][7]. Há alerta do setor de que as regras podem fechar portas para startups [5]. O Clarevo não revende dados, então o modelo do produto é compatível com as propostas conhecidas, mas o contrato com o fornecedor precisa prever a adaptação.
- **Consentimento.** Desde a Resolução Conjunta nº 7/2023, o prazo deve ser compatível com a finalidade declarada; o teto fixo de 12 meses foi retirado, embora textos de bancos ainda citem 12 meses [8][9][10] **[redação exata vigente não verificada]**. Revogação a qualquer momento [8][9]. Renovação simplificada no ambiente da receptora, sem refazer o fluxo, só para consentimento vigente [8][9]. A autorização acontece no app do banco (redirecionamento), sem senha passar pelo Clarevo [3][16].
- **Limites da rede.** Há limite mensal de chamadas por CPF e por recurso (ex.: poucas consultas de transações por mês e algumas centenas de saldo); os números variam entre versões da documentação da Belvo (4 ou 8 para cadastro e contas; 240 ou 420 para saldo) [17][18] **[valores oficiais não verificados]**. A sincronização precisa respeitar isso.
- **LGPD e sigilo.** O BC entende o Open Finance compatível com a LGPD e com a LC 105/2001 (sigilo bancário) [19]. O consentimento regulatório é tratado como consentimento qualificado da LGPD [20]. O Clarevo será controlador dos dados que guardar: finalidade única (organização financeira da própria pessoa), minimização, eliminação após revogação ou exclusão de conta (art. 16 da LGPD) **[dever específico da receptora após revogação não verificado]**. Ponto do modelo de benefício: o empregador nunca acessa esses dados, nem agregados, e isso deve constar no contrato com empresas e na política de privacidade.

## 2. Fornecedores

| Fornecedor | Situação no BC / Open Finance | Dados e cobertura | SDK, sandbox, webhooks | Preço |
|---|---|---|---|---|
| **Pluggy** | Autorizada como IP na modalidade ITP desde jun/2024 [11][12]; diz que a licença cobre pagamentos e busca de dados e que clientes consomem sem licença própria [16] | Mais de 130 instituições; saldos, extratos, cartões, investimentos [21]; endpoints de faturas (`/bills`) e investimentos [22] | Pacote `react-native-pluggy-connect`, React e web [23]; token de conexão criado no servidor com client ID e secret [23]; conectores de teste via `includeSandbox` [23]; webhooks `item/updated`, `transactions/created/updated/deleted` [24] | Plano a partir de **R$ 2.500/mês**; teste grátis de 14 dias com até 20 contas [3a]; desenvolvedor relata não conseguir valor menor [15]. "Meu Pluggy" grátis é só para uso próprio (5 conexões do mesmo titular) [3a] |
| **Belvo** | Autorizada como iniciadora de pagamento em 2023 [25]; produto de dados para Brasil pelo fluxo regulado OFDA [26] | Contas, transações, faturas, investimentos (endpoints públicos) [26][27]; mais de 8 milhões de consentimentos [28] | Widget hospedado em webview com deep link (sem SDK React Native encontrado) [26]; sandbox com dados fictícios, widget e webhooks só com chaves de API [27]; tela de gestão de consentimentos exigida no guia [26] | Sem tabela pública; relato não oficial de ~**R$ 6.000/mês** [15] |
| **Klavi** | Autorizada para iniciar pagamentos (2025) e Pix Automático; comprou ITP Inipay [29] | Foco em relatório de crédito, renda e score a partir de 12 meses de transações [29] | Não verificado | Sob consulta. Foco em análise de crédito destoa da regra do Clarevo de não ofertar crédito |
| **Tecnospeed** | Atua com receptor parceiro que faz KYC [30] | Extratos e cartões via API, foco em ERPs e empresas [30] | Não verificado | Relato não oficial: R$ 1.500 de entrada + R$ 540/mês [15] |
| **Celcoin** | Infraestrutura de Open Finance, licença ITP (via Finansystech) [31] | Não verificado | Não verificado | Sob consulta [31] |
| **Iniciador** | Infraestrutura white label de receptora de dados [13] | Voltada a instituições reguladas | Não verificado | Sob consulta |
| **Quanto** | Não encontrei informação atual [não verificado] | | | |

Retenção de dados pelos fornecedores após exclusão do item: **não verificada** em nenhum deles; perguntar em contrato.

## 3. Raspagem de tela (credenciais)

Ainda existe: a Pluggy declara obter dados "via credenciais" em instituições fora do Open Finance [16], e a Belvo já anunciou a convivência de modelos regulado e não regulado [32]. Deve ser evitada: exige que a pessoa entregue senha a terceiros e amplia o risco de vazamento [33]; gera conflito com os bancos (caso Bradesco x Guiabolso, 2016) [34] **[fonte exata do caso não confirmada]**; quebra com mudanças de tela e autenticação em dois fatores; contraria a direção das propostas do BC de restringir o uso de dados fora do arranjo regulado [6][7]. Para o Clarevo, que é oferecido por empregadores, um incidente com senha bancária seria grave. Recomendação: só conectores Open Finance regulados (confirmar com o fornecedor como filtrar o widget **[não verificado]**).

## 4. O que o Clarevo precisa construir (alto nível)

1. **Telas de consentimento**: explicação da finalidade, dados pedidos (contas, cartões), prazo, aviso de que o empregador não vê nada; widget do fornecedor; retorno por deep link; tela "Conexões" com status, renovação e revogação.
2. **Servidor (Supabase Edge Functions)**: criação do token de conexão; client ID e secret só em segredos do servidor, nunca no aparelho; tabela de conexões guardando só o identificador do item do fornecedor, escrita apenas por funções do banco com RLS e testes em `supabase/tests`, como exige a regra do projeto.
3. **Webhooks**: rota com verificação de origem, idempotência por evento e fila; nunca confiar no retorno do app.
4. **Sincronização**: tarefa agendada que respeita os limites mensais por CPF; conversão de valores para centavos inteiros na borda.
5. **Mapeamento e duplicidades**: transações importadas entram numa área de "a revisar" e viram registro, conta paga ou compra de cartão só por confirmação, usando as funções existentes (`create_record`, `pay_commitment`, `add_card_purchase`, `pay_invoice`). Sugestão de vínculo com item manual existente por valor exato, data em janela curta e descrição; fatura do banco reconciliada com a fatura do cartão no Clarevo, nunca somada de novo. Identificador externo único por transação para não importar duas vezes.
6. **Desconectar e excluir**: revogar no fornecedor (excluir o item), apagar dados brutos importados e manter só o que a pessoa já confirmou como registro; exclusão total junto com a exclusão da conta.
7. **Governança**: nova decisão em `docs/00_VISAO_E_DECISOES.md` (integração bancária hoje está fora do ciclo, D-008), política de privacidade e termos atualizados, relatório de impacto (RIPD).

## 5. Recomendação

- **1ª escolha: Pluggy.** Menor preço público (R$ 2.500/mês, cerca de R$ 30 mil/ano) [3a], SDK React Native e web oficiais [23], cobertura ampla incluindo cartões e faturas [21][22], teste grátis e sandbox sem contrato [3a][23].
- **2ª escolha: Belvo.** Produto regulado maduro, sandbox completo e gestão de consentimentos documentada [26][27], porém preço relatado mais alto (~R$ 6.000/mês, não oficial) [15] e integração mobile por webview.
- **Prototipar antes de qualquer contrato** (sandbox Pluggy ou Belvo, dados fictícios): fluxo de consentimento no app e na web, Edge Function do token, rota de webhooks, tabela "a revisar" e regras de duplicidade, tela de conexões e desconexão. Nunca conectar contas reais de pessoas no teste.
- **O que Enzo precisa fazer e assinar:**
  1. Registrar a decisão de trazer integração bancária para o ciclo.
  2. Criar conta no painel da Pluggy e ativar o teste de 14 dias; gerar client ID e secret de sandbox e guardá-los nos segredos do Supabase.
  3. Pedir proposta comercial com o CNPJ do Clarevo e perguntar por escrito: base regulatória (parceria do art. 36, quem é a receptora), plano e preço por conexão acima da franquia, volume mínimo e fidelidade, como restringir a conectores regulados, retenção e exclusão de dados após revogação, adaptação às novas regras do BC (1x1x1), SLA e suporte.
  4. Assinar contrato de serviço e acordo de tratamento de dados (operador LGPD) com cláusula de proibição de uso secundário dos dados.
  5. Indicar pessoa encarregada de dados (LGPD), atualizar política de privacidade e termos, e incluir no contrato com empregadores que nenhum dado bancário é compartilhado.
  6. Configurar a URL de webhooks de produção e as credenciais de produção.
  7. Repetir a cotação com a Belvo como alternativa antes de assinar.

## Fontes (todas acessadas em 11/10/2026, por resultados de busca)

1. https://normativos.bcb.gov.br/Lists/Normativos/Attachments/51028/Res_Conj_0001_v7_L.pdf
2. https://openfinancebrasil.org.br/modelo-de-participacao/
3. https://www.pluggy.ai/blog/regula%C3%A7%C3%A3o-open-finance · 3a. https://www.pluggy.ai/pricing e https://www.pluggy.ai/meu-pluggy
4. https://finsidersbrasil.com.br/economia-open/bc-propoe-novas-regras-para-uso-de-dados-de-clientes-no-open-finance/
5. https://finsidersbrasil.com.br/economia-open/regras-bc-open-finance-startups-fintechs
6. https://www.letsmoney.com.br/noticias/banco-central-revisa-parcerias-dados-open-finance/ (set/2026)
7. https://finfy.luby.com.br/blog/banco-central-prepara-regulamentacao-de-parcerias-no-open-finance-o-que-muda-para-fintechs-em-2026/ e https://www.letsmoney.com.br/noticias/bc-veta-venda-dados-open-finance
8. https://agenciagov.ebc.com.br/noticias/202310/bc-simplifica-renovacao-de-consentimentos-no-open-finance-e-amplia-prazo-de-validade-do-compartilhamento
9. https://www.mayerbrown.com/pt/insights/publications/2023/12/facilitating-data-sharing-in-open-finance-new-central-bank-resolution
10. https://www.caixa.gov.br/open-finance/termos-de-uso/Paginas/default.aspx
11. https://finsidersbrasil.com.br/economia-open/pluggy-obtem-autorizacao-para-operar-como-iniciador-de-pagamento/
12. https://finsidersbrasil.com.br/economia-open/pluggy-recebe-licenca-de-iniciador-de-pagamento/
13. https://iniciador.com.br/en/infraestrutura/receptora-de-dados
14. https://finsidersbrasil.com.br/conteudo-de-marca/modelo-de-parcerias-a-hora-de-padronizar-o-que-ja-funciona/ e https://www.legisweb.com.br/legislacao/?id=429372 (Res. Conj. 4/2022, art. 36)
15. https://www.tabnews.com.br/GuilhermeVieira/estou-desenvolvendo-um-app-de-financas-pessoais-e-nao-consigo-pagar-o-open-finance-pluggy-r2-5k-mes-belvo-r6k-mes-tecnospeed-r1-5k-de-entrada-r540 (relato pessoal, não oficial)
16. https://www.pluggy.ai/produtos/open-finance
17. https://developers.belvo.com/products/aggregation_brazil/aggregation-brazil-data-retrieval-limits
18. https://developers.belvo.com/docs/brazil-open-finance-network-limits
19. https://revistapgbc.bcb.gov.br/revista/issue/download/38/213
20. https://confidata.com.br/blog/lgpd-fintechs-open-banking-pix-dados
21. https://www.baguete.com.br/noticias/pluggy-capta-us-35-milhoes-com-dgf (ago/2026)
22. https://pypi.org/project/pluggy-sdk/
23. https://docs.pluggy.ai/docs/environments-and-configurations e https://docs.pluggy.ai/docs/setup-pluggyconnect-widget-on-your-app
24. https://docs.pluggy.ai/docs/webhooks
25. https://belvo.com/blog/belvo-launches-open-finance-payment-initiation-leverage-pix-brazil/
26. https://developers.belvo.com/developer_resources/choose-hosted-widget-product.md e https://developers.belvo.com/docs/ofda-integration-guide-api
27. https://developers.belvo.com/apis/belvoopenapispec/section/introduction
28. https://belvo.com/pt-br/blog/infraestrutura-open-finance/
29. https://klavi.ai/sobre-nos e https://klavi.ai/
30. https://blog.tecnospeed.com.br/?p=36608 e https://blog.tecnospeed.com.br/?p=34920
31. https://startups.com.br/negocios/celcoin-mira-open-finance-e-compra-finansytech-por-r-15-mi/
32. https://belvo.com/blog/belvo-launches-official-open-finance-solution-regulated-institutions-brazil/
33. https://www.bai.org/banking-strategies/from-screen-scraping-to-open-banking/
34. https://wfintechs.substack.com/p/short-takes-37 (trecho em português citado pela busca; atribuição não confirmada)

## Alternativa sem custo

**Contexto.** Enzo, em 11/10/2026, deu prioridade aos próximos ciclos na ordem "bancos, família, empresas". Depois da pesquisa sobre Open Finance (fornecedor autorizado, a partir de cerca de R$ 2.500 por mês, mais a revisão das regras de parcerias pelo Banco Central prevista para dezembro de 2026), a resposta foi: "No momento, não temos como investir nessa função nesse nível, o que podemos fazer de similar ou paralelo". A integração com bancos continua fora do ciclo atual (D-008). O que se faz em paralelo é trazer os mesmos dados por um caminho que a própria pessoa controla, sem contrato, sem servidor de terceiros e sem custo mensal (D-048).

**O que é.** A pessoa baixa no banco o extrato da conta ou a fatura do cartão (arquivo OFX ou planilha CSV) e escolhe esse arquivo no Clarevo (Movimentos › Organizar › "Importar extrato ou fatura"). O arquivo é lido no aparelho, as linhas aparecem em "A revisar" e só o que ela confirma vira lançamento.

**Como cada ponto do memorando é tratado.**

| Ponto do memorando | Importar arquivo |
|---|---|
| Consentimento regulatório e prazo | Não há: a pessoa entrega o arquivo no momento em que escolhe, e cada importação é um ato dela. Nada para renovar nem revogar. |
| Credenciais bancárias | Nunca passam pelo Clarevo: o arquivo é baixado por ela no próprio banco. Sem raspagem de tela. |
| Servidor, webhooks e sincronização | Nenhum: a leitura roda no aparelho (`packages/core/src/importar`) e só as linhas confirmadas seguem para o banco do Clarevo, pelas funções de sempre. |
| Duplicidades (seção 4, item 5) | Resolvidas no próprio fluxo: chave única por linha (resumo SHA-256 calculado no aparelho) e a marca "Já anotado" por semelhança de valor, dia e descrição. Importar o mesmo arquivo de novo não duplica nada. |
| Fatura do banco x fatura do Clarevo | A compra entra na fatura do cartão pelo dia dela, e o pagamento da fatura continua sendo registrado por Pagar fatura. A linha de pagamento dentro do extrato vem como "Parece pagamento de fatura" e desmarcada; dentro da fatura, o pagamento recebido não entra. |
| Desconectar e excluir | Não há conexão. O arquivo não é guardado; os lançamentos criados são registros comuns (editar e excluir como sempre). O saldo do arquivo é ignorado: não existe saldo por conta (P-018). |
| LGPD | Minimização: do arquivo, só o que a pessoa confirma e o resumo de cada linha; nenhum dado de terceiros, nem do banco, nem o número da conta. O empregador nunca vê nada, como no resto do produto. |
| Limite do fornecedor por CPF | Não existe. |

**O que perde em relação ao Open Finance.** Não é automático (a pessoa baixa e escolhe o arquivo quando quiser), não traz saldo, não traz investimentos e depende de o banco oferecer OFX ou planilha com data, descrição e valor. Bancos que só entregam PDF não servem por este caminho.

**Limites do primeiro corte.** Até 5 MB e 5.000 linhas por arquivo; 500 linhas por chamada ao banco (a tela divide); fatura já paga não recebe compra nem estorno; compra com mais de 48 meses e data futura não entram; cada linha da fatura vale uma compra à vista (compras parceladas aparecem parcela por parcela, como o banco as mostra).

**Item 2: comprovante de Pix e de pagamento em PDF (Ciclo I2, D-051).** Entregue. Para o que o arquivo de extrato não cobre (o Pix que acabou de acontecer, a TED, o boleto pago, a compra no débito), a pessoa baixa o comprovante em PDF no app do banco e o escolhe no Clarevo, em Anotar gasto (folha de "Escanear nota fiscal" › "Ler comprovante de Pix ou pagamento (PDF)") ou em Registrar recebimento (linha própria). O PDF é lido no aparelho (o mesmo caminho do DANFE), o leitor devolve só o tipo (Pix, TED, boleto, débito), a direção (saiu ou entrou), o valor, a data e a hora, o nome da outra ponta e a mensagem, e o formulário vem preenchido ("Pix para Maria Souza"), com "Como você pagou?" em "Dinheiro, débito ou Pix". Nada é gravado sem "Salvar".

| Ponto do memorando | Comprovante em PDF |
|---|---|
| Consentimento regulatório e prazo | Não há: cada comprovante é um ato da pessoa, no momento em que o escolhe. |
| Credenciais bancárias | Nunca passam pelo Clarevo: o PDF é baixado por ela no próprio app do banco. |
| Servidor, webhooks e sincronização | Nenhum: a leitura roda no aparelho (`packages/core/src/comprovante`); só o registro que a pessoa salva vai para o banco do Clarevo, por `create_record`, como sempre. |
| Duplicidades | Sem chave no registro (nem o ID da transação, nem um resumo dele): o aviso é por semelhança, "Parece já anotado em 05/10/2026: ...", quando há registro do mesmo tipo, valor e data a até 1 dia. Não bloqueia. Guardar o resumo do ID exigiria coluna e índice novos (migração), e esta entrega não faz migração. |
| Desconectar e excluir | Não há conexão. O PDF e o texto não são guardados; o registro criado é comum (editar e excluir como sempre). |
| LGPD | Minimização no leitor: CPF e CNPJ (inteiros ou mascarados), chave Pix, instituição, agência, conta, ID da transação, código de autenticação e protocolo são descartados; do nome, só o da outra ponta. A memória por nome fica só no aparelho, pelo resumo SHA-256 do nome normalizado. |
| Limite do fornecedor por CPF | Não existe. |

**O que perde.** Não é automático (um PDF por vez), não traz saldo e depende de o banco oferecer o comprovante em PDF com texto (foto de comprovante e PDF escaneado não são lidos). O leiaute de cada banco pode trazer rótulos que a leitura ainda não conhece: o aceite com comprovantes reais é P-026.

**Próximo passo da alternativa.** Compartilhar o PDF direto do app do banco para o Clarevo ("Compartilhar com o Clarevo"), que exige a folha de compartilhamento nativa e espera o build das lojas (mesma pendência do PDF da nota, D-038(9)).
