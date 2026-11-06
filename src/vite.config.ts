import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
// ⚠️ Sem o prefixo `node:` — algumas versões do npm interpretam esses
// especificadores como pacotes a instalar e quebram com EINVALIDPACKAGENAME.
import fs from 'fs';
import path from 'path';

// ⭐ ONDE ESTÁ O .env.local
// Por padrão o Vite só procura os arquivos .env na RAIZ do projeto (a pasta do
// vite.config). Neste servidor o código fica em `src/` e o `.env.local` numa
// pasta acima — resultado: as variáveis VITE_* NUNCA chegavam ao build e o app
// usava silenciosamente a API padrão embutida no código (api.x-star.com.br),
// ignorando o domínio configurado. Aqui procuramos o arquivo subindo os
// diretórios e apontamos `envDir` para onde ele realmente está.
function localizarEnvDir(): string {
  const candidatos = [
  process.cwd(),
  path.resolve(process.cwd(), 'src'),
  path.resolve(process.cwd(), '..'),
  path.resolve(process.cwd(), '..', '..'),
  __dirname,
  path.resolve(__dirname, '..'),
  path.resolve(__dirname, '..', '..')];

  for (const dir of candidatos) {
    if (fs.existsSync(path.join(dir, '.env.local')) || fs.existsSync(path.join(dir, '.env'))) {
      console.log(`🔧 [vite] Variáveis de ambiente carregadas de: ${dir}`);
      return dir;
    }
  }
  console.warn('🔧 [vite] Nenhum .env.local encontrado — usando os padrões do código.');
  return process.cwd();
}

// Tons do Tailwind que leem variáveis CSS (aparência por usuário)
const TONS_TEMA = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const daVariavel = (prefixo: string) =>
Object.fromEntries(TONS_TEMA.map((t) => [t, `rgb(var(--${prefixo}-${t}) / <alpha-value>)`]));

// https://vitejs.dev/config/
// 🔧 Valores específicos de ambiente vêm de variáveis (.env.local, NÃO versionado).
//    Se não definidas, usa os padrões abaixo — então este arquivo não precisa ser
//    editado por servidor. Variáveis suportadas (ver .env.example):
//      VITE_ALLOWED_HOSTS  → lista separada por vírgula de hosts permitidos.
//                            Deixe em branco (padrão) para permitir QUALQUER host,
//                            ou use "all"/"*" para o mesmo efeito. Só defina uma
//                            lista se quiser restringir.
//      VITE_DEV_ORIGIN     → origin usada pelo dev server (Cloudflare/proxy)
//      VITE_HMR_HOST       → host do HMR (websocket)
//      VITE_PORT           → porta do dev server
export default defineConfig(({
  mode
}) => {
  const envDir = localizarEnvDir();
  const env = loadEnv(mode, envDir, '');
  // Deixa explícito no build QUAL API o app vai usar — evita descobrir isso
  // depois, em produção, por um erro de rede.
  console.log(`🔧 [vite] VITE_SERVER_DB = ${env.VITE_SERVER_DB || '(não definida → padrão do código)'}`);

  // Este ambiente fica atrás de proxy/Cloudflare e pode receber nomes públicos
  // diferentes. Aceitar todos os hosts evita que o Vite bloqueie a requisição
  // antes mesmo de o proxy encaminhá-la.
  const allowedHosts = true;

  // ⚠️ NÃO forçar origin/HMR fixos. Quando `server.origin` aponta para um domínio
  //    diferente daquele acessado, o Vite gera as URLs dos assets (inclusive CSS)
  //    para o host errado → a página carrega SEM o Tailwind ("tela sem formato").
  //    Sem origin/hmr.host, o Vite usa URLs relativas e infere o host da própria
  //    requisição — funciona em QUALQUER domínio sem edição por servidor.
  const port = Number(env.VITE_PORT || 5173);
  const server: Record<string, unknown> = {
    host: '0.0.0.0',
    port,
    strictPort: true,
    allowedHosts
  };
  return {
    // ⭐ Faz o Vite ler os .env do diretório onde eles realmente estão
    envDir,
    plugins: [react()],
    // 🔧 PostCSS/Tailwind declarado EXPLICITAMENTE aqui. Não dependemos da
    //    descoberta automática do postcss.config.js — em alguns ambientes
    //    (ESM + cwd diferente) o Vite não carregava o config e servia o CSS
    //    SEM as utilities do Tailwind (tela "sem formatação"). Inline garante
    //    que o Tailwind SEMPRE roda, em qualquer servidor.
    css: {
      postcss: {
        // ⭐ Config do Tailwind passada INLINE (content embutido). Não resolvemos
        //    nenhum tailwind.config.js de arquivo — em ambientes onde o
        //    node_modules fica numa pasta acima, o Vite resolvia um config
        //    vazio e o CSS saía SEM utilities ("content option missing or
        //    empty" → tela sem formatação). Inline elimina a resolução de
        //    arquivo: o Tailwind SEMPRE varre estes fontes.
        plugins: [tailwindcss({
          content: ['./index.html', './index.tsx', './App.tsx', './components/**/*.{ts,tsx}', './pages/**/*.{ts,tsx}', './contexts/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}', './utils/**/*.{ts,tsx}'],
          // Aparência por usuário (utils/temas.ts): "teal-*" (destaque) e
          // "gray-*" leem variáveis CSS (padrões em index.css).
          theme: {
            extend: {
              colors: {
                teal: daVariavel('destaque'),
                gray: daVariavel('cinza')
              }
            }
          },
          plugins: []
        }), autoprefixer()]
      }
    },
    server,
    preview: {
      host: '0.0.0.0',
      allowedHosts
    }
  };
});