export interface SecaoTutorial {
  id: string;
  titulo: string;
  resumo: string;
  /** Aba do prontuário que a seção ensina (botão "Abrir aba"). */
  etapa?: string;
  /** Lido em voz alta no botão "Ouvir". */
  narracao: string;
  passos: string[];
  /** Comandos de voz de exemplo — clicar envia ao assistente. */
  comandos: string[];
}

export const tutorialProntuario: SecaoTutorial[] = [
{
  id: 'inicio',
  titulo: 'Como ditar o prontuário',
  resumo: 'O básico: abrir o atendimento, falar e revisar.',
  narracao:
  'Olá! Eu sou a sua assistente do prontuário. Com o atendimento do paciente aberto, toque no microfone e fale normalmente, como se ditasse para uma secretária. Eu coloco cada informação na aba certa: anamnese, exame físico, diagnóstico ou evolução. Tudo o que eu escrevo aparece na tela para você revisar, e é salvo do mesmo jeito que a digitação. Eu nunca assino, prescrevo ou envio nada ao paciente: isso é sempre com você.',
  passos: [
  'Abra o atendimento do paciente pela agenda ou pela fila.',
  'Toque no microfone do assistente, no canto inferior direito.',
  'Fale o conteúdo. Você pode ditar até 2 minutos de uma vez.',
  'Toque de novo para enviar. Eu preencho e digo o que anotei.',
  'Revise na tela. Para corrigir, digite direto no campo ou dite de novo.'],

  comandos: ['O que você consegue fazer no prontuário?', 'Abrir a anamnese']
},
{
  id: 'anamnese',
  titulo: 'Anamnese',
  resumo: 'Queixa, história, antecedentes, alergias e medicamentos.',
  etapa: 'anamnese',
  narracao:
  'Na anamnese, diga a queixa principal e a história da doença atual. Pode citar também doenças pregressas, alergias, medicamentos em uso, histórico familiar e hábitos de vida. Se você disser o nome do campo, eu uso exatamente esse campo. Se não disser, eu separo pelo sentido do que foi falado.',
  passos: [
  'Comece pela queixa: “queixa principal, dor de cabeça há três dias”.',
  'Continue pela história: “piora à tarde, sem febre, melhora com dipirona”.',
  'Acrescente antecedentes, alergias e medicamentos quando houver.'],

  comandos: [
  'Queixa principal: dor de cabeça há três dias, piora no fim da tarde',
  'Alergia a dipirona. Usa losartana 50 mg uma vez ao dia',
  'Pai hipertenso, mãe diabética. Não fuma, bebe socialmente']

},
{
  id: 'exame_fisico',
  titulo: 'Exame físico',
  resumo: 'Sinais vitais em uma frase e achados do exame.',
  etapa: 'exame_fisico',
  narracao:
  'No exame físico, você pode falar todos os sinais vitais numa frase só: pressão, pulso, temperatura, saturação, frequência respiratória, glicemia, peso e altura. Pode dizer a pressão do jeito de consultório, como doze por oito. O IMC é calculado sozinho. Os achados do exame vão para as observações.',
  passos: [
  'Diga os sinais vitais em sequência, sem precisar de pausa entre eles.',
  'Fale peso e altura: o IMC aparece calculado com a classificação.',
  'Dite os achados: “ausculta cardíaca normal, abdome flácido e indolor”.'],

  comandos: [
  'Pressão 12 por 8, pulso 76, saturação 98, temperatura 36,5',
  'Peso 72 quilos, altura 1 metro e 70',
  'Ausculta pulmonar com murmúrio vesicular presente, sem ruídos adventícios']

},
{
  id: 'diagnostico',
  titulo: 'Diagnóstico e CID',
  resumo: 'Busca de CID-10 por voz; você confirma o código.',
  etapa: 'diagnostico',
  narracao:
  'No diagnóstico, diga o nome da doença ou o código CID. Eu coloco o termo na busca e mostro as sugestões. Quem escolhe o código certo é você, com um clique. O primeiro CID escolhido é o principal; os seguintes ficam como secundários. Observações do diagnóstico também podem ser ditadas.',
  passos: [
  'Diga “CID hipertensão” ou “CID I10”.',
  'Escolha a sugestão correta na lista que abre.',
  'Para um segundo diagnóstico, dite outro CID depois de escolher o primeiro.'],

  comandos: ['CID hipertensão essencial', 'Observação do diagnóstico: suspeita de enxaqueca sem aura']
},
{
  id: 'evolucao',
  titulo: 'Evolução',
  resumo: 'Texto da evolução pronto para você adicionar.',
  etapa: 'evolucao',
  narracao:
  'Na evolução, dite o texto do jeito que você escreveria. Eu coloco na caixa da nova evolução, e você confere e clica em Adicionar. Assim, a evolução fica registrada com a data e o seu nome. Evoluções antigas nunca são alteradas por voz.',
  passos: [
  'Dite a evolução completa.',
  'Revise o texto na caixa da nova evolução.',
  'Clique em Adicionar para registrar com data e profissional.'],

  comandos: ['Evolução: paciente refere melhora da dor, mantém medicação, retorno em 30 dias']
},
{
  id: 'documentos',
  titulo: 'Prescrição, exames e atestado',
  resumo: 'Eu abro a aba; o conteúdo é seu.',
  etapa: 'prescricoes',
  narracao:
  'Prescrição, pedido de exames, relatórios e atestados são documentos com a sua responsabilidade, por isso eu não os preencho sozinha. Peça para eu abrir a aba e use os padrões salvos ou a Memed para agilizar. Todos imprimem com o seu cabeçalho.',
  passos: [
  'Diga “abrir prescrições”, “abrir exames” ou “abrir atestado”.',
  'Use um padrão salvo ou monte o documento.',
  'Imprima ou envie ao paciente pela própria aba.'],

  comandos: ['Abrir prescrições', 'Abrir exames', 'Como faço um atestado?']
},
{
  id: 'finalizar',
  titulo: 'Assinar e finalizar',
  resumo: 'Depois de assinado, nada mais muda — nem por voz.',
  narracao:
  'Ao terminar, revise o resumo do atendimento e assine. Depois de assinado, o prontuário fica travado: ninguém altera, nem por digitação nem por voz. Se eu tentar preencher um atendimento assinado, eu aviso e não mudo nada.',
  passos: [
  'Abra a aba Resumo e confira tudo o que foi registrado.',
  'Assine o atendimento.',
  'Encerre o cronômetro, se estiver usando.'],

  comandos: ['Abrir o resumo do atendimento', 'Como assino o atendimento?']
},
{
  id: 'dicas',
  titulo: 'Dicas para um ditado perfeito',
  resumo: 'Acrescentar, substituir e falar números.',
  narracao:
  'Algumas dicas. Por padrão eu acrescento ao que já está escrito. Para trocar o conteúdo de um campo, diga substituir ou apagar e escrever. Fale números com calma, e diga o nome do campo quando quiser precisão. E lembre: eu só escrevo o que você disse. Nunca acrescento sintomas, doses ou diagnósticos.',
  passos: [
  'Para trocar um campo: “substituir a queixa principal por tosse seca”.',
  'Para ir a outra aba: “abrir o exame físico”.',
  'Em ambiente barulhento, fale mais perto do microfone.'],

  comandos: ['Substituir a queixa principal por tosse seca há uma semana']
}];