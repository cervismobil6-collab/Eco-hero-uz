import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tsxBin = path.resolve(__dirname, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const styleTextShim = 'import u from "node:util";import m from "node:module";const o=u.styleText;u.styleText=(f,t,p)=>{try{return Array.isArray(f)?f.reduce((s,x)=>o?o(x,s,p):s,t):o?o(f,t,p):t}catch{return String(t)}};m.syncBuiltinESMExports();';
const shimFlag = `--import=data:text/javascript,${encodeURIComponent(styleTextShim)}`;

function withCompatEnv(extraNodeOpts = '') {
  const parts = [process.env.NODE_OPTIONS, extraNodeOpts, shimFlag].filter(Boolean);
  return {
    ...process.env,
    NODE_OPTIONS: parts.join(' '),
  };
}

if (!fs.existsSync(tsxBin)) {
  console.log('[ApexNodes Bootstrap] tsx topilmadi, paketlar o\'rnatilmoqda (npm install --include=dev)...');
  const installRes = spawnSync(npmCmd, ['install', '--include=dev', '--include=optional', '--no-audit', '--no-fund'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env,
  });
  if (installRes.status !== 0) {
    process.exit(installRes.status ?? 1);
  }
}

function canLoadBundler() {
  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      "Promise.all([import('vite'), import('@tailwindcss/vite')]).then(() => process.exit(0)).catch(() => process.exit(1))",
    ],
    { cwd: __dirname, stdio: 'ignore', env: withCompatEnv() }
  );
  return probe.status === 0;
}

if (!canLoadBundler()) {
  console.log('[ApexNodes Bootstrap] Vite/Rolldown native binding topilmadi, tuzatilmoqda...');
  const lockFile = path.resolve(__dirname, 'package-lock.json');
  if (fs.existsSync(lockFile)) {
    try {
      fs.rmSync(lockFile, { force: true });
    } catch {
      // ignore
    }
  }
  spawnSync(npmCmd, ['install', '--no-package-lock', '--include=dev', '--include=optional', '--no-audit', '--no-fund'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env,
  });

  if (!canLoadBundler() && process.platform === 'linux') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    let isGnu = true;
    try {
      const report = process.report?.getReport?.();
      isGnu = Boolean(report?.header?.glibcVersionRuntime);
    } catch {
      isGnu = true;
    }
    const libc = isGnu ? 'gnu' : 'musl';
    let rolldownVer = 'latest';
    let oxideVer = 'latest';
    try {
      rolldownVer = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'node_modules/rolldown/package.json'), 'utf-8')).version || 'latest';
    } catch {}
    try {
      oxideVer = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'node_modules/@tailwindcss/oxide/package.json'), 'utf-8')).version || 'latest';
    } catch {}

    spawnSync(
      npmCmd,
      [
        'install',
        '--no-save',
        '--no-package-lock',
        '--no-audit',
        '--no-fund',
        `@rolldown/binding-linux-${arch}-${libc}@${rolldownVer}`,
        `@tailwindcss/oxide-linux-${arch}-${libc}@${oxideVer}`,
      ],
      { cwd: __dirname, stdio: 'inherit', env: process.env }
    );

    if (!canLoadBundler()) {
      spawnSync(
        npmCmd,
        ['install', '--no-save', '--no-package-lock', '--no-audit', '--no-fund', `@rolldown/binding-wasm32-wasi@${rolldownVer}`],
        { cwd: __dirname, stdio: 'inherit', env: process.env }
      );
    }
  }
}

const isAiStudioSandbox =
  String(process.env.K_SERVICE || '').startsWith('ais-dev-') ||
  String(process.env.K_SERVICE || '').startsWith('ais-pre-');

if (!isAiStudioSandbox && process.env.SKIP_AUTO_BUILD !== 'true' && !fs.existsSync(path.resolve(__dirname, 'dist', 'index.html'))) {
  console.log('[ApexNodes Bootstrap] dist/index.html topilmadi, yengil static build qilinmoqda (1 GiB RAM himoyasi)...');
  const buildEnv = withCompatEnv(process.env.NODE_OPTIONS?.includes('max-old-space-size') ? '' : '--max-old-space-size=512');
  const buildRes = spawnSync(npmCmd, ['run', 'build'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: buildEnv,
  });
  if (buildRes.status !== 0) {
    console.warn('[ApexNodes Bootstrap] npm run build yakunlanmadi, server fallback rejimida ishga tushirilmoqda...');
  }
}

async function ensureCloudflaredBinary() {
  const binDir = path.resolve(__dirname, 'bin');
  const binPath = path.join(binDir, 'cloudflared');
  const isValid = () => {
    try {
      return fs.existsSync(binPath) && fs.statSync(binPath).size > 5 * 1024 * 1024;
    } catch {
      return false;
    }
  };

  if (!isValid() && process.platform === 'linux') {
    const cfArch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cfArch}`;
    try {
      fs.mkdirSync(binDir, { recursive: true });
      console.log(`[ApexNodes Bootstrap] cloudflared (${cfArch}) yuklab olinmoqda...`);
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 5 * 1024 * 1024) {
          fs.writeFileSync(binPath, buf);
          fs.chmodSync(binPath, 0o755);
          console.log(`[ApexNodes Bootstrap] cloudflared yuklandi (${(buf.length / 1024 / 1024).toFixed(1)} MB).`);
        }
      } else {
        console.warn(`[ApexNodes Bootstrap] cloudflared yuklash HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('[ApexNodes Bootstrap] cloudflared yuklab bo\'lmadi:', err?.message || err);
    }
  }

  if (isValid()) {
    try {
      fs.chmodSync(binPath, 0o755);
      const ver = spawnSync(binPath, ['--version'], { cwd: __dirname, encoding: 'utf-8' });
      console.log('[ApexNodes Bootstrap] cloudflared tayyor:', (ver.stdout || ver.stderr || '').trim().split('\n')[0]);
    } catch {}
  }
}

const needCloudflared =
  Boolean(String(process.env.CLOUDFLARE_TUNNEL_TOKEN || '').trim()) ||
  (process.env.USE_QUICK_TUNNEL !== 'false' && !process.env.RENDER_EXTERNAL_URL && !process.env.RAILWAY_PUBLIC_DOMAIN);

if (needCloudflared) {
  await ensureCloudflaredBinary();
} else {
  console.log('[Bootstrap] Doimiy HTTPS hosting aniqlandi (USE_QUICK_TUNNEL=false), cloudflared yuklash o\'tkazib yuborildi.');
}

const cmd = fs.existsSync(tsxBin) ? tsxBin : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
const args = fs.existsSync(tsxBin) ? ['server.ts'] : ['tsx', 'server.ts'];

let shuttingDown = false;
let activeChild = null;
let rapidCrashCount = 0;

function launchServer() {
  const startedAt = Date.now();
  const isRenderFree = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
  const defaultHeapFlag = isRenderFree ? '--max-old-space-size=384' : '--max-old-space-size=640';
  const child = spawn(cmd, args, {
    cwd: __dirname,
    stdio: 'inherit',
    env: withCompatEnv(process.env.NODE_OPTIONS?.includes('max-old-space-size') ? '' : defaultHeapFlag),
  });
  activeChild = child;

  child.on('exit', (code, signal) => {
    activeChild = null;
    if (shuttingDown) {
      process.exit(0);
      return;
    }
    const uptimeMs = Date.now() - startedAt;
    if (uptimeMs > 60000) {
      rapidCrashCount = 0;
    } else {
      rapidCrashCount += 1;
    }
    console.warn(`[ApexNodes Bootstrap] Server to'xtadi (code=${code}, signal=${signal}). ${rapidCrashCount >= 5 ? '10s' : '3s'} dan keyin qayta ishga tushiriladi...`);
    setTimeout(launchServer, rapidCrashCount >= 5 ? 10000 : 3000);
  });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    shuttingDown = true;
    if (activeChild && !activeChild.killed) {
      activeChild.kill(sig);
    } else {
      process.exit(0);
    }
  });
}

launchServer();
