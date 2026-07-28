/**
 * Deterministic frame-by-frame capture: one headless Chrome page per clip,
 * driven by calling window.__render(t) (t = seconds since clip start) for
 * every output frame, then screenshotting. Because every frame's DOM state
 * is computed purely from t (no reliance on real-time CSS animation/wall
 * clock), capture speed never affects the rendered result.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME_PATH =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * puppeteer-core (a devDependency, not full puppeteer) ships no bundled
 * browser — it drives whatever's at CHROME_PATH. A fresh clone on a machine
 * without Chrome/Chromium at that path (or without $CHROME_PATH set to one)
 * has nothing to launch; check first so callers can skip cleanly instead of
 * letting puppeteer throw mid-capture.
 */
export function chromeAvailable() {
  return fs.existsSync(CHROME_PATH);
}

export { CHROME_PATH };

/**
 * @param {{name: string, html: string, duration: number, fps?: number, framesRoot: string, viewport?: {width: number, height: number, deviceScaleFactor?: number}}} opts
 */
export async function captureClipFrames({
  name,
  html,
  duration,
  fps = 30,
  framesRoot,
  viewport = { width: 1920, height: 1080, deviceScaleFactor: 1 },
}) {
  const dir = path.join(framesRoot, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: viewport,
    args: ['--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    const totalFrames = Math.max(1, Math.round(duration * fps));
    for (let i = 0; i < totalFrames; i++) {
      const t = i / fps;
      await page.evaluate((tt) => window.__render(tt), t);
      const file = path.join(dir, `frame-${String(i).padStart(5, '0')}.png`);
      await page.screenshot({ path: file, type: 'png' });
    }
    return { dir, totalFrames, fps };
  } finally {
    await browser.close();
  }
}
