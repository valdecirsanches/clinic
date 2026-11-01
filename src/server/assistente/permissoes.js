// ==================== ASSISTENTE — PERMISSÕES ====================
// O assistente só enxerga o que o usuário enxerga no menu. Esta é a mesma
// regra de `temPermissao` em src/hooks/useAuth.ts; se uma mudar, mude a outra.
//
// Cada ferramenta do assistente declara a página a que pertence
// (`pagina: 'agenda'`); se o usuário não pode abrir a página, a ferramenta
// nem chega a ser oferecida à IA.

const TODOS = ['super_admin', 'admin', 'medico', 'dentista', 'atendente'];

// Páginas que nunca são bloqueadas por permissoesMenu customizado.
const PAGINAS_ESSENCIAIS = {
  agenda: TODOS,
  agenda_profissional: TODOS,
  fila_atendimento: TODOS,
  configuracoes: TODOS,
  prontuario_atendimento: TODOS
};

// Páginas que o admin sempre acessa, mesmo com permissões customizadas antigas.
const ADMIN_SEMPRE = [
'assinatura', 'backup', 'especialidades', 'auditoria', 'usuarios', 'clinicas',
'sessoes', 'ponto', 'ponto_facial', 'whatsapp_meta'];


// Padrão por tipo, quando o usuário não tem permissoesMenu.
const PADRAO = {
  dashboard: TODOS,
  agenda: TODOS,
  agenda_profissional: TODOS,
  fila_atendimento: TODOS,
  pacientes: TODOS,
  empresas_conveniadas: TODOS,
  convenios: TODOS,
  planos_saude: ['super_admin', 'admin'],
  cobrancas: TODOS,
  mensagens: TODOS,
  whatsapp_meta: ['super_admin', 'admin'],
  prontuarios: ['super_admin', 'admin', 'medico', 'dentista'],
  prontuario_atendimento: TODOS,
  procedimentos: ['super_admin', 'admin', 'medico', 'dentista'],
  configuracoes: TODOS,
  configuracoes_globais: ['super_admin'],
  planos: ['super_admin', 'admin'],
  memed_profissionais: ['super_admin', 'admin'],
  medicamentos: ['super_admin', 'admin', 'medico', 'dentista'],
  cid10: ['super_admin'],
  auditoria: ['super_admin', 'admin'],
  sessoes: ['super_admin'],
  especialidades: ['super_admin', 'admin'],
  operadoras: ['super_admin'],
  clinicas: ['super_admin', 'admin'],
  usuarios: ['super_admin', 'admin']
};

function lerPermissoesMenu(valor) {
  if (Array.isArray(valor)) return valor.map(String);
  if (typeof valor === 'string' && valor.trim()) {
    try {
      const lista = JSON.parse(valor);
      return Array.isArray(lista) ? lista.map(String) : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

/** O usuário pode abrir esta página do sistema? */
function podeAcessarPagina(usuario, pagina) {
  if (!usuario || !pagina) return false;
  const tipo = String(usuario.tipo || '');
  if (tipo === 'super_admin') return true;
  if (PAGINAS_ESSENCIAIS[pagina] && PAGINAS_ESSENCIAIS[pagina].includes(tipo)) return true;
  if (tipo === 'admin' && ADMIN_SEMPRE.includes(pagina)) return true;
  const menu = lerPermissoesMenu(usuario.permissoesMenu);
  if (menu.length) return menu.includes(pagina);
  return Boolean(PADRAO[pagina] && PADRAO[pagina].includes(tipo));
}

module.exports = { podeAcessarPagina, lerPermissoesMenu };
