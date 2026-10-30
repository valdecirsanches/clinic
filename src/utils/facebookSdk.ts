/**
 * Carregamento sob demanda do SDK do Facebook.
 *
 * A janela oficial de conexão da Meta (Embedded Signup) só existe através do
 * SDK. Ele é carregado apenas quando a clínica clica em "Conectar WhatsApp" —
 * assim não entra no bundle nem pesa para quem usa apenas o WAHA ou o SMS.
 */

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

export function carregarSdkFacebook(appId: string, apiVersion: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.FB) return resolve();

    const existente = document.getElementById('facebook-jssdk');
    if (existente) {
      // Já em carregamento por outra tela: aguarda a inicialização
      const aguardar = setInterval(() => {
        if (window.FB) {
          clearInterval(aguardar);
          resolve();
        }
      }, 200);
      setTimeout(() => {
        clearInterval(aguardar);
        if (!window.FB) reject(new Error('O SDK do Facebook não carregou'));
      }, 15000);
      return;
    }

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      try {
        window.FB.init({
          appId,
          cookie: true,
          xfbml: false,
          version: apiVersion
        });
        resolve();
      } catch (err: any) {
        reject(new Error(err?.message || 'Falha ao iniciar o SDK do Facebook'));
      }
    };
    script.onerror = () =>
    reject(new Error('Não foi possível carregar o SDK do Facebook'));
    document.body.appendChild(script);
  });
}