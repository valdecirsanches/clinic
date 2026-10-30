const { exec } = require('child_process');

const arquivos = [
'pacientes.js',
'consultas.js'];


function executarArquivo(index) {
  if (index >= arquivos.length) {
    console.log('Todos os arquivos foram executados.');
    return;
  }

  const arquivo = arquivos[index];
  console.log(`Executando ${arquivo}...`);

  // Executa no diretório atual para garantir que encontra os arquivos
  exec(`node ${arquivo}`, { cwd: __dirname }, (erro, stdout, stderr) => {
    if (erro) {
      console.error(`Erro em ${arquivo}:`, erro.message);
      return;
    }

    if (stderr) {
      console.error(`Aviso em ${arquivo}:`, stderr);
    }

    console.log(stdout);

    executarArquivo(index + 1);
  });
}

executarArquivo(0);