# Clarevo · orientações para o Claude

- Responder e escrever textos do produto em português do Brasil, linguagem neutra de gênero, sem travessões longos e sem a expressão "fazer sentido".
- Produto novo: não usar marca, ativos, dados ou código do Bíos.
- Referências vigentes em `docs/referencias/`. Em divergência, prevalecem as decisões mais recentes de Enzo e o "Primeiro ciclo" (`CLAREVO_Primeiro_Ciclo_para_Claude_v1.0.md`). Registrar novas decisões em `docs/00_VISAO_E_DECISOES.md`.
- Identidade: azul #2457F5, lima #D4F05B, texto #17223B. Logotipo oficial "clarevo." (minúsculas com ponto lima) nos cabeçalhos; símbolo C aberto só como ícone (`docs/marca/`, não redesenhar). Seguir as telas originais em `docs/referencias/` e preservar a estrutura do Resumo.
- Dinheiro sempre em centavos inteiros. Regras financeiras em `packages/core`, repetidas e validadas no banco.
- Autorização é validada no banco (RLS e funções). Escrita de registros só pelas funções `create_record`, `update_record`, `delete_record`, `pay_commitment`, `undo_commitment_payment`; de contas a pagar só por `create_commitment`, `update_commitment`, `delete_commitment`, `pay_commitment`, `undo_commitment_payment`; de gastos fixos, parcelamentos e contas do ano só por `create_series`, `update_series_from`, `end_series`, `delete_series`, `inform_series_year`, `skip_series_year`, e as contas de cada mês também pela geração `sync_series_occurrences` (idempotência e versão). Toda mudança de esquema vem com teste em `supabase/tests`.
- Dados de demonstração são fictícios e identificados. Conta nova nunca recebe dados de exemplo.
- Fora do ciclo atual: integração bancária, cartões, convites familiares, cobrança, painel de empresas, IA, recomendação de produtos financeiros. Resumo dos últimos meses, aprender e dúvidas, lembretes de contas a pagar, renda comprometida, metas e simulador entram nos ciclos seguintes, na ordem de D-023 com a mudança de D-034. Conteúdo educativo só com informação pública já disponível, com fonte, sem recomendar produto.
- Antes de entregar: `npm test`, `npm run typecheck`, `npm run test:db` (se mexer no banco), `npm run test:web` (se mexer em telas). Informar só verificações realmente executadas.
- App Expo: ler `apps/app/AGENTS.md`; instalar pacotes nativos com versões compatíveis com o SDK.
