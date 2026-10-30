/**
 * ⭐ Helper centralizado de permissões de menu.
 *
 * As permissões do usuário são gravadas em `localStorage.sessao.usuario.permissoesMenu`
 * pelo backend no login. Cada item é uma string MenuItemId (ex.: 'agenda',
 * 'prontuarios', 'pacientes', 'cobrancas', etc.).
 *
 * Este módulo é a FONTE ÚNICA para checar se o usuário logado pode acessar
 * uma determinada área. Use-o em todo botão/ação que leve a uma página
 * controlada por permissão, para evitar vazamentos (ex.: botão "Prontuário"
 * dentro da página de Pacientes que abria o atendimento mesmo quando o
 * atendente não tinha permissão de 'prontuarios').
 */

type SessaoUsuario = {
  permissoesMenu?: string[];
  tipo?: string;
};
function lerSessao(): {
  usuario?: SessaoUsuario;
} | null {
  try {
    const raw = localStorage.getItem('sessao');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ⭐ Itens "básicos" do sistema: ficam sempre visíveis para qualquer usuário
// autenticado, mesmo quando o admin definiu uma whitelist customizada em
// permissoesMenu. Negar prontuário ou agenda NÃO deve esconder Pacientes /
// Empresas — esses são itens de uso geral.
export const MENU_ITENS_BASICOS_SEMPRE_VISIVEIS = ['dashboard', 'pacientes', 'empresas_conveniadas'
// ⭐ 'fila_atendimento' NÃO é básico — admin pode bloquear via permissões.
// ⭐ 'agenda' também NÃO é básico — admin pode bloquear via permissões.
] as const;

/**
 * Retorna true se o usuário logado tem permissão para o menuId informado.
 *
 * Regras:
 * - super_admin SEMPRE tem acesso a tudo (escape hatch absoluto).
 * - Se o array `permissoesMenu` existir e tiver itens, ele é a fonte da verdade
 *   (whitelist explícita): só permite o que estiver listado.
 * - Se `permissoesMenu` estiver vazio/ausente, libera (compatibilidade com
 *   usuários antigos que ainda não tiveram permissões customizadas) —
 *   nesse caso o filtro fica a cargo do tipoUsuario na Sidebar.
 */
export function temPermissao(menuId: string): boolean {
  const sessao = lerSessao();
  if (!sessao) return false;
  const usuario = sessao.usuario;
  if (!usuario) return false;
  // super_admin nunca é bloqueado
  if (usuario.tipo === 'super_admin') return true;
  // ⭐ Itens básicos do sistema ficam sempre disponíveis (independente da
  // whitelist customizada). Isso evita que negar 'prontuarios' acabe
  // bloqueando 'pacientes' e 'empresas' por tabela.
  if ((MENU_ITENS_BASICOS_SEMPRE_VISIVEIS as readonly string[]).includes(menuId)) {
    return true;
  }
  const perms = usuario.permissoesMenu;
  if (Array.isArray(perms) && perms.length > 0) {
    return perms.includes(menuId);
  }
  // Sem lista customizada → segue tipoUsuario (não bloqueia aqui).
  return true;
}

/**
 * Atalho para checar várias permissões. Retorna true se TODAS forem concedidas.
 */
export function temTodasPermissoes(...menuIds: string[]): boolean {
  return menuIds.every((id) => temPermissao(id));
}

/**
 * Atalho para checar várias permissões. Retorna true se PELO MENOS UMA for concedida.
 */
export function temAlgumaPermissao(...menuIds: string[]): boolean {
  return menuIds.some((id) => temPermissao(id));
}