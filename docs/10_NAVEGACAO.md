# Onde fica cada tarefa no Clarevo · proposta para Enzo

09/10/2026. Junta quatro análises independentes (mapa das telas com medidas, princípios de usabilidade, tarefas feitas por pessoas fictícias do público e comparação com outros apps de finanças). As medidas vêm da versão web de demonstração, em celular de 360 × 640 e de 390 × 844 (`nav_audit/m360x640/report.txt`, `m390x844/report.txt`, `measure.out`, capturas em `nav_audit/m360x640/` e `nav_audit/shots/`). Nada foi alterado no app.

> **Situação em 10/10/2026: a navegação foi implementada e está registrada em D-039 (`docs/00`).** O texto abaixo é a proposta de 09/10/2026, mantida como registro; onde ele diz "hoje", leia a situação de antes da entrega. Enzo respondeu "Sim" a B1 e a B2 e pediu a barra inferior nas telas de consulta.
>
> **Entregue (D-039):**
> - B1: "Anotar gasto" sempre logo abaixo do cabeçalho azul (y 408 a 460 em 390 × 844 e em 320 px), com a faixa "Seus últimos meses", o card "Primeiros passos" e as confirmações depois dele.
> - B2: "Ver contas ›" no card "Ainda a pagar" e "›" ao lado de "Recebido" e "Pago".
> - Barra inferior à vista em todas as telas de consulta, com a aba de origem marcada, sem barra dupla nem salto ao abrir.
> - A5: Contas a pagar no mês certo, com seletor local (sem limite para trás e até 12 meses à frente) e as entradas "de agora" no mês atual.
> - A6: "Revisar vencidas" já com 1 vencida e "Já paguei" no detalhe da conta.
> - A7: a linha de lembretes em Contas a pagar, só no celular, fora da demonstração e com os lembretes desligados, que abre Conta no card de lembretes.
> - A8: a previsão e o critério do total depois das listas, para o primeiro "Já paguei" ficar à vista.
> - A12, só o nome acessível da aba: "Movimentos: movimentações do mês".
> - A17: Metas compacta, com o plano de guardar dentro do card da reserva (com ou sem reserva) e o card "Fazer as contas". Do A18, só a linha "Planejar quanto guardar" no card da reserva para quem respondeu "Agora não".
> - A21: a busca de Aprender ("Buscar um tema ou uma função") com o grupo "No app".
> - A1, A2, A9 e A11 entraram com o Ciclo E (D-037 e D-038).
>
> **Em aberto:**
> - A16, "Nova conta do ano" no topo da lista de Gastos fixos: não foi feito.
> - A vencida se paga em 4 toques contando a confirmação. Para chegar a 3, "Já paguei" teria de ficar na própria linha da vencida, o que muda D-035(5) e depende de Enzo.
> - Ficam sem barra, por terem rodapé fixo, `/reserva`, `/guardar`, `/guardar/minima`, `/retomar/atualizar`, `/retomar/pagar` e `/a-pagar/vencidas`; Enzo pode preferir a barra também nelas.
> - Desvios menores a confirmar: o card "Seu mês" fica depois de "Suas metas"; a tela de pagamento mantém o título "Marcar como paga" enquanto o detalhe diz "Já paguei"; a previsão e a linha de lembretes ficam depois das listas, e não no topo; "Lembretes" e "Ocultar valores" na busca abrem Conta, e não a seção.
> - Os demais itens das seções 4 e 5 (A3, A4, A10, A13 a A15, o resto de A18, A19, A20, A22 a A25 e B3 a B6) não foram tratados por D-039 e seguem como proposta. Antes de construir cada um, conferir no código se outro ciclo já o entregou.
> - Testes em aparelho (iOS e Android) da barra, do teclado aberto e dos lembretes, que a versão web não exercita.

## 1. Resposta curta

**Escanear nota fiscal.** O lugar certo é dentro de "Anotar gasto", como o primeiro botão do formulário. As cinco portas de gasto (Resumo, Movimentos, Primeiros passos, "Anotar outro gasto" e o atalho do ícone) já abrem esse mesmo formulário, então todas ganham o recurso sem nenhum botão novo no Resumo. Um ponto pede decisão de Enzo: na maioria dos cupons, o QR code traz só a loja (CNPJ) e o mês, sem valor e sem dia. Quem entrega "escaneou, preencheu" é a leitura da página oficial da Sefaz, que a especificação deixou para depois (seção 2.4).

**Localização das tarefas.** No uso do dia a dia, a maior parte está em lugar fácil: "Anotar gasto" a 2 toques e visível sem rolar, "Já paguei" a 3 toques, e o bloco "Organizar" com valores nas legendas. Os problemas aparecem em seis pontos:

1. Justamente para quem acabou de entrar e para quem volta depois de semanas, "Anotar gasto" sai da primeira tela (fica em y 834 e em y 730, com a barra de abas começando em y 576).
2. Contas a pagar abre no mês que a pessoa olhou por último no Resumo, sem seletor de mês: quem viu setembro e toca no card vê "R$ 0,00" e nenhum "Já paguei".
3. Na aba Metas, como foi desenhada, a pergunta "Você consegue guardar algum valor por mês?" ocupa sozinha a primeira tela e empurra a reserva, as metas e o simulador para baixo.
4. Várias portas não parecem portas: o card "Ainda a pagar", os valores "Recebido" e "Pago" do Resumo e os totais de Movimentos (estes nem respondem ao toque).
5. A busca de Aprender só acha temas: "nota fiscal", "boleto", "lembrete", "categoria" e "simular" devolvem zero resultado e nunca levam a uma tela.
6. Recursos que estão chegando (lembretes, renda comprometida, simulador, reserva) foram desenhados longe de onde a pessoa pensa neles, ou com nomes diferentes para a mesma coisa.

**O que precisa de Enzo.** Seis mudanças tocam o Resumo (seção 5) e uma decisão é sobre a nota fiscal (seção 2.4). Todo o resto (seção 4) pode entrar agora, porque não muda o Resumo nem a barra de abas.

## 2. Escanear nota fiscal em "Anotar gasto"

> **Situação em 10/10/2026: implementado no Ciclo E (D-038, `docs/00`).** A linha "Escanear nota fiscal" (56 px) é o primeiro item de Anotar gasto novo, com a folha de três opções, a câmera, o PDF do DANFE, "Colar o link ou a chave", o bloco "Nota lida", a nota já anotada, a descrição sem "Compra (CNPJ ...)", a leitura da página da Sefaz-RJ no celular e "Como você pagou?" logo depois do Valor. A pergunta de 2.4 foi respondida por Enzo ("Sim, ler a Sefaz-RJ já"). O que mudou em relação ao desenho abaixo:
>
> - A câmera não abre direto no primeiro toque: antes da permissão, uma folha oferece "Usar a câmera", "Escolher o PDF da nota" e "Colar o link ou a chave" (decisão de Enzo depois da auditoria); só depois de ler com a câmera uma vez o toque abre a câmera direto. Não há "Usar foto da galeria".
> - "Ver a nota no site da Sefaz" abre no navegador do aparelho (na web, em outra aba), e não dentro do app com "Voltar ao gasto": não há webview instalado. O endereço não é guardado (leva a chave inteira), então o botão no detalhe do gasto só existe na sessão em que a nota foi lida.
> - O banco guarda só o resumo SHA-256 da chave, não a chave (a chave de NF-e de pessoa física carrega o CPF do emitente). "Como da última vez nesta loja" fica só no aparelho, por resumo do CNPJ.
> - Não foram feitos nesta entrega: o foco automático em Descrição continua como era, "Ler outra nota" no detalhe depois de salvar, o aviso de "conta já anotada" para toda conta em aberto (2.3), o atalho `?ler=nota` do ícone, a linha de Primeiros passos, e o tema "Ler nota fiscal". A busca de Aprender (2.5) entrou depois, com o grupo "No app" (D-039): "nota", "cupom", "QR" e "NFC-e" levam a "Escanear nota fiscal". A leitura da página da Sefaz só foi testada com páginas sintéticas (P-025).

### 2.1 Onde fica

- **Primeiro item do formulário "Anotar gasto"**, acima da legenda "Gasto já pago · Conta principal". Hoje essa legenda fica perto de y 125, Descrição de 180 a 228 e Valor de 275 a 333 (`m360x640/08_anotar_gasto.png`).
- Aparece só em "Anotar gasto" novo, inclusive no modo "Dia" de "Seus últimos meses" (quem guardou as notas do mês). Não aparece em "Registrar recebimento", "Editar registro", "Anotar conta a pagar" nem no pagamento de conta.
- **Sem botão novo no Resumo** e sem ícone solto no cabeçalho. As quatro análises concordam: o formulário já é a porta única de todo gasto, e o Resumo continua como o desenho aprovado.
- **Foco automático em Descrição.** Hoje o formulário abre com o teclado (`record-form.tsx`, linha 407). Em 360 × 640, com o teclado aberto, só aparece o trecho até perto de y 260. Com a linha de escanear, Descrição desce para cerca de y 240 a 290, e o próprio sistema rola a tela para mostrar o campo, o que esconde a linha de escanear sob o cabeçalho. Recomendação: tirar o foco automático só na primeira abertura de "Anotar gasto" e manter em "Anotar outro gasto" e "Salvar e anotar outro". Custo: quem digita toca uma vez no campo. Conferir num Android real; se a linha continuar inteira com o teclado aberto, o foco automático pode ficar.

### 2.2 Como fica

```
[ ← Anotar gasto              Salvando em Pessoal ]

  [ (QR)  Escanear nota fiscal                    › ]   linha de 56 px, azul claro
          Cupom do mercado ou PDF de compra on-line

  Gasto já pago · Conta principal
  Descrição            [ Ex.: Café            ]
  Valor em reais       [ R$ 0,00              ]
                       Σ Somar valores
  Como você pagou?     (Dinheiro, débito ou Pix) (Cartão de crédito)
  Data do pagamento    [ 07/10/2026 ]  (Hoje) (Ontem)
  Categoria            (Mercado) (Moradia) (Transporte) ...

[ Cancelar ]                          [ Salvar gasto ]   rodapé fixo
```

- **Um botão só no formulário.** O toque abre a câmera direto, que é o caso mais comum (cupom na mão). A tela da câmera traz o texto "Aponte para o QR code no rodapé do cupom. Compra on-line: o código de barras do DANFE.", a lanterna e três saídas sempre visíveis: "Escolher o PDF da nota", "Usar foto da galeria" (se o `expo-camera` do SDK ler código numa imagem; conferir) e "Colar o link ou a chave". "Voltar" devolve ao formulário para digitar à mão. Sem câmera, ou com a permissão negada, o mesmo botão abre só "Escolher o PDF da nota" e "Colar o link ou a chave".
- **Permissão de câmera** só no primeiro toque, com uma frase antes: "O Clarevo usa a câmera só para ler o código da nota. Nenhuma foto é guardada."
- **"Como você pagou?" logo depois do Valor** (compra no cartão, Ciclo E), antes da data. "Dinheiro, débito ou Pix" vem marcado; depois de ler uma nota (D-042), a forma de pagamento que a nota informa escolhe por você (crédito: "Cartão de crédito"; dinheiro, débito, Pix e vale: "Dinheiro, débito ou Pix"; mais de uma forma: nenhuma), com a legenda "A nota informa: Pix. Mude se você pagou de outro jeito." e, sem cartão cadastrado, "A nota diz cartão de crédito. Cadastre o cartão para anotar a compra na fatura." Com "Cartão de crédito": os cartões viram chips, aparece "Em quantas vezes?", "Data do pagamento" vira "Data da compra" e a legenda do topo vira "Compra no cartão · entra na fatura de novembro". Sem cartão cadastrado, "Cadastrar cartão" volta ao formulário com tudo preenchido. Se a escolha ficasse no fim, depois da Categoria (perto de y 604, atrás do rodapé fixo), a pessoa só a descobriria depois de preencher a data errada.
- **"Nota lida" com valor, loja, data e forma, e a câmera com foco e guia (D-042, pedido de Enzo de 10/10/2026).** A linha do bloco passa a ser "Nota lida: Mercado Exemplo Ltda · RJ · R$ 87,40 · 06/10/2026 · Pix" (o que a leitura trouxer; o valor segue "Ocultar valores"), e na web, para a nota do RJ com QR online, o bloco diz "No celular, o Clarevo lê o valor e a data na página da Sefaz." A câmera abre com zoom leve (0,1), moldura quadrada ao centro, a dica "Aproxime até o QR ocupar a moldura." depois de 5 segundos e a da lanterna depois de 10. O foco contínuo já é o padrão do `expo-camera` 57.0.6; `autofocus="on"` travaria o foco e não há "toque para focar" nessa versão. Nunca foi exercitada em aparelho real (só em navegador com câmera de teste).

### 2.3 Depois de ler

- Volta ao **mesmo formulário**, com um bloco no lugar do botão: "Nota lida: Mercado Exemplo · RJ · 12/10/2026" (ou "CNPJ 12.345.678/0001-90 · RJ · outubro de 2026", quando só há o QR), e os links "Ler outra nota" e "Desfazer leitura". Nada é gravado sem "Salvar gasto".
- **Quando falta valor ou dia**, o bloco diz isso claramente, para a leitura não parecer falha: "O valor não vem no código desta nota. Digite o total impresso no cupom." O foco vai para o primeiro campo que falta (quase sempre Valor, com teclado numérico). Se a nota trouxe tudo, o teclado fica fechado e basta tocar em "Salvar gasto".
- **Descrição.** Nunca "Compra (CNPJ ...)", que apareceria assim em "Pagamentos do mês" e em Movimentos. Se a página da Sefaz foi lida, vem o nome da loja. Se a mesma loja (mesmo CNPJ, que está dentro da chave) já foi anotada, repete a descrição e a categoria da última vez, com a legenda "Como da última vez nesta loja". Se não, fica em branco com a dica "Ex.: Mercado", e tocar numa categoria com a descrição vazia preenche a descrição com o nome dela. A regra mora no core, com teste.
- **"Ver a nota no site da Sefaz"** fica dentro do bloco da nota e no detalhe do gasto salvo. Abre dentro do app, com "Voltar ao gasto", sem perder o que foi preenchido.
- **Nota já anotada** (pela chave, como na especificação): "Esta nota já foi anotada em 12/10/2026: Mercado, R$ 87,40." com "Abrir registro".
- **Conta já anotada.** Se o valor lido for igual ao de uma conta em aberto do mês, ou a descrição for parecida, o aviso que já existe para gasto fixo passa a valer para toda conta em aberto: "É o pagamento de Internet? Use Já paguei para ela sair de Ainda a pagar." Sem linha fixa nova no topo do formulário.
- **Código de boleto.** O boleto tem outro tipo de código de barras. Se a câmera ou o campo de colar reconhecer um boleto (44 dígitos do código de barras, 47 ou 48 da linha digitável): "Este é o código de um boleto. Para anotar uma conta que ainda vai vencer, use Anotar conta a pagar." com o botão que abre essa tela. O código não é guardado (P-013 continua pendente).
- **Depois de salvar**, o detalhe mostra "Ler outra nota" no lugar de "Anotar outro gasto" quando o gasto veio de uma nota (ver A3 sobre a ordem dos botões).

Caminho: "Anotar gasto" › "Escanear nota fiscal" › "Salvar gasto" = **3 toques**, mais 1 na primeira permissão e mais o valor digitado quando a nota não o traz. Pelo atalho do ícone (2.5): 2 toques.

### 2.4 O que a leitura consegue trazer · decisão de Enzo

- Na nota emitida normalmente (on-line), que é a regra no varejo, o QR traz a chave de acesso: estado, ano e mês, CNPJ da loja e o modelo. **Valor e dia só vêm no QR das notas emitidas em contingência**, que são exceção (`spec8_nota.md`, fatos conferidos em 09/10; Manual do DANFE NFC-e da Sefaz-RR). O QR versão 3 (NT 2025.001) traz menos ainda na emissão on-line.
- Consequência: com a fase 1 da especificação (`spec9` §2.1), a pessoa escaneia e, na maioria dos cupons, ainda digita valor e dia. Loja, total e data vêm da página oficial da Sefaz, que a especificação pôs em "Fase seguinte" (§2.3).
- **Recomendação:** trazer para este ciclo, só no app de celular e começando pelo RJ (`consultadfe.fazenda.rj.gov.br`), a leitura da página oficial. Ela acontece por toque da pessoa, uma nota por vez, no próprio aparelho e sem servidor do Clarevo, como pedem os Ajustes SINIEF 16 e 18/2018 (que restringem robôs). A página abre visível dentro do app, e o app lê só o que ela mostra e descarta o CPF. Se falhar: "Não deu para ler a página da Sefaz. Confira o valor no cupom.", com o formulário mantido. Antes de prometer, testar com 5 a 10 cupons reais de mercados do RJ (P-025). Na web, por bloqueio do navegador, fica só o link.
- **Pergunta para Enzo:** "Escanear nota" deve, já nesta fase, preencher loja, valor e data no celular (com a leitura da página da Sefaz do RJ), ou pode começar trazendo só a loja e o mês, com a pessoa digitando o valor? A recomendação é a primeira opção. Registrar a resposta em D-038. A nota de `docs/08` §4 ("depende de parecer jurídico") precisa ser atualizada junto.
- **Cuidado técnico (sem decisão):** o leitor do QR (`parseNfceQr`) precisa aceitar as versões 2 e 3. Na contingência da versão 3, o QR pode trazer o CPF ou o CNPJ de quem comprou, e esse campo deve ser descartado no próprio leitor, antes de qualquer tela, rascunho ou registro, com teste que confira que o CPF não sai. O leiaute exato deve ser conferido no PDF oficial da NT 2025.001 (última versão).

### 2.5 Outras portas para a nota (sem tocar no Resumo)

- **Atalho do ícone na web:** "Escanear nota fiscal" (`/registro/novo?tipo=despesa&ler=nota`, que abre a câmera direto) no lugar de "Calculadoras", que já tem três portas dentro do app. No app de celular, o mesmo atalho quando entrar o `expo-quick-actions` (conferir a versão do SDK).
- **Primeiros passos, passo 3:** legenda "Mercado, farmácia ou transporte. Dá para escanear a nota."
- **Aprender:** tema "Ler nota fiscal" em "Usar o Clarevo" (o que é lido, o que nunca é guardado, com fonte da Sefaz) e uma linha em "Quem vê estes dados?" ("A chave da nota fica no registro. O CPF nunca é guardado.").
- **Busca:** "nota", "cupom", "QR", "NFC-e" e "DANFE" levam a "Escanear nota fiscal" (A21).

### 2.6 Para depois

- "Adicionar nota fiscal" no detalhe de um gasto já anotado, e "Você já anotou R$ 87,40 em 12/10 (Mercado). Juntar a nota a esse gasto?" quando a nota trouxer valor e dia. Isso evita que a mesma compra conte duas vezes, mas grava a chave por `update_record` e precisa de teste no banco.
- Um ícone pequeno de nota nas linhas de Movimentos e da composição ("com nota fiscal", para o leitor de tela). Uma área "Compras" só quando os itens da nota forem lidos.
- Teste com 5 pessoas da ordem Valor antes de Descrição no formulário sem nota. A ordem atual só muda se o teste mostrar ganho.

## 3. Como foi medido

- Versão web de demonstração (outubro de 2026), contas nova e "retorno" (`?cenario=retorno`). A barra de abas começa em y 576 em 360 × 640 e em y 780 em 390 × 844. "Visível" quer dizer acima da barra, sem rolar.
- Num Android real de 360 × 640, as barras do sistema tiram cerca de 64 px. As medidas daqui são o melhor caso.
- Os toques contam a partir do Resumo do mês atual, sem contar digitação nem o toque nos campos. "+ rolagem" quer dizer que o alvo fica abaixo da barra de abas em 360 × 640.

## 4. (A) Pode entrar agora, sem mexer no Resumo nem na barra de abas

Nenhum item abaixo muda os blocos aprovados do Resumo (D-022) nem a barra de abas. Vários ajustam especificações dos Ciclos A2, B, C, D e E, em construção, antes de virar tela. Os que mudam o texto de uma decisão marcada como "proposta Claude, revisável" estão indicados, para registro em `docs/00_VISAO_E_DECISOES.md`.

### Anotar gasto e detalhe do gasto

- **A1 · Alta · Escanear nota fiscal** como descrito na seção 2.
- **A2 · Alta · "Como você pagou?" logo depois do Valor** (seção 2.2). Ajusta `spec9` §1.4, que não diz onde a escolha fica.
- **A3 · Média · Próximo passo visível depois de salvar.** Hoje, depois de "Salvar gasto", "Anotar outro gasto" fica no limite (598 a 650), "Editar registro" é o botão cheio e "Ver resumo do mês" fica em 854 a 906, depois de "Excluir registro" (`m360x640/20_detalhe_gasto_salvo.png`; `registro/[id]/index.tsx`, linhas 157 a 182). Proposta: com o aviso "Gasto salvo", mostrar "Ver resumo do mês" (botão cheio) e "Anotar outro gasto" (ou "Ler outra nota") logo abaixo da faixa verde, antes do card. "Editar registro" vira secundário e "Excluir registro" fica por último. O detalhe continua abrindo, como pede o CL C002.
- **A4 · Baixa · "É um recebimento? Registrar recebimento"** no fim do formulário, perto de "Como este registro entra no mês?", trocando o tipo sem perder o que foi digitado. Quem usa "Anotar gasto" para lançar o salário hoje não tem como trocar dali.

### Contas a pagar

- **A5 · Alta · Abrir no mês certo.** `/a-pagar` usa o mês escolhido por último nas abas e não tem seletor (`a-pagar/index.tsx`, linha 288). Com o Resumo em setembro, a tela mostrou "Previsto para setembro de 2026 R$ 0,00" e nenhum "Já paguei" (`shots/a_pagar_setembro_360x640.png`). Proposta: seletor de mês logo abaixo de "Pessoal · {mês}"; fora do mês atual, "Voltar para outubro de 2026" no topo, e não só no estado vazio; as entradas que falam de agora (lembrete do Ciclo A2, atalho do ícone, aviso de vencidas) abrem sempre no mês atual.
- **A6 · Média · Conta vencida a 3 toques.** Hoje, com 1 vencida: card › conta › "Marcar como paga" › "Confirmar pagamento" = 4 toques; uma conta a vencer leva 3. Proposta: mostrar "Revisar vencidas" já com 1 vencida (trocar `overdue.length >= 2` por `>= 1`; a tela de revisão já trata uma conta só e paga na data do vencimento) e trocar "Marcar como paga" por "Já paguei" no detalhe (linha 528), para a mesma ação ter um nome só.
- **A7 · Média · Lembretes onde a pessoa pensa em vencimento (Ciclo A2).** No celular, com os lembretes desligados, a linha "Receber um aviso um dia antes do vencimento · Ligar" abaixo do total do mês (some quando ligado ou depois de "Agora não"). A oferta de lembretes também aparece depois de salvar a primeira conta a pagar de qualquer tipo, não só gasto fixo. O lembrete continua um só para todas as contas (D-025).
- **A8 · Média · Previsão sem empurrar a lista.** A previsão dos pagamentos do mês (`spec6` §2) entra no bloco do topo, no lugar do parágrafo explicativo de 5 linhas (que vai para "O que é previsto e realizado?"), e não como bloco novo. Assim o primeiro "Já paguei" continua visível (hoje em 548 a 592). Ao lado da previsão, o link "Quanto isso é da sua renda?" para a renda comprometida (Ciclo B).
- **A9 · Média · Fatura do cartão (Ciclo E).** A linha "Fatura Cartão Exemplo" abre a tela da fatura, e o botão rápido vira "Pagar fatura" ("Pagar R$ 1.230,00 hoje?", com "Confirmar pagamento", "Outro valor" e "Cancelar"). Se seguisse o padrão atual, "Já paguei" daria erro, porque a fatura só se paga por `pay_invoice`. A mesma regra vale na revisão de vencidas e em "Seus últimos meses".

### Movimentos

- **A10 · Média · Totais que abrem a composição.** Os cards "Recebido em outubro" e "Pago em outubro" parecem tocáveis, mas não são (`(tabs)/movimentacoes.tsx`, linhas 140 e 146). Proposta: os dois abrem a composição, com "›"; o de Pago tem a legenda "Ver por categoria ›" e abre já em "Por categoria". Os dois cards continuam separados, como D-035(8) decidiu.
- **A11 · Média · "Organizar" com Cartões (Ciclo E).** Ordem: Contas a pagar, Cartões ("Fatura de novembro: R$ 420,00 · vence 10/11"; sem cartão, "Nenhum cartão. Compras no cartão entram em Pago quando a fatura é paga"), Gastos fixos e parcelamentos, Calculadoras. A renda comprometida não vira linha aqui, para não empurrar mais a lista (o primeiro registro já está em y 976).
- **A12 · Baixa · Mesmo ícone e mesmo nome.** "Anotar gasto" usa "+" no Resumo e "−" em Movimentos, e "Registrar recebimento" usa "+" (linhas 114 e 120). Proposta: "+" nos dois "Anotar gasto" e a seta de entrada (ArrowDownLeft) em "Registrar recebimento", igual às linhas de recebimento. Título da tela e links ("Ir para Movimentações", "Ver Movimentações") passam a dizer "Movimentos", como o rótulo da aba. O nome para leitor de tela da aba passa a conter "Movimentos" (WCAG 2.5.3, `tab-bar.tsx`, linha 18). A barra de abas não muda.
- **A13 · Baixa · Composição sempre com ação.** Na composição de Recebido e de Pago, "Registrar recebimento" ou "Anotar gasto" sempre no fim da lista, e não só no estado vazio (`composicao.tsx`, linhas 63 a 102).

### Gastos fixos e parcelamentos

- **A14 · Média · Ligação com a renda comprometida (Ciclo B).** Logo abaixo de "Por mês, se os valores não mudarem", o link "Quanto isso pesa na sua renda? Ver renda comprometida". No detalhe de financiamento ou compra parcelada: "Conta como dívida na renda comprometida · Ver". Hoje os links só vão da renda comprometida para cá, e não o contrário.
- **A15 · Média · Parcela no cartão.** No aviso que aparece quando o parcelamento fala em cartão ou fatura (`series-form.tsx`, linha 563), o botão "Anotar como compra no cartão", que abre "Anotar gasto" com cartão, descrição, valor total e parcelas preenchidos. No fim da seção de parcelamentos: "Compras parceladas no cartão ficam em Cartões".
- **A16 · Baixa · Conta do ano à vista.** Botão secundário "Nova conta do ano" no topo da lista, junto de "Novo gasto fixo ou parcelamento". Hoje ele fica em y 1166, e o caminho por Movimentos leva 5 toques. Sem conta do ano cadastrada, a legenda em "Organizar" vira "2 cadastrados. Também IPVA, IPTU e matrícula".

### Metas (Ciclos C e D, ajustes antes de construir)

- **A17 · Alta · Ordem da aba.** (1) A pergunta "Você consegue guardar algum valor por mês?" no topo, em versão compacta (cerca de 200 px: título, "Sim, consigo" e "Agora não" lado a lado, "Responder depois" como link pequeno), só enquanto não respondida ou quando chega a hora de perguntar de novo, como Enzo pediu. (2) Logo abaixo, o card da Reserva, com "Calcular minha reserva", visível em 360 × 640. Depois do "Sim", o plano entra dentro desse card ("Planejado: R$ 300,00 por mês · 1ª etapa em novembro de 2027 · Mudar valor"), em vez de virar um segundo card sobre o mesmo valor. (3) Suas metas. (4) Um card "Fazer as contas" com duas linhas: "Simular um plano" e "Calculadoras". (5) Card lima. (6) Concluídas e arquivadas. O bloco "Seu mês" vira a linha "Ver renda comprometida" dentro do card da Reserva. Evidência: hoje o primeiro card de Metas vai de y 176 a 528 e o resto fica abaixo da barra (`m360x640/03_metas_demo.png`); no desenho, a pergunta sozinha ocupa cerca de 330 px.
- **A18 · Alta · Porta para a pergunta depois de "Agora não".** Hoje a pergunta só volta em 30 dias. Proposta: a linha fixa "Planejar quanto guardar" dentro do card da Reserva (ou no topo, se não houver reserva), que abre a mesma pergunta. Portas no momento certo, fora do Resumo: no fim de `/renda-comprometida`, na composição "Diferença do mês" e na tela final de "Seus últimos meses".
- **A19 · Média · Número de referência honesto.** O desenho mostra, ao lado de "Quanto você consegue guardar por mês?", o valor "Fora dos compromissos em outubro: R$ 2.850,00". Na demonstração, depois de pagar tudo, restam R$ 1.450,00 (recebido R$ 6.000,00, pago R$ 3.900,00, ainda a pagar R$ 650,00), porque o mercado não é compromisso. Para quem acha que não consegue guardar, prometer demais leva a desistir. Proposta: mostrar o mês como ele é ("Em outubro: recebido R$ 6.000,00, pago R$ 3.900,00 e R$ 650,00 ainda a pagar.") e, com 3 meses anotados, "Nos últimos 3 meses, a diferença do mês foi em média R$ X.". "Fora dos compromissos" fica só na tela da renda comprometida, onde vem explicado. Muda `spec7` §2 (proposta Claude).
- **A20 · Média · Um nome por recurso.** O simulador aparece com quatro nomes no desenho. Proposta: "Simular um plano" em todas as portas e como linha do grupo "Guardar e dividir" em `/calcular`, que é onde a pessoa procura uma conta. Em Aprender, seguir D-031(8) (atalho em "Dinheiro no tempo") e não criar a seção "Calcular" de `spec2` §4.7, que conflita com D-031; a legenda do card "Calculadoras" de Aprender (visível, em y 360 a 476) passa a citar "simular". A calculadora "Reserva para imprevistos" vira "Quanto guardar para imprevistos?", com a legenda "Só a conta, nada é gravado", e "Reserva para imprevistos" fica só para a reserva gravada em Metas. Com reserva criada, a calculadora mostra no topo "Você já tem uma reserva: R$ 3.500,00 de R$ 22.500,00 · Ver em Metas".
- Se o Ciclo C atrasar: na tela atual de Metas, pôr o card "Enquanto isso, faça as contas" antes do aviso "Metas chegam em uma próxima versão" e tirar a ilustração do aviso.

### Aprender

- **A21 · Média · A busca acha funções.** Hoje "calculadora" devolve 5 temas e nenhum leva à tela Calculadoras; "nota fiscal", "cupom", "boleto", "lembrete", "categoria", "simular", "apagar" e "renda comprometida" devolvem zero (`nav_audit/probe/search.out`). Proposta: grupo "No app" no topo dos resultados, a partir de um índice fixo no core com sinônimos (nota, cupom, QR › Escanear nota fiscal; salário, renda › Registrar recebimento; boleto, vencimento › Contas a pagar; IPVA, IPTU › Contas do ano; cartão, fatura › Cartões; categoria › Pago por categoria; lembrete, aviso › Lembretes; esconder › Ocultar valores; guardar, poupar › Metas e reserva; simular › Simular um plano; voltei › Seus últimos meses). Rótulo "Buscar um tema ou uma função" e dica "Ex.: juros, boleto, IPVA". Continua no aparelho e sem registrar buscas (D-032(6)), com teste no core.
- **A22 · Média · Dúvidas frequentes perto do topo.** Hoje a seção fica em y 4062 numa aba de 4792 px, e o atalho "Ir para Dúvidas frequentes" fica em y 960. Proposta: a fileira "Ir para" logo abaixo da busca, com "Dúvidas frequentes" primeiro. Muda o texto de D-031(2) (proposta Claude).

### Conta

- **A23 · Média · Seções novas no topo (Ciclo A2).** Ordem: perfil, "Lembretes", "Privacidade neste aparelho" (ocultar valores ao abrir, pedir biometria), Segurança, Conta financeira, Acesso ao plano, Sair. Hoje "Segurança" está em y 662 e "Sair" em y 1138; seções novas no fim ficariam a mais de uma tela e meia de rolagem. O nome do avatar para leitor de tela passa a "Conta: perfil, lembretes, privacidade, segurança e acesso ao plano" (`header.tsx`, linha 70).

### Seus últimos meses e Primeiros passos

- **A24 · Média · "Atualizar agora" sempre à mão.** Em `/retomar`, "Atualizar agora" fica em y 1388 numa página de 1546 px (2,4 telas abaixo), depois de todos os meses. Proposta: rodapé fixo com "Atualizar agora" (principal) e "Seguir adiante", igual ao dos formulários, com a dica "Seguir adiante não apaga nem cria nada" logo acima.
- **A25 · Média · Primeiros passos que terminam.** Hoje "recebido" e "pago" contam só o mês corrente (`primeiros-passos.tsx`, linhas 70 e 71), então voltam a pendentes todo dia 1º, e o card só fecha quando os três passos ficam prontos ao mesmo tempo. Quem não tem gasto fixo (mora com a família, por exemplo) fica meses com o card acima de "Anotar gasto". Proposta: passo concluído uma vez fica concluído (guardado no aparelho, como a situação do card já é) e o passo 1 ganha "Não tenho gastos fixos". Não muda nada do desenho do Resumo, só faz o card sair quando deve. Muda o texto de D-033(1) e (3) (proposta Claude).

## 5. (B) Precisa da aprovação de Enzo (Resumo)

Em todos os itens, os blocos de D-022 e a ordem entre eles continuam iguais. Mudam só a área dos avisos temporários, sinais de toque e uma linha nova já prevista. Sugestão de teste para o conjunto: protótipo na própria versão web de demonstração, com um parâmetro que só existe na demonstração (como o `?cenario=retorno` que já existe), comparando o Resumo de hoje com o proposto. Fazer com 5 pessoas do público (pelo menos 2 com pouca familiaridade com finanças), num Android de 360 × 640, nos três estados (conta nova, volta depois de semanas e uso normal). Tarefas: "Anote um gasto de R$ 25,00 na farmácia", "Veja quais contas ainda faltam pagar", "Veja em que você mais gastou neste mês". Medir: acerto sem ajuda, primeiro toque certo e tempo até o primeiro toque.

**B1 · Alta · "Anotar gasto" sempre logo depois do cabeçalho azul.**
- O que muda: a faixa "Seus últimos meses" e o card "Primeiros passos" passam para logo depois de "Anotar gasto", antes de "Ainda a pagar". "Anotar gasto" fica sempre em y 408 a 460, e o título do aviso perto de y 476, ainda visível. Junto: na faixa, texto de 2 linhas, "Ver resumo" e "Seguir adiante" lado a lado e a dica "Os meses ficam como estão. Nada é apagado." (hoje "Seguir adiante" grava a decisão no primeiro toque, sem caminho de volta). No card, passos de uma linha (a legenda vai para o leitor de tela), "Agora não" na linha do título e os concluídos resumidos em "2 de 4 prontos".
- Por quê: hoje, na conta nova, "Anotar gasto" está em y 834 a 886 em 360 × 640 e em y 796 a 848 em 390 × 844, abaixo da barra nos dois; na volta depois de ausência, em y 730 a 782, com "Ver resumo" também abaixo (`m360x640/14_resumo_conta_nova.png`, `15_resumo_retorno.png`). O 4º passo "Planejar quanto guardar" acrescenta cerca de 80 px. Na tela original aprovada (`docs/referencias/telas_originais_resumo_2026-10-08.png`), "Anotar gasto" vem logo depois do cabeçalho azul: a proposta devolve o Resumo a esse desenho nos dias com aviso. Mobills, Organizze e YNAB também mantêm o botão de anotar fixo na tela inicial.
- Custo: em 360 × 640, os botões da faixa ficam no limite da primeira tela (perto de y 590) e pedem uma rolagem curta, o que se aceita porque atualizar os meses é opcional. Muda o texto de D-030(3) e D-033(1).
- Recomendação: **aprovar**. Se Enzo preferir manter a posição atual, aplicar ao menos o card compacto, que sozinho sobe "Anotar gasto" para perto de y 512 na conta nova.

**B2 · Média · Sinal de toque nas portas do Resumo (a pergunta de D-034(4), refeita).**
- O que muda: no card "Ainda a pagar", o link "Ver contas" na mesma linha de "Anotar conta a pagar", no mesmo estilo do "Ver todos" de "Pagamentos do mês" (0 px a mais; o ícone de calendário da tela original continua). Um "›" pequeno ao lado dos rótulos "Recebido" e "Pago" do cabeçalho.
- Por quê: o valor do card abre a lista de contas, mas o único texto de ação visível é "Anotar conta a pagar" (o aviso "Abre as contas a pagar" existe só para leitor de tela, `(tabs)/index.tsx`, linha 253). Tocar em "Pago" é o único caminho para "Por categoria" a partir do Resumo, sem nenhum sinal. Com a linha da renda comprometida com seta (B3), a pessoa aprenderia que só o que tem seta abre.
- Recomendação: **aprovar**. Nenhum bloco muda de lugar ou de tamanho. Regra única para o app: toda linha ou card que abre outra tela termina com "›"; a seta inclinada fica só no card lima aprovado.

**B3 · Média · Linha da renda comprometida (Ciclo B) no fim do card "Ainda a pagar".**
- O que muda: em vez de entrar entre o valor e "Anotar conta a pagar" (`spec2` §4.5), a linha entra no fim do card, depois de um divisor, numa linha só de no máximo 48 px: "Renda comprometida em outubro · 52,5% ›", com o medidor de 8 px na própria linha.
- Por quê: assim o card não fica com três alvos seguidos com destinos diferentes, e o valor e o link não mudam de lugar. Em 360 × 640 a linha fica abaixo da barra de qualquer jeito; em 390 × 844, "Pagamentos do mês" (hoje em y 735) sai da primeira tela por cerca de 20 px.
- Recomendação: **aprovar**, sabendo do custo em 390 × 844. As outras portas (Gastos fixos, Contas a pagar, Metas) entram sem aprovação (A8, A14, A17).

**B4 · Média · Botão de olho (ocultar valores) no cabeçalho das abas (Ciclo A2).**
- O que muda: um botão de olho ao lado do avatar, no mesmo lugar nas quatro abas. Ele cabe nas contas reais. Na demonstração, em 360 px, sobram cerca de 34 px entre o logotipo e o selo "Demonstração", menos que um alvo de 44 px. Por isso o selo passaria para baixo do logotipo.
- Recomendação: **aprovar só se couber em 320 px** sem cortar o logotipo, como `spec6` §1 já exige. Se não couber, o recurso fica só em Conta (A23), que já atende quem quer os valores ocultos ao abrir.

**B5 · Baixa · Aviso único "Novo em Metas" para quem já usava o app.**
- O que muda: na área dos avisos temporários, uma vez só, para contas criadas antes do Ciclo C: "Novo em Metas: um plano para guardar, com o valor que você escolher." com "Ver" e "Agora não", com as mesmas regras de "Primeiros passos".
- Por quê: Enzo pediu para sempre perguntar se a pessoa consegue guardar. O 4º passo só alcança contas novas, e quem já abriu Metas aprendeu que a aba estava vazia ("Metas chegam em uma próxima versão").
- Recomendação: **aprovar para quando o Ciclo C entrar**, junto com B1, para o aviso não empurrar "Anotar gasto".

**B6 · Baixa · "Voltar para Pessoal" no estado vazio da Família.**
- O que muda: no Resumo, em "Nenhuma família vinculada", o botão "Voltar para Pessoal".
- Por quê: quem toca em "Família" por curiosidade perde "Anotar gasto" sem explicação, e a escolha vale também para Movimentos até fechar o app.
- Recomendação: aprovar. É uma ação dentro de um estado vazio já aprovado.

**Não recomendado:** botão de escanear no próprio Resumo, mesmo como segmento ao lado de "Anotar gasto". Com A1 e o atalho do ícone, o recurso fica a 1 toque a mais, sem mudar o Resumo. Rever só se o teste com 5 pessoas mostrar que não acham o recurso dentro de "Anotar gasto".

## 6. Divergências entre as análises e como foram resolvidas

| Ponto | Opções das análises | Escolha e motivo |
|---|---|---|
| Foco automático em Descrição | Manter (tarefas e mapa); tirar (princípios); testar Valor primeiro (comparação) | Tirar só na primeira abertura e conferir num Android real. Com o teclado aberto, a linha de escanear corre risco de ficar escondida. A ordem Valor primeiro, só com teste |
| PDF, galeria e "colar" | Link de PDF no formulário (princípios); tudo na tela da câmera (comparação); "colar" só sem câmera (especificação) | Uma linha só no formulário, cuja legenda cita o PDF; as outras formas dentro da tela da câmera. Deixa o topo do formulário leve para quem digita |
| Descrição sugerida pela nota | "Compra (CNPJ ...)" (especificação) | Nome da loja (página da Sefaz), ou descrição e categoria da última compra na loja, ou em branco com dica. As quatro análises recusam o CNPJ como título |
| "Ver a nota no site da Sefaz" | No formulário (especificação); só no detalhe (tarefas); dentro do app com volta (princípios) | No bloco da nota e no detalhe, aberto dentro do app com "Voltar ao gasto". Ajuda quem perdeu o cupom sem tirar a pessoa da tarefa |
| "Primeiros passos" na frente de "Anotar gasto" | Mover os avisos para depois (mapa, princípios, comparação); só compactar o card (tarefas) | As duas coisas: mover (B1, volta ao desenho original) e compactar. Se Enzo recusar B1, o card compacto já ajuda |
| Sinal de toque no card "Ainda a pagar" | Trocar o calendário por seta (mapa); "Ver contas" (princípios) | "Ver contas" ao lado de "Anotar conta a pagar". O calendário está na tela original aprovada e fica |
| Lugar da linha da renda comprometida | Meio do card (especificação); fim do card (mapa) | Fim do card, com 48 px: menos toque errado e nada muda de lugar |
| Pagar conta vencida | "Revisar vencidas" com 1 vencida (mapa); "Já paguei" na linha com "Quando foi pago?" (princípios) | A primeira: chega a 3 toques sem regra nova e mantém D-035(5). A segunda só se o teste mostrar confusão |
| Totais de Movimentos | Juntar numa linha (tarefas); manter (D-035(8)) | Manter os dois cards e torná-los tocáveis. Juntar mudaria um elemento que D-035(8) decidiu manter |
| "É o pagamento de uma conta?" em Anotar gasto | Linha fixa no topo (princípios) | Ampliar o aviso que já existe (toda conta em aberto, descrição parecida, valor igual). Uma linha fixa apareceria quase sempre e pesaria no caminho manual |
| "Seu mês" e "Fora dos compromissos" em Metas | Linha com o número dentro da Reserva (princípios); número engana (tarefas) | Só o link "Ver renda comprometida" em Metas e o mês como ele é ao lado da pergunta. O número sem os gastos do dia a dia leva a prometer demais |
| Conta: uma seção ou duas | "Avisos e privacidade" (mapa); "Lembretes" e "Privacidade neste aparelho" (princípios) | Duas seções curtas: nomes que a pessoa reconhece ao procurar |
| Simulador em Aprender | Seção "Calcular" (`spec2` §4.7); atalho em "Dinheiro no tempo" (D-031(8)) | D-031(8), que é decisão registrada, mais a palavra "simular" na legenda do card "Calculadoras" |
| Linha "Ver os registros" em Movimentos | Link no fim de "Organizar" que rola até a lista (princípios) | Não entra: o link ficaria abaixo da barra (o fim de "Organizar" está perto de y 724). Observar no teste se as pessoas acham a lista |
| Quando ler a página da Sefaz | Depois (especificação); já, no RJ (comparação) | Recomendação: já, no celular e no RJ, com notas reais. Decisão de Enzo (2.4) |

## 7. O que já funciona e deve ficar

- "Anotar gasto" a 2 toques, visível sem rolar no uso normal (y 408 a 460 em 320, 360 e 390 de largura), e um só formulário para todas as portas de gasto.
- "Já paguei" na linha da conta a vencer: 3 toques, com o primeiro botão visível sem rolar.
- "Organizar" em Movimentos, com valores nas legendas ("R$ 650,00 em aberto neste mês · 1 vencida").
- "Anotar conta a pagar" com "Com que frequência?" no topo: quem pensa em conta chega a gasto fixo, parcelamento e conta do ano sem trocar de tela.
- Calculadoras na hora da decisão (parcelamento, financiamento, conta vencida, conta do ano) e "O que é isso?" com "Voltar à tarefa" sem perder o preenchimento.
- Rodapé fixo com "Salvar" nos formulários, sempre acima do teclado.
- A barra de abas com ícone e texto, alvos de 56 px e nenhuma ação dentro dela.
- A volta depois de semanas como faixa no Resumo, sem tela que abre sozinha nem notificação, e com linguagem sem culpa.

## 8. Tabela final

Toques a partir do Resumo do mês atual, sem contar digitação. "+ rolagem": o alvo fica abaixo da barra de abas em 360 × 640. Os itens marcados com B1 a B6 dependem da aprovação da seção 5.

| Tarefa | Onde fica hoje | Onde deve ficar | Toques hoje / depois |
|---|---|---|---|
| Anotar gasto (uso normal) | Resumo, logo depois do cabeçalho azul | Igual | 2 / 2 |
| Anotar gasto (conta nova ou volta depois de semanas) | Resumo, abaixo do card ou da faixa (y 834 ou 730) | Logo depois do cabeçalho, em todos os estados (B1) | 2 + rolagem / 2 |
| Escanear nota fiscal | Não existe | Primeira linha de "Anotar gasto"; atalho do ícone na web | não existe / 3 (2 pelo atalho), + 1 na primeira permissão |
| Ler a nota em PDF (compra on-line) | Não existe | Tela da câmera, "Escolher o PDF da nota" | não existe / 5 |
| Anotar compra no cartão | Desenho sem lugar definido | "Como você pagou?" logo depois do Valor | não existe / 3 |
| Registrar recebimento | Movimentos; composição de Recebido só quando vazia | Igual, com o botão sempre na composição e a troca dentro de "Anotar gasto" | 3 / 3 |
| Ver as contas a pagar | Toque no card "Ainda a pagar", sem texto de ação | O mesmo card com "Ver contas" (B2) | 1 / 1 |
| Ver as contas de agora depois de olhar outro mês | Contas a pagar abre no mês olhado, sem seletor | Seletor de mês e "Voltar para outubro de 2026" no topo | 2 a 4 / 2 |
| Pagar conta a vencer | Contas a pagar, "Já paguei" na linha | Igual | 3 / 3 |
| Pagar conta vencida (uma só) | Detalhe da conta, "Marcar como paga" | "Revisar vencidas" já com 1 vencida; "Já paguei" também no detalhe | 4 / 3 |
| Pagar fatura do cartão | Desenho: Movimentos › Cartões › cartão › fatura | Também na linha da fatura em Contas a pagar, "Pagar fatura" | 6 / 3 |
| Anotar conta a pagar | Link no card "Ainda a pagar" (y 626) | Igual | 2 + rolagem / 2 + rolagem |
| Cadastrar gasto fixo | "Anotar conta a pagar" › "Todo mês"; ou Movimentos › Gastos fixos | Igual | 3 / 3 |
| Cadastrar conta do ano (IPVA, IPTU) | Movimentos › Gastos fixos › rolar até "Nova conta do ano" | "Nova conta do ano" no topo da lista | 5 / 4 (3 pelo Resumo, com "Todo ano") |
| Ver para onde foi o dinheiro (Por categoria) | Toque em "Pago" no Resumo, sem sinal; nenhum caminho em Movimentos | "›" em "Pago" (B2) e card "Pago em outubro" de Movimentos abrindo já em "Por categoria" | 2 (escondido) / 2 |
| Voltar ao Resumo depois de salvar um gasto | Detalhe, "Ver resumo do mês" no fim (y 854) | Logo abaixo da faixa "Gasto salvo" | 1 + rolagem / 1 |
| Anotar ou ler outra nota em seguida | Detalhe, "Anotar outro gasto" no limite (y 598) | Logo abaixo da faixa; "Ler outra nota" quando veio de nota | 1 / 1 |
| Atualizar os meses depois de semanas | Faixa (botões em y 586 e 646) › `/retomar` › "Atualizar agora" no fim (y 1388) | Faixa logo depois de "Anotar gasto" (B1); rodapé fixo em `/retomar` | 2 + 2 rolagens / 2 + rolagem curta |
| Ligar lembretes de vencimento | Desenho: avatar › rolar até o 4º card de Conta | Linha "Ligar" em Contas a pagar; "Lembretes" logo depois do perfil em Conta | 2 + rolagem / 2 (mais a permissão) |
| Ocultar valores e pedir biometria | Desenho: avatar › rolar em Conta | "Privacidade neste aparelho" logo depois do perfil; olho no cabeçalho (B4) | 2 + rolagem / 2 (1 com o olho) |
| Ver a renda comprometida | Desenho: linha no meio do card "Ainda a pagar" | Linha no fim do card (B3) e links em Gastos fixos, Contas a pagar e Metas | 1 + rolagem / 1 + rolagem (3 por Movimentos › Gastos fixos) |
| Responder "Você consegue guardar algum valor por mês?" | Desenho: topo de Metas; depois de "Agora não", nenhuma porta por 30 dias | Topo de Metas, compacto; "Planejar quanto guardar" no card da Reserva | 2 / 2 (sempre disponível) |
| Calcular e criar a reserva | Hoje: Metas › rolar › calculadora; desenho: abaixo da pergunta | Card da Reserva logo abaixo da pergunta, visível em 360 × 640 | 2 + rolagem / 2 |
| Simular um plano | Desenho: Metas (abaixo da dobra) e Aprender (y 3573); fora de Calculadoras | Metas, card "Fazer as contas"; também em Calculadoras | 2 + rolagem / 2 (3 por Calculadoras) |
| Calculadoras | Movimentos › "Organizar" (y 648); Metas; Aprender; atalho do ícone | Igual nas três abas; o atalho do ícone vira "Escanear nota fiscal" | 2 + rolagem / 2 + rolagem |
| Dúvidas frequentes | Fim de Aprender (y 4062) | Atalho logo abaixo da busca | 2 + rolagem longa / 2 |
| Achar uma função pelo nome | A busca de Aprender só acha temas | Grupo "No app" nos resultados da busca | sem caminho / 3 |
| Voltar ao Pessoal depois de tocar em Família | Seletor no topo | Também "Voltar para Pessoal" no estado vazio (B6) | 1 / 1 |

## 9. Ordem sugerida

1. **Agora, junto com os ciclos em construção:** A1 e A2 (nota e forma de pagamento, depois da resposta de Enzo em 2.4), A5 (mês certo em Contas a pagar), A17 a A20 (Metas e simulador, antes de construir as telas), A7 e A23 (lembretes e Conta, Ciclo A2), A8, A14 e A3.
2. **Logo depois:** A6, A10, A21, A22, A24, A25, A9, A11, A15, e os de prioridade baixa (A4, A12, A13, A16).
3. **Com a aprovação de Enzo:** B1 e B2 juntos, depois de o protótipo passar pelo teste com 5 pessoas; B3 com o Ciclo B; B4 com o Ciclo A2; B5 com o Ciclo C; B6 a qualquer momento.
4. **Ao registrar:** D-038 (nota, com a resposta de 2.4), ajustes de texto em D-030(3), D-031(2), D-033(1) e (3) e D-035(10) (atalho do ícone), e a atualização de `docs/08` §4.

## Correções do crítico (aplicar antes de executar)

- §2.4, pergunta para Enzo com fato errado: a opção 2 diz que a leitura traz "só a loja e o mês", mas o QR e a chave trazem o CNPJ, e não o nome da loja (spec8_nota.md, campos da chave; spec9 §2.1, descrição "Compra (CNPJ ...)"). O nome só aparece se a mesma loja já foi anotada. Texto corrigido: "Na maioria dos cupons, o código traz só o mês e o CNPJ da loja. Para preencher nome da loja, valor e dia, o app precisa abrir a página da Sefaz-RJ no celular. Começamos já com isso (mais prazo, só RJ, só celular) ou primeiro sem isso, com a pessoa digitando valor, dia e nome?"
- §2.4 pode estar perguntando de novo algo que Enzo já respondeu. Em spec9 está registrado: "Vamos para a Fase 1 e a seguinte, pois são igualmente importante". Em spec8, a fase 2 era justamente ler a página da Sefaz, e a spec9 entendeu "a seguinte" como o PDF. A proposta deve mostrar essa ambiguidade e pedir uma confirmação ("Quando você disse 'a seguinte', era ler a página da Sefaz ou o PDF da compra on-line?"), em vez de uma pergunta nova.
- §2.4 apresenta como fato jurídico algo não conferido: "como pedem os Ajustes SINIEF 16 e 18/2018" vem de um trecho de busca, sem a página aberta (benchmark_notas.txt: "WebFetch não resolve DNS... tudo vem de trechos de resultado de busca"; "Captcha no RJ: não confirmado"). Escrever "a conferir" e não afirmar que o app cumpre a regra. A recomendação também omite custos que pesam no prazo: `react-native-webview` não está instalado (apps/app/package.json não tem camera, webview nem document-picker), a leitura só existe no celular e não dá para testar aqui (só há e2e web; o teste em aparelho de D-025 continua pendente), e a página pode mudar sem aviso. Proposta: fase 1 e PDF seguem sem depender da Sefaz; a leitura da Sefaz-RJ vira um teste com prazo fechado, com 5 a 10 cupons reais de Enzo.
- §2.2 deixa o PDF escondido e contraria "igualmente importante": ficando só dentro da tela da câmera, quem quer o PDF recebe primeiro o pedido de permissão da câmera. Se negar no iOS, a câmera só volta pelos Ajustes. Correção: no primeiro toque, uma folha curta, que já serve de explicação antes da permissão, com "Usar a câmera", "Escolher o PDF da nota" e "Colar o link ou a chave". Depois de usar a câmera uma vez, o toque abre a câmera direto. Na web sem câmera (computador do trabalho), o PDF vem primeiro. Recontar: PDF = Anotar gasto › Escanear › Escolher o PDF › arquivo › Salvar, mais a saída do app para baixar o PDF do e-mail no celular. Os 5 toques da tabela escondem esse passo.
- A compra no cartão depois de salvar não foi tratada, e o percurso com personas já mostrava a falha (walkthrough_personas.md, tarefas 14 e 15: "Pago não muda, compra some de Movimentos"). Pela spec9 §1.2, a compra no cartão nunca entra em Pago. Por isso A3 ("Ver resumo do mês" como botão principal) e o efeito de D-019 confundem: "salvei e não aparece". Correção: depois de uma compra no cartão, mostrar a faixa "Compra anotada na fatura de novembro do Cartão Exemplo. Entra em Pago quando a fatura for paga." com "Ver fatura" como botão principal. Em Movimentos, um filtro "No cartão" com as compras do mês fora dos totais. Acrescentar à tabela final a linha "Achar uma compra no cartão" (hoje, pelo desenho: Movimentos › Organizar › Cartões › cartão › fatura = 5 toques).
- A justificativa de B2 é falsa: "Tocar em 'Pago' é o único caminho para 'Por categoria' a partir do Resumo". O "Ver todos" de "Pagamentos do mês" abre `/composicao?tipo=pago`, com o mesmo segmento "Por categoria" (`(tabs)/index.tsx`, linha 161; mapa.md itens 4 e 5). Corrigir o texto de B2 e a linha "Ver para onde foi o dinheiro" da tabela: o caminho com nome existe, só fica abaixo da dobra (y 760).
- B2 muda a recomendação anterior sem dizer. Em docs/08 §2.4(a) e §7 item 4, Enzo recebeu "Ver todas" ao lado do título "Ainda a pagar", com a recomendação "(a) manter como está", e respondeu "Não entendi" (D-034(4)). A proposta precisa dizer que substitui essa pergunta, explicar por que a recomendação mudou e manter um só nome e um só lugar. Além disso, B2 e B3 juntos deixam o card com 4 alvos (valor › contas, "Anotar conta a pagar", "Ver contas" › contas outra vez, linha da renda), o oposto do motivo dado em B3. Em 360 px, com cerca de 296 px úteis e letra 1,3x, "Anotar conta a pagar" e "Ver contas" na mesma linha quebram. Correção: "Ver contas ›" na linha do título, no padrão do "Ver todos" de "Pagamentos do mês".
- B4 e A23 partem de telas desatualizadas. `header.tsx` (alterado às 19:11, depois da medição das 19:03) já tem o olho com `eyeFits()`, que o esconde quando não cabe, inclusive na demonstração em 360 px, como spec6 §1 já tinha decidido ("só se couber"). `conta.tsx` já tem `RemindersCard` e `PrivacyCard` depois de Segurança. Tirar B4 das aprovações (passa a ser só informação) e não mover o selo "Demonstração". Tratar A23 como mudança em tela pronta, não em desenho, e trocar "Desenho:" por "Hoje:" nas linhas de lembretes e ocultar valores. Medir de novo no build atual antes de enviar.
- B5 contraria uma resposta registrada de Enzo e não diz isso. Em spec7_guardar (D-036), a pergunta aparece "na aba Metas e como 4º passo do card Primeiros passos", e "O Resumo não ganha nada além desse passo". Ou B5 sai, ou entra como pedido explícito para reabrir essa resposta. A18 também amplia os lugares que Enzo aprovou (renda comprometida, composição da Diferença, fim de "Seus últimos meses") e deve dizer que amplia D-036. No fim da revisão de ausência, conferir se a pergunta não soa como cobrança (D-030(7)).
- A12 contraria o Primeiro Ciclo (l. 28: "Navegação: Resumo, Movimentações, Metas e Aprender... 'Movimentos'... rótulos compactos, com nome acessível completo"), que prevalece pelo CLAUDE.md. Manter o título "Movimentações" e os links como estão. Para cumprir a WCAG 2.5.3, seguir o padrão de D-031(1), em que o nome acessível contém o rótulo visível: em `tab-bar.tsx`, linha 18, usar algo como a11y "Movimentos: movimentações do mês".
- A20 renomeia uma calculadora que Enzo aprovou (D-034(2), lista de docs/08 §3.2, item 5 "Reserva para imprevistos") e textos já prontos no core (`goals.ts` RESERVE_NAME; `simulate.ts` calcLink "Simular com rendimento" e learnShortcut "Simular"). Não é só "proposta Claude": passa para a seção B ou sai. O conflito com spec2 §4.7 (seção "Calcular") já foi resolvido por spec6_notes §4, que prevalece. Juntar "Simular com rendimento" em "Simular um plano" apaga a informação de que o link leva os mesmos números com rendimento. Manter os dois nomes: um para as portas, outro para os links com valores.
- A19 ignora o texto já construído e testado: "Fora dos compromissos... Não é saldo: ainda precisa cobrir gastos do dia a dia" (`savings.ts`, linhas 494 e 551; `goals.ts`, linha 826). O "mês como ele é" também engana no dia 9, porque Pago ainda está parcial. Além disso, a média de 3 meses precisa tirar os meses "sem registro" (P-022; D-030 "meses com algo sem registro"). Correção: manter a referência com o aviso e acrescentar "Nos últimos 3 meses com recebimento e gasto anotados, a diferença foi em média R$ X" só quando houver esses 3 meses.
- Foco automático: a medida "só aparece até y 260 com o teclado" é estimativa (mapa.md #36, "estimado"; a medição web não tem teclado virtual). Mesmo assim, ela leva a uma mudança que deixa mais lenta a tarefa mais frequente para todo mundo (+1 toque em Descrição), e o método de contagem (§3, "sem contar o toque nos campos") esconde esse custo, mostrando "2 / 2" na tabela. Correção: manter `autoFocus` (record-form.tsx, linha 407) até medir num Android real. Se a linha sumir, usar um botão de 44 px "Nota", com ícone de QR, na própria linha de Descrição, visível com o teclado aberto. Contar esse toque na tabela.
- Falta somar a altura no formulário. Hoje, em 360 × 640, Data e Hoje/Ontem cabem acima do rodapé (431 a 560) e Categoria já fica escondida (604 em diante) (m360x640/report.txt, 08). A linha de escanear (cerca de 80 px com a legenda) mais "Como você pagou?" (dois chips que quebram em 296 px, cerca de 130 px) levam Data para cerca de 640 e Categoria para cerca de 810, atrás do rodapé em 576. Medir com protótipo. Para reduzir: "Como você pagou?" como segmento de uma linha (48 px) e linha de escanear de 48 px com legenda de uma linha.
- Contas a pagar também não teve a altura somada. A5 (seletor e "Voltar para outubro"), A6 ("Revisar vencidas" com 1 vencida), A7 (linha dos lembretes) e A8 (previsão) entram todos no bloco do topo. A proposta diz que o 1º "Já paguei" continua visível (hoje em 548 a 592, dobra 640), mas a soma dá cerca de +50 a 100 px, e ele vai para cerca de 600 a 690, cortado num Android real. Correção: seletor de mês na própria linha "Pessoal · outubro de 2026 ‹ ›", e linha dos lembretes depois da lista "A vencer", ou só depois de pagar a primeira conta.
- A5 não define o seletor: `a-pagar/index.tsx` usa o mês global (`useView`, linha 153), que é o mesmo do Resumo e de Movimentos. Um seletor global faz o Resumo mudar de mês na volta. Dizer se o seletor é local. Trocar também a evidência: pelo card, abrir setembro é coerente, porque o card já diz "Previsto para setembro de 2026". A falha real está nas entradas que falam de agora: o aviso do A2, que abre `/a-pagar`, o atalho web `/a-pagar` e a legenda de Organizar.
- B1: o número "o card compacto sozinho sobe 'Anotar gasto' para perto de y 512" não se sustenta. D-033(6) exige linhas de 56 px ou mais: 4 passos pendentes × 56 mais a linha do título dão cerca de 270 px, e "Anotar gasto" fica perto de 690 a 700, ainda abaixo da dobra (567). Refazer a conta. Esconder as legendas dos passos (só para leitor de tela) tira a única explicação de "gastos fixos" ("Aluguel, escola, luz, internet e parcelas") para quem tem pouca familiaridade com finanças: manter ao menos a legenda do próximo passo pendente. Separar B1 em duas partes: card compacto na seção A (é regra de D-033, proposta Claude, fora dos blocos de D-022) e mudança de ordem na seção B.
- B1 não mostra o custo para a conta nova: a primeira tela passa a mostrar só o cabeçalho, "Anotar gasto" e o título do card, e o guia aprovado por Enzo (D-033, "sim, pode seguir com isso") perde a vez para uma ação que o passo 3 do próprio card já oferece. Dizer esse custo para Enzo e incluir no teste a tarefa "Cadastre o seu aluguel" na conta nova.
- O teste com 5 pessoas não testa o que a própria proposta diz que vai testar: a seção 5 diz "rever só se o teste mostrar que não acham o recurso dentro de 'Anotar gasto'", mas não há tarefa de escanear. Acrescentar "Anote esta compra do mercado (cupom na mão)" e "Anote esta compra on-line (PDF)", feitas num celular real, porque a câmera não se testa na web do computador. Incluir ao menos 1 pessoa com letra ampliada e, se possível, 1 que use leitor de tela.
- A tabela conta "2 pelo atalho" para escanear, mas o atalho do ícone só funciona no app web instalado pelo Chrome, Edge ou Samsung Internet no Android, e não no iOS (D-035(10)). Os atalhos no app nativo ficaram fora (D-035(11)), e o `expo-quick-actions` é de terceiros, então "conferir a versão do SDK" não se aplica. Acrescentar a coluna "vale em: celular / web". Não trocar o atalho "Calculadoras" por um caminho de câmera enquanto a leitura de código no navegador não for conferida (spec8: "se o expo-camera suportar; senão, campo para colar").
- Código de boleto: "44 dígitos do código de barras" também é o tamanho da chave da NF-e. Para separar os dois, o leitor precisa olhar o tipo de código (ITF no boleto, Code 128 no DANFE) e as conferências: no boleto, moeda '9' na posição 4 e DV mod 11 na posição 5, e arrecadação começando com '8'; na chave, DV na posição 44 e UF válida. Há colisões reais nos primeiros dígitos: o Bradesco (237) começa com "23", que é o código do CE, e o C6 (336) começa com "33", que é o do RJ. Exigir teste no core. Conferir se o `itf14` do expo-camera lê ITF de 44 dígitos no iOS; se não ler, o aviso de boleto vale só para o "Colar".
- "Conta já anotada" pelo valor igual: o NFC-e vem do varejo, e contas como Internet, condomínio e aluguel não chegam como NFC-e. Depois de uma leitura, comparar pelo valor gera quase só alarme falso (mercado de R$ 150,00 contra Internet de R$ 150,00). Ampliar o aviso que já existe (descrição igual, `record-form.tsx`, linhas 336 a 342) para toda conta em aberto, sem comparar valor quando o gasto veio de uma nota.
- Exemplos e demonstração: a demonstração tem data fixa em 07/10/2026 (Primeiro Ciclo C002). Os exemplos "12/10/2026" são datas futuras e, na demonstração, dariam erro "Só datas até hoje". Usar 06/10/2026 e prever uma "Nota de exemplo" fictícia e identificada (QR sintético) para a demonstração a investidores e para o e2e (regra do CLAUDE.md). No modo "Dia" de "Seus últimos meses", falta a regra para nota de outro mês: "Esta nota é de agosto. Anotar em agosto?".
- "Como da última vez nesta loja" e "Nota já anotada" exigem uma leitura nova no banco (registros por CNPJ dentro de `receipt_key`, em todos os meses), com RLS e teste em `supabase/tests`, como pede o CLAUDE.md. Não basta "a regra mora no core". Dizer isso e somar ao prazo.
- A6 "um nome só" fica pela metade: trocar só o botão do detalhe deixa o título da tela "Marcar como paga" (`a-pagar/[id]/pagar.tsx`, linha 28) e o diálogo "Marcar Internet como paga hoje?" (D-035(5)). Ou muda tudo, ou fica "Já paguei" como botão e "Marcar como paga" como título. Deixar isso escrito.
- Números inconsistentes: a dobra medida é y 567 (360 × 640) e y 771 (390 × 844) (report.txt; fold.out), mas a proposta usa 576 e 780, que é o topo dos botões das abas. A16 diz 5 toques, e mapa.md #13 conta 4. Todas as medidas foram feitas com letra em 100%, mas o Primeiro Ciclo pede "texto ampliado sem corte", e o texto acompanha a letra do sistema (só 4 limites `maxFontSizeMultiplier`). Medir também com 1,3x e 2x (na web, zoom de 130% e 200%) antes de dizer que "Anotar gasto" fica visível no uso normal.
- "Ler outra nota" no lugar de "Anotar outro gasto" tira o caminho de digitar à mão logo depois. O formulário já abre com a linha de escanear, então basta manter "Anotar outro gasto" (um nome a menos, mesma quantidade de toques).
- Formato para Enzo: a última pergunta sobre o Resumo voltou com "Não entendi" (D-034(4)), e a seção 5 traz coordenadas em px e linhas de código. Fazer uma página para Enzo com imagens de antes e depois (geradas na demonstração com um parâmetro) e no máximo 3 perguntas de sim ou não: valor automático pela Sefaz-RJ; "Anotar gasto" sempre logo abaixo do azul; "Ver contas ›". O resto vai para um anexo técnico.
- A ordem sugerida diz "antes de virar tela", mas boa parte já existe. O core e o banco de B, C e D estão prontos (`savings.ts`, `goals.ts`, `simulate.ts`, `committed.ts`; migrações 0006 e 0007; testes 50, 60 e 65), e Conta e o cabeçalho do A2 já foram feitos. A17 a A20, A23 e B4 viram retrabalho com testes de texto. Marcar o tamanho de cada item (P, M, G) e o que já está feito, para Enzo ver o efeito no prazo.

## O que faltou na proposta

- Pessoa que compra no carnê ou crediário (comum no público): a NF-e da loja deveria levar a "Anotar conta a pagar › Parcelado" já preenchido. Exemplo de link no bloco da nota: "Comprou no carnê ou crediário? Anotar como parcelamento". Hoje a proposta só trata parcela no cartão (A15).
- Acessibilidade da câmera: anunciar "Nota lida" ao leitor de tela (região viva, como em D-035(2)), vibrar ao ler (expo-haptics já instalado), mostrar depois de cerca de 10 s "Não achou o código? Use a lanterna ou cole a chave", deixar as saídas alcançáveis pelo leitor de tela e respeitar "reduzir movimento". A tela da câmera faz parte do preenchimento, então precisa manter "Salvando em Pessoal" visível (D-018; C002, "contexto visível e fixo").
- Uso no computador (benefício da empresa, acesso no trabalho): a tela larga (docs/telas/18_resumo_736px.png) não foi avaliada. Ali o PDF deve vir antes da câmera (webcam) e o e-mail com o DANFE fica no próprio computador.
- Pessoa com renda frequente (autônoma, motorista de app): "Registrar recebimento" continua a 3 toques, só por Movimentos. A13 põe o botão no fim da composição de Recebido; ele deveria ficar no topo, para Resumo › Recebido › Registrar recebimento valer sem rolar.
- Tarefas que faltam na tabela final: editar ou excluir um registro; desfazer pagamento; corrigir uma nota lida errada depois de salvar; criar meta e registrar aporte (mapa #31); informar a renda de referência (mapa #27); cadastrar cartão; registrar estorno ou encargo da fatura; mudar de mês; "Quem vê estes dados?" e Acesso ao plano (confiança no benefício da empresa); alterar senha e sair.
- Família: `receipt_key` é única por contexto, então a mesma nota pode entrar no Pessoal e na Família (contaria duas vezes quando os convites entrarem). Definir a regra ou um aviso entre os contextos que a pessoa enxerga.
- Lista de pacotes nativos e esforço: expo-camera, expo-image-picker (galeria), expo-document-picker, biblioteca de PDF que rode no Hermes, react-native-webview (Sefaz dentro do app) e textos de permissão em pt-BR no app.json. Nenhum está instalado, todos pedem novo build de desenvolvimento e nada disso se verifica aqui além do "Colar" na web.
- Registrar em D-038 que o pedido de Enzo substitui "captura de documentos... são expansões" das Instruções v2.1 (l. 23), que P-013 cita.
- Leitura sem sinal no caixa: a chave se lê sem internet, mas salvar e ler a página da Sefaz não. Falta dizer o que acontece com o que foi preenchido (rascunho mantido, C002) e prever "Ler a página da Sefaz quando houver conexão".
- O bloqueio por biometria do A2 acrescenta um passo a quem escaneia no caixa (o percurso das personas, tarefa 13, já marcava "4 + biometria"), e isso não entra na contagem. iPhone: sem atalho web e sem atalhos nativos, escanear sempre leva 3 toques.
- Escolha de pagamento lembrada: para quem quase sempre usa cartão, "Dinheiro, débito ou Pix" marcado por padrão custa 1 toque por gasto. Avaliar lembrar a última escolha no aparelho.
