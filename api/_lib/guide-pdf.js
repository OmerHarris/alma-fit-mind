const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = rgb(20 / 255, 24 / 255, 26 / 255);
const INK_SOFT = rgb(90 / 255, 84 / 255, 74 / 255);
const GOLD = rgb(176 / 255, 141 / 255, 87 / 255);
const GOLD_DARK = rgb(124 / 255, 96 / 255, 51 / 255);
const CLAY = rgb(181 / 255, 80 / 255, 46 / 255);
const PAPER = rgb(250 / 255, 247 / 255, 241 / 255);

const DAYS = [
  {
    title: "Day 1 — Reset Your Baseline",
    body: "20-minute walk, no phone.",
    plate: "Drink a full glass of water before your first meal.",
    mind: "Write down the real reason you want this — not “get fit,” the actual reason.",
  },
  {
    title: "Day 2 — Build the First Habit",
    body: "One round of bodyweight squats, push-ups, and a plank — good reps, not max reps.",
    plate: "Add one vegetable to a meal you'd normally skip it in.",
    mind: "Notice one moment today you almost quit on yourself — and didn't.",
  },
  {
    title: "Day 3 — Protein First",
    body: "Repeat Day 2's movements — try to beat yesterday by one rep each.",
    plate: "Eat a real source of protein at your first meal.",
    mind: "Say “I am someone who follows through” out loud, once.",
  },
  {
    title: "Day 4 — Rest Is Training",
    body: "Active recovery only — stretch or a slow 15-minute walk.",
    plate: "Notice, without judging, how you eat when stressed today.",
    mind: "List three things you did this week your old self wouldn't have.",
  },
  {
    title: "Day 5 — Push a Little",
    body: "Add five more reps than Day 3 to each movement.",
    plate: "Plan tomorrow's meals tonight — five minutes, max.",
    mind: "Name the exact moment you usually fall off a plan, and one way around it.",
  },
  {
    title: "Day 6 — Show Up Anyway",
    body: "Do the workout even if you don't feel like it — that's the actual point.",
    plate: "Practice one social-eating moment without over-restricting or overeating.",
    mind: "Forgive yourself, out loud, for one thing from this week.",
  },
  {
    title: "Day 7 — Lock It In",
    body: "Full circuit — squats, push-ups, plank, plus a 20-minute walk.",
    plate: "Pick one eating habit from this week you'll actually keep.",
    mind: "Write down what changed in how you think about yourself — not your body. Your mind.",
  },
];

function wrapText(font, size, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function generateGuidePdf() {
  const pdf = await PDFDocument.create();
  pdf.setTitle("The 7-Day Mind-Body Reset");
  pdf.setAuthor("Alma Fit & Mind");
  pdf.setSubject("Free guide from almafitandmind.com");

  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Cover page
  const cover = pdf.addPage([PAGE_W, PAGE_H]);
  cover.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: INK });

  const markR = 34;
  const markX = PAGE_W / 2;
  const markY = PAGE_H - 190;
  cover.drawCircle({ x: markX, y: markY, size: markR, color: GOLD });
  const aWidth = serifBold.widthOfTextAtSize("A", 34);
  cover.drawText("A", {
    x: markX - aWidth / 2,
    y: markY - 12,
    size: 34,
    font: serifBold,
    color: INK,
  });

  const eyebrow = "ALMA FIT & MIND";
  const eyebrowSize = 11;
  const eyebrowW = sansBold.widthOfTextAtSize(eyebrow, eyebrowSize);
  cover.drawText(eyebrow, {
    x: markX - eyebrowW / 2,
    y: markY - 70,
    size: eyebrowSize,
    font: sansBold,
    color: GOLD,
  });

  const title1 = "The 7-Day";
  const title2 = "Mind-Body Reset";
  const titleSize = 40;
  cover.drawText(title1, {
    x: markX - serifBold.widthOfTextAtSize(title1, titleSize) / 2,
    y: markY - 140,
    size: titleSize,
    font: serifBold,
    color: rgb(1, 1, 1),
  });
  cover.drawText(title2, {
    x: markX - serifBold.widthOfTextAtSize(title2, titleSize) / 2,
    y: markY - 190,
    size: titleSize,
    font: serifBold,
    color: rgb(1, 1, 1),
  });

  const sub = "One small Body, Plate, and Mind action each day for a week.";
  const subSize = 13;
  cover.drawText(sub, {
    x: markX - sans.widthOfTextAtSize(sub, subSize) / 2,
    y: markY - 230,
    size: subSize,
    font: sans,
    color: rgb(0.85, 0.85, 0.85),
  });

  const footer = "almafitandmind.com";
  cover.drawText(footer, {
    x: markX - sans.widthOfTextAtSize(footer, 10) / 2,
    y: 60,
    size: 10,
    font: sans,
    color: rgb(0.6, 0.6, 0.6),
  });

  // Content pages
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAPER });
  let y = PAGE_H - MARGIN - 10;

  const ensureSpace = (needed) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAPER });
      y = PAGE_H - MARGIN - 10;
    }
  };

  const drawLabelLine = (label, text, color) => {
    const labelSize = 11;
    const bodySize = 11;
    const lineGap = 15;
    const labelText = label + "  ";
    const labelW = sansBold.widthOfTextAtSize(labelText, labelSize);
    const lines = wrapText(sans, bodySize, text, CONTENT_W - labelW - 10);

    ensureSpace(lineGap * lines.length + 6);
    page.drawText(labelText, { x: MARGIN, y, size: labelSize, font: sansBold, color });
    lines.forEach((line, i) => {
      page.drawText(line, {
        x: MARGIN + labelW + 10,
        y: y - lineGap * i,
        size: bodySize,
        font: sans,
        color: INK_SOFT,
      });
    });
    y -= lineGap * lines.length + 12;
  };

  DAYS.forEach((day, idx) => {
    ensureSpace(50);
    if (idx > 0) {
      page.drawLine({
        start: { x: MARGIN, y: y + 8 },
        end: { x: PAGE_W - MARGIN, y: y + 8 },
        thickness: 0.75,
        color: rgb(0.9, 0.87, 0.79),
      });
      y -= 14;
      ensureSpace(30);
    }
    page.drawText(day.title, { x: MARGIN, y, size: 17, font: serifBold, color: INK });
    y -= 24;

    drawLabelLine("Body:", day.body, CLAY);
    drawLabelLine("Plate:", day.plate, GOLD_DARK);
    drawLabelLine("Mind:", day.mind, INK);
  });

  ensureSpace(60);
  y -= 10;
  page.drawLine({
    start: { x: MARGIN, y: y + 8 },
    end: { x: PAGE_W - MARGIN, y: y + 8 },
    thickness: 0.75,
    color: rgb(0.9, 0.87, 0.79),
  });
  y -= 20;
  const disclaimer = wrapText(
    sans,
    9,
    "General movement guidance for healthy adults — not medical advice. Check with your doctor before starting any new exercise routine, especially if you have an injury or health condition.",
    CONTENT_W
  );
  disclaimer.forEach((line, i) => {
    page.drawText(line, { x: MARGIN, y: y - 12 * i, size: 9, font: sans, color: rgb(0.5, 0.47, 0.42) });
  });

  return pdf.save();
}

module.exports = { generateGuidePdf };
