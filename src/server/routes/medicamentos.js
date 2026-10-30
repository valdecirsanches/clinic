const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');

// Lista de medicamentos para importação
const MEDICAMENTOS_BASE = [
{ nome: 'Paracetamol 500mg', principioAtivo: 'Paracetamol', concentracao: '500mg', formaFarmaceutica: 'Comprimido', fabricante: 'EMS', registroAnvisa: '1.0235.0001.001-1', tarja: 'sem_tarja' },
{ nome: 'Paracetamol 750mg', principioAtivo: 'Paracetamol', concentracao: '750mg', formaFarmaceutica: 'Comprimido', fabricante: 'Medley', registroAnvisa: '1.0235.0001.002-1', tarja: 'sem_tarja' },
{ nome: 'Dipirona Sódica 500mg', principioAtivo: 'Dipirona Sódica', concentracao: '500mg', formaFarmaceutica: 'Comprimido', fabricante: 'Neo Química', registroAnvisa: '1.0235.0002.001-1', tarja: 'sem_tarja' },
{ nome: 'Ibuprofeno 400mg', principioAtivo: 'Ibuprofeno', concentracao: '400mg', formaFarmaceutica: 'Comprimido', fabricante: 'Aché', registroAnvisa: '1.0235.0003.001-1', tarja: 'sem_tarja' },
{ nome: 'Ibuprofeno 600mg', principioAtivo: 'Ibuprofeno', concentracao: '600mg', formaFarmaceutica: 'Comprimido', fabricante: 'EMS', registroAnvisa: '1.0235.0003.002-1', tarja: 'sem_tarja' },
{ nome: 'Diclofenaco Sódico 50mg', principioAtivo: 'Diclofenaco Sódico', concentracao: '50mg', formaFarmaceutica: 'Comprimido', fabricante: 'Novartis', registroAnvisa: '1.0235.0004.001-1', tarja: 'vermelha' },
{ nome: 'Nimesulida 100mg', principioAtivo: 'Nimesulida', concentracao: '100mg', formaFarmaceutica: 'Comprimido', fabricante: 'Eurofarma', registroAnvisa: '1.0235.0005.001-1', tarja: 'vermelha' },
{ nome: 'Amoxicilina 500mg', principioAtivo: 'Amoxicilina', concentracao: '500mg', formaFarmaceutica: 'Cápsula', fabricante: 'EMS', registroAnvisa: '1.0235.0010.001-1', tarja: 'vermelha' },
{ nome: 'Amoxicilina 875mg', principioAtivo: 'Amoxicilina', concentracao: '875mg', formaFarmaceutica: 'Comprimido', fabricante: 'Medley', registroAnvisa: '1.0235.0010.002-1', tarja: 'vermelha' },
{ nome: 'Azitromicina 500mg', principioAtivo: 'Azitromicina', concentracao: '500mg', formaFarmaceutica: 'Comprimido', fabricante: 'Pfizer', registroAnvisa: '1.0235.0012.001-1', tarja: 'vermelha' },
{ nome: 'Cefalexina 500mg', principioAtivo: 'Cefalexina', concentracao: '500mg', formaFarmaceutica: 'Cápsula', fabricante: 'EMS', registroAnvisa: '1.0235.0013.001-1', tarja: 'vermelha' },
{ nome: 'Ciprofloxacino 500mg', principioAtivo: 'Ciprofloxacino', concentracao: '500mg', formaFarmaceutica: 'Comprimido', fabricante: 'Bayer', registroAnvisa: '1.0235.0014.001-1', tarja: 'vermelha' },
{ nome: 'Metronidazol 400mg', principioAtivo: 'Metronidazol', concentracao: '400mg', formaFarmaceutica: 'Comprimido', fabricante: 'Sanofi', registroAnvisa: '1.0235.0016.001-1', tarja: 'vermelha' },
{ nome: 'Losartana Potássica 50mg', principioAtivo: 'Losartana Potássica', concentracao: '50mg', formaFarmaceutica: 'Comprimido', fabricante: 'Merck', registroAnvisa: '1.0235.0020.001-1', tarja: 'vermelha' },
{ nome: 'Enalapril 10mg', principioAtivo: 'Maleato de Enalapril', concentracao: '10mg', formaFarmaceutica: 'Comprimido', fabricante: 'Merck', registroAnvisa: '1.0235.0021.001-1', tarja: 'vermelha' },
{ nome: 'Atenolol 50mg', principioAtivo: 'Atenolol', concentracao: '50mg', formaFarmaceutica: 'Comprimido', fabricante: 'AstraZeneca', registroAnvisa: '1.0235.0023.002-1', tarja: 'vermelha' },
{ nome: 'Anlodipino 5mg', principioAtivo: 'Besilato de Anlodipino', concentracao: '5mg', formaFarmaceutica: 'Comprimido', fabricante: 'Pfizer', registroAnvisa: '1.0235.0025.001-1', tarja: 'vermelha' },
{ nome: 'Hidroclorotiazida 25mg', principioAtivo: 'Hidroclorotiazida', concentracao: '25mg', formaFarmaceutica: 'Comprimido', fabricante: 'Merck', registroAnvisa: '1.0235.0026.001-1', tarja: 'vermelha' },
{ nome: 'Metformina 500mg', principioAtivo: 'Cloridrato de Metformina', concentracao: '500mg', formaFarmaceutica: 'Comprimido', fabricante: 'Merck', registroAnvisa: '1.0235.0030.001-1', tarja: 'vermelha' },
{ nome: 'Metformina 850mg', principioAtivo: 'Cloridrato de Metformina', concentracao: '850mg', formaFarmaceutica: 'Comprimido', fabricante: 'EMS', registroAnvisa: '1.0235.0030.002-1', tarja: 'vermelha' },
{ nome: 'Omeprazol 20mg', principioAtivo: 'Omeprazol', concentracao: '20mg', formaFarmaceutica: 'Cápsula', fabricante: 'AstraZeneca', registroAnvisa: '1.0235.0040.001-1', tarja: 'vermelha' },
{ nome: 'Omeprazol 40mg', principioAtivo: 'Omeprazol', concentracao: '40mg', formaFarmaceutica: 'Cápsula', fabricante: 'EMS', registroAnvisa: '1.0235.0040.002-1', tarja: 'vermelha' },
{ nome: 'Pantoprazol 40mg', principioAtivo: 'Pantoprazol Sódico', concentracao: '40mg', formaFarmaceutica: 'Comprimido', fabricante: 'Takeda', registroAnvisa: '1.0235.0041.001-1', tarja: 'vermelha' },
{ nome: 'Loratadina 10mg', principioAtivo: 'Loratadina', concentracao: '10mg', formaFarmaceutica: 'Comprimido', fabricante: 'Schering-Plough', registroAnvisa: '1.0235.0050.001-1', tarja: 'sem_tarja' },
{ nome: 'Cetirizina 10mg', principioAtivo: 'Dicloridrato de Cetirizina', concentracao: '10mg', formaFarmaceutica: 'Comprimido', fabricante: 'UCB', registroAnvisa: '1.0235.0051.001-1', tarja: 'sem_tarja' },
{ nome: 'Prednisona 20mg', principioAtivo: 'Prednisona', concentracao: '20mg', formaFarmaceutica: 'Comprimido', fabricante: 'EMS', registroAnvisa: '1.0235.0060.002-1', tarja: 'vermelha' },
{ nome: 'Clonazepam 2mg', principioAtivo: 'Clonazepam', concentracao: '2mg', formaFarmaceutica: 'Comprimido', fabricante: 'Roche', registroAnvisa: '1.0235.0070.001-1', tarja: 'preta' },
{ nome: 'Fluoxetina 20mg', principioAtivo: 'Cloridrato de Fluoxetina', concentracao: '20mg', formaFarmaceutica: 'Cápsula', fabricante: 'Eli Lilly', registroAnvisa: '1.0235.0074.001-1', tarja: 'vermelha' },
{ nome: 'Sertralina 50mg', principioAtivo: 'Cloridrato de Sertralina', concentracao: '50mg', formaFarmaceutica: 'Comprimido', fabricante: 'Pfizer', registroAnvisa: '1.0235.0075.001-1', tarja: 'vermelha' },
{ nome: 'Levotiroxina 50mcg', principioAtivo: 'Levotiroxina Sódica', concentracao: '50mcg', formaFarmaceutica: 'Comprimido', fabricante: 'EMS', registroAnvisa: '1.0235.0080.002-1', tarja: 'vermelha' },
{ nome: 'Sinvastatina 20mg', principioAtivo: 'Sinvastatina', concentracao: '20mg', formaFarmaceutica: 'Comprimido', fabricante: 'Merck', registroAnvisa: '1.0235.0090.001-1', tarja: 'vermelha' },
{ nome: 'Atorvastatina 20mg', principioAtivo: 'Atorvastatina Cálcica', concentracao: '20mg', formaFarmaceutica: 'Comprimido', fabricante: 'EMS', registroAnvisa: '1.0235.0091.002-1', tarja: 'vermelha' },
{ nome: 'AAS 100mg', principioAtivo: 'Ácido Acetilsalicílico', concentracao: '100mg', formaFarmaceutica: 'Comprimido', fabricante: 'Bayer', registroAnvisa: '1.0235.0100.001-1', tarja: 'sem_tarja' },
{ nome: 'Fluconazol 150mg', principioAtivo: 'Fluconazol', concentracao: '150mg', formaFarmaceutica: 'Cápsula', fabricante: 'Pfizer', registroAnvisa: '1.0235.0140.001-1', tarja: 'vermelha' },
{ nome: 'Aciclovir 400mg', principioAtivo: 'Aciclovir', concentracao: '400mg', formaFarmaceutica: 'Comprimido', fabricante: 'EMS', registroAnvisa: '1.0235.0150.002-1', tarja: 'vermelha' },
{ nome: 'Vitamina D3 2000UI', principioAtivo: 'Colecalciferol', concentracao: '2000UI', formaFarmaceutica: 'Cápsula', fabricante: 'Sanofi', registroAnvisa: '1.0235.0130.001-1', tarja: 'sem_tarja' },
{ nome: 'Ácido Fólico 5mg', principioAtivo: 'Ácido Fólico', concentracao: '5mg', formaFarmaceutica: 'Comprimido', fabricante: 'EMS', registroAnvisa: '1.0235.0132.001-1', tarja: 'sem_tarja' }];


// GET / - Lista com paginação
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '';
    const params = [];
    if (search) {
      // Busca o termo em qualquer parte do nome comercial, princípio ativo,
      // forma/apresentação ou fabricante — assim nomes como "Gynazole"
      // (que ficam dentro do campo `nome`) sempre aparecem.
      where =
      'WHERE nome LIKE ? OR principioAtivo LIKE ? OR formaFarmaceutica LIKE ? OR fabricante LIKE ?';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    const countRow = await dbGlobal.prepare(`SELECT COUNT(*) as total FROM medicamentos ${where}`).get(...params);
    const total = countRow?.total || 0;
    const rows = await dbGlobal.prepare(`SELECT * FROM medicamentos ${where} ORDER BY nome ASC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
    res.json({ data: rows || [], pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)), hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)), hasPrev: parseInt(page) > 1 } });
  } catch (err) {
    console.error('❌ Erro ao buscar medicamentos:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /estatisticas
router.get('/estatisticas', async (req, res) => {
  try {
    const row = await dbGlobal.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN tarja='vermelha' THEN 1 ELSE 0 END) as vermelha, SUM(CASE WHEN tarja='preta' THEN 1 ELSE 0 END) as preta, SUM(CASE WHEN tarja='amarela' THEN 1 ELSE 0 END) as amarela, SUM(CASE WHEN tarja='sem_tarja' OR tarja IS NULL THEN 1 ELSE 0 END) as sem_tarja FROM medicamentos`).get();
    res.json({ total: row?.total || 0, vermelha: row?.vermelha || 0, preta: row?.preta || 0, amarela: row?.amarela || 0, sem_tarja: row?.sem_tarja || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ⭐ Auto-correção de schema (idempotente).
// A base PMVG repete o MESMO registro ANVISA em várias apresentações do mesmo produto.
// O índice UNIQUE em registroAnvisa fazia o INSERT IGNORE descartar todas as apresentações
// repetidas — por isso só ~4.800 entravam em vez de 25.000+. Removemos o UNIQUE e
// afrouxamos NOT NULL / aumentamos o tamanho das colunas para caber as descrições longas.
let schemaCorrigido = false;
async function garantirSchemaMedicamentos() {
  if (schemaCorrigido) return;
  const alters = [
  "ALTER TABLE medicamentos DROP INDEX registroAnvisa",
  "ALTER TABLE medicamentos MODIFY nome VARCHAR(500) NOT NULL",
  "ALTER TABLE medicamentos MODIFY principioAtivo VARCHAR(500) NULL",
  "ALTER TABLE medicamentos MODIFY concentracao VARCHAR(200) NULL",
  "ALTER TABLE medicamentos MODIFY formaFarmaceutica VARCHAR(200) NULL",
  "ALTER TABLE medicamentos MODIFY fabricante VARCHAR(500) NULL",
  "ALTER TABLE medicamentos MODIFY registroAnvisa VARCHAR(100) NULL",
  "ALTER TABLE medicamentos MODIFY tarja VARCHAR(50) NULL"];

  for (const sql of alters) {
    try {
      await dbGlobal.prepare(sql).run();
      console.log(`🔧 Schema medicamentos: ${sql}`);
    } catch (e) {

      // Ignora se o índice/coluna já estiver no formato correto
    }}
  schemaCorrigido = true;
}

// POST /importar
// Aceita uma lista de medicamentos no corpo (ex.: planilha PMVG processada no front).
// Se nenhuma lista for enviada, importa a base interna (MEDICAMENTOS_BASE) — compatibilidade.
// IMPORTANTE: cada apresentação é um registro próprio (mesmo que compartilhe registro ANVISA),
// então fazemos INSERT simples — NÃO descartamos por registro repetido.
router.post('/importar', async (req, res) => {
  try {
    await garantirSchemaMedicamentos();

    const lista =
    Array.isArray(req.body?.medicamentos) && req.body.medicamentos.length > 0 ?
    req.body.medicamentos :
    MEDICAMENTOS_BASE;

    console.log(`📥 Importando ${lista.length} medicamentos...`);
    const agora = new Date().toISOString();
    let importados = 0,erros = 0;

    for (let i = 0; i < lista.length; i++) {
      const med = lista[i] || {};
      // Nome é obrigatório
      const nome = (med.nome || '').toString().trim();
      if (!nome) {erros++;continue;}
      // ID único por linha (inclui índice + aleatório para evitar colisão dentro do mesmo ms)
      const id = `med-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
      const tarja = ['vermelha', 'preta', 'amarela', 'sem_tarja'].includes(med.tarja) ?
      med.tarja :
      'sem_tarja';
      try {
        await dbGlobal.prepare(`INSERT INTO medicamentos (id, nome, principioAtivo, concentracao, formaFarmaceutica, fabricante, registroAnvisa, tarja, criadoEm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          id,
          nome.slice(0, 500),
          (med.principioAtivo || '').toString().slice(0, 500) || null,
          (med.concentracao || '').toString().slice(0, 200) || null,
          (med.formaFarmaceutica || '').toString().slice(0, 200) || null,
          (med.fabricante || '').toString().slice(0, 500) || null,
          (med.registroAnvisa || '').toString().slice(0, 100) || null,
          tarja,
          agora
        );
        importados++;
      } catch (e) {erros++;}
    }

    const total = await dbGlobal.prepare('SELECT COUNT(*) as count FROM medicamentos').get();
    console.log(`✅ Importação: ${importados} importados, ${erros} erros`);
    res.json({ success: true, total: importados, erros, totalFinal: total?.count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /limpar - Remove todos os medicamentos (para reimportar base limpa)
router.delete('/limpar', async (req, res) => {
  try {
    const result = await dbGlobal.prepare('DELETE FROM medicamentos').run();
    console.log(`✅ Todos os medicamentos foram excluídos (${result.changes} registros)`);
    res.json({ success: true, excluidos: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const row = await dbGlobal.prepare('SELECT * FROM medicamentos WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Medicamento não encontrado' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;