import React from 'react';
import {
  ARCADAS,
  COR,
  Denticao,
  Face,
  OdontogramaDados,
  corDaCondicao,
  infoDente,
  nomeFace,
  normalizarDente,
  NOME_CONDICAO } from
'./modelo';

// ==================== ARCADAS (SVG) ====================
// Desenho único das arcadas: silhueta anatômica de cada dente (coroa + raízes)
// e o diagrama das 5 faces junto ao plano oclusal, como nas fichas clínicas.
// Usado na tela (interativo) e na impressão (renderToStaticMarkup).

const LARGURA: Record<string, number> = { molar: 46, premolar: 38, canino: 36, incisivo: 34 };
const LARGURA_DECIDUO: Record<string, number> = { molar: 40, premolar: 36, canino: 31, incisivo: 29 };
const ESPACO = 5;
const LINHA_MEDIA = 18;
const ALT_SILHUETA = 82;
const LADO_FACE = 26;
const MARGEM = 16;

function larguraDente(numero: string) {
  const i = infoDente(numero);
  return (i.decidua ? LARGURA_DECIDUO : LARGURA)[i.tipo];
}

/** Centros (x) das raízes, em fração da largura. */
function raizes(numero: string): number[] {
  const i = infoDente(numero);
  if (i.tipo === 'molar') return i.superior ? [0.24, 0.5, 0.76] : [0.3, 0.7];
  if (numero === '14' || numero === '24') return [0.34, 0.66]; // 1º pré-molar superior
  return [0.5];
}

function caminhoCoroa(w: number, tipo: string): string {
  const m = w * 0.1;
  const nl = w * 0.24;
  const nr = w * 0.76;
  const e = m + 1;
  const d = w - m - 1;
  let borda: string;
  if (tipo === 'molar') borda = `Q ${w * 0.17} 81 ${w * 0.34} 76 Q ${w * 0.5} 82 ${w * 0.66} 76 Q ${w * 0.83} 81 ${d} 71`;else
  if (tipo === 'premolar') borda = `Q ${w * 0.26} 81 ${w * 0.5} 76 Q ${w * 0.74} 81 ${d} 71`;else
  if (tipo === 'canino') borda = `Q ${w * 0.3} 78 ${w * 0.5} 83 Q ${w * 0.7} 78 ${d} 71`;else
  borda = `Q ${w * 0.5} 80 ${d} 71`;
  return `M ${nl} 41 C ${m} 45 ${m} 58 ${e} 71 ${borda} C ${w - m} 58 ${w - m} 45 ${nr} 41 Z`;
}

function caminhoRaiz(w: number, cx: number, topo: number, largura: number): string {
  const x = w * cx;
  const meia = largura / 2;
  return `M ${x - meia} 46 C ${x - meia - 1} 32 ${x - 3} ${topo + 8} ${x} ${topo} C ${x + 3} ${topo + 8} ${x + meia + 1} 32 ${x + meia} 46 Z`;
}

function topoRaiz(numero: string): number {
  const i = infoDente(numero);
  if (i.decidua) return 18;
  if (i.tipo === 'canino') return 2;
  if (i.tipo === 'molar') return 10;
  return 7;
}

interface PropsArcadas {
  dados: OdontogramaDados;
  denticao: Denticao;
  selecionado?: string | null;
  interativo?: boolean;
  /** Dente em destaque ao passar o mouse sobre um achado */
  destaque?: string | null;
  onDente?: (numero: string) => void;
  onFace?: (numero: string, face: Face) => void;
  titulo?: string;
}

export function ArcadasSvg({
  dados,
  denticao,
  selecionado,
  interativo = false,
  destaque,
  onDente,
  onFace,
  titulo = 'Odontograma'
}: PropsArcadas) {
  const fileiras: {dentes: string[][];superior: boolean;}[] = [];
  if (denticao !== 'decidua') fileiras.push({ dentes: ARCADAS.permanente.superior, superior: true });
  if (denticao !== 'permanente') fileiras.push({ dentes: ARCADAS.decidua.superior, superior: true });
  if (denticao !== 'permanente') fileiras.push({ dentes: ARCADAS.decidua.inferior, superior: false });
  if (denticao !== 'decidua') fileiras.push({ dentes: ARCADAS.permanente.inferior, superior: false });

  const larguraQuadrante = (q: string[]) => q.reduce((s, n) => s + larguraDente(n), 0) + ESPACO * (q.length - 1);
  const largurasFileira = fileiras.map((f) => larguraQuadrante(f.dentes[0]) + LINHA_MEDIA + larguraQuadrante(f.dentes[1]));
  const larguraTotal = Math.max(...largurasFileira) + MARGEM * 2;
  const centro = larguraTotal / 2;
  const ALT_FILEIRA = ALT_SILHUETA + 8 + LADO_FACE + 20;
  const VAO_OCLUSAL = 18;
  const VAO_MISTA = 10;

  let y = MARGEM;
  const posicoes = fileiras.map((f, i) => {
    const anterior = fileiras[i - 1];
    if (i > 0) y += anterior.superior && !f.superior ? VAO_OCLUSAL : VAO_MISTA;
    const pos = { ...f, y };
    y += ALT_FILEIRA;
    return pos;
  });
  const alturaTotal = y + MARGEM;

  const renderDente = (numero: string, x: number, yFileira: number, superior: boolean) => {
    const w = larguraDente(numero);
    const info = infoDente(numero);
    const { condicoesFaces, marcas } = normalizarDente(dados[numero]);
    const tem = (m: string) => marcas.includes(m as any);
    const ausente = tem('extraido');
    const implante = tem('implante');
    const coroaMarca = tem('protese') ? corDaCondicao('protese') : tem('cariado') ? corDaCondicao('cariado') : tem('restaurado') ? corDaCondicao('restaurado') : null;
    const ativo = selecionado === numero;
    const realce = destaque === numero;

    // Silhueta: em cima na arcada superior (raiz para cima); embaixo na inferior
    const ySil = superior ? yFileira : yFileira + LADO_FACE + 28;
    const yFace = superior ? yFileira + ALT_SILHUETA + 8 : yFileira + 18;
    const yNum = superior ? yFace + LADO_FACE + 14 : yFileira + 11;
    const transformSil = superior ?
    `translate(${x} ${ySil})` :
    `translate(${x} ${ySil + ALT_SILHUETA}) scale(1 -1)`;

    const topo = topoRaiz(numero);
    const centrosRaiz = raizes(numero);
    const largRaiz = centrosRaiz.length > 1 ? w * 0.2 : w * 0.34;

    // Diagrama das faces: superior → vestibular em cima; inferior → em baixo.
    // Mesial fica do lado da linha média.
    const s = LADO_FACE;
    const k = s * 0.3;
    const fx = x + (w - s) / 2;
    const mesialADireita = info.direito;
    const regioes: {face: Face;pontos: string;}[] = [
    { face: superior ? 'vestibular' : 'lingual', pontos: `0,0 ${s},0 ${s - k},${k} ${k},${k}` },
    { face: superior ? 'lingual' : 'vestibular', pontos: `0,${s} ${k},${s - k} ${s - k},${s - k} ${s},${s}` },
    { face: mesialADireita ? 'distal' : 'mesial', pontos: `0,0 ${k},${k} ${k},${s - k} 0,${s}` },
    { face: mesialADireita ? 'mesial' : 'distal', pontos: `${s},0 ${s},${s} ${s - k},${s - k} ${s - k},${k}` },
    { face: 'oclusal', pontos: `${k},${k} ${s - k},${k} ${s - k},${s - k} ${k},${s - k}` }];


    const descricao = [info.nome, ...marcas.map((m) => NOME_CONDICAO[m]),
    ...(Object.keys(condicoesFaces) as Face[]).map((f) => `${nomeFace(f, numero)}: ${NOME_CONDICAO[condicoesFaces[f] as string]}`)].
    join('. ');

    return (
      <g
        key={numero}
        className={interativo ? 'odg-dente' : undefined}
        role={interativo ? 'button' : undefined}
        tabIndex={interativo ? 0 : undefined}
        aria-label={interativo ? `Dente ${numero}. ${descricao}` : undefined}
        aria-pressed={interativo ? ativo : undefined}
        onClick={interativo ? () => onDente?.(numero) : undefined}
        onKeyDown={interativo ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onDente?.(numero);
          }
        } : undefined}>

        <title>{`${numero} — ${descricao}`}</title>
        {/* Área de seleção */}
        <rect
          x={x - 3}
          y={yFileira - 4}
          width={w + 6}
          height={ALT_FILEIRA + 2}
          rx={10}
          className="odg-fundo"
          fill={ativo ? '#0D94881A' : realce ? '#0D94880F' : 'transparent'}
          stroke={ativo ? '#0D9488' : 'none'}
          strokeWidth={1.5} />


        {/* Silhueta */}
        <g transform={transformSil} opacity={ausente ? 0.55 : 1}>
          {!implante && centrosRaiz.map((c, i) =>
          <path
            key={i}
            d={caminhoRaiz(w, c, topo + (centrosRaiz.length === 3 && i === 1 ? 6 : 0), largRaiz)}
            fill={ausente ? 'none' : COR.raiz}
            stroke={ausente ? COR.ausente : COR.raizBorda}
            strokeWidth={1.2}
            strokeDasharray={ausente ? '3 3' : undefined} />
          )}
          {implante &&
          <g>
              <rect x={w / 2 - w * 0.13} y={topo + 6} width={w * 0.26} height={42 - topo} rx={3} fill={COR.tratadoClaro} stroke={COR.tratado} strokeWidth={1.4} />
              {Array.from({ length: 6 }).map((_, i) =>
            <line key={i} x1={w / 2 - w * 0.16} x2={w / 2 + w * 0.16} y1={topo + 11 + i * ((36 - topo) / 6)} y2={topo + 14 + i * ((36 - topo) / 6)} stroke={COR.tratado} strokeWidth={1.2} />
            )}
            </g>
          }
          {tem('tratamento_canal') && !implante && centrosRaiz.map((c, i) =>
          <line key={`canal${i}`} x1={w * c} y1={44} x2={w * c} y2={topo + 9} stroke={COR.tratado} strokeWidth={2.4} strokeLinecap="round" />
          )}
          <path
            d={caminhoCoroa(w, info.tipo === 'premolar' && info.decidua ? 'molar' : info.tipo)}
            fill={ausente ? 'none' : coroaMarca ? coroaMarca.clara : COR.esmalte}
            stroke={ausente ? COR.ausente : coroaMarca ? coroaMarca.forte : COR.esmalteBorda}
            strokeWidth={coroaMarca ? 2.2 : 1.3}
            strokeDasharray={ausente ? '3 3' : undefined} />

          {/* Brilho do esmalte */}
          {!ausente && !coroaMarca &&
          <path d={`M ${w * 0.3} 50 C ${w * 0.26} 56 ${w * 0.27} 62 ${w * 0.3} 66`} stroke="#E6EBF0" strokeWidth={2} fill="none" strokeLinecap="round" />
          }
          {tem('fratura') &&
          <polyline points={`${w * 0.18},56 ${w * 0.38},64 ${w * 0.5},56 ${w * 0.64},66 ${w * 0.84},58`} fill="none" stroke={COR.tratar} strokeWidth={2.2} strokeLinejoin="round" />
          }
          {(ausente || tem('extracao_indicada')) &&
          <g stroke={ausente ? '#94A3B8' : COR.tratar} strokeWidth={2.4} strokeLinecap="round">
              <line x1={w * 0.12} y1={12} x2={w * 0.88} y2={78} />
              <line x1={w * 0.88} y1={12} x2={w * 0.12} y2={78} />
            </g>
          }
        </g>

        {/* Faces */}
        <g transform={`translate(${fx} ${yFace})`} opacity={ausente ? 0.35 : 1}>
          {regioes.map(({ face, pontos }) => {
            const cond = condicoesFaces[face];
            const cor = cond ? corDaCondicao(cond) : null;
            return (
              <polygon
                key={face}
                points={pontos}
                className={interativo ? 'odg-face' : undefined}
                fill={cor ? cor.forte : '#FFFFFF'}
                fillOpacity={cor ? 0.88 : 1}
                stroke={cor ? '#FFFFFF' : COR.esmalteBorda}
                strokeWidth={1}
                onClick={interativo && onFace ? (e) => {
                  e.stopPropagation();
                  onFace(numero, face);
                } : undefined}>

                <title>{`${numero} — ${nomeFace(face, numero)}${cond ? `: ${NOME_CONDICAO[cond]}` : ''}`}</title>
              </polygon>);

          })}
          <rect x={0} y={0} width={s} height={s} fill="none" stroke={COR.esmalteBorda} strokeWidth={1} pointerEvents="none" />
        </g>

        <text
          x={x + w / 2}
          y={yNum}
          textAnchor="middle"
          fontSize={11}
          fontWeight={ativo ? 700 : 600}
          fill={ativo ? '#0D9488' : COR.texto}
          style={{ fontVariantNumeric: 'tabular-nums' }}>
          {numero}
        </text>
      </g>);

  };

  return (
    <svg
      viewBox={`0 0 ${larguraTotal} ${alturaTotal}`}
      width="100%"
      role="img"
      aria-label={titulo}
      style={{ maxWidth: larguraTotal * 1.45, display: 'block', margin: '0 auto', fontFamily: 'inherit' }}>

      {interativo &&
      <style>{`
          .odg-dente { cursor: pointer; outline: none; }
          .odg-dente:hover .odg-fundo { fill: #0D94880D; }
          .odg-dente:focus-visible .odg-fundo { stroke: #0D9488; stroke-dasharray: 4 3; }
          .odg-face:hover { fill-opacity: .6; stroke: #0D9488; stroke-width: 1.4; }
        `}</style>
      }
      {posicoes.map((f, i) => {
        const largura = largurasFileira[i];
        const inicio = centro - largura / 2;
        // Faixa de gengiva na altura do colo dos dentes
        const yColo = f.superior ? f.y + 32 : f.y + LADO_FACE + 28 + ALT_SILHUETA - 48;
        let x = inicio;
        const dentes: React.ReactNode[] = [];
        f.dentes[0].forEach((n) => {
          dentes.push(renderDente(n, x, f.y, f.superior));
          x += larguraDente(n) + ESPACO;
        });
        x += LINHA_MEDIA - ESPACO;
        f.dentes[1].forEach((n) => {
          dentes.push(renderDente(n, x, f.y, f.superior));
          x += larguraDente(n) + ESPACO;
        });
        return (
          <g key={i}>
            <rect x={inicio - 6} y={yColo} width={largura + 12} height={16} rx={8} fill={COR.gengiva} opacity={0.4} />
            <line
              x1={centro}
              x2={centro}
              y1={f.y}
              y2={f.y + ALT_FILEIRA - 6}
              stroke="#E2E8F0"
              strokeWidth={1}
              strokeDasharray="2 4" />

            {dentes}
          </g>);

      })}
    </svg>);

}
