/**
 * Redução de imagens usadas como logotipo.
 *
 * O logotipo da clínica é guardado em base64 no cadastro e replicado na sessão
 * (cabeçalho, documentos impressos, cabeçalho dos templates do WhatsApp). Uma
 * imagem grande transforma a sessão num texto de vários MB, que é lido e
 * convertido em objeto em várias telas — e aí a aba congela.
 *
 * Reduzir na hora do envio mantém o logo nítido e a sessão leve.
 */
export async function reduzirImagem(
dataUrl: string,
ladoMaximo = 512)
: Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return dataUrl;

  const imagem = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Imagem inválida.'));
    img.src = dataUrl;
  });

  const maiorLado = Math.max(imagem.width, imagem.height);
  // Já é pequena: não reprocessa (evita perder qualidade sem necessidade).
  if (maiorLado <= ladoMaximo && dataUrl.length < 400_000) return dataUrl;

  const escala = Math.min(1, ladoMaximo / maiorLado);
  const largura = Math.max(1, Math.round(imagem.width * escala));
  const altura = Math.max(1, Math.round(imagem.height * escala));

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(imagem, 0, 0, largura, altura);

  // PNG preserva transparência (logotipos costumam ter fundo transparente).
  // Se o resultado ficar pesado, cai para JPEG com fundo branco.
  const png = canvas.toDataURL('image/png');
  if (png.length <= 300_000) return png;

  const comFundo = document.createElement('canvas');
  comFundo.width = largura;
  comFundo.height = altura;
  const ctx2 = comFundo.getContext('2d');
  if (!ctx2) return png;
  ctx2.fillStyle = '#ffffff';
  ctx2.fillRect(0, 0, largura, altura);
  ctx2.drawImage(imagem, 0, 0, largura, altura);
  return comFundo.toDataURL('image/jpeg', 0.85);
}