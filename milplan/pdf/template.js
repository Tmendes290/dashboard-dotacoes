const { PDFDocument, StandardFonts } = require('pdf-lib');
const L = require('./layout');
const D = require('./draw');
const { formatDateBR } = require('../util');
const { valeLogoBuffer, milplanLogoBuffer } = require('./assets');

// Textos fixos do contrato — mesmo texto do template oficial (ver SS-Milplan-031.pdf).
const CONDICOES_GERAIS =
  'Esta Solicitação de Serviço (SS) segue rigorosamente o contrato vigente. A medição dos serviços será ' +
  'realizada com base no número de meses do planejamento aprovado pelo Líder do Squad da VALE. Esta SS ' +
  'poderá ser revisada em prazo e/ou valor, desde que as alterações não decorram de responsabilidade da ' +
  'Executante. Ficam autorizados o Líder do Projeto e o Preposto da Executante a resolverem as questões ' +
  'técnicas relativas a este escopo.';

const OBRIGACAO_INTRO =
  'Apresentar um Plano de Execução de Obra para cada Ordem de Serviço solicitada, em até 05 (cinco) dias úteis, contendo:';

const OBRIGACAO_ITENS = [
  'Planilha de Quantidades',
  'Escopo e descrição dos serviços',
  'Estrutura Analítica do Projeto – EAP',
  'Cronograma físico-operacional detalhado',
  'Histogramas de mão de obra direta e indireta',
  'Histograma de equipamentos',
  'Organograma a ser adotado na execução da obra',
  'Orçamento da execução dos serviços (ORÇ)',
  'Lista de Pendências (Preparativos)',
  'Plano de aquisição de material',
  'Desembolso financeiro do projeto',
];

/**
 * Gera o PDF da Solicitação de Serviço.
 * @param {object} ssData - linha de milplan_ss (+ campos resolvidos de PEP/squad).
 * @param {Array<{numero_revisao:number, motivo:string, responsavel_nome:string}>} revisoes
 * @returns {Promise<Buffer>}
 */
async function gerarPdfSS(ssData, revisoes) {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const valeLogoImg = await pdfDoc.embedPng(valeLogoBuffer);
  const milplanLogoImg = await pdfDoc.embedPng(milplanLogoBuffer);

  let page = pdfDoc.addPage([L.PAGE_WIDTH, L.PAGE_HEIGHT]);
  let y = L.PAGE_HEIGHT - L.MARGIN;
  const x = L.MARGIN;
  const w = L.CONTENT_WIDTH;

  // ── Faixa de logos: Vale à esquerda, Milplan à direita (extraídas do SS-Milplan-031.pdf) ──
  const logoStripH = 32;
  const valeDims = valeLogoImg.scale(logoStripH / valeLogoImg.height);
  page.drawImage(valeLogoImg, { x, y: y - logoStripH, width: valeDims.width, height: valeDims.height });
  const milplanDims = milplanLogoImg.scale(logoStripH / milplanLogoImg.height);
  page.drawImage(milplanLogoImg, { x: x + w - milplanDims.width, y: y - logoStripH, width: milplanDims.width, height: milplanDims.height });
  y -= logoStripH + 8;

  function ensureSpace(needed) {
    if (y - needed < L.MARGIN) {
      page = pdfDoc.addPage([L.PAGE_WIDTH, L.PAGE_HEIGHT]);
      y = L.PAGE_HEIGHT - L.MARGIN;
    }
  }

  function drawBoxedSection(titulo, texto, minHeight) {
    const textH = Math.max(
      minHeight || 0,
      D.measureWrappedHeight(texto, fontRegular, L.FONT_SIZE.body, w - 8, L.LINE_HEIGHT.body) + 8
    );
    ensureSpace(16 + textH);
    y = D.drawSectionBar(page, { x, y, width: w, text: titulo, font: fontBold });
    D.strokeRect(page, { x, y: y - textH, width: w, height: textH });
    D.drawWrappedText(page, {
      text: texto, x: x + 4, y: y - 10, width: w - 8, font: fontRegular, size: L.FONT_SIZE.body, lineHeight: L.LINE_HEIGHT.body,
    });
    y -= textH + 6;
  }

  function drawPessoaBlock(titulo, cols) {
    ensureSpace(16 + 12 + 16 + 6);
    y = D.drawSectionBar(page, { x, y, width: w, text: titulo, font: fontBold });
    y = D.drawFieldGrid(page, { x, y, width: w, cols, fontRegular, fontBold });
    y -= 6;
  }

  // ── Cabeçalho: título + SS N°/Data/Prazo ──
  const titleBoxW = w * 0.58;
  const infoBoxW = w - titleBoxW;
  const headerH = 54;
  D.fillRect(page, { x, y: y - headerH, width: titleBoxW, height: headerH, color: L.COLOR_HEADER_BAR });
  page.drawText('Solicitação de Serviço (SS)', {
    x: x + 10, y: y - headerH / 2 - 4, size: L.FONT_SIZE.title, font: fontBold, color: L.COLOR_HEADER_TEXT,
  });
  D.strokeRect(page, { x: x + titleBoxW, y: y - headerH, width: infoBoxW, height: headerH });
  const infoX = x + titleBoxW + 6;
  page.drawText(`SS N°: ${ssData.ss_numero}`, { x: infoX, y: y - 16, size: L.FONT_SIZE.value, font: fontBold, color: L.COLOR_TEXT });
  page.drawText(`Data de Emissão: ${formatDateBR(ssData.data_emissao)}`, { x: infoX, y: y - 30, size: L.FONT_SIZE.body, font: fontRegular, color: L.COLOR_TEXT });
  page.drawText(`Prazo do Plano: ${formatDateBR(ssData.prazo_plano)}`, { x: infoX, y: y - 44, size: L.FONT_SIZE.body, font: fontRegular, color: L.COLOR_TEXT });
  y -= headerH + 8;

  // ── Contrato / Projeto ou C. de Custo ──
  const halfW = w / 2;
  const rowH = 18;
  D.drawKeyValueRow(page, { x, y, width: halfW, label: 'Contrato', value: ssData.contrato, fontRegular, fontBold, labelWidth: halfW * 0.35, height: rowH });
  D.drawKeyValueRow(page, { x: x + halfW, y, width: halfW, label: 'Projeto ou C. de Custo', value: ssData.pep, fontRegular, fontBold, labelWidth: halfW * 0.45, height: rowH });
  y -= rowH;

  // ── Objeto do Contrato ──
  drawBoxedSection('Objeto do Contrato', ssData.objeto_contrato || '');

  // ── Gestor do Contrato / Líder do Projeto / Preposto Executante ──
  drawPessoaBlock('Gestor do Contrato', [
    { label: 'Área', value: ssData.gestor_contrato_area, frac: 0.34 },
    { label: 'Nome', value: ssData.gestor_contrato_nome, frac: 0.36 },
    { label: 'Telefone', value: ssData.gestor_contrato_telefone, frac: 0.30 },
  ]);
  drawPessoaBlock('Líder do Projeto', [
    { label: 'Squad', value: ssData.lider_squad, frac: 0.34 },
    { label: 'Nome', value: ssData.lider_nome, frac: 0.36 },
    { label: 'Telefone', value: ssData.lider_telefone, frac: 0.30 },
  ]);
  drawPessoaBlock('Preposto Executante', [
    { label: 'Área', value: ssData.preposto_area, frac: 0.34 },
    { label: 'Nome', value: ssData.preposto_nome, frac: 0.36 },
    { label: 'Telefone', value: ssData.preposto_telefone, frac: 0.30 },
  ]);

  // ── Planejador (campo adicionado a pedido, fora do template oficial) / Nome do Projeto na Carteira ──
  ensureSpace(rowH * 2 + 6);
  D.drawKeyValueRow(page, { x, y, width: w, label: 'Planejador', value: ssData.planejador_nome, fontRegular, fontBold, labelWidth: w * 0.22, height: rowH });
  y -= rowH;
  D.drawKeyValueRow(page, { x, y, width: w, label: 'Nome do Projeto na Carteira', value: ssData.nome_projeto_carteira, fontRegular, fontBold, labelWidth: w * 0.30, height: rowH });
  y -= rowH + 6;

  // ── Escopo ──
  drawBoxedSection('Escopo', ssData.escopo || '', 60);

  // ── Condições Gerais ──
  drawBoxedSection('Condições Gerais', CONDICOES_GERAIS);

  // ── Obrigação da Executante ──
  const obrigacaoText = OBRIGACAO_INTRO + '\n' + OBRIGACAO_ITENS.map((i) => '• ' + i).join('\n');
  drawBoxedSection('Obrigação da Executante', obrigacaoText);

  // ── Tabela Revisão | Motivo | Responsável ──
  const revFracs = [0.20, 0.55, 0.25];
  const revColX = [x, x + w * revFracs[0], x + w * (revFracs[0] + revFracs[1])];
  const revRowH = 16;

  ensureSpace(revRowH * (revisoes.length + 1));
  D.fillRect(page, { x, y: y - revRowH, width: w, height: revRowH, color: L.COLOR_LABEL_BG });
  ['Revisão', 'Motivo', 'Responsável'].forEach((label, i) => {
    D.strokeRect(page, { x: revColX[i], y: y - revRowH, width: w * revFracs[i], height: revRowH });
    page.drawText(label, { x: revColX[i] + 4, y: y - revRowH + 5, size: L.FONT_SIZE.label, font: fontBold, color: L.COLOR_TEXT });
  });
  y -= revRowH;

  for (const rev of revisoes) {
    ensureSpace(revRowH);
    const label = rev.numero_revisao === 0 ? 'Revisão' : `Revisão ${rev.numero_revisao}`;
    const values = [label, rev.motivo || '', rev.responsavel_nome || ''];
    values.forEach((val, i) => {
      D.strokeRect(page, { x: revColX[i], y: y - revRowH, width: w * revFracs[i], height: revRowH });
      page.drawText(String(val), { x: revColX[i] + 4, y: y - revRowH + 5, size: L.FONT_SIZE.value, font: fontRegular, color: L.COLOR_TEXT });
    });
    y -= revRowH;
  }
  y -= 20;

  // ── Rodapé: local/data + DE ACORDO + assinaturas ──
  ensureSpace(80);
  function centeredText(text, font, size, colX, colW, yPos) {
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: colX + (colW - tw) / 2, y: yPos, size, font, color: L.COLOR_TEXT });
  }

  centeredText(`Marabá - PA, : ${formatDateBR(ssData.data_emissao)}`, fontRegular, L.FONT_SIZE.body, x, w, y);
  y -= 20;
  centeredText('DE ACORDO', fontBold, L.FONT_SIZE.sectionHeader, x, w, y);
  y -= 30;

  const colW = w / 2;
  centeredText(ssData.lider_nome || '', fontBold, L.FONT_SIZE.value, x, colW, y);
  centeredText(ssData.preposto_nome || '', fontBold, L.FONT_SIZE.value, x + colW, colW, y);
  y -= 14;
  centeredText('Líder do Squad', fontRegular, L.FONT_SIZE.small, x, colW, y);
  centeredText('Preposto Executante', fontRegular, L.FONT_SIZE.small, x + colW, colW, y);

  return Buffer.from(await pdfDoc.save());
}

module.exports = { gerarPdfSS };
