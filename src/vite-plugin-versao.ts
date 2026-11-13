// ==================== VERSÃO PUBLICADA (/versao.json) ====================
// O navegador de quem está com o sistema aberto não sabe que saiu versão nova.
// Este plugin publica /versao.json com o commit atual do git; o app
// (components/AvisoNovaVersao.tsx) compara com o que carregou e avisa.
//   - `npm run dev`: responde ao vivo (depois de um `git pull`, já muda).
//   - `npm run build`: grava dist/versao.json.
// Também injeta __BUILD_TIMESTAMP__ (usado por config/version.ts).
// Para o aviso mostrar o que mudou, inclua no commit uma linha:
//   Novidade: Ajuda por voz em todas as telas (botão ? ou F1).
import { execSync } from 'child_process';
import type { Plugin } from 'vite';

export interface InfoVersao {
  /** Identificador que muda a cada versão publicada (commit ou horário). */
  id: string;
  commit: string | null;
  /** Data da versão (ISO). */
  data: string;
  /** Resumo para o usuário (linha "Novidade: ..." do último commit). */
  novidade: string | null;
}

function git(args: string, cwd: string): string | null {
  try {
    return execSync(`git ${args}`, { cwd, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

function lerVersao(cwd: string, inicio: string): InfoVersao {
  const commit = git('rev-parse --short HEAD', cwd);
  return {
    id: commit || inicio,
    commit,
    data: (commit && git('log -1 --format=%cI', cwd)) || inicio,
    novidade: commit ? novidadeDoCommit(git('log -1 --format=%B', cwd)) : null
  };
}

/**
 * Texto para o USUÁRIO da clínica: a linha "Novidade: ..." da mensagem do
 * commit. Sem ela, o aviso não mostra resumo (o título do commit é técnico).
 */
export function novidadeDoCommit(mensagem: string | null): string | null {
  const linha = String(mensagem || '').split('\n').find((l) => /^\s*novidade\s*:/i.test(l));
  const texto = linha ? linha.replace(/^\s*novidade\s*:\s*/i, '').trim() : '';
  return texto ? texto.slice(0, 200) : null;
}

export function pluginVersao(raiz: string = __dirname): Plugin {
  const inicio = new Date().toISOString();
  let emCache: InfoVersao | null = null;
  let validoAte = 0;
  const atual = () => {
    if (!emCache || Date.now() > validoAte) {
      emCache = lerVersao(raiz, inicio);
      validoAte = Date.now() + 15000;
    }
    return emCache;
  };

  return {
    name: 'easyclin-versao',
    config() {
      return { define: { __BUILD_TIMESTAMP__: JSON.stringify(inicio) } };
    },
    configureServer(server) {
      server.middlewares.use('/versao.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(atual()));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'versao.json', source: JSON.stringify(atual()) });
    }
  };
}
