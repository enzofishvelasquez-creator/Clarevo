# Clarevo — Handoff de identidade e experiência para o Claude

07/10/2026 · versão 1.0 · produto novo · proposta para implementação por etapas.

## Base confirmada e decisões ainda abertas

Enzo decidiu criar o Clarevo do zero no Claude. Pessoas e famílias são o público principal. A arquitetura deve permitir contratação empresarial e acesso oferecido como benefício. Marca, código, paleta e interface são novos. Do Bíos vêm métodos e aprendizados, sem herança automática de ativos, dados ou tecnologias.

**Beleza visual, fluidez e qualidade da informação têm o mesmo peso.** A direção anterior foi considerada opaca ou pastel. O novo visual deve ter cores com presença e leitura clara.

A pesquisa recomenda **Azul vivo e lima**, com logo de C aberto e acento lima. Enzo respondeu “perfeito, gostei” à proposta em 07/10/2026; usar como referência inicial, refinando aplicações e desenho vetorial. Verde com tangerina e índigo com coral são alternativas de comparação. Os protótipos usam valores fictícios e não demonstram um backend seguro ou um produto pronto.

O material de referência é `CLAREVO_Pesquisa_de_Mercado_e_Direcao_Visual.docx`. Este handoff orienta o Claude que implementa; as instruções do projeto ChatGPT definem o papel de planejamento naquele ambiente.

## CL-V001 Criar o sistema visual candidato

**Ação:** definir tokens e componentes reutilizáveis da direção recomendada.

| Papel | Valor inicial | Uso |
|---|---|---|
| Marca e ação | `#2457F5` | Cabeçalho, ação principal, estado ativo |
| Acento | `#D4F05B` | Destaque, metas e ilustração, com texto escuro |
| Apoio ilustrativo | `#F56545` | Detalhes; evitar branco em texto comum |
| Texto | `#17223B` | Títulos, valores e conteúdo |
| Texto secundário | `#4B5873` | Rótulos e explicações |
| Superfície | `#FFFFFF` | Componentes de leitura |
| Fundo | `#F6F8FC` | Separação discreta das superfícies |
| Erro | `#B42318` | Mensagem e estado de erro |
| Confirmação | `#087E58` | Estado acompanhado de texto ou ícone |

Manrope é a fonte candidata; usar fonte do sistema como alternativa. Ponto de partida: corpo 16 px, rótulos 14 px, valores de destaque 32–40 px. Números tabulares nas listas e totais. Ajustar a hierarquia sem cortar valores com ampliação de texto. Componentes podem usar cantos de 12–20 px e espaçamento em múltiplos de 4 px; não arredondar tudo da mesma maneira.

**Aceite:** contraste calculado sobre os fundos reais, foco visível, texto ampliado sem sobreposição e estados identificáveis sem depender só de cor. Branco/azul resulta em 5,59:1; texto/lima, em 12,36:1; secundário/branco, em 7,14:1. São verificações de pares opacos, não certificação da interface.

**Fora:** considerar o tema escuro concluído pela simples inversão dos tokens. Ele precisa de desenho e revisão próprios. Não copiar ativos de concorrentes.

## CL-V002 Implementar navegação e contexto

**Lugar:** estrutura principal do app. Quatro destinos: **Resumo**, **Movimentações**, **Metas** e **Aprender**. Perfil e benefício ficam em Conta.

**Ação:** manter o contexto Pessoal/Família visível. Formulários mostram onde o registro será salvo. O contexto muda os dados, as permissões e os totais, com comportamento explícito para rascunhos.

**Aceite:** a pessoa identifica o contexto antes de salvar; troca de contexto preserva ou explica o destino do rascunho; voltar à lista mantém o período e a posição. No backend, o escopo é validado em cada acesso. Navegação não substitui autorização.

**Texto:** “Pessoal”, “Família”, “Salvar em Pessoal”, “Salvar em Família”, “Quem vê estes dados?”.

## CL-V003 Completar o resumo financeiro

**Lugar:** Resumo e composição dos valores.

**Ação:** separar recebido, pago, ainda a pagar e a confirmar. Mostrar período e critério. Cada total permite consultar os eventos que o compõem.

**Aceite:** no cenário fictício, R$ 6.000 recebidos e R$ 3.900 pagos produzem R$ 2.100 de diferença do mês. Um novo pagamento de R$ 80 muda o total pago para R$ 3.980 e a diferença para R$ 2.020. R$ 650 ainda previstos permanecem separados. Isso não determina o saldo da conta.

**Texto:** “Diferença do mês”, “Recebimentos menos pagamentos confirmados”, “Ainda a pagar neste mês”.

**Fora:** chamar essa diferença de dinheiro disponível sem considerar saldo inicial, obrigações, reservas e outros eventos. Dado ausente não vira zero silenciosamente.

## CL-V004 Completar registro edição e falha

**Lugar:** formulário e lista de movimentações.

**Ação:** permitir anotar uma despesa paga, escolher o contexto, conferir, salvar e corrigir. Definir conta, data e situação conforme o modelo financeiro. Usar precisão monetária adequada ao armazenamento e ao cálculo.

**Aceite:** mensagens junto ao campo preservam o preenchimento; envio repetido não duplica o registro; falha conserva o rascunho e orienta nova tentativa; salvar ou editar atualiza resumo e composição pelo mesmo critério. Confirmação aparece somente após confirmação real da persistência.

**Texto:** “Anotar gasto”, “Valor em reais”, “Gasto salvo”, “Confira o valor informado”. Ajustar a mensagem de falha ao comportamento implementado.

**Fora:** inferir aprovação de integrações bancárias ou classificação automática por IA.

## CL-V005 Desenhar compartilhamento familiar

**Lugar:** convite, formulário, configurações do contexto e detalhe de acesso.

**Ação:** compartilhar um contexto escolhido, com permissões de leitura, registro e edição definidas. Não publicar todo o histórico pessoal ao aceitar um convite. Decidir papéis, saída e revogação antes de implementar.

**Aceite:** acesso direto e indireto respeita o contexto e a ação; revogação bloqueia novas consultas e trata cache e sincronização; familiares têm credenciais próprias; titularidade e autoria dos eventos permanecem rastreáveis. Participação de menores exige decisão específica.

**Texto:** “Estes registros serão compartilhados com os membros autorizados desta família”. Mostrar nomes e permissões reais, não um selo genérico de privacidade.

## CL-V006 Preparar benefício empresarial

**Lugar:** modelo de dados, direito ao plano e Conta. Painel de gestão em etapa própria.

**Ação:** separar pessoa, contexto, organização, contrato, licença e direito ao plano. Convite empresarial não é convite familiar. Patrocínio habilita o plano, sem permitir leitura das finanças.

**Aceite:** empresa administra vagas, convites e licenças; não consulta receitas, despesas, contas, dívidas, metas ou família. Fim do benefício não apaga a conta nem transfere o histórico. Definir cobertura e continuidade para a operação comercial.

**Texto:** “Acesso pelo benefício da sua empresa”, com validade e cobertura reais. “A empresa administra seu acesso ao plano. Seus registros financeiros têm permissões próprias.”

**Fora:** indicadores financeiros individuais ou agregados para RH no primeiro escopo. Não prometer privacidade sem implementar e verificar a proteção correspondente.

## CL-V007 Entregar educação ligada à tarefa

**Lugar:** ajuda opcional na tarefa e área Aprender.

**Ação:** criar peças breves sobre fatura, renda variável e reservas. Usar desenhos geométricos em duas ou três cores, formas abertas e ilustrações humanas quando forem úteis. Reservar espaço de leitura para números e formulários.

**Aceite:** abrir a explicação não perde o preenchimento. Há retorno à tarefa. Cada exemplo declara suas hipóteses. Linguagem respeitosa, sem culpa ou promessa de enriquecimento.

**Texto de exemplo:** “Uma compra de R$ 160 no cartão registra o consumo. Pagar a fatura quita essa obrigação e movimenta a conta. Contar esse pagamento como uma nova compra duplicaria o consumo. Juros e tarifas têm registros próprios.”

**Fora:** nota moral sobre os gastos, diagnóstico emocional ou recomendação automática de crédito e investimento.

## CL-V008 Implementar movimento funcional

| Interação | Proposta inicial |
|---|---|
| Pressão de botão | 100–150 ms, resposta breve |
| Troca de contexto | 180–220 ms, mudança curta e contexto nomeado |
| Abertura de detalhe | 250–300 ms, conservar a origem visual |
| Confirmação | 200–300 ms, estado final claro |
| Progresso de meta | 250–350 ms entre o valor anterior e o novo |

**Aceite:** transições começam por ação; respeitam redução de movimento; valores financeiros são mostrados diretamente no resultado final; foco e leitura assistiva permanecem corretos. Durações são propostas, a revisar nos dispositivos escolhidos. Não anunciar cada quadro da animação.

**Fora:** moedas e confetes contínuos, parallax decorativo, animação inicial de todos os totais ou atraso artificial para “parecer fluido”. Feedback de toque não prova que uma operação foi salva.

## CL-V009 Desenvolver o logo depois da escolha

**Ação:** partir do conceito de C aberto e elemento lima, com assinatura “clarevo” em minúsculas. A imagem gerada por IA é referência de direção. Refinar geometria, espaçamento e tipografia em vetor original.

**Aceite:** símbolo em 16, 24, 32 e 48 px; versão em uma cor; fundos claro e escuro; ícone de app com margem adequada aos recortes de cada plataforma. A leitura de C e abertura deve ser testada, inclusive contra leitura de lua. Entregar símbolo, assinatura horizontal, versão reversa e arquivos vetoriais depois da decisão.

**Fora:** anunciar registro ou exclusividade da marca. A pesquisa não verifica anterioridade do nome ou símbolo.

## CL-V010 Validar o primeiro fluxo

**Ação:** testar registrar, editar, trocar contexto, entender o total e consultar educação. Conferir isolamento de dados e cálculos. No estudo com pessoas, observar beleza, compreensão, conforto e conclusão da tarefa separadamente.

**Aceite:** Claude informa o que foi implementado, o que falta e quais verificações executou. Testes de autorização e regras financeiras devem cobrir casos reais de falha, sem se limitar a espelhar a interface. Não declarar teste em dispositivo ou com usuário que não aconteceu.

Sugestão de piloto: 8–12 pessoas com diferentes rendas e familiaridades com aplicativos; 2–3 responsáveis por benefícios revisam a oferta e o fluxo de adesão. É validação qualitativa, sem inferência estatística sobre o mercado.

## Mensagem para abrir o trabalho no Claude

> Vamos criar o Clarevo do zero. O foco é organização e educação financeira para pessoas e famílias, com fundação preparada para empresas oferecerem o plano como benefício. Beleza visual, fluidez e qualidade da informação têm o mesmo peso. Leia o plano inicial, a pesquisa de mercado e este handoff. A direção azul vivo e lima é candidata; mantenha tokens e componentes fáceis de revisar. Comece por uma proposta de arquitetura adequada às plataformas que vamos atender e pelo fluxo de despesa paga com resumo e composição. Separe identidade, contexto familiar, organização, licença e autorização. Apresente os limites de acesso e as regras financeiras antes de codificar esses domínios. Não inclua integração bancária, WhatsApp ou IA no primeiro ciclo sem uma decisão específica. Registre decisões e entregue incrementos que possamos revisar, com as verificações realmente executadas.

## Referências técnicas e de mercado

Consulta em 07/10/2026. Serviços e políticas são declarações dos próprios fornecedores; não constituem auditoria.

- [Pesquisa e oferta Organizze](https://www.organizze.com.br/)
- [YNAB para empresas](https://www.ynab.com/wellness) e [política de privacidade](https://www.ynab.com/privacy-policy)
- [Monarch para famílias](https://help.monarch.com/hc/en-us/articles/20926382202004-Monarch-for-Couples-and-Households)
- [Cuide da Grana para empresas](https://cuidedagrana.com/empresas.html)
- [Onze saúde financeira](https://www.onze.com.br/saude-financeira/)
- [W3C contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [W3C animação por interação](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
- [Apple redução de movimento](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria)
- [Material movimento](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
- [Manrope](https://fonts.google.com/specimen/Manrope) e [Lucide](https://github.com/lucide-icons/lucide)
