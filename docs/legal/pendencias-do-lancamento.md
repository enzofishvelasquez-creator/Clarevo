# Pendências dos textos legais para o lançamento (04/11/2026)

O site só sai da "versão preliminar" quando `node scripts/gerar-site.js --final` passa. Hoje ele recusa por **108 marcadores** (eram 103 antes da seção de preço e da seção 3.12, em 04/11/2026) na política de privacidade, nos termos de uso e na página de exclusão de conta, mais as frases de rascunho e as duas seções de formulários desligados. Este documento separa os marcadores em quatro grupos, para cada um ir a quem decide. O resumo para o advogado (`resumo-para-advogado.md`, perguntas 1 a 46) continua valendo; aqui está o que falta **no texto**.

## A. Decisões do Enzo (produto), com a recomendação da equipe

**Aprovadas em 04/11/2026 (D-083)**, com a A3 trocada pela assinatura paga.

O advogado confere depois; se o Enzo aprovar, a equipe troca os marcadores pelo texto e implementa o que for do app.

| # | Marcador (onde) | Recomendação |
|---|---|---|
| A1 | Forma do aceite e registro da versão e da data (termos, política) | Manter a frase acima de "Criar conta" (sem caixa de seleção) e **passar a registrar no banco a versão dos termos e da política aceita e a data**, no cadastro e a cada versão nova. A equipe implementa |
| A2 | Forma da declaração de idade (termos, política, P-002) | A mesma frase do cadastro: "ao criar a conta, você confirma ter 18 anos ou mais" |
| A3 | O que o plano inclui e se haverá cobrança (termos, P-005) | **Substituída pela D-083 (04/11/2026):** a Clarevo é paga, R$ 29,90 por mês, com 14 dias grátis sem cartão; depois, só ver e exportar. Os termos ganham a seção de preço, pagamento, renovação, cancelamento e arrependimento (CDC, art. 49), e a política, os serviços de pagamento (Apple, Google e o da web). Vai ao advogado |
| A4 | Compromisso de disponibilidade (termos) | Sem compromisso formal: "fazemos o possível para o app funcionar sem interrupções e avisamos as manutenções planejadas" |
| A5 | Prazo e forma do aviso de mudança dos termos e da política (termos, política) | Aviso **30 dias antes**, no app e por e-mail; mudança que reduza direitos pede novo aceite no app. A equipe faz o aviso no app |
| A6 | Regras de suspensão e de encerramento por descumprimento (termos) | Só por uso que ponha outras pessoas ou o serviço em risco ou por descumprimento grave; aviso por e-mail com **10 dias** para a pessoa responder e exportar os dados, salvo risco imediato ou ordem legal |
| A7 | Prazo para apagar de vez o que foi marcado como excluído (P-010, política, exclusão) | **6 meses** |
| A8 | Contas sem uso (política) | Não apagar contas por inatividade no lançamento; revisar em 2027 |
| A9 | Apagar ao sair da conta (política, seção 9) | **Sim**: ao sair, o app apaga do aparelho as preferências e memórias da conta (hoje ficam até excluir a conta). A equipe implementa |
| A10 | Encarregado de dados (política) | Manter o canal privacidade@clarevo.app.br e indicar o Enzo como responsável pelo canal; o advogado confirma se a Clarevo é agente de pequeno porte, que a Resolução CD/ANPD nº 2/2022 dispensa de nomear encarregado |
| A11 | Backup automático do Android (política) | Já decidido em 03/11/2026: desligado (`allowBackup: false`). A equipe troca o marcador pelo texto |
| A12 | Endereço publicado (todas as páginas) | O endereço do cartão CNPJ. Se for residencial, perguntar ao advogado se basta publicar cidade e UF com os e-mails |
| A13 | Data de vigência (política, termos, exclusão) | O dia da publicação final |
| A14 | Seções 3.6 (contato pelo site) e 3.7 (Novidades por e-mail) | Os dois formulários ficam **desligados** no lançamento: a equipe tira as duas seções e os trechos ligados a elas (Resend do formulário, Brevo) do texto publicado e guarda num arquivo à parte, para quando ligar |
| A15 | Seção 3.10 (WhatsApp) e trechos da Meta | O WhatsApp fica fora no lançamento (`docs/36`): a equipe tira a seção e os trechos da Meta do texto publicado e guarda à parte |
| A16 | Versões anteriores da política | Ficam publicadas no site, numa página de versões, em vez de "mediante pedido" |

## B. Advogado

| # | Assunto | Marcadores |
|---|---|---|
| B1 | Bases legais de cada uso (seção 6 da política): cadastro, registros, Família, empresa, "Como você conheceu a Clarevo?", contagens da equipe, Telegram, funções do aparelho | 9 |
| B2 | Fornecedores: papel (operador ou não), país, contrato e transferência internacional (LGPD, art. 33) de Supabase, Cloudflare, Resend, Zoho, Expo, Apple, Google e Telegram | 10 |
| B3 | Registros de acesso (Marco Civil da Internet, art. 15): o que guardar, onde e por quanto tempo | 2 |
| B4 | Incidente de segurança (LGPD, art. 48): prazo e forma de comunicar | 1 |
| B5 | Regra interna de quem da equipe acessa dados e em que situações, com registro desses acessos (hoje não existe) | 2 |
| B6 | Pedido de autoridade: procedimento e aviso à pessoa | 1 |
| B7 | Pedidos do titular: como confirmar a identidade (proposta: responder ao e-mail cadastrado, sem pedir documento) | 2 |
| B8 | Cláusula de limitação de responsabilidade compatível com o CDC (termos) | 1 |
| B9 | Categoria e descrição livre frente aos dados sensíveis da LGPD | 1 |
| B10 | Guarda por obrigação legal e defesa de direitos | 2 |
| B11 | Telegram (pergunta 45), Inova Simples nas lojas (pergunta 46) e assinatura paga (pergunta 47: arrependimento nas lojas, renovação, preço, só leitura, Plano Família, tributos e nota fiscal) | 7 |
| B12 | Tirar as frases "Rascunho preparado pela equipe... Não é parecer jurídico" depois da revisão | 3 |

## C. Conferência em painel (Enzo, uns 15 minutos; a equipe manda o roteiro)

| # | O quê | Onde |
|---|---|---|
| C1 | Prazo das cópias de segurança (no plano Pro, previsto em 7 dias) | Supabase, Database, Backups |
| C2 | Prazo de guarda dos registros de envio e país | Resend, configurações da conta |
| C3 | País do tratamento da caixa de e-mail (conta criada em zoho.com) | Zoho Mail, dados da conta |
| C4 | Se a hospedagem define cookie e onde processa os acessos; Web Analytics desligado | Cloudflare, projetos `clarevo`, `clarevo-demo` e `clarevo-site` |
| C5 | Se a Cloudflare fica na frente do Supabase (lista de suboperadores) | Página de suboperadores do Supabase |
| C6 | O que o componente de leitura de código do Google (ML Kit) envia | Documentação do ML Kit (a equipe lê, se a rede deixar) |

## D. Equipe (sem depender de ninguém, depois das decisões A)

1. Registro da versão aceita dos termos e da política e da data (A1), com migração e testes. **Feito em 05/11/2026** (migração 0024, aviso de aceite no app, termos e política sem os marcadores da A1, A2 e A5).
2. Aviso de mudança dos textos no app (A5).
3. Apagar do aparelho as preferências da conta ao sair (A9). **Feito em 05/11/2026**, com a política (seção 9) e a A11 no texto.
4. Tirar do texto publicado as seções do que está desligado (A14, A15) e guardar à parte.
5. Página de licenças de código aberto (termos, seção de propriedade intelectual): lista gerada dos pacotes que vão no app, publicada no site e com link no app.
6. Página de versões anteriores da política (A16).
7. Trocar os marcadores decididos pelo texto e rodar o `--final`.
