# Integração bancária: alternativa sem custo (importar extrato e fatura)

Data: 11/10/2026. Esta página traz só a seção "Alternativa sem custo". O memorando de decisão sobre Open Finance (caminho regulatório, fornecedores, raspagem de tela, o que construir e a recomendação) é o texto principal deste arquivo na árvore principal do projeto e será reunido a esta seção na conciliação.

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

**Próximo passo da alternativa.** Item 2 da proposta aceita por Enzo: comprovante de Pix recebido por compartilhamento (entrega seguinte).
