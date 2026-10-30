
export default {
  plugins: {
    // 🔧 Config do Tailwind INLINE aqui (não dependemos de resolver o arquivo
    //    tailwind.config.js, que em alguns ambientes era resolvido para a pasta
    //    errada/vazia → CSS sem utilities, tela "sem formatação"). Com o
    //    `content` embutido, o Tailwind SEMPRE varre os fontes corretos.
    tailwindcss: {
      content: [
      './index.html',
      './index.tsx',
      './App.tsx',
      './components/**/*.{ts,tsx}',
      './pages/**/*.{ts,tsx}',
      './contexts/**/*.{ts,tsx}',
      './hooks/**/*.{ts,tsx}',
      './utils/**/*.{ts,tsx}'],

      theme: { extend: {} },
      plugins: []
    },
    autoprefixer: {}
  }
};