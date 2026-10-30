# Scripts legados

Scripts avulsos de diagnóstico, correção pontual e migração que ficavam na raiz
de `src/server`. Nenhum é carregado pelo servidor. Foram mantidos para consulta.

- Muitos são da época do SQLite (`data/principal.db`) e **não funcionam** com o
  MySQL atual.
- Os `fix-*` corrigiram dados de clínicas específicas e não devem ser rodados de
  novo sem revisar o código.
- Para rodar um deles, a partir de `src/server`:
  `node scripts/legado/<arquivo>.js` (as credenciais do MySQL vêm do `.env.local`).
