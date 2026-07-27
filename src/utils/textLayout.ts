export interface PixelTextOptions {
  readonly size?: number;
  readonly minSize?: number;
  readonly color?: string | number;
  readonly align?: 'left' | 'center' | 'right';
  readonly stroke?: string;
  readonly strokeThickness?: number;
  readonly letterSpacing?: number;
  readonly lineSpacing?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxLines?: number;
  readonly padding?: number | Readonly<{ x: number; y: number }>;
  readonly layoutName?: string;
  readonly panelName?: string;
}

export interface PixelTextMeasure {
  (text: string, size: number, lineSpacing: number): Readonly<{ width: number; height: number }>;
}

export interface PixelTextLayout {
  readonly text: string;
  readonly size: number;
  readonly width: number;
  readonly height: number;
  readonly lines: readonly string[];
  readonly fits: boolean;
}

const DEFAULT_MIN_SIZE = 8;

export function toPixelFontText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/gu, '');
}

export function pixelTextPadding(
  padding: PixelTextOptions['padding'],
): Readonly<{ x: number; y: number }> {
  if (typeof padding === 'number') {
    const value = Math.max(0, Math.round(padding));
    return { x: value, y: value };
  }
  return {
    x: Math.max(0, Math.round(padding?.x ?? 0)),
    y: Math.max(0, Math.round(padding?.y ?? 0)),
  };
}

function splitLongWord(
  word: string,
  size: number,
  maxWidth: number,
  lineSpacing: number,
  measure: PixelTextMeasure,
): string[] {
  const chunks: string[] = [];
  let chunk = '';
  for (const character of word) {
    const candidate = `${chunk}${character}`;
    if (chunk && measure(candidate, size, lineSpacing).width > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export function wrapPixelText(
  text: string,
  size: number,
  maxWidth: number,
  lineSpacing: number,
  measure: PixelTextMeasure,
): readonly string[] {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return text.split('\n');
  const output: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      output.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/u)) {
      if (measure(word, size, lineSpacing).width > maxWidth) {
        if (line) {
          output.push(line);
          line = '';
        }
        const chunks = splitLongWord(word, size, maxWidth, lineSpacing, measure);
        output.push(...chunks.slice(0, -1));
        line = chunks.at(-1) ?? '';
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate, size, lineSpacing).width > maxWidth) {
        output.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    output.push(line);
  }

  return output;
}

export function fitPixelText(
  text: string,
  options: PixelTextOptions,
  measure: PixelTextMeasure,
): PixelTextLayout {
  const safeText = toPixelFontText(text);
  const preferredSize = Math.max(DEFAULT_MIN_SIZE, Math.round(options.size ?? 16));
  const minSize = Math.min(
    preferredSize,
    Math.max(DEFAULT_MIN_SIZE, Math.round(options.minSize ?? DEFAULT_MIN_SIZE)),
  );
  const padding = pixelTextPadding(options.padding);
  const maxWidth = options.maxWidth === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(1, Math.round(options.maxWidth) - padding.x * 2);
  const maxHeight = options.maxHeight === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(1, Math.round(options.maxHeight) - padding.y * 2);
  const lineSpacing = Math.round(options.lineSpacing ?? 0);
  let fallback: PixelTextLayout | undefined;

  for (let size = preferredSize; size >= minSize; size -= 1) {
    const lines = wrapPixelText(safeText, size, maxWidth, lineSpacing, measure);
    const fittedText = lines.join('\n');
    const bounds = measure(fittedText, size, lineSpacing);
    const fits = bounds.width <= maxWidth
      && bounds.height <= maxHeight
      && (options.maxLines === undefined || lines.length <= options.maxLines);
    const layout: PixelTextLayout = {
      text: fittedText,
      size,
      width: Math.ceil(bounds.width),
      height: Math.ceil(bounds.height),
      lines,
      fits,
    };
    fallback = layout;
    if (fits) return layout;
  }

  return fallback ?? {
    text: safeText,
    size: minSize,
    width: 0,
    height: 0,
    lines: safeText.split('\n'),
    fits: false,
  };
}

export function pixelTextOrigin(
  align: NonNullable<PixelTextOptions['align']>,
): Readonly<{ x: number; y: number }> {
  return {
    x: align === 'center' ? 0.5 : align === 'right' ? 1 : 0,
    y: 0.5,
  };
}
