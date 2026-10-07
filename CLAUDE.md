# Clarevo · orientações para o Claude

- Responder e escrever textos do produto em português do Brasil, linguagem neutra de gênero, sem travessões longos e sem a expressão "fazer sentido".
- Produto novo: não usar marca, ativos, dados ou código do Bíos (os arquivos na raiz do repositório B-os-1.0 são do Bíos).
- Referências vigentes em `docs/referencias/` e decisões em `docs/00_VISAO_E_DECISOES.md`. Registrar novas decisões lá.
- Dinheiro sempre em centavos inteiros. Regras financeiras ficam em `packages/core` com testes.
- Autorização é validada no banco (RLS). Toda mudança de esquema vem com teste em `supabase/tests`.
- Dados de demonstração são fictícios e devem ser identificados como tal.
- Antes de entregar: `npm test`, `npm run typecheck`, `npm run test:db` (se mexer no banco). Informar só verificações realmente executadas.
- App Expo: ler `apps/app/AGENTS.md`; instalar pacotes nativos com versões compatíveis com o SDK.
