/**
 * HTML SINTÉTICO (fictício) no leiaute padrão das consultas públicas de NFC-e (cabeçalho do estabelecimento, tabela de itens,
 * totais e blocos de informações). O contêiner dos testes não alcança a Sefaz: estes arquivos reproduzem o leiaute conhecido, não
 * uma nota real. O aceite com cupons reais do RJ continua pendente (P-025). Nenhum dado é de pessoa real: o CPF abaixo é o de
 * exemplo, inválido para uso, e serve só para provar que o leitor nunca o devolve.
 */

export const CONSUMER_CPF = '123.456.789-09';
export const CONSUMER_NAME = 'FULANO DE TAL EXEMPLO';

/** Chave com espaços de 4 em 4, como a página mostra. */
export function spaced(key: string): string {
  return key.replace(/(.{4})/g, '$1 ').trim();
}

export interface PageOptions {
  store?: string;
  cnpj?: string;
  key?: string;
  issued?: string;
  total?: string;
  gross?: string;
  discount?: string;
  items?: number;
  withCpf?: boolean;
  /** Linhas da tabela "Forma de pagamento" (rótulo já em HTML e valor pago). Padrão: Cartão de Crédito com o valor a pagar. `false`: sem a tabela. */
  payments?: { label: string; value: string }[] | false;
  /** Linha "Troco R$" depois das formas. */
  change?: string;
}

/** Tabela "Forma de pagamento" / "Valor pago" do leiaute padrão, com as formas pedidas e o troco. */
function paymentRows(o: PageOptions): string {
  if (o.payments === false) return '';
  const rows = o.payments ?? [{ label: 'Cart&atilde;o de Cr&eacute;dito', value: o.total ?? '30,00' }];
  return [
    `   <div id="linhaTotal"><label>Forma de pagamento:</label><span class="totalNumb">Valor pago R$</span></div>`,
    ...rows.map((r) => `   <div id="linhaTotal"><label>${r.label}</label><span class="totalNumb">${r.value}</span></div>`),
    ...(o.change ? [`   <div id="linhaTotal"><label>Troco R$</label><span class="totalNumb">${o.change}</span></div>`] : []),
  ].join('\n') + '\n';
}

/** Leiaute padrão: txtTopo, tabela #tabResult, #totalNota e "Informações gerais da Nota". */
export function standardPage(o: PageOptions): string {
  const items = o.items ?? 3;
  const rows = Array.from({ length: items }, (_v, i) => {
    const n = i + 1;
    return `<tr id="Item + ${n}"><td valign="top"><span class="txtTit">PRODUTO EXEMPLO ${n}</span><span class="Rcod">(Código: 789000000000${n} )</span><br/><span class="Rqtd"><strong>Qtde.:</strong>1</span><span class="RUN"><strong>UN: </strong>UN</span><span class="RvlUnit"><strong>Vl. Unit.:</strong>&nbsp;10,00</span></td><td align="right" valign="top" class="txtTit"><span class="valor">10,00</span></td></tr>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="utf-8"/>
<title>Consulta Pública da NFC-e - Secretaria de Estado de Fazenda</title>
<style type="text/css">.txtTopo{font-size:14px;font-weight:bold;} #totalNota .totalNumb{float:right;}</style>
<script type="text/javascript">var chave = '${o.key ?? ''}'; var total = 'Valor a pagar R$: 1,00';</script>
</head>
<body>
<div id="avisos"></div>
<div class="container">
 <div id="conteudo">
  <div class="txtCenter">
   <div id="u20" class="txtTopo">${o.store ?? 'MERCADO EXEMPLO LTDA'}</div>
   <div class="text">CNPJ: <span>${o.cnpj ?? '11.222.333/0001-81'}</span></div>
   <div class="text">Rua Exemplo, 100, Centro, Rio de Janeiro, RJ</div>
  </div>
  <div class="txtCenter"><div class="txtTopo">DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletr&ocirc;nica</div></div>
  <table id="tabResult" class="table table-striped">
${rows}
  </table>
  <div id="totalNota" class="txtRight">
   <div id="linhaTotal"><label>Qtd. total de itens:</label><span class="totalNumb">${items}</span></div>
   <div id="linhaTotal"><label>Valor total R$:</label><span class="totalNumb">${o.gross ?? o.total ?? '30,00'}</span></div>
   <div id="linhaTotal"><label>Descontos R$:</label><span class="totalNumb">${o.discount ?? '0,00'}</span></div>
   <div id="linhaTotal" class="linhaShade"><label>Valor a pagar R$:</label><span class="totalNumb txtMax">${o.total ?? '30,00'}</span></div>
${paymentRows(o)}  </div>
  <div id="infos">
   <h4>Informa&ccedil;&otilde;es gerais da Nota</h4>
   <ul><li><strong>EMISS&Atilde;O NORMAL</strong><br/><strong>N&uacute;mero: </strong>123456 <strong>S&eacute;rie: </strong>999 <strong>Emiss&atilde;o: </strong>${o.issued ?? '06/10/2026 14:32:10'} - Via Consumidor<br/><strong>Protocolo de Autoriza&ccedil;&atilde;o: </strong>133260000000001<br/><strong>Data de Autoriza&ccedil;&atilde;o: </strong>${o.issued ?? '06/10/2026 14:32:15'}</li></ul>
   ${o.withCpf === false ? '' : `<h4>Consumidor</h4><ul><li>CPF: ${CONSUMER_CPF}<br/>Nome: ${CONSUMER_NAME}</li></ul>`}
   <h4>Chave de acesso</h4>
   <ul><li><span class="chave">${o.key ? spaced(o.key) : ''}</span></li></ul>
   <p>Consulte pela Chave de Acesso em <a href="https://www.nfce.fazenda.rj.gov.br/consulta">www.nfce.fazenda.rj.gov.br/consulta</a></p>
  </div>
 </div>
</div>
</body>
</html>`;
}

/** Variante com rótulo e valor em células de tabela, nome sem a classe txtTopo e totais sem "Valor a pagar" (só "Valor total"). */
export function tablePage(o: { store: string; cnpj: string; key: string; issued: string; total: string }): string {
  return `<html><body>
<div class="topo">
 <h3>${o.store}</h3>
 <p>CNPJ: ${o.cnpj}</p>
 <p>Avenida Exemplo, 200 - Niter&oacute;i - RJ</p>
</div>
<table class="resumo">
 <tr><td>Quantidade de itens</td><td>5</td></tr>
 <tr><td>Valor total R$</td><td>${o.total}</td></tr>
 <tr><td>Troco R$</td><td>0,00</td></tr>
</table>
<div>Emiss&atilde;o: ${o.issued}</div>
<div>Chave de acesso: ${spaced(o.key)}</div>
<div>Consumidor n&atilde;o identificado</div>
</body></html>`;
}

/** Variante com a forma de pagamento numa tabela (cabeçalho "Forma de pagamento" / "Valor pago", uma linha por forma e "Troco"). */
export function paymentTablePage(o: { key: string; rows: { label: string; value: string }[]; change?: string; sameLine?: string }): string {
  return `<html><body>
<div id="u20" class="txtTopo">LOJA DA TABELA LTDA</div>
<div class="text">CNPJ: 11.222.333/0001-81</div>
<table id="totais"><tr><td>Valor a pagar R$</td><td>50,00</td></tr></table>
${o.sameLine ? `<div>Forma de pagamento: ${o.sameLine}</div>` : `<table id="pagamento"><thead><tr><th>Forma de pagamento</th><th>Valor pago</th></tr></thead><tbody>${o.rows.map((r) => `<tr><td>${r.label}</td><td>${r.value}</td></tr>`).join('')}${o.change ? `<tr><td>Troco</td><td>${o.change}</td></tr>` : ''}</tbody></table>`}
<div>Emiss&atilde;o: 06/10/2026 10:00:00</div>
<div>Consumidor</div><div>CPF: ${CONSUMER_CPF}</div><div>Nome: PIX COMERCIO EXEMPLO</div>
<div>Chave de acesso: ${spaced(o.key)}</div>
</body></html>`;
}

export const NOT_FOUND_PAGE = `<html><body><div class="alert">Nota Fiscal Eletr&ocirc;nica n&atilde;o encontrada. Verifique a chave de acesso e tente novamente.</div></body></html>`;

export const CAPTCHA_PAGE = `<html><head><title>Verifica&ccedil;&atilde;o</title><script src="https://www.google.com/recaptcha/api.js"></script></head><body><form><div class="g-recaptcha"></div><p>Confirme que voc&ecirc; n&atilde;o &eacute; um rob&ocirc; e tente de novo.</p></form></body></html>`;
