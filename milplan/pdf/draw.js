const L = require('./layout');

function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').replace(/\r\n/g, '\n').split(/(\n)/);
  const lines = [];
  let current = '';
  for (const chunk of words) {
    if (chunk === '\n') {
      lines.push(current);
      current = '';
      continue;
    }
    for (const word of chunk.split(' ')) {
      if (word === '') continue;
      const trial = current ? current + ' ' + word : word;
      if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = trial;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

// Desenha texto com quebra de linha, retorna o novo y (abaixo do bloco desenhado).
function drawWrappedText(page, { text, x, y, width, font, size, color, lineHeight }) {
  const lines = wrapText(text, font, size, width);
  let cursorY = y;
  for (const line of lines) {
    page.drawText(line, { x, y: cursorY, size, font, color: color || L.COLOR_TEXT });
    cursorY -= lineHeight || size + 2;
  }
  return cursorY;
}

function measureWrappedHeight(text, font, size, width, lineHeight) {
  const lines = wrapText(text, font, size, width);
  return lines.length * (lineHeight || size + 2);
}

function strokeRect(page, { x, y, width, height, borderColor, borderWidth }) {
  page.drawRectangle({
    x, y, width, height,
    borderColor: borderColor || L.COLOR_BORDER,
    borderWidth: borderWidth != null ? borderWidth : 0.75,
  });
}

function fillRect(page, { x, y, width, height, color }) {
  page.drawRectangle({ x, y, width, height, color });
}

// Barra de título de seção (fundo colorido, texto branco em negrito). Retorna o novo y.
function drawSectionBar(page, { x, y, width, text, font, height }) {
  const h = height || 16;
  fillRect(page, { x, y: y - h, width, height: h, color: L.COLOR_HEADER_BAR });
  page.drawText(text, {
    x: x + 4,
    y: y - h + (h - L.FONT_SIZE.sectionHeader) / 2 + 1,
    size: L.FONT_SIZE.sectionHeader,
    font,
    color: L.COLOR_HEADER_TEXT,
  });
  return y - h;
}

// Uma linha "label em cima (fundo cinza) / valor embaixo", dividida em N colunas.
// cols: [{label, value, frac}] — frac soma 1 (fração da largura total).
function drawFieldGrid(page, { x, y, width, cols, fontRegular, fontBold, labelRowHeight, valueRowHeight }) {
  const lh = labelRowHeight || 12;
  const vh = valueRowHeight || 16;
  let cx = x;
  for (const col of cols) {
    const w = width * col.frac;
    fillRect(page, { x: cx, y: y - lh, width: w, height: lh, color: L.COLOR_LABEL_BG });
    strokeRect(page, { x: cx, y: y - lh, width: w, height: lh });
    page.drawText(col.label, {
      x: cx + 3, y: y - lh + 3, size: L.FONT_SIZE.label, font: fontBold, color: L.COLOR_TEXT,
    });
    strokeRect(page, { x: cx, y: y - lh - vh, width: w, height: vh });
    page.drawText(String(col.value || ''), {
      x: cx + 3, y: y - lh - vh + 5, size: L.FONT_SIZE.value, font: fontRegular, color: L.COLOR_TEXT,
    });
    cx += w;
  }
  return y - lh - vh;
}

// Linha simples "label | valor" lado a lado (usado pra Contrato / Projeto ou C. de Custo / Nome do Projeto).
function drawKeyValueRow(page, { x, y, width, label, value, fontRegular, fontBold, labelWidth, height }) {
  const h = height || 16;
  fillRect(page, { x, y: y - h, width: labelWidth, height: h, color: L.COLOR_LABEL_BG });
  strokeRect(page, { x, y: y - h, width: labelWidth, height: h });
  page.drawText(label, { x: x + 3, y: y - h + 5, size: L.FONT_SIZE.label, font: fontBold, color: L.COLOR_TEXT });
  const valueWidth = width - labelWidth;
  strokeRect(page, { x: x + labelWidth, y: y - h, width: valueWidth, height: h });
  page.drawText(String(value || ''), {
    x: x + labelWidth + 4, y: y - h + 5, size: L.FONT_SIZE.value, font: fontRegular, color: L.COLOR_TEXT,
  });
  return y - h;
}

module.exports = {
  wrapText,
  drawWrappedText,
  measureWrappedHeight,
  strokeRect,
  fillRect,
  drawSectionBar,
  drawFieldGrid,
  drawKeyValueRow,
};
