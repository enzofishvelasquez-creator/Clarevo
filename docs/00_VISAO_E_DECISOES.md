# Visão e registro de decisões

Atualizado em 07/10/2026.

## Visão

Clarevo ajuda pessoas e famílias a entender o próprio mês: o que entrou, o que foi pago, o que vence e o que é só previsão. Educação financeira aparece junto da tarefa, de forma breve e opcional. Empresas podem oferecer o plano como benefício sem acessar as finanças de ninguém.

Beleza visual, fluidez de uso e informação útil têm o mesmo peso.

## Decisões tomadas

| Nº | Data | Decisão | Origem |
|---|---|---|---|
| D-001 | 07/10/2026 | Produto novo. Não herda marca, código, dados ou arquitetura do Bíos; herda métodos de trabalho. | Instruções v2.1 §2 |
| D-002 | 07/10/2026 | Direção visual "Azul vivo e lima" (#2457F5, #D4F05B, #17223B) como referência inicial. | Enzo: "perfeito, gostei" |
| D-003 | 07/10/2026 | App com Expo (React Native): um código para iOS, Android e web. | Proposta Claude, ver Arquitetura |
| D-004 | 07/10/2026 | Backend Supabase (Postgres + autenticação + permissões por linha). | Proposta Claude, ver Arquitetura |
| D-005 | 07/10/2026 | Valores em centavos inteiros. Previsto e confirmado são situações distintas. | Instruções §5 |
| D-006 | 07/10/2026 | Licença empresarial habilita plano; não dá acesso a dados. Testado no banco. | Instruções §4, CL-V006 |
| D-007 | 07/10/2026 | Exclusão de evento é lógica (deleted_at); autoria é imutável. | Instruções §6, CL-V005 |
| D-008 | 07/10/2026 | Fora do primeiro ciclo: integração bancária, WhatsApp, IA, investimentos detalhados, painel de RH. | Handoff |

D-003 e D-004 são propostas. Se você aprovar, ficam confirmadas; se preferir outra tecnologia, a troca agora é barata.

## Decisões pendentes (alteram o que construímos)

| Nº | Pergunta | Recomendação | Afeta |
|---|---|---|---|
| P-001 | Lançar primeiro em iOS, Android, web ou todos? | Android + iOS via lojas, web para demonstração ao investidor. Mesmo código. | Publicação |
| P-002 | Faixa etária mínima e participação de menores na família | 18+ no lançamento; menores em fase posterior com consentimento do responsável | Convites, LGPD |
| P-003 | Papéis familiares: além de titular e membro, haverá "somente leitura"? | Titular, membro (anota) e leitor | Permissões |
| P-004 | Fim do benefício: prazo de continuidade e oferta particular | 30 dias de acesso pleno, depois plano gratuito com leitura do histórico | Comercial |
| P-005 | Preços e limites dos planos individual e familiar | Definir com o investidor | Cobrança |
| P-006 | Nome de domínio e contas nas lojas (Apple/Google) em nome de qual empresa | Criar CNPJ/contas já; aprovação na Apple pode levar dias | Lançamento |
| P-007 | Repositório próprio "clarevo" no GitHub | Sim, ver Roteiro passo 1 | Organização |
