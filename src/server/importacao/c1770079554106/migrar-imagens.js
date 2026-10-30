const fs = require('fs');
const path = require('path');

const origemBase = '/mnt/hdbackup/API/backup completo da pasta media do appclinic/extras';
const destinoBase = '/home/sanches/Magic/clinic-app/src/server/uploads/op1770078943084/c1770079554106';

// Função pra percorrer tudo recursivamente
function listarArquivos(dir) {
  let resultados = [];

  const lista = fs.readdirSync(dir);
  lista.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat && stat.isDirectory()) {
      resultados = resultados.concat(listarArquivos(filePath));
    } else {
      resultados.push(filePath);
    }
  });

  return resultados;
}

// Percorrer cada pacienteId
const pacientes = fs.readdirSync(origemBase);

pacientes.forEach((pacienteId) => {
  const pastaPaciente = path.join(origemBase, pacienteId);

  if (!fs.statSync(pastaPaciente).isDirectory()) return;

  console.log(`📁 Processando paciente: ${pacienteId}`);

  const arquivos = listarArquivos(pastaPaciente);

  arquivos.forEach((arquivo) => {
    const nomeArquivo = path.basename(arquivo);

    const destinoDir = path.join(
      destinoBase,
      pacienteId, // aqui você pode trocar se clienteId for diferente
      'documentos'
    );

    // cria pasta se não existir
    fs.mkdirSync(destinoDir, { recursive: true });

    const destinoArquivo = path.join(destinoDir, nomeArquivo);

    try {
      fs.copyFileSync(arquivo, destinoArquivo);
      console.log(`✅ Copiado: ${nomeArquivo}`);
    } catch (err) {
      console.error(`❌ Erro ao copiar ${nomeArquivo}:`, err.message);
    }
  });
});

console.log('🚀 Migração finalizada!');