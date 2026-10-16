# Família e painel de empresas: proposta para decisão

Versão de 15/10/2026, atualizada em 16/10/2026: o **Ciclo L (Família) foi implementado** depois das respostas de Enzo (D-055; o que foi feito e onde está em `docs/00`, `docs/03` e `docs/05`); o **Ciclo M (painel de empresas) também foi implementado** depois das respostas de Enzo (D-056; o que foi feito e onde está em `docs/00`, `docs/03`, `docs/04` e `docs/05`). As prioridades seguem a ordem que Enzo definiu em 11/10/2026: bancos, família, empresas. Bancos foram resolvidos sem custo, com a importação de extrato e fatura (D-048) e a leitura de comprovantes de Pix (D-051). Este documento prepara os próximos dois ciclos.

## O que já existe no banco

- Contexto Família, vínculos com papel (titular, membro ou leitor) e três permissões: ler, anotar e editar de outras pessoas.
- Todas as regras de gastos, recebimentos, contas a pagar, gastos fixos, contas do ano, metas, cartões, orçamento, contas de origem e importação já valem para a Família, com testes de permissão. Faltavam a tela e o convite, que entraram com o Ciclo L (migração 0013: `create_family`, `create_family_invite`, `cancel_family_invite`, `accept_family_invite`, `leave_family`, `remove_family_member`, `set_member_role`, `transfer_family_ownership` e `end_family`).
- Empresa: organização, quem administra, contrato de benefício com número de vagas e plano (individual ou familiar), licenças por e-mail e direito ao plano. A empresa não vê finanças, nem em números somados (regras 7, 14 e 49 de `03_ACESSO_E_PERMISSOES.md`).

## Ciclo L: Família

### Proposta

1. **Criar a Família.** Na tela Família, "Criar Família" com um nome (por exemplo, "Casa"). Quem cria vira titular.
2. **Convidar.** Titular gera um link de convite com papel escolhido: "anota e vê" ou "só vê". O link vale por 7 dias, serve uma única vez e pode ser cancelado. É enviado pelo próprio celular (WhatsApp, e-mail ou outro), sem custo de envio pelo Clarevo.
3. **Aceitar.** Quem recebe abre o link, entra ou cria a conta e vê o nome da Família, quem convidou e o que poderá fazer, antes de aceitar. Aceitar nunca mostra nem copia o Pessoal de ninguém.
4. **Alternar.** No topo do app, um seletor "Pessoal | Família" troca o contexto. Todas as telas atuais passam a funcionar na Família, com as regras de permissão do banco.
5. **Sair e remover.** Membro sai quando quiser. Titular remove membro e muda o papel. O que a pessoa anotou continua na Família, porque é histórico da casa.
6. **Gravação só por funções**, como o resto do app: `create_family`, `create_family_invite`, `cancel_family_invite`, `accept_family_invite`, `leave_family`, `remove_family_member`, `set_member_role` (e, na implementação, `transfer_family_ownership` e `end_family`, para o titular não ficar sem saída, L-7), com chave de idempotência, versão e testes em `supabase/tests`. O convite guarda só o resumo SHA-256 do código.

### Perguntas para Enzo

| Nº | Pergunta | Recomendação |
|---|---|---|
| L-1 | Família só para quem tem plano familiar pela empresa, ou para todas as pessoas durante o piloto? | Todas durante o piloto; a trava por plano entra junto com a cobrança |
| L-2 | Quantas pessoas por Família? | Até 6, contando quem é titular |
| L-3 | Uma pessoa pode estar em mais de uma Família? | Uma por vez neste ciclo |
| L-4 | P-012: quem marca como paga uma conta criada por outra pessoa? | Quem anota na Família pode marcar como paga; alterar e excluir continuam só com quem criou ou com "editar de outras pessoas" |
| L-5 | P-015: renda de referência por pessoa ou da casa? | Da casa, definida por quem anota |
| L-6 | Quando alguém sai, o nome continua nos registros antigos? | Sim, como "ex-membro" mais o primeiro nome |
| L-7 | Titular pode sair? | Só depois de passar a titularidade a outra pessoa adulta ou encerrar a Família |
| L-8 | Convite pelo próprio celular (sem custo) ou e-mail enviado pelo Clarevo (exige provedor, P-008)? | Pelo próprio celular neste ciclo |

## Ciclo M: painel de empresas

**Feito em 16/10/2026 (D-056).** Enzo aceitou as recomendações M-1 a M-6; o banco (migração 0014), o core, o app (web) e os testes entraram juntos. Em resumo: o painel só existe na web (`/empresa`, em Conta › Painel da empresa); o RH vê vagas, convites, licenças e só as contagens de licenças, nunca finanças nem o uso do app (**o indicador de entradas no mês saiu depois da revisão de segurança de 16/10/2026, pelo risco de identificar pessoas: o RH vê o e-mail de cada licença e pode controlar contas próprias; o RH vê só as contagens de licenças**); o convite é um link de uso único que o RH envia pelo canal interno; as quatro funções `clarevo_staff_*` só rodam no SQL Editor; a licença só é gravada por `invite_licenses`, `renew_license_invite`, `cancel_license_invite`, `end_license` e `accept_license`; o fim do benefício dá 30 dias de acesso pleno e nada é apagado. As decisões de detalhe que não estavam em M-1 a M-6 são proposta do Claude, revisáveis por Enzo (`docs/00`, D-056 (5)).

### Proposta

1. **Onde.** Só na web (`clarevo.pages.dev/empresa`), para quem administra o benefício (RH). O app de celular não muda para as pessoas.
2. **Cadastro da empresa.** A equipe Clarevo cria a organização, o contrato (vagas, plano, início e fim) e a primeira pessoa administradora, por uma função restrita à equipe. Não há cadastro aberto nem cobrança neste ciclo.
3. **O que o RH vê.** Vagas contratadas, convites enviados, licenças ativas e encerradas, datas. Nunca valores, categorias, metas, contas, cartões, Família, nem médias ou totais de finanças.
4. **O que o RH faz.** Convidar por e-mail (um a um ou colando uma lista), reenviar, cancelar convite pendente e encerrar licença. A empresa não escolhe quem aceita nem ativa licença: a pessoa ativa ao aceitar.
5. **Fim do benefício** (P-004): a pessoa mantém conta, histórico e Família; continua com acesso pleno por 30 dias e depois passa para o plano gratuito, com leitura do histórico.
6. **Gravação só por funções** (`invite_licenses`, `cancel_license_invite`, `end_license`, `accept_license`), substituindo a escrita direta que hoje existe na tabela `licenses`, com testes de permissão.

### Perguntas para Enzo

| Nº | Pergunta | Recomendação |
|---|---|---|
| M-1 | O RH pode ver algum indicador somado e anônimo (por exemplo, "70% das pessoas usaram o app no mês")? | Só as contagens de licenças (vagas, convidadas, ativas e encerradas), nunca finanças nem o uso do app. A resposta aceita em 16/10/2026 incluía "pessoas que entraram no mês"; esse indicador saiu depois da revisão de segurança do mesmo dia, pelo risco de identificar pessoas (o RH vê o e-mail de cada licença). Mudar isso exige rever a promessa "Quem vê estes dados?" e o contrato |
| M-2 | Como o convite chega às pessoas? | Link de convite da empresa que o RH envia pelo canal interno (sem custo). E-mail pelo Clarevo depende de P-008 |
| M-3 | Quem cria a empresa no sistema? | A equipe Clarevo, a partir do contrato assinado |
| M-4 | Prazo de acesso depois do fim do benefício (P-004) | 30 dias de acesso pleno, depois plano gratuito com leitura |
| M-5 | Contrato e LGPD: a empresa é só pagadora, e o Clarevo é controlador dos dados financeiros? | Sim; confirmar com advogado antes do primeiro contrato |
| M-6 | Plano familiar pelo benefício: a Família inteira conta como 1 vaga? | Sim, 1 vaga por pessoa que recebe o benefício |

## Fora destes ciclos

Cobrança e preços (P-005), envio de e-mail pelo Clarevo (P-008), menores na Família (P-002, só 18+ no lançamento) e qualquer dado financeiro para a empresa.
