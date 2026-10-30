
/**
 * Serviço de Integração com API Itaú - Boletos Registrados
 * 
 * Baseado na API oficial do Itaú para geração de boletos registrados.
 * Implementa OAuth 2.0 para autenticação e endpoints de registro/consulta.
 */

const fetch = require('node-fetch');
const { getDb } = require('../databaseGlobal');

/**
 * Obtém token OAuth do Itaú (com cache e renovação automática)
 */
async function obterTokenItau(bancoConfigId, forceRefresh = false) {
  const db = getDb();

  try {
    // Busca config bancária
    const config = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM configuracoes_banco WHERE id = ?',
        [bancoConfigId],
        (err, row) => {
          if (err) reject(err);else
          resolve(row);
        }
      );
    });

    if (!config) {
      throw new Error('Configuração bancária não encontrada');
    }

    if (!config.clientId || !config.clientSecret) {
      throw new Error('Client ID e Client Secret não configurados');
    }

    // Verifica se token ainda é válido (com margem de 10 minutos)
    const agora = new Date();
    const tokenValidade = config.tokenValidade ? new Date(config.tokenValidade) : null;

    if (!forceRefresh && config.tokenOAuth && tokenValidade && tokenValidade > agora) {
      console.log('✅ [Itaú] Token OAuth válido até', tokenValidade.toISOString());
      return config.tokenOAuth;
    }

    console.log('🔄 [Itaú] Renovando token OAuth...');

    // Solicita novo token
    const url = 'https://oauth.itau.com.br/identity/connect/token';
    const scope = 'readonly';

    const headerValue = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${headerValue}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        scope,
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao obter token OAuth: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Calcula validade (expires_in em segundos, com margem de 10 minutos)
    const validadeTimestamp = new Date(Date.now() + (data.expires_in - 600) * 1000);

    // Salva token no banco
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE configuracoes_banco SET tokenOAuth = ?, tokenValidade = ? WHERE id = ?',
        [data.access_token, validadeTimestamp.toISOString(), bancoConfigId],
        (err) => {
          if (err) reject(err);else
          resolve();
        }
      );
    });

    console.log('✅ [Itaú] Token OAuth renovado, válido até', validadeTimestamp.toISOString());

    return data.access_token;
  } catch (error) {
    console.error('❌ [Itaú] Erro ao obter token:', error);
    throw error;
  }
}

/**
 * Calcula dígito verificador do nosso número (Módulo 10)
 */
function calcularDVNossoNumero(agencia, conta, carteira, nossoNumero) {
  const composto = `${agencia.padStart(4, '0')}${conta.padStart(5, '0')}${carteira.padStart(3, '0')}${nossoNumero.padStart(8, '0')}`;

  let soma = 0;
  let peso = 2;

  for (let i = composto.length - 1; i >= 0; i--) {
    const parcial = parseInt(composto[i]) * peso;
    soma += parcial > 9 ? Math.floor(parcial / 10) + parcial % 10 : parcial;
    peso = peso === 2 ? 1 : 2;
  }

  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

/**
 * Registra boleto na API do Itaú
 */
async function registrarBoleto(bancoConfigId, dadosBoleto) {
  try {
    const db = getDb();

    // Busca config bancária
    const config = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM configuracoes_banco WHERE id = ?',
        [bancoConfigId],
        (err, row) => {
          if (err) reject(err);else
          resolve(row);
        }
      );
    });

    if (!config) {
      throw new Error('Configuração bancária não encontrada');
    }

    if (!config.itauKey) {
      throw new Error('Itaú Key não configurada');
    }

    // Obtém token OAuth
    const token = await obterTokenItau(bancoConfigId);

    // Monta payload do boleto
    const nossoNumero = dadosBoleto.nossoNumero.padStart(8, '0');
    const dvNossoNumero = calcularDVNossoNumero(
      config.agencia,
      config.conta,
      config.carteira,
      nossoNumero
    );

    const payload = {
      tipo_ambiente: config.tipoAmbiente || 2, // 1=Produção, 2=Homologação
      tipo_cobranca: 1, // Cobrança registrada
      tipo_produto: '00006',
      subproduto: '00008',
      tipo_registro: 1, // Registro de boleto
      beneficiario: {
        cpf_cnpj_beneficiario: config.cnpjCedente.replace(/\D/g, ''),
        agencia_beneficiario: config.agencia.padStart(4, '0'),
        conta_beneficiario: config.conta.padStart(7, '0'),
        digito_verificador_conta_beneficiario: config.contaDigito
      },
      titulo_aceite: 'N', // Não aceitar após vencimento
      pagador: {
        cpf_cnpj_pagador: (dadosBoleto.sacadoCpf || '').replace(/\D/g, ''),
        nome_pagador: dadosBoleto.sacadoNome.substring(0, 30),
        logradouro_pagador: (dadosBoleto.sacadoEndereco || '').substring(0, 40),
        bairro_pagador: (dadosBoleto.sacadoBairro || '').substring(0, 15),
        cidade_pagador: (dadosBoleto.sacadoCidade || '').substring(0, 20),
        uf_pagador: dadosBoleto.sacadoUf || 'SP',
        cep_pagador: (dadosBoleto.sacadoCep || '').replace(/\D/g, '')
      },
      tipo_carteira_titulo: config.carteira,
      moeda: {
        codigo_moeda_cnab: '09' // Real
      },
      nosso_numero: nossoNumero,
      digito_verificador_nosso_numero: dvNossoNumero.toString(),
      data_vencimento: dadosBoleto.dataVencimento,
      valor_cobrado: dadosBoleto.valor.toFixed(2).replace('.', '').padStart(17, '0'),
      especie: '01', // Duplicata Mercantil
      data_emissao: dadosBoleto.dataEmissao,
      data_limite_pagamento: dadosBoleto.dataVencimento, // Mesmo dia do vencimento
      tipo_pagamento: 3, // Pagamento total
      indicador_pagamento_parcial: 'false',
      juros: {
        tipo_juros: parseInt(config.tipoJuros) || 5, // 5 = Isento
        percentual_juros: (config.juros || 0).toFixed(5).replace('.', '').padStart(12, '0')
      },
      multa: {
        tipo_multa: parseInt(config.tipoMulta) || 3, // 3 = Isento
        percentual_multa: (config.multa || 0).toFixed(5).replace('.', '').padStart(12, '0')
      },
      recebimento_divergente: {
        tipo_autorizacao_recebimento: '3' // Aceita somente valor total
      },
      grupo_desconto: [{
        tipo_desconto: 0 // Sem desconto
      }]
    };

    console.log('📤 [Itaú] Enviando boleto para registro:', {
      nossoNumero,
      valor: dadosBoleto.valor,
      vencimento: dadosBoleto.dataVencimento
    });

    // Chama API do Itaú
    const url = 'https://gerador-boletos.itau.com.br/router-gateway-app/public/codigo_barras/registro';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.itau',
        'access_token': token,
        'itau-chave': config.itauKey,
        'identificador': config.cnpjCedente.replace(/\D/g, '').padStart(14, '0'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ mensagem: 'Erro desconhecido' }));

      // Se token inválido, tenta renovar e fazer nova tentativa
      if (errorData.mensagem && errorData.mensagem.toLowerCase().includes('access token inválido')) {
        console.log('🔄 [Itaú] Token inválido, renovando e tentando novamente...');
        return await registrarBoleto(bancoConfigId, dadosBoleto); // Recursão com token renovado
      }

      // Se boleto já existe, retorna sucesso (idempotência)
      if (errorData.mensagem && errorData.mensagem.toLowerCase().includes('ja existe')) {
        console.log('⚠️ [Itaú] Boleto já registrado, retornando dados existentes');
        return {
          sucesso: true,
          mensagem: 'Boleto já registrado anteriormente',
          codigoBarras: null, // Não temos o código, mas boleto existe
          linhaDigitavel: null
        };
      }

      // Monta mensagem de erro detalhada
      let mensagemErro = errorData.mensagem || 'Erro ao registrar boleto';
      if (errorData.campos && Array.isArray(errorData.campos)) {
        mensagemErro += '\n' + errorData.campos.map((c) => c.mensagem).join('\n');
      }

      throw new Error(mensagemErro);
    }

    const resultado = await response.json();

    console.log('✅ [Itaú] Boleto registrado com sucesso');

    return {
      sucesso: true,
      codigoBarras: resultado.codigo_barras,
      linhaDigitavel: resultado.numero_linha_digitavel,
      localPagamento: resultado.local_pagamento || 'Pagável em qualquer banco até o vencimento'
    };

  } catch (error) {
    console.error('❌ [Itaú] Erro ao registrar boleto:', error);
    throw error;
  }
}

/**
 * Consulta situação de um boleto registrado
 */
async function consultarSituacao(bancoConfigId, nossoNumero) {
  try {
    const db = getDb();

    // Busca config bancária
    const config = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM configuracoes_banco WHERE id = ?',
        [bancoConfigId],
        (err, row) => {
          if (err) reject(err);else
          resolve(row);
        }
      );
    });

    if (!config) {
      throw new Error('Configuração bancária não encontrada');
    }

    // Obtém token OAuth
    const token = await obterTokenItau(bancoConfigId);

    const dvNossoNumero = calcularDVNossoNumero(
      config.agencia,
      config.conta,
      config.carteira,
      nossoNumero.padStart(8, '0')
    );

    const payload = {
      tipo_ambiente: config.tipoAmbiente || 2,
      tipo_cobranca: 1,
      tipo_produto: '00006',
      subproduto: '00008',
      tipo_registro: 3, // Consulta
      beneficiario: {
        cpf_cnpj_beneficiario: config.cnpjCedente.replace(/\D/g, ''),
        agencia_beneficiario: config.agencia.padStart(4, '0'),
        conta_beneficiario: config.conta.padStart(7, '0'),
        digito_verificador_conta_beneficiario: config.contaDigito
      },
      tipo_carteira_titulo: config.carteira,
      nosso_numero: nossoNumero.padStart(8, '0'),
      digito_verificador_nosso_numero: dvNossoNumero.toString()
    };

    const url = 'https://gerador-boletos.itau.com.br/router-gateway-app/public/codigo_barras/registro';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.itau',
        'access_token': token,
        'itau-chave': config.itauKey,
        'identificador': config.cnpjCedente.replace(/\D/g, '').padStart(14, '0'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.mensagem || 'Erro ao consultar boleto');
    }

    const resultado = await response.json();

    return {
      sucesso: true,
      codigoBarras: resultado.codigo_barras,
      linhaDigitavel: resultado.numero_linha_digitavel,
      localPagamento: resultado.local_pagamento,
      situacao: resultado.situacao || 'REGISTRADO'
    };

  } catch (error) {
    console.error('❌ [Itaú] Erro ao consultar boleto:', error);
    throw error;
  }
}

module.exports = {
  obterTokenItau,
  registrarBoleto,
  consultarSituacao,
  calcularDVNossoNumero
};