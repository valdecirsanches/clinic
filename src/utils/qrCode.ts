/**
 * Geração de QR Code SEM dependência npm.
 *
 * ⚠️ Não usar o pacote `qrcode`: ele arrasta `pngjs` como dependência
 * transitiva, que falha na extração em alguns ambientes de build (e não está
 * instalado neste projeto — importá-lo quebra o `vite build`).
 * Usamos a API pública qrserver.com, mesma abordagem já adotada no BoletoModal.
 */

interface OpcoesQrCode {
  /** Lado da imagem em pixels (padrão 300) */
  tamanho?: number;
  /** Margem em módulos (padrão 1) */
  margem?: number;
}

function montarUrl(texto: string, opcoes?: OpcoesQrCode): string {
  const tamanho = opcoes?.tamanho || 300;
  const margem = opcoes?.margem ?? 1;
  return (
    `https://api.qrserver.com/v1/create-qr-code/?size=${tamanho}x${tamanho}` +
    `&margin=${margem}&format=png&data=${encodeURIComponent(texto)}`);

}

/**
 * Retorna o QR Code como data URL (embutível em <img> e em PDF).
 * Se a conversão falhar, devolve a URL direta da API — ainda exibível em <img>.
 */
export async function gerarQrCodeDataUrl(
texto: string,
opcoes?: OpcoesQrCode)
: Promise<string> {
  const url = montarUrl(texto, opcoes);
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`QR API HTTP ${resposta.status}`);
    const blob = await resposta.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('[gerarQrCodeDataUrl] Falhou:', err);
    return url;
  }
}