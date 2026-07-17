const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const PAGE_W = 612, PAGE_H = 792, MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;
const INK = rgb(20 / 255, 24 / 255, 26 / 255);
const INK_SOFT = rgb(90 / 255, 84 / 255, 74 / 255);
const GOLD = rgb(176 / 255, 141 / 255, 87 / 255);
const LINE = rgb(0.9, 0.87, 0.79);
const PAPER = rgb(250 / 255, 247 / 255, 241 / 255);

function wrap(font, size, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(test, size) > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// rows: [[label, value], ...]
async function generateIntakePdf(name, rows) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Client Intake — ${name}`);
  pdf.setAuthor("Alma Fit & Mind");

  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAPER });
  let y = PAGE_H - MARGIN;

  // Header band
  page.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: INK });
  page.drawCircle({ x: MARGIN + 16, y: PAGE_H - 46, size: 16, color: GOLD });
  page.drawText("A", { x: MARGIN + 10, y: PAGE_H - 52, size: 18, font: serifBold, color: INK });
  page.drawText("Client Intake", { x: MARGIN + 44, y: PAGE_H - 44, size: 20, font: serifBold, color: rgb(1, 1, 1) });
  page.drawText("Alma Fit & Mind · almafitandmind.com", { x: MARGIN + 44, y: PAGE_H - 64, size: 10, font: sans, color: rgb(0.7, 0.7, 0.7) });
  y = PAGE_H - 118;

  page.drawText(name, { x: MARGIN, y, size: 16, font: serifBold, color: INK });
  y -= 28;

  const labelW = 165;
  const valW = CONTENT_W - labelW - 12;

  const ensure = (need) => {
    if (y - need < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAPER });
      y = PAGE_H - MARGIN;
    }
  };

  for (const [label, value] of rows) {
    const lines = wrap(sans, 11, value, valW);
    const blockH = Math.max(18, lines.length * 15) + 8;
    ensure(blockH);
    page.drawText(label, { x: MARGIN, y: y - 2, size: 10.5, font: sansBold, color: INK });
    lines.forEach((ln, i) => {
      page.drawText(ln, { x: MARGIN + labelW, y: y - 2 - i * 15, size: 11, font: sans, color: INK_SOFT });
    });
    y -= blockH;
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PAGE_W - MARGIN, y: y + 4 }, thickness: 0.5, color: LINE });
    y -= 6;
  }

  ensure(40);
  y -= 8;
  const disc = wrap(sans, 8.5, "Collected via the Alma's Assistant chat on almafitandmind.com. This is coaching intake information, not medical records. Handle privately.", CONTENT_W);
  disc.forEach((ln, i) => page.drawText(ln, { x: MARGIN, y: y - i * 11, size: 8.5, font: sans, color: rgb(0.55, 0.52, 0.47) }));

  return pdf.save();
}

module.exports = { generateIntakePdf };
