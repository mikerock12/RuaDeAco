export async function toggleFullscreen(): Promise<boolean> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return false;
    }
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return true;
  } catch {
    return document.fullscreenElement !== null;
  }
}
