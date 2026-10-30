/**
 * Trava de localização do kiosk de ponto facial.
 *
 * A referência é capturada NO LOCAL pelo próprio aparelho (GPS) e guardada por
 * clínica. Geocodificar o endereço em tempo de execução se mostrou impreciso e
 * era a causa de o kiosk acusar quilômetros de distância com o funcionário
 * parado dentro da clínica.
 */
export interface ConfigLocalPonto {
  /** Exigir que a marcação aconteça dentro do raio. */
  validar: boolean;
  /** Raio permitido, em metros, a partir do ponto de referência. */
  raioMetros: number;
  latitude?: number | null;
  longitude?: number | null;
  /** Precisão informada pelo GPS no momento da captura, em metros. */
  precisaoCaptura?: number;
  capturadoEm?: string;
}

export const CONFIG_LOCAL_PONTO_PADRAO: ConfigLocalPonto = {
  validar: true,
  raioMetros: 150,
  latitude: null,
  longitude: null
};

export const chaveConfigLocalPonto = (clinicaId: string) =>
`ponto_facial_local_${clinicaId}`;

/** Distância em metros entre dois pontos (haversine). */
export function distanciaEmMetros(
lat1: number,
lon1: number,
lat2: number,
lon2: number)
: number {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a =
  Math.sin(dp / 2) * Math.sin(dp / 2) +
  Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}