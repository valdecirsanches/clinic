import { useState, useEffect, useCallback } from 'react';
import { AgendaProfissional } from '../types';
import { API_BASE_URL, isMagicPatterns } from '../config/api';
import { useRevalidacao } from './useRevalidacao';
export function useAgendaProfissional(clinicaId?: string) {
  const [agendas, setAgendas] = useState<AgendaProfissional[]>([]);
  const [loading, setLoading] = useState(true);
  // ⭐ useCallback: referência estável, exigida pela revalidação
  const loadAgendas = useCallback(async () => {
    if (!clinicaId || isMagicPatterns) return;
    try {
      console.log('📋 [useAgendaProfissional] Carregando agendas da clínica via API:', clinicaId);
      const response = await fetch(`${API_BASE_URL}/api/agendas?clinicaId=${clinicaId}`);
      console.log('📡 [useAgendaProfissional] Response status:', response.status);
      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }
      const data = await response.json();
      console.log('✅ [useAgendaProfissional] Agendas carregadas via API:', data);
      console.log('📊 [useAgendaProfissional] Total de agendas:', data.length);

      // Log detalhado de cada agenda com verificação de dias da semana
      const diasNomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      data.forEach((agenda: any, index: number) => {
        console.log(`\n📅 [useAgendaProfissional] Agenda ${index + 1}: ${agenda.profissionalNome}`);
        console.log(`   ID: ${agenda.id}`);
        console.log(`   profissionalId: ${agenda.profissionalId}`);
        console.log(`   Total horários: ${agenda.horarios?.length || 0}`);
        if (agenda.horarios && agenda.horarios.length > 0) {
          console.log('   🕐 Horários configurados:');
          agenda.horarios.forEach((h: any, i: number) => {
            const diaNome = diasNomes[h.diaSemana] || `Dia ${h.diaSemana}`;
            console.log(`      ${i + 1}. ${diaNome} (${h.diaSemana}): ${h.horaInicio} - ${h.horaFim}`);
          });

          // Verifica se tem sexta-feira (5)
          const temSexta = agenda.horarios.some((h: any) => Number(h.diaSemana) === 5);
          if (temSexta) {
            console.log('   ⚠️ ATENÇÃO: Esta agenda TEM sexta-feira configurada!');
          } else {
            console.log('   ✅ Esta agenda NÃO tem sexta-feira');
          }
        }
      });
      setAgendas(data as AgendaProfissional[]);
    } catch (error) {
      console.error('❌ [useAgendaProfissional] Erro ao carregar agendas via API:', error);
      setAgendas([]);
    } finally {
      setLoading(false);
    }
  }, [clinicaId]);
  useEffect(() => {
    if (!clinicaId) {
      console.warn('⚠️ useAgendaProfissional: clinicaId não fornecido');
      setLoading(false);
      return;
    }
    loadAgendas();
  }, [clinicaId, loadAgendas]);
  // Horários alterados em outro terminal refletem aqui
  useRevalidacao(loadAgendas, {
    intervalo: 60000,
    pausado: !clinicaId
  });
  const addAgenda = async (agenda: Omit<AgendaProfissional, 'id' | 'criadoEm'>) => {
    if (!clinicaId) {
      throw new Error('clinicaId não definido');
    }
    try {
      console.log('➕ [useAgendaProfissional] Adicionando agenda via API:', agenda);
      console.log('➕ [useAgendaProfissional] Horários a enviar:', JSON.stringify(agenda.horarios, null, 2));
      const payload = {
        ...agenda,
        clinicaId
      };
      console.log('➕ [useAgendaProfissional] Payload completo:', JSON.stringify(payload, null, 2));
      const response = await fetch(`${API_BASE_URL}/api/agendas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      console.log('➕ [useAgendaProfissional] Response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json();
        console.error('➕ [useAgendaProfissional] Erro do servidor:', errorData);
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      const newAgenda = await response.json();
      console.log('✅ [useAgendaProfissional] Agenda criada via API:', newAgenda);
      await loadAgendas();
      return newAgenda;
    } catch (error: any) {
      console.error('❌ [useAgendaProfissional] Erro ao adicionar agenda via API:', error);
      throw error;
    }
  };
  const updateAgenda = async (id: string, updates: Partial<AgendaProfissional>) => {
    if (!clinicaId) {
      throw new Error('clinicaId não definido');
    }
    try {
      console.log('📝 [useAgendaProfissional] Atualizando agenda via API:', id);
      console.log('📝 [useAgendaProfissional] Updates:', JSON.stringify(updates, null, 2));
      console.log('📝 [useAgendaProfissional] Horários a enviar:', JSON.stringify(updates.horarios, null, 2));
      const payload = {
        ...updates,
        clinicaId
      };
      console.log('📝 [useAgendaProfissional] Payload completo:', JSON.stringify(payload, null, 2));
      const response = await fetch(`${API_BASE_URL}/api/agendas/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      console.log('📝 [useAgendaProfissional] Response status:', response.status);
      const responseText = await response.text();
      console.log('📝 [useAgendaProfissional] Response body:', responseText);
      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = {
            error: responseText
          };
        }
        console.error('📝 [useAgendaProfissional] Erro do servidor:', errorData);
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      console.log('✅ [useAgendaProfissional] Agenda atualizada via API');
      await loadAgendas();
    } catch (error: any) {
      console.error('❌ [useAgendaProfissional] Erro ao atualizar agenda via API:', error);
      throw error;
    }
  };
  const deleteAgenda = async (id: string) => {
    if (!clinicaId) {
      throw new Error('clinicaId não definido');
    }
    try {
      console.log('🗑️ Deletando agenda via API:', id);
      const response = await fetch(`${API_BASE_URL}/api/agendas/${id}?clinicaId=${clinicaId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      console.log('✅ Agenda deletada via API');
      await loadAgendas();
    } catch (error: any) {
      console.error('❌ Erro ao deletar agenda via API:', error);
      throw error;
    }
  };

  // ⭐ NOVO: Toggle abrir/fechar agenda
  // Fechar só é permitido se não houver consultas futuras
  const toggleAgenda = async (id: string, ativo: boolean): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!clinicaId) {
      throw new Error('clinicaId não definido');
    }
    try {
      console.log(`🔄 [useAgendaProfissional] Toggle agenda ${id}: ativo=${ativo}`);
      const response = await fetch(`${API_BASE_URL}/api/agendas/${id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          ativo
        })
      });
      const data = await response.json();
      if (!response.ok) {
        console.warn('⚠️ [useAgendaProfissional] Toggle recusado:', data.error);
        return {
          success: false,
          error: data.error
        };
      }
      console.log(`✅ [useAgendaProfissional] Agenda ${ativo ? 'ABERTA' : 'FECHADA'}`);
      await loadAgendas();
      return {
        success: true
      };
    } catch (error: any) {
      console.error('❌ [useAgendaProfissional] Erro no toggle:', error);
      return {
        success: false,
        error: error.message
      };
    }
  };
  return {
    agendas,
    loading,
    addAgenda,
    updateAgenda,
    deleteAgenda,
    toggleAgenda,
    refresh: loadAgendas
  };
}