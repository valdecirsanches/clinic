/**
 * Mouse simulado da apresentação: vai até o item do menu, "clica", e depois
 * passeia pelos elementos da tela como um usuário trabalhando.
 *
 * Os cliques são apenas visuais — nada é acionado no sistema. A troca de
 * tela continua sendo feita pelo roteiro.
 *
 * As coordenadas são as do sistema dentro do palco (1280×720 ou 390×844),
 * sem a escala da tela. Ficam num objeto único (`posicaoCursor`) lido tanto
 * pela camada visual do palco quanto pela gravação em modo compatível.
 */

export interface PosicaoCursor {
  x: number;
  y: number;
  visivel: boolean;
  /** performance.now() do último clique, para desenhar o "toque" */
  cliqueEm: number;
  /** Celular: mostra um toque (círculo) em vez da seta */
  toque: boolean;
}

export const posicaoCursor: PosicaoCursor = { x: 640, y: 360, visivel: false, cliqueEm: 0, toque: false };

/** Duração do efeito de clique (ms) */
export const DURACAO_CLIQUE_MS = 450;

/** Elementos que um usuário de verdade apontaria */
const ALVOS_CONTEUDO = [
'main button',
'main a[href]',
'main [role="tab"]',
'main tbody tr',
'main input:not([type="hidden"])',
'main select',
'main [role="button"]'].
join(',');

const suave = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const sortear = (min: number, max: number) => min + Math.random() * (max - min);

export class CursorDemo {
  private rodada = 0;
  private pausado = false;

  constructor(
  private iframe: () => HTMLIFrameElement | null,
  private tamanho: {w: number;h: number;},
  celular: boolean)
  {
    posicaoCursor.toque = celular;
    posicaoCursor.visivel = false;
    posicaoCursor.x = tamanho.w * 0.6;
    posicaoCursor.y = tamanho.h * 0.55;
  }

  private get doc(): Document | null {
    try {
      return this.iframe()?.contentDocument || null;
    } catch {
      return null;
    }
  }

  /** Centro do elemento, se estiver visível dentro do palco */
  private centro(el: Element | null): {x: number;y: number;} | null {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    const x = r.left + Math.min(r.width / 2, 60);
    const y = r.top + r.height / 2;
    if (x < 4 || y < 4 || x > this.tamanho.w - 4 || y > this.tamanho.h - 60) return null;
    return { x, y };
  }

  /** Espera sem contar pausa. false = a rodada foi trocada */
  private esperar(ms: number, minha: number): Promise<boolean> {
    return new Promise((resolve) => {
      let decorrido = 0;
      let anterior = performance.now();
      const passo = () => {
        if (this.rodada !== minha) return resolve(false);
        const agora = performance.now();
        if (!this.pausado) decorrido += agora - anterior;
        anterior = agora;
        if (decorrido >= ms) resolve(true);else
        requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    });
  }

  private mover(alvo: {x: number;y: number;}, ms: number, minha: number): Promise<boolean> {
    const inicio = { x: posicaoCursor.x, y: posicaoCursor.y };
    // Leve curva, como a mão de alguém
    const curva = sortear(-0.12, 0.12);
    posicaoCursor.visivel = true;
    return new Promise((resolve) => {
      let decorrido = 0;
      let anterior = performance.now();
      const passo = () => {
        if (this.rodada !== minha) return resolve(false);
        const agora = performance.now();
        if (!this.pausado) decorrido += agora - anterior;
        anterior = agora;
        const t = Math.min(1, decorrido / ms);
        const k = suave(t);
        const dx = alvo.x - inicio.x;
        const dy = alvo.y - inicio.y;
        const arco = Math.sin(Math.PI * k) * curva;
        posicaoCursor.x = inicio.x + dx * k - dy * arco;
        posicaoCursor.y = inicio.y + dy * k + dx * arco;
        if (t >= 1) resolve(true);else
        requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    });
  }

  private clicar() {
    posicaoCursor.cliqueEm = performance.now();
  }

  /** Duração do movimento proporcional à distância */
  private tempoAte(alvo: {x: number;y: number;}) {
    const d = Math.hypot(alvo.x - posicaoCursor.x, alvo.y - posicaoCursor.y);
    return Math.min(900, Math.max(320, d * 0.9));
  }

  /** Antes de trocar de tela: vai até o item do menu e clica */
  async irParaMenu(pagina: string, capa: boolean): Promise<void> {
    const minha = ++this.rodada;
    if (capa) {
      posicaoCursor.visivel = false;
      return;
    }
    const alvo = this.centro(this.doc?.querySelector(`[data-menu-id="${pagina}"]`) || null);
    if (!alvo) return;
    if (!(await this.mover(alvo, this.tempoAte(alvo), minha))) return;
    this.clicar();
    await this.esperar(160, minha);
  }

  /** Depois da troca: se o item só apareceu agora (grupo expandido), aponta para ele; depois passeia */
  async trabalhar(pagina: string, capa: boolean): Promise<void> {
    const minha = ++this.rodada;
    if (capa) {
      posicaoCursor.visivel = false;
      return;
    }
    posicaoCursor.visivel = true;
    if (!(await this.esperar(350, minha))) return;
    const menu = this.centro(this.doc?.querySelector(`[data-menu-id="${pagina}"]`) || null);
    if (menu && Math.hypot(menu.x - posicaoCursor.x, menu.y - posicaoCursor.y) > 40) {
      if (!(await this.mover(menu, this.tempoAte(menu), minha))) return;
      this.clicar();
      if (!(await this.esperar(400, minha))) return;
    }
    // Passeia pelos elementos da tela até a próxima cena
    let ultimo: Element | null = null;
    for (let passo = 0; passo < 40; passo += 1) {
      const candidatos = Array.from(this.doc?.querySelectorAll(ALVOS_CONTEUDO) || []).filter(
        (el) => el !== ultimo && this.centro(el)
      );
      if (!candidatos.length) {
        if (!(await this.esperar(800, minha))) return;
        continue;
      }
      // Prefere o que está perto do topo e do meio, como quem lê a tela
      const el = candidatos[Math.floor(Math.pow(Math.random(), 1.6) * Math.min(candidatos.length, 18))];
      ultimo = el;
      const c = this.centro(el);
      if (!c) continue;
      const alvo = { x: c.x + sortear(-8, 8), y: c.y + sortear(-3, 3) };
      if (!(await this.mover(alvo, this.tempoAte(alvo), minha))) return;
      // Clique visual de vez em quando em abas e botões
      const clicavel = el.matches('[role="tab"], main button');
      if (clicavel && Math.random() < 0.35) this.clicar();
      if (!(await this.esperar(sortear(900, 1600), minha))) return;
    }
  }

  pausar() {
    this.pausado = true;
  }

  retomar() {
    this.pausado = false;
  }

  parar() {
    this.rodada += 1;
    this.pausado = false;
    posicaoCursor.visivel = false;
  }
}