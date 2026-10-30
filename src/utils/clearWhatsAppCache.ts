/**
 * Utilitário para limpar cache do WhatsApp
 * Use no console: clearWhatsAppCache()
 */

export function clearWhatsAppCache() {
  console.log('🧹 Limpando cache do WhatsApp...');

  // Lista todas as chaves do localStorage
  const keys = Object.keys(localStorage);

  // Remove todas as chaves relacionadas ao WhatsApp
  const whatsappKeys = keys.filter((key) => key.includes('whatsapp') || key.includes('session'));
  console.log('🔍 Chaves encontradas:', whatsappKeys);
  whatsappKeys.forEach((key) => {
    console.log(`🗑️ Removendo: ${key}`);
    localStorage.removeItem(key);
  });
  console.log('✅ Cache limpo! Recarregue a página.');

  // Dispara evento para forçar reload dos componentes
  window.dispatchEvent(new Event('whatsapp-config-updated'));
  window.dispatchEvent(new Event('whatsapp-status-updated'));
}

// Expõe globalmente para uso no console
if (typeof window !== 'undefined') {
  ;
  (window as any).clearWhatsAppCache = clearWhatsAppCache;
}