import React, { useState } from 'react';
import {
  MapPinIcon,
  CrosshairIcon,
  Loader2Icon,
  CheckCircleIcon,
  AlertTriangleIcon } from
'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useConfiguracoesGlobais } from '../../hooks/useConfiguracoesGlobais';
import {
  ConfigLocalPonto,
  CONFIG_LOCAL_PONTO_PADRAO,
  chaveConfigLocalPonto } from
'../../types/pontoLocalizacao';

interface ValidacaoLocalizacaoCardProps {
  clinicaId: string;
  podeEditar: boolean;
}

/**
 * Trava de localização do kiosk facial.
 *
 * A referência da clínica é capturada NO LOCAL (GPS do aparelho), não
 * geocodificada pelo endereço: geocodificação de endereço brasileiro erra com
 * frequência e era o que fazia o kiosk acusar quilômetros de distância com o
 * funcionário parado na porta da clínica.
 */
export function ValidacaoLocalizacaoCard({
  clinicaId,
  podeEditar
}: ValidacaoLocalizacaoCardProps) {
  const config = useConfiguracoesGlobais<ConfigLocalPonto>(
    chaveConfigLocalPonto(clinicaId),
    CONFIG_LOCAL_PONTO_PADRAO
  );
  const [capturando, setCapturando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{
    tipo: 'ok' | 'erro';
    texto: string;
  } | null>(null);

  const atual = { ...CONFIG_LOCAL_PONTO_PADRAO, ...config.valor };
  const temReferencia =
  typeof atual.latitude === 'number' && typeof atual.longitude === 'number';

  const gravar = async (novo: ConfigLocalPonto) => {
    setSalvando(true);
    setAviso(null);
    try {
      await config.salvar(novo);
      setAviso({ tipo: 'ok', texto: 'Configuração salva.' });
    } catch {
      setAviso({ tipo: 'erro', texto: 'Não foi possível salvar.' });
    } finally {
      setSalvando(false);
    }
  };

  const capturarLocalAtual = () => {
    if (!navigator.geolocation) {
      setAviso({
        tipo: 'erro',
        texto: 'Este navegador não informa a localização.'
      });
      return;
    }
    setCapturando(true);
    setAviso(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setCapturando(false);
        await gravar({
          ...atual,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          precisaoCaptura: Math.round(pos.coords.accuracy || 0),
          capturadoEm: new Date().toISOString()
        });
      },
      () => {
        setCapturando(false);
        setAviso({
          tipo: 'erro',
          texto:
          'Não foi possível obter a localização. Autorize o acesso e tente novamente.'
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  if (config.loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          Carregando configuração de localização...
        </div>
      </Card>);

  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <MapPinIcon
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-600"
            aria-hidden="true" />
          
          <div>
            <h3 className="font-semibold text-gray-900">
              Localização no kiosk facial
            </h3>
            <p className="mt-0.5 max-w-xl text-sm text-gray-600">
              Quando exigida, o funcionário só consegue marcar ponto dentro do
              raio definido a partir do ponto de referência da clínica.
            </p>
          </div>
        </div>

        <label className="flex flex-shrink-0 items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={atual.validar}
            disabled={!podeEditar || salvando}
            onChange={(e) => gravar({ ...atual, validar: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
          
          Exigir localização
        </label>
      </div>

      {atual.validar &&
      <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          <div>
            <p className="text-sm font-medium text-gray-700">
              Ponto de referência
            </p>
            {temReferencia ?
          <p className="mt-0.5 text-sm text-gray-600">
                {atual.latitude!.toFixed(6)}, {atual.longitude!.toFixed(6)}
                {atual.precisaoCaptura ?
            ` · precisão de ${atual.precisaoCaptura} m` :
            ''}
                {atual.capturadoEm ?
            ` · definido em ${new Date(atual.capturadoEm).toLocaleString('pt-BR')}` :
            ''}
              </p> :

          <p className="mt-0.5 flex items-start gap-1.5 text-sm text-amber-700">
                <AlertTriangleIcon
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              aria-hidden="true" />
            
                Nenhum ponto de referência definido. Sem ele o kiosk não tem
                como comparar a distância e vai pedir esta configuração.
              </p>
          }

            {podeEditar &&
          <Button
            variant="ghost"
            onClick={capturarLocalAtual}
            disabled={capturando || salvando}
            className="mt-2 text-teal-700 hover:bg-teal-50">
            
                {capturando ?
            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> :

            <CrosshairIcon className="mr-2 h-4 w-4" />
            }
                {capturando ?
            'Obtendo localização...' :
            temReferencia ?
            'Redefinir usando minha localização atual' :
            'Usar minha localização atual'}
              </Button>
          }
            <p className="mt-1 text-xs text-gray-500">
              Faça isso com este aparelho dentro da clínica. É mais preciso que
              buscar as coordenadas pelo endereço.
            </p>
          </div>

          <div>
            <label
            htmlFor="raio-ponto"
            className="block text-sm font-medium text-gray-700">
            
              Raio permitido
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
              id="raio-ponto"
              type="number"
              min={50}
              max={5000}
              step={50}
              value={atual.raioMetros}
              disabled={!podeEditar || salvando}
              onChange={(e) =>
              gravar({
                ...atual,
                raioMetros: Math.max(
                  50,
                  Math.min(5000, Number(e.target.value) || 150)
                )
              })
              }
              className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500" />
            
              <span className="text-sm text-gray-600">metros</span>
            </div>
          </div>
        </div>
      }

      {!atual.validar &&
      <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-600">
          A verificação está desligada: o kiosk libera a marcação sem consultar
          o GPS.
        </p>
      }

      {aviso &&
      <p
        className={`mt-3 flex items-center gap-1.5 text-sm ${aviso.tipo === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
        
          {aviso.tipo === 'ok' ?
        <CheckCircleIcon className="h-4 w-4" aria-hidden="true" /> :

        <AlertTriangleIcon className="h-4 w-4" aria-hidden="true" />
        }
          {aviso.texto}
        </p>
      }

      {!podeEditar &&
      <p className="mt-3 text-xs italic text-gray-500">
          Apenas um administrador altera esta configuração.
        </p>
      }
    </Card>);

}