// ==================== CONVERSÃO WEBM → MP4 (ffmpeg) ====================
// O navegador que só grava WebM envia o vídeo; o servidor devolve MP4 (H.264 +
// AAC, "faststart"), formato que abre em qualquer celular, WhatsApp e Windows.
// Usa o ffmpeg do pacote ffmpeg-static; sem ele, o "ffmpeg" instalado no
// sistema (FFMPEG_PATH no server/.env.local, se estiver fora do PATH).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const LIMITE_MS = 10 * 60 * 1000;

function caminhoFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const estatico = require('ffmpeg-static');
    if (estatico && fs.existsSync(estatico)) return estatico;
  } catch {

    // pacote não instalado: tenta o do sistema
  }return 'ffmpeg';
}

function pastaTemporaria() {
  const base = process.env.BACKUP_TEMP_DIR || os.tmpdir();
  const pasta = path.join(base, 'easyclin-video');
  fs.mkdirSync(pasta, { recursive: true });
  return pasta;
}

/** Converte o buffer WebM e devolve o caminho do MP4 (quem chama apaga) */
function converter(bufferWebm) {
  return new Promise((resolve, reject) => {
    const pasta = pastaTemporaria();
    const base = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entrada = path.join(pasta, `${base}.webm`);
    const saida = path.join(pasta, `${base}.mp4`);
    fs.writeFileSync(entrada, bufferWebm);

    const args = [
    '-y', '-i', entrada,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
    '-pix_fmt', 'yuv420p', '-r', '30',
    // largura/altura pares (exigência do H.264)
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    saida];

    let erroTexto = '';
    let processo;
    try {
      processo = spawn(caminhoFfmpeg(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      fs.rmSync(entrada, { force: true });
      return reject(new Error(`ffmpeg indisponível no servidor: ${err.message}`));
    }
    const limite = setTimeout(() => processo.kill('SIGKILL'), LIMITE_MS);
    processo.stderr.on('data', (d) => {
      erroTexto = (erroTexto + d.toString()).slice(-2000);
    });
    processo.on('error', (err) => {
      clearTimeout(limite);
      fs.rmSync(entrada, { force: true });
      fs.rmSync(saida, { force: true });
      reject(
        new Error(
          err.code === 'ENOENT' ?
          'ffmpeg não está instalado no servidor. Rode "npm install" na pasta server (instala o ffmpeg-static) ou instale o ffmpeg.' :
          `ffmpeg falhou: ${err.message}`
        )
      );
    });
    processo.on('close', (codigo) => {
      clearTimeout(limite);
      fs.rmSync(entrada, { force: true });
      if (codigo === 0 && fs.existsSync(saida)) return resolve(saida);
      fs.rmSync(saida, { force: true });
      const ultima = erroTexto.trim().split('\n').pop() || '';
      reject(new Error(`A conversão para MP4 falhou (código ${codigo}). ${ultima}`.trim()));
    });
  });
}

module.exports = { converter };