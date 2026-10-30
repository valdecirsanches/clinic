import React, { useCallback, useEffect, useState, createContext, useContext } from 'react';
import { API_BASE_URL, isMagicPatterns } from '../config/api';
interface Usuario {
  id: string;
  nome: string;
  email: string;
  tipo: 'super_admin' | 'admin' | 'medico' | 'dentista' | 'atendente';
  clinicaId?: string;
  operadoraId?: string;
}
interface Clinica {
  id: string;
  nome: string;
  operadoraId: string;
}
interface AuthContextData {
  usuario: Usuario | null;
  clinicaAtual: Clinica | null;
  operadoraSelecionada: string | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
  selecionarClinica: (clinicaId: string) => Promise<void>;
  selecionarOperadora: (operadoraId: string) => void;
}
const AuthContext = createContext<AuthContextData>({} as AuthContextData);
export function AuthProvider({
  children


}: {children: React.ReactNode;}) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [clinicaAtual, setClinicaAtual] = useState<Clinica | null>(null);
  const [operadoraSelecionada, setOperadoraSelecionada] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Carrega sessão ao montar
  useEffect(() => {
    const carregarSessao = async () => {
      try {
        // No Magic Patterns, pula chamadas à API externa
        if (isMagicPatterns) {
          setLoading(false);
          return;
        }
        const token = localStorage.getItem('auth_token');
        if (!token) {
          setLoading(false);
          return;
        }
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (!response.ok) {
          localStorage.removeItem('auth_token');
          setLoading(false);
          return;
        }
        const data = await response.json();
        setUsuario(data.usuario);
        setClinicaAtual(data.clinicaAtual);
        setOperadoraSelecionada(data.operadoraSelecionada);
      } catch (err) {
        console.error('Erro ao carregar sessão:', err);
      } finally {
        setLoading(false);
      }
    };
    carregarSessao();
  }, []);
  const login = useCallback(async (email: string, senha: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        senha
      })
    });
    if (!response.ok) {
      throw new Error('Credenciais inválidas');
    }
    const data = await response.json();
    localStorage.setItem('auth_token', data.token);
    setUsuario(data.usuario);
    setClinicaAtual(data.clinicaAtual);
    setOperadoraSelecionada(data.operadoraSelecionada);
  }, []);
  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setUsuario(null);
    setClinicaAtual(null);
    setOperadoraSelecionada(null);
  }, []);
  const selecionarClinica = useCallback(async (clinicaId: string) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    const response = await fetch(`${API_BASE_URL}/api/auth/selecionar-clinica`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        clinicaId
      })
    });
    if (!response.ok) {
      throw new Error('Erro ao selecionar clínica');
    }
    const data = await response.json();
    setClinicaAtual(data.clinicaAtual);
  }, []);
  const selecionarOperadora = useCallback((operadoraId: string) => {
    setOperadoraSelecionada(operadoraId);
  }, []);
  return <AuthContext.Provider value={{
    usuario,
    clinicaAtual,
    operadoraSelecionada,
    loading,
    login,
    logout,
    selecionarClinica,
    selecionarOperadora
  }}>
      
      {children}
    </AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}