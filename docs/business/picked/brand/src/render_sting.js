// Renders brand/motion/sting.html to an MP4, one frame at a time, so the timing
// is exact whatever the machine's speed. Needs Playwright and ffmpeg.
// Usage: node render_sting.js [path-to-playwright] [chromium-executable]
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const pw = require(process.argv[2] || 'playwright');
const FPS = 30, SECONDS = 3.6;
const dir = path.join(__dirname, '..', 'motion');
const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'sting-'));

(async () => {
  const browser = await pw.chromium.launch(process.argv[3] ? { executablePath: process.argv[3] } : {});
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto('file://' + path.join(dir, 'sting.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));
  const n = Math.round(FPS * SECONDS);
  for (let i = 0; i < n; i++) {
    const t = (i / FPS) * 1000;
    await page.evaluate(t => document.getAnimations().forEach(a => { a.currentTime = t; }), t);
    await page.screenshot({ path: path.join(frames, `f${String(i).padStart(4, '0')}.png`) });
  }
  // the last frame doubles as a still for posts and thumbnails
  fs.copyFileSync(path.join(frames, `f${String(n - 1).padStart(4, '0')}.png`), path.join(dir, 'picked-sting-end-frame.png'));
  await browser.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart',
    path.join(dir, 'picked-sting-1080x1920.mp4')]);
  fs.rmSync(frames, { recursive: true });
  console.log('ok', n, 'frames');
})();
