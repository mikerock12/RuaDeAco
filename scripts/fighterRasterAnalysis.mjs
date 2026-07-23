// Análise raster compartilhada entre a auditoria de sprites e os testes.
// Fecha a brecha em que um retângulo uniforme com um pixel alterado por frame
// passava como "animação real": hashes distintos não bastam; exigimos cores,
// diferença real entre poses e silhueta que não seja um bloco retangular único.
import { inflateSync } from 'node:zlib';

// Limites calibrados nas folhas válidas de Rafa, Guto e Astro (18/07/2026):
// - menor contagem de cores opacas por frame corporal observada: 3.627
//   (rafa-mare/jump-backward.png); por frame de efeito: 153
//   (guto-barba/abraco-glacial-effect.png).
// - menor diferença real entre qualquer par de frames de uma folha: 550 px
//   em efeitos e 7.080 px em corpos; normalizada pela massa opaca, sempre
//   acima de 99% — os placeholders rejeitados diferiam por 1–2 px (~0,03%).
// - maior taxa de preenchimento do bounding box corporal: 0,748
//   (rafa-mare/frozen.png); o retângulo-placeholder preenchia ~99,99%.
// Os valores abaixo mantêm folga ampla para arte legítima e ainda rejeitam
// qualquer variação trivial do gerador de retângulos.
export const BODY_MIN_DISTINCT_OPAQUE_COLORS = 64;
export const EFFECT_MIN_DISTINCT_OPAQUE_COLORS = 16;
export const MIN_FRAME_PAIR_DIFF_PIXELS = 64;
export const MIN_FRAME_PAIR_DIFF_RATIO = 0.02;
export const BODY_MAX_BBOX_FILL_RATIO = 0.9;
export const BODY_FILL_MIN_BBOX_AREA = 2048;

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error('Assinatura PNG inválida');

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }
  if (bitDepth !== 8) throw new Error(`Bit depth não suportado: ${bitDepth}`);
  if (interlace !== 0) throw new Error('PNG entrelaçado não suportado');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Color type não suportado: ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4, 255);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const current = Buffer.from(line);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      switch (filter) {
        case 1: current[x] = (current[x] + left) & 255; break;
        case 2: current[x] = (current[x] + up) & 255; break;
        case 3: current[x] = (current[x] + ((left + up) >> 1)) & 255; break;
        case 4: current[x] = (current[x] + paeth(left, up, upLeft)) & 255; break;
      }
    }
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      const source = x * channels;
      if (colorType === 6) {
        pixels[target] = current[source];
        pixels[target + 1] = current[source + 1];
        pixels[target + 2] = current[source + 2];
        pixels[target + 3] = current[source + 3];
      } else if (colorType === 2) {
        pixels[target] = current[source];
        pixels[target + 1] = current[source + 1];
        pixels[target + 2] = current[source + 2];
      } else if (colorType === 4) {
        pixels[target] = pixels[target + 1] = pixels[target + 2] = current[source];
        pixels[target + 3] = current[source + 1];
      } else {
        pixels[target] = pixels[target + 1] = pixels[target + 2] = current[source];
      }
    }
    previous = current;
  }
  return { width, height, bitDepth, colorType, interlace, pixels };
}

export function frameBounds(sheet, frameIndex) {
  return sheet.layout === 'vertical'
    ? {
        startX: 0,
        endX: sheet.frameWidth - 1,
        startY: frameIndex * sheet.frameHeight,
        endY: (frameIndex + 1) * sheet.frameHeight - 1,
      }
    : {
        startX: frameIndex * sheet.frameWidth,
        endX: (frameIndex + 1) * sheet.frameWidth - 1,
        startY: 0,
        endY: sheet.frameHeight - 1,
      };
}

export function frameRasterStats(image, frameIndex, sheet) {
  const bounds = frameBounds(sheet, frameIndex);
  const colors = new Set();
  let opaque = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let y = bounds.startY; y <= bounds.endY; y += 1) {
    for (let x = bounds.startX; x <= bounds.endX; x += 1) {
      const index = (y * image.width + x) * 4;
      if (image.pixels[index + 3] === 0) continue;
      opaque += 1;
      colors.add((image.pixels[index] << 16) | (image.pixels[index + 1] << 8) | image.pixels[index + 2]);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const bboxArea = opaque === 0 ? 0 : (maxX - minX + 1) * (maxY - minY + 1);
  return {
    opaque,
    distinctColors: colors.size,
    bboxArea,
    bboxFillRatio: bboxArea > 0 ? opaque / bboxArea : 0,
  };
}

// Diferença visível real entre dois frames da mesma folha: pixels cujo estado
// (transparente/opaco) ou cor RGB divergem. RGB escondido sob alpha zero não
// conta, para coincidir com o critério canônico de arte visível da auditoria.
export function framePairDiff(image, frameA, frameB, sheet) {
  const boundsA = frameBounds(sheet, frameA);
  const boundsB = frameBounds(sheet, frameB);
  let diff = 0;
  for (let y = 0; y < sheet.frameHeight; y += 1) {
    for (let x = 0; x < sheet.frameWidth; x += 1) {
      const indexA = ((boundsA.startY + y) * image.width + boundsA.startX + x) * 4;
      const indexB = ((boundsB.startY + y) * image.width + boundsB.startX + x) * 4;
      const transparentA = image.pixels[indexA + 3] === 0;
      const transparentB = image.pixels[indexB + 3] === 0;
      if (transparentA && transparentB) continue;
      if (transparentA !== transparentB
        || image.pixels[indexA] !== image.pixels[indexB]
        || image.pixels[indexA + 1] !== image.pixels[indexB + 1]
        || image.pixels[indexA + 2] !== image.pixels[indexB + 2]) diff += 1;
    }
  }
  return diff;
}

// Verificações anti-placeholder de uma folha inteira. `frames` deve ser a
// contagem de frames fisicamente disponíveis; frames vazios são ignorados
// aqui porque a auditoria já os acusa como FRAME VAZIO.
export function placeholderIssues(image, sheet, rasterKind) {
  const issues = [];
  const minColors = rasterKind === 'body'
    ? BODY_MIN_DISTINCT_OPAQUE_COLORS
    : EFFECT_MIN_DISTINCT_OPAQUE_COLORS;
  const stats = [];
  for (let frame = 0; frame < sheet.frames; frame += 1) {
    stats.push(frameRasterStats(image, frame, sheet));
  }

  for (let frame = 0; frame < sheet.frames; frame += 1) {
    const frameStats = stats[frame];
    if (frameStats.opaque === 0) continue;
    if (frameStats.distinctColors < minColors) {
      issues.push(
        `FRAME ${frame} COM POUCAS CORES OPACAS: ${frameStats.distinctColors}, MÍNIMO ${minColors}`,
      );
    }
    if (rasterKind === 'body'
      && frameStats.bboxArea >= BODY_FILL_MIN_BBOX_AREA
      && frameStats.bboxFillRatio > BODY_MAX_BBOX_FILL_RATIO) {
      issues.push(
        `FRAME ${frame} É BLOCO RETANGULAR ÚNICO: PREENCHE ${(frameStats.bboxFillRatio * 100).toFixed(1)}% DO BBOX, MÁXIMO ${(BODY_MAX_BBOX_FILL_RATIO * 100).toFixed(0)}%`,
      );
    }
  }

  for (let frameA = 0; frameA < sheet.frames; frameA += 1) {
    for (let frameB = frameA + 1; frameB < sheet.frames; frameB += 1) {
      if (stats[frameA].opaque === 0 || stats[frameB].opaque === 0) continue;
      const diff = framePairDiff(image, frameA, frameB, sheet);
      const ratio = diff / Math.max(1, Math.max(stats[frameA].opaque, stats[frameB].opaque));
      if (diff < MIN_FRAME_PAIR_DIFF_PIXELS || ratio < MIN_FRAME_PAIR_DIFF_RATIO) {
        issues.push(
          `FRAMES ${frameA} E ${frameB} QUASE IDÊNTICOS: ${diff} px (${(ratio * 100).toFixed(2)}%) DE DIFERENÇA REAL, MÍNIMO ${MIN_FRAME_PAIR_DIFF_PIXELS} px E ${(MIN_FRAME_PAIR_DIFF_RATIO * 100).toFixed(0)}%`,
        );
      }
    }
  }

  return issues;
}
