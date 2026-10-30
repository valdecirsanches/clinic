import { API_BASE_URL } from '../config/api';

/**
 * Converte o vídeo gravado em WebM para MP4 no servidor (ffmpeg).
 * Vai como text/plain para não disparar o preflight que o proxy não repassa;
 * o servidor lê o corpo como binário.
 */
export async function converterParaMp4(webm: Blob): Promise<Blob> {
  let usuarioId = '';
  try {
    usuarioId = JSON.parse(localStorage.getItem('sessao') || 'null')?.usuario?.id || '';
  } catch {

    // sem sessão: o servidor recusa com a mensagem adequada
  }let resposta: Response;
  try {
    resposta = await fetch(
      `${API_BASE_URL}/api/video-demo/converter-mp4?usuarioId=${encodeURIComponent(usuarioId)}`,
      { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: webm }
    );
  } catch {
    throw new Error('Não foi possível enviar o vídeo ao servidor para converter em MP4.');
  }
  if (!resposta.ok) {
    if (resposta.status === 413) {
      throw new Error(
        `O servidor web recusou o vídeo (${Math.round(webm.size / 1048576)} MB) por tamanho. Aumente o limite de upload do proxy (nginx: client_max_body_size 500M).`
      );
    }
    if (resposta.status === 404) {
      throw new Error('O servidor ainda não tem a conversão para MP4. Publique a versão nova e reinicie o backend.');
    }
    const dados = await resposta.json().catch(() => null);
    throw new Error(dados?.error || `O servidor não converteu o vídeo (erro ${resposta.status}).`);
  }
  const mp4 = await resposta.blob();
  if (!mp4.size) throw new Error('O servidor devolveu um MP4 vazio.');
  return new Blob([mp4], { type: 'video/mp4' });
}