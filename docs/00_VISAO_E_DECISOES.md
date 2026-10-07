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
| D-003 | 07/10/2026 | App com Expo (React Native): um código para iOS, Android e web. | Proposta Claude, aprovada por Enzo |
| D-004 | 07/10/2026 | Backend Supabase (Postgres + autenticação + permissões por linha). | Proposta Claude, aprovada por Enzo |
| D-005 | 07/10/2026 | Valores em centavos inteiros. Previsto e confirmado são situações distintas. | Instruções §5 |
| D-006 | 07/10/2026 | Licença empresarial habilita plano; não dá acesso a dados. Testado no banco. | Instruções §4, CL-V006 |
| D-007 | 07/10/2026 | Exclusão de registro é lógica (deleted_at); autoria é imutável. | Instruções §6, CL C003 |
| D-008 | 07/10/2026 | Fora do primeiro ciclo: integração bancária, WhatsApp, IA, cartões, compromissos (cadastro), metas, convites familiares, cobrança, painel de empresas. | Primeiro ciclo v1.0 |
| D-009 | 07/10/2026 | Repositório próprio `enzofishvelasquez-creator/clarevo`, separado do Bíos. | Enzo |
| D-010 | 07/10/2026 | Logo: C aberto azul com crescente lima, vetorizado a partir da imagem aprovada (`docs/marca/`). Nome desenhado com Lexend Bold (OFL) como aproximação; refinamento tipográfico pendente. | Logo aprovado, CL-V009 |
| D-011 | 07/10/2026 | Neste ciclo só existem registros **realizados** (gasto pago e renda recebida). Data DD/MM/AAAA, nunca futura; descrição de 1 a 80 caracteres; limite de R$ 9.999.999,99 por registro; categoria opcional ("Sem categoria"). | Primeiro ciclo v1.0, CL C002 |
| D-012 | 07/10/2026 | Escrita só por funções do banco com chave de idempotência por pessoa e versão do registro; leitura filtrada por permissão. | CL C006 |
| D-013 | 07/10/2026 | Sem Supabase configurado, o app roda em demonstração (acesso simulado, selo visível). Conta nova nunca recebe dados fictícios. | CL C001 |
| D-014 | 07/10/2026 | Senha: mínimo de 8 caracteres, com letras e números, informado antes do envio. | Proposta Claude (OWASP), revisável |

## Decisões pendentes (alteram o que construímos)

| Nº | Pergunta | Recomendação | Afeta |
|---|---|---|---|
| P-001 | Lançar primeiro em iOS, Android, web ou todos? | Android + iOS via lojas, web para demonstração ao investidor. Mesmo código. | Publicação |
| P-002 | Faixa etária mínima e participação de menores na família | 18+ no lançamento; menores em fase posterior com consentimento do responsável | Convites, LGPD |
| P-003 | Papéis familiares: além de titular e membro, haverá "somente leitura"? | Titular, membro (anota) e leitor | Permissões |
| P-004 | Fim do benefício: prazo de continuidade e oferta particular | 30 dias de acesso pleno, depois plano gratuito com leitura do histórico | Comercial |
| P-005 | Preços e limites dos planos individual e familiar | Definir com o investidor | Cobrança |
| P-006 | Nome de domínio e contas nas lojas (Apple/Google) em nome de qual empresa | Criar CNPJ/contas já; aprovação na Apple pode levar dias | Lançamento |
| P-008 | Provedor de e-mail para confirmação e recuperação (Resend, Amazon SES ou outro) | Resend, pela simplicidade | Lançamento |
| P-009 | Fonte definitiva do nome "clarevo" no logo | Manter Lexend ou encomendar desenho próprio | Marca |
| P-010 | Política de retenção do rastro técnico de registros excluídos | Definir com assessoria de privacidade (LGPD) | Dados |
