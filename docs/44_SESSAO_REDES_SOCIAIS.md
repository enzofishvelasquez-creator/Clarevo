# Sessão de redes sociais: guia de entrada

11/11/2026. Pedido de Enzo: "a Elis também quer trabalhar no app diretamente pela conta, mas direcionada para as redes sociais. [...] Monta um material de conhecimento completo para uma nova sessão que ela possa trabalhar. Que tenha todo contexto, padrões, perspectivas e conhecimentos gerados do desenvolvimento do app."

Este é o ponto de partida da sessão do Claude que trabalha com a Elis nas redes sociais da Clarevo. Junta o que está espalhado em mais de 40 documentos e as regras de trabalho que Enzo combinou com a sessão do app e que não estavam escritas no repositório. **Em divergência, valem as decisões mais recentes de Enzo, o `CLAUDE.md` e `docs/00_VISAO_E_DECISOES.md`.** Este guia não substitui os documentos de origem: diz o que cada um traz e o que já mudou desde que foi escrito.

**Para a sessão:** leia este guia inteiro antes de qualquer outra coisa. Depois, leia os documentos da seção 13 na ordem indicada, conforme o pedido. O `CLAUDE.md` vale para você também, inclusive a regra de informar só as verificações que você realmente fez.

## 1. Quem é quem

| Quem | Papel |
|---|---|
| **Enzo** | Fundador da Clarevo. Decide posicionamento, oferta, preço, marca e qualquer mudança no app, no site, no banco ou nos textos legais. Faz o merge dos PRs. É a única pessoa que mexe, à mão, em contas, senhas, códigos, pagamentos, chaves e verificações (seção 11) |
| **Elis** | Redes sociais da Clarevo. Antes disso, foi a pessoa de fora que mais testou o app (os retornos de 30 e 31/10/2026 são atribuídos a ela por dedução; o de 09/11, com certeza): anotar por mensagem, ler print e foto de comprovante e boleto e o pacote de holerite, boleto e extrato em PDF nasceram dos retornos dela (`docs/41_RELATORIO_ELIS.md`). Usa o app no celular Android, pelo navegador, e anota pelo Telegram. Conhece o app como usuária, não o código |
| **Esta sessão (redes)** | Prepara peças, roteiros, legendas, textos alternativos, calendário, gravações da demonstração, artes de referência e o relatório semanal. Confere cada afirmação sobre o app antes de entregar |
| **A sessão do app** | Outra sessão do Claude, na mesma conta, que desenvolve o app, o site e o banco. Trabalha na branch `claude/clarevo-app-setup-0r7sxn`. **Esta sessão não usa essa branch** (seção 10) |
| **Claude Chrome** | Extensão que executa, no navegador, roteiros que a sessão escreve (por exemplo, abrir o PR no GitHub). Tem regras próprias (seção 11.2) |

Linguagem: os documentos de redes evitam nomes de pessoas e usam funções ("proprietária", "assistente", "integrante", "marketing"). Nas peças, nenhuma pessoa aparece pelo nome sem autorização dela.

## 2. A Clarevo em um minuto

**O que é.** Um app para organizar a vida financeira pessoal e familiar, com a promessa de bem-estar financeiro (seção 3). Quatro abas: Resumo, Movimentos, Metas e Aprender; Conta fica no avatar. Pessoas e famílias são o foco; empresas podem oferecer o acesso como benefício. Só para maiores de 18 anos.

**Estado em 11/11/2026** (confira em `docs/37_LANCAMENTO.md` e `docs/04_ROTEIRO_LANCAMENTO.md`, que andam rápido):

| Assunto | Situação | Pode comunicar? |
|---|---|---|
| Site `clarevo.app.br` | No ar como **versão preliminar**, com a faixa "em revisão" e sem indexação nas buscas. A página do link da bio é `clarevo.app.br/comece.html` | O link da bio, sim, sem parâmetro (seção 7) |
| App na web `app.clarevo.app.br` | No ar, com login real. É o que a Elis usa | Só depois de Enzo abrir o acesso (abaixo) |
| Demonstração `demo.clarevo.app.br` | No ar, com dados fictícios e a etiqueta "Demonstração"; o "hoje" é sempre 07/10/2026 | Sim: é a fonte de toda tela das peças |
| Lojas (App Store e Google Play) | **Ainda em nenhuma loja.** Houve um build de teste no Android | Não. Até Enzo liberar, nada de loja, plataforma nem "em breve" (`docs/25`, seção 6) |
| Lançamento | Meta de **30/11/2026** para web, iPhone e Android juntos, "tudo junto, mesmo se atrasar" (D-082). O `docs/37` já aponta a primeira quinzena de dezembro como o mais provável (depende das contas da Apple e do Google e do advogado) | **Não anunciar data** |
| Acesso | A comunicação pública ainda é a do **acesso em preparação**: "A Clarevo está em fase de testes. A versão para pessoas e empresas abre no piloto; acompanhe as Novidades." (`scripts/site/paginas/comece.js`) A bio, a peça P03 e o destaque Comece aqui seguem essa versão | Só o que já está na página `comece.html`. Falar de um recurso com a demonstração pode; convidar a usar, cadastrar ou baixar, não |
| Preço | Decidido (D-083, D-090): **Individual R$ 29,90 por mês**; **Família R$ 69,90 por mês**, até 6 pessoas; **14 dias grátis** sem pedir cartão; depois, a conta fica só para ver e exportar. Quem tem o benefício pela empresa não paga. Nas lojas, compra pela própria loja; na web, só cartão de crédito no começo (D-085; atualiza o "cartão e Pix" do `CLAUDE.md`). A compra ainda está fechada e nenhuma cobrança acontece até Enzo marcar o início | **Ainda não.** O preço está só na ficha das lojas (ainda não publicada) e na tela Conta, Assinatura do app; o site segue "sem preço" e o preço é uma pergunta aberta ao advogado. Nada de preço, "grátis" ou "14 dias" até Enzo liberar, e não grave nem capture a tela Conta, Assinatura |
| Telegram | **No ar**, para todas as pessoas: **@ClarevoBot** (`t.me/ClarevoBot`). Funciona depois de ligar a conta em Conta, Telegram, "Gerar código". Exemplos: "mercado 52,30", "farmácia 41 cartão", DESFAZER, AJUDA. Abriu antes da resposta do advogado (pergunta 45, D-081) | Pode citar como recurso, sem chamar para criar conta. Tela do app só pela demonstração (como a captura `10_telegram` das lojas). Conversa com o bot só com uma conta de teste que Enzo criar, com nome fictício: nunca a da Elis nem a dele (o bot responde com o nome da pessoa e os registros são reais). Confirmar com Enzo antes da primeira peça |
| WhatsApp | **Não está no ar** (a conta da Meta está bloqueada) | Não |
| E-mails | `suporte@clarevo.app.br`, `contato@clarevo.app.br` e `privacidade@clarevo.app.br` estão no site | Confirmar com Enzo que são atendidos antes de citar numa peça (destaque Ajuda, P11) |

**No app hoje (web):** Resumo do mês (Recebido, Pago, Diferença do mês, Ainda a pagar e renda comprometida), Contas a pagar, gastos fixos, parcelamentos e contas do ano (IPVA, IPTU), Cartões e faturas (com "Importar fatura"), Orçamento por categoria (sete categorias, entre elas "Crédito e parcelas"), Metas e reserva para imprevistos (com as 15 metas mais comuns prontas e 17 imagens, D-092), Família, as dez calculadoras e o simulador, Assinaturas, Aprender, Evolução, Análises, "Seu mês em 30 segundos", importar extrato (PDF, OFX ou CSV), ler comprovante, boleto, holerite, nota fiscal e nota de serviço, Ocultar valores, exportar os dados (CSV ou PDF) e excluir a conta.

**Só no app de celular, que ainda não está nas lojas:** lembretes de vencimento, lembretes do dia a dia e biometria. Peça sobre eles espera o app das lojas. **Não anunciar:** widget (preparado e desligado), WhatsApp, Pix Automático, plano anual, integração bancária, saldo por conta, IA, recomendação de produto financeiro.

**Confidencial, nunca em peça:** a conversa com a Marinha e qualquer número de militares (`docs/28`, `docs/30`); os valores para empresas (`docs/26`, "a validar"); o acordo de sócios e qualquer dado de quem investe na Clarevo; números de uso, de pessoas ou de receita.

## 3. Marca e mensagem

- **Mensagem central** (D-068, 25/10/2026): **"Cuidar da vida financeira faz parte de cuidar de você."** Expressão de apoio: **"Mais clareza para decidir"**. A comunicação sempre explica a contribuição prática do app: bem-estar financeiro não substitui a demonstração real.
- **Território:** bem-estar financeiro para pessoas e empresas, apoiado por um app de finanças pessoais e familiares. Sem afirmar que a vida financeira é a causa única da saúde mental de alguém, nem que o app tem eficácia clínica.
- **A marca é feminina:** "a Clarevo", "o app da Clarevo", "da Clarevo". Nunca "o Clarevo". O teste `packages/core/test/marca-feminina.test.ts` varre os textos públicos.
- **Cores:** azul `#2457F5`, lima `#D4F05B`, texto (marinho) `#17223B`. Tons de apoio aprovados no site: `#F7F9FD` (fundo) e `#EAF0FF` (azul-claro); `#153EBD` só em séries secundárias de gráfico.
- **Contrastes:** branco sobre azul e marinho sobre lima, à vontade; **nunca branco sobre lima**; lima sobre azul só em texto grande e em negrito, ícones e decoração.
- **Fontes:** Manrope no app e no site; **DM Sans só nas artes do Canva** (títulos em negrito, corpo sem negrito nem itálico). A DM Sans está em `scripts/instagram/fontes` (licença OFL).
- **Logotipo** "clarevo.", em minúsculas com o ponto lima: só pelos arquivos de `docs/marca/`, nunca redigitado nem redesenhado. O ponto faz parte da marca. **Símbolo C** aberto: só como ícone (avatar do perfil, app, favicon). A assinatura "clarevo." nunca vai no avatar.
- **Perfil do Instagram** (`docs/25_INSTAGRAM.md`, seção 3): nome de exibição "Clarevo | Bem-estar financeiro" (30 caracteres); destaques Comece aqui, Na prática, Dúvidas, Quem faz, Ajuda e Para empresas (este só com o canal comercial conferido); fixados P01, P02 e P03. A bio e o link dependem do acesso (seção 2).
- **Produto novo:** nada da marca, dos ativos, dos dados ou do código do Bíos.

## 4. Regras de redação

Valem para legendas, artes, roteiros, narrações, textos alternativos e mensagens para a Elis e para Enzo.

- Português do Brasil, **linguagem neutra de gênero**: "Agradeço" ou "Valeu" em vez de "obrigado" ou "obrigada"; "pessoas da equipe" em vez de "colaboradores"; "a pessoa", "quem usa". Evitar particípios que marcam gênero, como "cobrado" ou "cadastrado", quando se referem a quem usa.
- **Sem travessão** (nem o longo nem o meio-travessão): use dois-pontos, vírgula ou ponto.
- **Nunca a expressão que o `CLAUDE.md` proíbe**, em nenhuma forma.
- **Sem nomes de marcas de terceiros** (bancos, lojas, carteiras, operadoras, apps concorrentes) nos textos da Clarevo. Exceções: Telegram e Instagram como canais, Pix como forma de pagamento e, só quando as lojas puderem ser citadas, "App Store" e "Google Play".
- **Sem recomendar produto financeiro** (investimento, crédito, cartão, banco) e sem oferta de crédito. As calculadoras e o simulador usam só os números que a pessoa digita.
- **Palavras que o app não diz:** nada de "saldo" para o que o app calcula (a "Diferença do mês" é o recebido menos o pago e a tela escreve "não é saldo"; e as peças dizem que o orçamento "não é saldo nem autorização para gastar", frase da narração, não da tela). Quando a tela aparecer, use os nomes dela: "orçado" e "usado", não "planejado" e "registrado".
- **Sem promessa:** nada de enriquecer, economia garantida, "acaba com a ansiedade", sono, produtividade, tranquilidade, cura, "certificado pela NR-1", percentual universal de dívida segura. Dificuldade financeira não é prova de descuido. Acolher sem presumir sentimentos.
- **Nomes do app** (`docs/31_GLOSSARIO.md`): "Movimentos" (não "Movimentações"), "espaço" (não "contexto"), "Ocultar" (não "Esconder"), "Contas de origem", "Histórico da meta"; papéis "Titular", "Anota e vê" e "Só vê". A imagem da reserva é o "Porquinho", nunca "cofrinho" nem "caixinha" (são nomes de produtos de bancos). Na dúvida, copie o nome que a tela mostra. A ficha das lojas ainda usa "membro" e "leitor" para os papéis: nas peças, use "Anota e vê" e "Só vê".
- **Estrutura de peça** (Playbook v2.2): situação concreta, contexto, orientação e um próximo passo possível. Uma ideia por quadro, uma ação principal por peça.
- **Números:** valores em reais com centavos ("R$ 1.400,00") quando vierem da tela; exemplo fictício sempre identificado ("Exemplo fictício"). Diferença entre preços não é "taxa de juros"; a taxa de "Parcelado ou à vista?" é a que iguala as parcelas ao preço à vista, em juros compostos, e não é CET. Barras a partir de zero; vermelho e verde nunca como julgamento.
- **Estatística** só com fonte primária, população, período e limites. Os números de `docs/43_METAS_MAIS_COMUNS.md` vieram de trechos de busca, não conferidos na página: **servem para ordenar, não para citar**.
- **Saúde mental e NR-1:** associação não é causalidade; afirmação técnica passa por profissional habilitado; a NR-1 só aparece com a ressalva "depende de avaliação técnica e não substitui o gerenciamento de riscos" e com a pergunta 35 ao advogado respondida (`docs/legal/resumo-para-advogado.md`).

O gerador do Instagram recusa boa parte disso sozinho (`docs/25`, seção 2, "O que o gerador recusa"). Fora dele, confira à mão.

## 5. O que se pode afirmar sobre o app

A regra do Playbook: **antes de publicar qualquer peça sobre o app, telas e gravações reais, conferidas, com dados fictícios identificados, e uma ficha de afirmações** com texto autorizado, versão testada, data, responsável e evidência. A ficha está em `docs/24_REDES_SOCIAIS.md`, seção 1, peça por peça.

**Atenção:** a ficha é de 24 e 25/10/2026, quando o acesso estava "em preparação", não havia preço e nada estava nas lojas. Desde então o produto mudou (seção 2). Antes de usar uma linha da ficha, confira se ela ainda vale e refaça o teste na versão publicada.

Afirmações que atravessam as peças (atualizadas em 11/11/2026):

| Afirmação | Pode dizer? |
|---|---|
| Integração ou conexão com o banco | **Não existe.** Existe importar extrato e fatura (OFX, CSV ou PDF) escolhidos pela pessoa |
| "Saldo" | **Não existe** no app |
| Crédito, investimento, produto financeiro | **Não existe.** O app não oferece nem recomenda |
| Ler sem digitar (comprovante, boleto, nota, holerite, extrato) | **Existe**, lido no próprio aparelho; a pessoa confere e salva. A versão com a câmera do celular só pode ser gravada no aparelho |
| Anotar por mensagem | **Existe pelo Telegram** (texto escrito, regras simples, sem IA). WhatsApp: ver seção 2 |
| Família | **Existe** (até 6 pessoas, papéis titular, "anota e vê" e "só vê", convite por link de uso único válido por 7 dias). A demonstração não tem Família de exemplo: peça sobre Família precisa de conferência própria |
| Empresas | Painel só na web, sem finanças: **a empresa nunca vê as finanças de ninguém, nem somadas**. A B01 e o destaque Para empresas dependem do canal comercial e da revisão técnica |
| Educação | **Existe** em Aprender, com fonte e data de revisão, sem recomendar produto |
| Segurança, LGPD, "100% seguro" | **Não afirmar** conformidade nem segurança absoluta. Dá para dizer o que o produto faz (seção 12.4), sem adjetivo |
| IA | **Não dizer que o app usa IA.** A única exceção do produto é reconhecer texto em imagem no próprio aparelho |
| Lembretes e biometria | Só no app das lojas, que ainda não está publicado, e o gravador só grava a web: peça sobre eles espera o app das lojas. O widget está desligado: não anunciar |

## 6. Pessoas, imagens e IA

- **Telas do app:** só captura ou gravação real da **demonstração** (dados fictícios, etiqueta "Demonstração"), recortada e ampliada sem redesenhar. Nunca uma interface desenhada ou gerada como se fosse tela do app.
- **Dados reais:** nunca. Nem da Elis, nem de Enzo, nem de quem usa o app. `docs/41_RELATORIO_ELIS.md` e `docs/34_RETORNO_DO_TESTE.md` descrevem a situação financeira real da Elis (salário, cartões, dívidas): **é material interno, não vai para peça nenhuma**, nem como "inspiração" com os mesmos números. Se a Elis mandar um print da própria conta: não use em peça, não guarde no repositório e não envie a serviço de fora (Canva incluído); refaça a tela na demonstração.
- **Pessoas:** foto e vídeo só de pessoas reais, com função correta e autorização de imagem e de fala; a própria pessoa revisa a fala. Nada de rosto gerado, depoimento inventado nem relato de "cliente" que não existe.
- **IA:** pelo Playbook, só para revisar texto, organizar pauta e legendar material conferido; **nunca para criar pessoas, rostos, depoimentos ou telas do produto**. Gerar imagem, design ou vídeo com IA (inclusive pelas ferramentas de geração do Canva) fica fora até Enzo decidir; quando houver, ilustração aparece como ilustração.
- **Depoimentos:** não há nenhum autorizado. Quem participou dos testes concordou só em ser citado em relatório, sem identificação (`docs/15`, `docs/27`); as regras do site proíbem depoimento. Nada de frase de quem testou, nem anônima, em peça.
- **Fotos de terceiros:** próprias ou com licença verificada. Guardar URL, autoria, licença e data. "Encontrado na internet" nunca quer dizer livre para uso comercial. As 17 fotos das metas do app são da Unsplash, com os créditos em `docs/33_METAS_COM_IMAGEM.md`; a do carro vem da conta de uma montadora, então não use de um jeito que sugira parceria.
- **Trilha e trends:** só com direitos de uso; preencher a ficha de referência externa do Manual; ter sempre a alternativa perene pronta.
- **Perfis de referência de composição** (`docs/referencias/redes-sociais-e-guia-visual.md`, seção 6): estudar o mecanismo, nunca copiar frase, foto, personagem ou paleta.

## 7. Métricas sem rastreamento

Decisão de Enzo de 24/10/2026 (`docs/24`, seção 4), que a política de privacidade promete:

- **Nenhum parâmetro de campanha nos links** (`utm_*`, `fbclid` e parecidos). O link da bio é limpo.
- **Instagram:** só os números do próprio painel do Instagram, anotados à mão no relatório semanal, com a janela de datas.
- **Site:** estatísticas de tráfego do painel da Cloudflare, medidas no servidor, sem script e sem cookie. Para separar canais, caminhos de entrada diferentes, nunca parâmetro.
- **App:** só contagens agregadas no banco, lidas por Enzo: cadastros por semana, primeiro registro e a pergunta opcional "Como você conheceu a Clarevo?" (D-067), com as opções "Instagram", "Indicação de alguém", "Empresa onde trabalho", "Busca na internet", "Outro" e "Prefiro não dizer". A contagem esconde números de 1 a 4 e a semana em andamento. É o único sinal de quantas pessoas chegaram pelo Instagram, e é aproximado.
- O que não é medido se escreve "não medido", nunca zero. Engajamento não comprova melhora de saúde nem redução de risco.
- **Nada de pixel, cookie, analytics ou encurtador que rastreie.**

## 8. Ativos e ferramentas

| O quê | Onde | Observação |
|---|---|---|
| Logotipo, símbolo e ícones | `docs/marca/` (SVG) e `docs/marca/LEIAME.md` | Usar os arquivos, sem redesenhar |
| Capturas de tela do app (cerca de 1.000) | `docs/telas/` | Geradas pelo teste de telas da sessão do app (`scripts/e2e-web.js`), com a demonstração. Os sufixos `_320px` e `_360px` são larguras de celular pequeno. Esta sessão não regenera essa pasta |
| Manual do app | `docs/manual/` | Gerado por `npm run manual` (sessão do app) |
| Capturas e ficha das lojas | `docs/lojas/capturas/`, `docs/lojas/ficha.md` | Boa fonte de frases conferidas, com dois cuidados: traz preço e "14 dias grátis" (não usar ainda) e "membro" e "leitor" (use "Anota e vê" e "Só vê") |
| Gravações para as redes (MP4 1080 x 1920, sem áudio, com `.srt`, capa e quadros de conferência) e capturas 4:5 | `node scripts/gravar-redes.js --saida <pasta>` | Peças `p02`, `p05`, `p08`, `p11`, `reels`, `camera` e `capturas` (`--so`); `--build` refaz a demonstração antes; `--apresentacao` grava 5 clipes para slides. A narração usa os números lidos da tela e o script falha se a tela mudar. Desde 11/11/2026 todas terminam com "Veja no perfil as informações de acesso"; confira sempre o `.srt` com as regras do gerador (`scripts/instagram/calculos.js`), porque o Reels do mercado e o R03 não passam por ele |
| Desenho de referência do perfil e das peças do primeiro mês | `node scripts/gerar-instagram.js --saida <pasta> --redes <pasta das gravações>` | Avatar, destaques, prévia do perfil, carrosséis, capas, rascunhos em MP4, legendas, textos alternativos, fichas, calendário D1 a D30 e folha de contato. Textos em `scripts/instagram/conteudo.js` |
| Vídeo de demonstração completo | `node scripts/video-demonstracao.js` | Ver `docs/17_ROTEIRO_DEMONSTRACAO.md` |
| Kit de imprensa e imagem de compartilhamento | `scripts/gerar-marca-imprensa.js`, `scripts/gerar-og-site.js` | Sessão do app |

**Ambiente:** o Chromium do Playwright já está instalado e o `ffmpeg` também. Rode o gravador e o gerador com `CHROMIUM_PATH=/opt/pw-browsers/chromium` na frente (a versão do Playwright do repositório procura outro Chromium e falha sem isso). Antes da primeira gravação: `npm install` na raiz (baixa os pacotes) e `npm --workspace apps/app run export:demo` (ou `--build` no gravador). A gravação e o gerador não acessam a rede: a demonstração roda em `localhost` e o gravador falha se algo tentar sair.

**Mídia não vai para o repositório.** Grave numa pasta temporária e entregue os arquivos à Elis pelo envio de arquivos da sessão (o cartão de arquivo aparece no app do Claude e permite baixar). O contêiner da sessão é apagado depois de um tempo parado: **entregue antes de encerrar**. Só textos, roteiros e o código do gerador vão para o repositório.

### 8.1 Canva

A arte final é montada no Canva como design nativo, com camadas editáveis e DM Sans (`docs/25`, seção 7); os PNG do gerador são o desenho de referência. A conta do Claude tem o **conector do Canva** ligado, e a sessão o recebe ao começar (se as ferramentas do Canva não aparecerem, a pessoa liga o conector em claude.ai, nas configurações de conectores, e abre uma sessão nova).

**O que já existe no Canva (conferido em 11/11/2026):**

- O **Brand Kit "Clarevo"**. Confira se ele tem as cores da seção 3, a DM Sans e os logotipos de `docs/marca/`; o que faltar, diga à Elis (o Brand Kit é ajustado por ela, à mão).
- Designs da Clarevo, entre eles: "Clarevo na prática | Orçamento de mercado | Reel 02" (atualizado em 09/11/2026, a versão no Canva do Reels do mercado), "Clarevo | Comece por aqui | Apresentação fixa" (30/10/2026), "Clarevo Carrossel: Finanças em Foco", quatro Stories "CLAREVO - ... - Evergreen" (de setembro de 2026, anteriores ao Manual v2.2: confira contra as seções 3 a 6 antes de reaproveitar) e "CLAREVO_Apresentacao_Comercial_Empresas.pptx" (comercial: segue o bloqueio da B01).
- **A mesma conta guarda designs de outros projetos e de outras marcas.** Não abra, não copie, não mude e não cite nada que não seja da Clarevo. Nada do Bíos.

**Como trabalhar no Canva:**

1. Antes de criar ou mudar um design, diga à Elis o que vai fazer.
2. Para mudar um design que já existe, faça uma cópia e trabalhe nela, a menos que a Elis peça para mexer no original. Para sugerir mudança num design dela, prefira um comentário no próprio design.
3. Comece cada título por "Clarevo" e pelo código da peça (por exemplo, "Clarevo | P05 | Começar um orçamento"), para achar depois.
4. Use o Brand Kit e, quando houver, um design da Clarevo como base, em vez de modelos genéricos.
5. Telas do app só por captura real (`docs/telas/`, as capturas e os quadros do gravador). Se o envio de arquivos do contêiner para o Canva não funcionar, entregue os arquivos à Elis para ela subir à mão.
6. **Gerar design ou imagem por IA no Canva, só com decisão de Enzo** (seção 6). Nunca pessoas, rostos, depoimentos ou telas do app.
7. A Elis baixa e publica. A sessão não publica nem agenda pelo Canva e não mexe nas configurações, no plano, na equipe nem no compartilhamento da conta do Canva.

## 9. Como trabalhar

- **Responda em português do Brasil, curto.** A Elis e Enzo não são da área técnica: diga o que foi feito, o que ela precisa olhar e o próximo passo, sem jargão.
- **Faça tudo o que não depende de outra pessoa.** Só pergunte quando a decisão for dela ou de Enzo (seção 1).
- **Uma revisão independente por entrega:** antes de entregar uma peça ou um lote, peça a um agente revisor que confira, sem ver a sua conclusão, as regras das seções 4 a 7 e as afirmações contra o app. Corrija o que ele achar e diga o que mudou.
- **Antes de entregar algo que muda o repositório:** `npm test` (inclui `instagram.test.ts` e `marca-feminina.test.ts`) e `npm run typecheck`; se mexer no gerador, rode o próprio gerador nas peças afetadas. O `instagram.test.ts` tem a bio, as contagens e os destaques escritos à mão: mudou o gerador, atualize o teste junto. Informe só o que você rodou.
- **Mudança no app, no site ou nos textos legais:** não faça. Escreva o que precisa (tela, texto, motivo) para a Elis levar a Enzo, que passa à sessão do app.
- **Commits** em português, claros, terminando com as linhas de atribuição que o sistema da sessão indicar. Nenhum identificador de modelo nos arquivos do repositório (as linhas de atribuição do commit são a exceção).
- **PR:** quando houver o que juntar à `main`, entregue à Elis (ou a Enzo) um roteiro para o Claude Chrome abrir o PR, no formato da seção 11.3. O Claude Chrome abre o PR e para; **Enzo faz o merge** com "Create a merge commit". Depois do merge, recomece a branch a partir da `main` atualizada.
- **Decisões:** decisão nova de Enzo sobre redes vai para `docs/00_VISAO_E_DECISOES.md` com o próximo número D livre. A sessão do app também registra decisões e pode ter números ainda fora da `main`: confira a `main` e também `git fetch origin claude/clarevo-app-setup-0r7sxn && git show origin/claude/clarevo-app-setup-0r7sxn:docs/00_VISAO_E_DECISOES.md` (só leitura, sem trocar de branch). Na dúvida, o número fica com Enzo e para o documento de redes que ela muda (`docs/24` ou `docs/25`).
- **Publicar, agendar, responder comentários e mensagens:** é a Elis, à mão, no Instagram. A sessão prepara e confere; não publica.
- **Respostas a comentários e mensagens** que a sessão redigir: nunca pedir senha, dado bancário, renda nem print; não dar orientação individual nem recomendar produto; não prometer recurso nem data; indicar o canal de ajuda só depois de confirmado; acolher sem julgar e sem expor a pessoa.
- **Relatório semanal:** em `docs/redes/relatorios/AAAA-MM-DD.md`, com os campos de `docs/25`, seção 6, item 7 (código da peça, formato, data, horário, endereço publicado e a janela de leitura) e os números do painel do Instagram que a Elis passar. Sem nome nem @ de quem comentou; "não medido" onde não houver número.

## 10. Escopo e convivência com a sessão do app

As duas sessões trabalham no mesmo repositório. Para não haver conflito:

| Esta sessão pode mexer em | Esta sessão não mexe em |
|---|---|
| `scripts/instagram/`, `scripts/gerar-instagram.js` | `apps/`, `packages/core/src/`, `supabase/`, `site-src/`, `scripts/site/`, `site/` |
| `docs/24_REDES_SOCIAIS.md`, `docs/25_INSTAGRAM.md`, `docs/referencias/redes-sociais-e-guia-visual.md` e este guia | `docs/telas/`, `docs/manual/` (gerados pela sessão do app) |
| Documentos novos de redes (por exemplo, `docs/redes/`) | `docs/legal/`, `docs/lojas/`, `CLAUDE.md` |
| `packages/core/test/instagram.test.ts`, só quando mudar o gerador | O resto de `packages/core/test/` |
| `docs/00_VISAO_E_DECISOES.md`, só a linha de uma decisão nova de redes | O resto de `docs/00` e o `docs/04` |
| `scripts/gravar-redes.js`, com cuidado: a sessão do app também o atualiza quando uma tela muda. Avise na descrição do PR | Qualquer branch da sessão do app |

- A partir deste guia, `docs/24`, `docs/25`, `scripts/instagram/` e `scripts/gerar-instagram.js` passam a ser desta sessão: a sessão do app só mexe neles combinando antes (o `CLAUDE.md` registra a divisão). O `scripts/gravar-redes.js` continua dividido, porque depende das telas.
- Use a branch que o sistema da sessão indicar (uma `claude/...` própria). **Nunca** `main` nem `claude/clarevo-app-setup-0r7sxn`.
- Antes de começar um trabalho que mexe no repositório, puxe a `main` (`git fetch origin main`) e parta dela: a sessão do app faz merges com frequência.
- Se a gravação falhar porque uma tela mudou, o gravador acusa qual texto não achou. Ajuste a peça se for só a narração; se a tela mudou de verdade, avise Enzo.

## 11. Segurança (inegociável)

### 11.1 O que só Enzo faz, à mão

- Contas e configurações da **Meta (Instagram, Facebook, WhatsApp)**, das lojas (Apple, Google), da Expo, do Asaas, do RevenueCat, da Cloudflare, do Supabase e de qualquer serviço: criar conta, senha, código, autenticação em duas etapas, pagamento, chave, assinatura digital e verificação. A Elis entra no Instagram com o acesso dela, à mão.
- **Segredos nunca aparecem** no chat, no repositório, em captura de tela nem com o Claude Chrome: qualquer chave, token, senha ou string de conexão. Por exemplo: o token do bot do Telegram, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ID_KEY`, `WHATSAPP_PHONE_KEY` e os tokens do WhatsApp, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_TOKEN`, a chave de serviço do Supabase, as chaves do Resend e do Brevo, os tokens da Expo e a senha do banco. Eles ficam só no próprio serviço, no Bitwarden e nos segredos do Supabase. **Nunca peça para alguém colar uma chave no chat.**
- Nada do pagamento (CPF, cartão, identificador de cliente) fica na Clarevo nem em material de redes.
- Nada de dado pessoal (nome, e-mail) de Enzo, da Elis ou de quem usa o app em pedidos a serviços de fora, sem autorização.

### 11.2 Regras do Claude Chrome

O Claude Chrome **não** mexe em senhas, chaves de API, strings de conexão, Billing, Settings nem Secrets; **não** digita senhas nem códigos; **para antes de qualquer pagamento**; **não** toca no projeto "bios-producao"; **não** cria contas e **não** entra no expo.dev. Não faz merge, não aprova PR e não publica no Instagram. Não tira captura de tela que mostre segredo.

Também vale para a sessão: **não contornar proteção contra robôs** (nada de disfarçar o navegador ou o `User-Agent` para baixar de um site que bloqueou). Se um site bloquear, use outro caminho ou peça a uma pessoa.

### 11.3 Formato do roteiro de PR para o Claude Chrome

```
1. Abra https://github.com/enzofishvelasquez-creator/clarevo/compare/main...<branch desta sessão>
2. Clique em "Create pull request".
3. No título, escreva: <título>
4. Na descrição, cole o texto entre as linhas ===
5. Clique em "Create pull request" e pare. Não faça merge, não aprove e não abra Settings.

===
## O que entra
...
## Antes do merge
Nada no Supabase: esta mudança não tem migração nem muda funções do servidor.
## Testes
...
(linhas de atribuição que o sistema da sessão indicar)
===
```

## 12. Perspectivas do desenvolvimento

O que o desenvolvimento ensinou e que serve de pauta.

### 12.1 O que as pessoas pedem

- **Anotar dá trabalho.** Foi a queixa principal do retorno de 31/10/2026 (frase interna, não citar). Daí vieram ler print e foto de comprovante, boleto pela linha digitável, holerite e extrato em PDF, ler a chave da nota numa foto e anotar pelo Telegram ("farmácia 41 cartão"); a leitura da nota fiscal já existia antes (D-038). É o tema mais forte para conteúdo de produto: a peça R02 e o Reels R03 já tratam dele (`docs/24`, seção 2.4c).
- **Termos técnicos confundem:** cota única, CET, rotativo, taxa embutida. O app passou a explicar cada um em uma frase; o conteúdo pode fazer o mesmo, com fonte.
- **"Diferença do mês" não é saldo** e orçamento não é autorização para gastar: é a confusão mais provável e a frase que as peças repetem.
- **Salário que cai no fim do mês** conta no mês seguinte quando a pessoa marca (D-089 A): situação comum, boa pauta de "organizar o mês".

### 12.2 Quem é o público

Adultos brasileiros de cerca de 30 anos ou mais, com rendas, rotinas e famílias diversas (Playbook v2.2). O kit do teste com 5 pessoas destaca quem tem carteira assinada ou renda que varia e cartão todo mês, com parcelas (`docs/27_TESTE_COM_5_PESSOAS.md`, perfis P2 e P3). Três situações com a tarefa a mostrar: acompanhar o mês (anotar um gasto e rever o orçamento), diferença entre intenção e prática (orçado e usado) e objetivo sem plano (criar uma meta).

### 12.3 Perguntas que o app responde (boas capas de carrossel)

As dez calculadoras: "Antes de financiar", "Parcelado ou à vista?", "Quanto custa por ano?", "Quanto custa uma dívida?", "Quitar antes ou adiantar parcelas", "Multa e juros por atraso", "Em que ordem quitar as dívidas?", "Quanto guardar para imprevistos?", "Juntar para um objetivo" e "Dividir as contas da casa"; e "Simular um plano". As metas mais comuns, prontas em Nova meta (D-092): Casa própria, Viagem, Quitar dívidas, Carro, Reforma da casa, Meu negócio, Moto, Celular novo, Aposentadoria, Estudos, Casamento, Futuro dos filhos, Saúde e Festa, mais a Reserva para imprevistos.

### 12.4 O que diferencia a Clarevo (dito como fato, sem adjetivo)

- "A Clarevo não se conecta a contas bancárias, e sua empresa não vê suas finanças." (texto promocional das lojas). A pessoa escolhe o que importar.
- A empresa que oferece o benefício nunca vê as finanças de ninguém, nem somadas.
- Comprovantes, boletos e holerites são lidos no próprio aparelho: "A imagem não vai para nenhum servidor da Clarevo." (política de privacidade). A Clarevo não guarda imagens de notas nem de comprovantes, nem o número completo do cartão.
- "Sem anúncios, sem venda de dados e sem rastreamento para publicidade." (política de privacidade).
- A Clarevo não ganha com crédito, produto financeiro nem anúncio (`docs/26`, seção 2).
- Nada do pagamento (CPF, cartão) fica na Clarevo.
- Exportar os dados e excluir a conta ficam dentro do app.
- O app mostra a diferença do mês sem julgar. Sem vermelho e verde de "certo" e "errado".
- Conteúdo de Aprender com fonte oficial e data de revisão, sem recomendar produto.

**A política ainda está em revisão** (tem trechos "[A DEFINIR]" e o site é preliminar): confira a versão publicada antes de cada peça que cite uma frase dela. Não use o "nada é guardado nem enviado" do rascunho de `docs/34`.

**Não dizer:** "criptografia de ponta a ponta", "ninguém consegue ver", "100% seguro", conformidade com a LGPD, "dados guardados no Brasil" (há pergunta aberta ao advogado). A própria política diz que nenhum sistema é totalmente seguro.

### 12.5 Tom

Dinheiro dentro da vida (rotina, relações, escolhas, planos), sem culpa e sem presumir sentimentos. Reconhecer que renda, trabalho, saúde e família também limitam escolhas. Oferecer um passo possível, nunca uma transformação.

## 13. O que ler, e quando

| Para | Leia |
|---|---|
| Qualquer pedido | Este guia, o `CLAUDE.md` e `docs/referencias/redes-sociais-e-guia-visual.md` (resumo oficial do Playbook e do Manual v2.2) |
| Uma peça sobre o app | `docs/24_REDES_SOCIAIS.md` (ficha de afirmações e gravações) e as capturas em `docs/telas/` |
| Gerar ou mudar peças do Instagram | `docs/25_INSTAGRAM.md` e `scripts/instagram/conteudo.js` |
| Entender um recurso | `docs/00_VISAO_E_DECISOES.md` (procure o número D), `docs/09_APRENDER.md` (conteúdo educativo e fontes), `docs/17_ROTEIRO_DEMONSTRACAO.md` (demonstração e perguntas de acesso) |
| Site e link da bio | `docs/22_SITE.md` |
| Preço, assinatura e empresas | `docs/26_PRECO_E_CONTRATACAO.md`, `docs/38_PAGAMENTO_WEB.md`, `docs/13_FAMILIA_E_EMPRESAS.md` |
| Lançamento | `docs/37_LANCAMENTO.md` e `docs/04_ROTEIRO_LANCAMENTO.md` (longo: procure a seção do assunto) |
| O que a Elis testou | `docs/41_RELATORIO_ELIS.md` e `docs/34_RETORNO_DO_TESTE.md` (com o "Rascunho para as redes"); material interno |
| Termos e jeito de dizer | `docs/31_GLOSSARIO.md`, `docs/lojas/ficha.md` |
| Limites legais | `docs/legal/LEIAME.md`, `docs/legal/resumo-para-advogado.md` |
| Metas | `docs/43_METAS_MAIS_COMUNS.md`, `docs/33_METAS_COM_IMAGEM.md` |

Documentos datados: `docs/29_FUNCIONALIDADES_COMERCIAIS.md` (27/10) e a ficha de `docs/24` (24/10) são de antes do preço, do Telegram aberto e de várias telas novas. Servem como ideia de pauta e ponto de partida; o estado atual é o da seção 2.

## 14. Pendências de redes

Até 11/11/2026 o repositório não registra perfil criado nem peça publicada: confirme com a Elis em que ponto está o Instagram.

### 14.1 O que já está pronto

- O gerador do Instagram com o perfil (avatar, destaques, bio, prévia), os carrosséis do calendário (P01, P03, P04, P07, P10, B01 e T01), as peças de reserva (R01, R02 "Organizar as finanças com a câmera do celular", B, F01, F02 e o Reels R03), as capas, os rascunhos em vídeo e o calendário D1 a D30 (`docs/25`).
- As gravações da demonstração: P02, P05, P08, P11, o Reels da compra de mercado e do orçamento (pedido da Elis em 09/11, D-089 F) e o Reels R03 de nota, comprovante e boleto lidos sem digitar (pedido da Elis em 31/10).
- A peça "câmera do celular" (R02 e R03) e o vídeo do mercado são os dois pedidos da Elis já atendidos.

### 14.2 Perguntar a Enzo antes de publicar

1. **Leitura de documentos:** `docs/29_FUNCIONALIDADES_COMERCIAIS.md` (27/10) ainda diz "não anunciar" a leitura de nota e de comprovante, testada só com documentos sintéticos, mas a ficha das lojas (10/11) e as peças R02 e R03 já contam com ela. Na narração, prefira a frase da política: "A imagem não vai para nenhum servidor da Clarevo." (no Android, o componente do Google pode enviar dados técnicos ao Google; a nota do Rio de Janeiro é consultada no site da Sefaz). A página 6 da R02 já foi alinhada à política em 11/11/2026.
2. **Preço e "14 dias grátis":** quando podem aparecer.
3. **Abrir o acesso:** quando abrir, mudam juntos a bio (a terceira linha volta a "Conheça a Clarevo ↓"), a P03, o destaque Comece aqui, as frases finais dos Reels ("Veja no perfil as informações de acesso") e o texto `ACESSO` de `scripts/site/paginas/comece.js` (este, pela sessão do app).
4. **Responsável pelo produto** que refaz o teste na versão publicada antes de cada peça de demonstração (o Playbook pede nome, data e versão). A ficha de afirmações de `docs/24` é de 24/10: depois disso vieram, entre outras, as decisões D-086 a D-092 (categorias, lembretes, Telegram com cartão, fatura importada, salário do fim do mês, metas prontas).
5. **Identificador do Instagram** (o `@`), quem administra, publica e responde.

### 14.3 Bloqueios conhecidos

- **B01 e o destaque Para empresas:** canal comercial conferido, revisão técnica de saúde e NR-1 e a pergunta 35 ao advogado.
- **P11 e o destaque Ajuda:** canal de ajuda e horário real de atendimento.
- **P06, P09 e P12:** pessoas reais, com autorização de imagem e de fala.
- **F02:** se citar a Família da Clarevo, conferência própria (a demonstração não tem Família de exemplo).
- **Trends (T01, T02):** referência e direitos de uso escolhidos na revisão semanal.

### 14.4 Pautas que nasceram do desenvolvimento

- "Já pensou em organizar suas finanças usando a câmera do celular?" (R02 e R03, à espera do item 1 acima).
- Anotar pelo Telegram em uma mensagem ("farmácia 41 cartão").
- As metas mais comuns, cada uma com o que costuma entrar na conta (D-092, `packages/core/src/goal-presets.ts`), sem citar os percentuais das pesquisas.
- Uma calculadora por peça, com exemplo fictício e a pergunta como capa.
- Salário que cai no fim do mês e conta no mês seguinte.
- "Diferença do mês não é saldo" e "orçamento não é autorização para gastar".
