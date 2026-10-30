// Hook UNIFICADO para persistir termo de busca de paciente
// ⭐ CHAVE ÚNICA usada por TODOS os componentes de busca
// PacientesPage, PacienteBuscaSelect, PacienteBuscaSelectAPI, usePacientes

const STORAGE_KEY = 'easyclin_busca_paciente_v2';

// Salva o termo
export function setGlobalSearchTerm(term: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, term);
  } catch (e) {


    // fallback silencioso
  }}

// Obtém o termo salvo
export function getGlobalSearchTerm(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch (e) {
    return '';
  }
}

// Limpa o termo (só quando explicitamente solicitado)
export function clearGlobalSearchTerm(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {


    // fallback silencioso
  }}