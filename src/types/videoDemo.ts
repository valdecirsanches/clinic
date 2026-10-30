/** Controles de áudio da apresentação (pré-visualização e vídeo) */
export interface AjustesAudio {
  musicaAtiva: boolean;
  /** 0–1 */
  volumeMusica: number;
  /** 0–1 */
  volumeNarracao: number;
  /** Abaixa a música enquanto a voz fala */
  abaixarNaFala: boolean;
  /** Música entra e sai suavemente */
  suavizar: boolean;
}

/** Música de fundo: a trilha composta pelo sistema ou um arquivo escolhido */
export interface MusicaEscolhida {
  origem: 'sistema' | 'arquivo';
  nome: string;
  url: string;
}