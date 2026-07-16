export interface FitViewport {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly scale: number;
}

export interface ViewportRefreshTiming {
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(handle: number): void;
  setDelay(callback: () => void, delayMs: number): number;
  clearDelay(handle: number): void;
}

export interface ViewportRefreshScheduler {
  schedule(): void;
  dispose(): void;
}

export const VIEWPORT_SETTLE_DELAY_MS = 160;

export function calculateFitViewport(
  viewportWidth: number,
  viewportHeight: number,
  logicalWidth = 640,
  logicalHeight = 360,
): FitViewport {
  if (
    !Number.isFinite(viewportWidth)
    || !Number.isFinite(viewportHeight)
    || !Number.isFinite(logicalWidth)
    || !Number.isFinite(logicalHeight)
    || viewportWidth <= 0
    || viewportHeight <= 0
    || logicalWidth <= 0
    || logicalHeight <= 0
  ) {
    return { width: 0, height: 0, left: 0, top: 0, scale: 0 };
  }

  const scale = Math.min(viewportWidth / logicalWidth, viewportHeight / logicalHeight);
  const width = logicalWidth * scale;
  const height = logicalHeight * scale;

  return {
    width,
    height,
    left: (viewportWidth - width) / 2,
    top: (viewportHeight - height) / 2,
    scale,
  };
}

export function createViewportRefreshScheduler(
  refresh: () => void,
  timing: ViewportRefreshTiming,
  settleDelayMs = VIEWPORT_SETTLE_DELAY_MS,
): ViewportRefreshScheduler {
  let frameHandle: number | null = null;
  let delayHandle: number | null = null;
  let disposed = false;

  const schedule = (): void => {
    if (disposed) return;

    if (frameHandle !== null) timing.cancelFrame(frameHandle);
    frameHandle = timing.requestFrame(() => {
      frameHandle = null;
      if (!disposed) refresh();
    });

    if (delayHandle !== null) timing.clearDelay(delayHandle);
    delayHandle = timing.setDelay(() => {
      delayHandle = null;
      if (!disposed) refresh();
    }, settleDelayMs);
  };

  const dispose = (): void => {
    disposed = true;
    if (frameHandle !== null) timing.cancelFrame(frameHandle);
    if (delayHandle !== null) timing.clearDelay(delayHandle);
    frameHandle = null;
    delayHandle = null;
  };

  return { schedule, dispose };
}
