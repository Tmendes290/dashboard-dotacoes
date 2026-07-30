const { rgb } = require('pdf-lib');

// A4 portrait, em pontos (72pt = 1in)
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Cores placeholder — trocar pelos tons oficiais Vale/Milplan quando os logos chegarem.
const COLOR_HEADER_BAR = rgb(0.16, 0.42, 0.49);
const COLOR_HEADER_TEXT = rgb(1, 1, 1);
const COLOR_LABEL_BG = rgb(0.92, 0.92, 0.92);
const COLOR_BORDER = rgb(0.55, 0.55, 0.55);
const COLOR_TEXT = rgb(0.1, 0.1, 0.1);

const FONT_SIZE = {
  title: 13,
  sectionHeader: 10,
  label: 7.5,
  value: 9,
  body: 8.5,
  small: 7,
};

const LINE_HEIGHT = {
  body: 11,
  value: 12,
};

module.exports = {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGIN,
  CONTENT_WIDTH,
  COLOR_HEADER_BAR,
  COLOR_HEADER_TEXT,
  COLOR_LABEL_BG,
  COLOR_BORDER,
  COLOR_TEXT,
  FONT_SIZE,
  LINE_HEIGHT,
};
