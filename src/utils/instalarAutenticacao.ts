// Instala o envio do token em todas as chamadas à API (ver autenticacaoApi.ts).
// Importado logo no início de index.tsx, antes de qualquer fetch do app.
import { instalarAutenticacaoApi } from './autenticacaoApi';

instalarAutenticacaoApi();
