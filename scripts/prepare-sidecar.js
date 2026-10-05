import { existsSync, mkdirSync, copyFileSync, chmodSync, createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { platform, arch } from 'node:os';
import https from 'node:https';
import { execSync } from 'node:child_process';

const TARGET_NODE_VERSION = 'v20.18.0';

function getTargetTriple() {
  const p = platform();
  const a = arch();

  if (p === 'linux' && (a === 'x64' || a === 'amd64')) {
    return 'x86_64-unknown-linux-gnu';
  }
  if (p === 'win32' && (a === 'x64' || a === 'amd64')) {
    return 'x86_64-pc-windows-msvc';
  }
  if (p === 'darwin') {
    return a === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  }
  throw new Error(`Plataforma não suportada: ${p}-${a}`);
}

async function prepare() {
  const triple = process.env.TAURI_TARGET_TRIPLE || getTargetTriple();
  const isWindows = triple.includes('windows');
  const ext = isWindows ? '.exe' : '';
  const binaryName = `star-engine-${triple}${ext}`;
  const outDir = resolve('src-tauri/binaries');
  const targetPath = join(outDir, binaryName);

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  console.log(`[Sidecar] Preparando binário para alvo: ${triple}...`);

  // If running locally on matching platform, use current node executable
  const isCurrentPlatform =
    (platform() === 'linux' && triple.includes('linux')) ||
    (platform() === 'win32' && triple.includes('windows')) ||
    (platform() === 'darwin' && triple.includes('darwin'));

  if (isCurrentPlatform && !process.env.FORCE_DOWNLOAD) {
    console.log(`[Sidecar] Usando Node.js local de ${process.execPath}...`);
    copyFileSync(process.execPath, targetPath);
    if (!isWindows) {
      chmodSync(targetPath, 0o755);
    }
    console.log(`[Sidecar] Pronto! Binário criado em: ${targetPath}`);
    return;
  }

  // Otherwise, download standalone binary
  console.log(`[Sidecar] Baixando Node.js ${TARGET_NODE_VERSION} para ${triple}...`);
  if (isWindows) {
    const url = `https://nodejs.org/dist/${TARGET_NODE_VERSION}/win-x64/node.exe`;
    await downloadFile(url, targetPath);
  } else if (triple.includes('linux')) {
    const tarUrl = `https://nodejs.org/dist/${TARGET_NODE_VERSION}/node-${TARGET_NODE_VERSION}-linux-x64.tar.xz`;
    const tmpTar = join(outDir, 'node-linux.tar.xz');
    await downloadFile(tarUrl, tmpTar);
    execSync(`tar -xf "${tmpTar}" -C "${outDir}" --strip-components=2 "node-${TARGET_NODE_VERSION}-linux-x64/bin/node"`);
    copyFileSync(join(outDir, 'node'), targetPath);
    execSync(`rm -f "${tmpTar}" "${join(outDir, 'node')}"`);
    chmodSync(targetPath, 0o755);
  } else if (triple.includes('darwin')) {
    const darwinArch = triple.includes('aarch64') ? 'darwin-arm64' : 'darwin-x64';
    const tarUrl = `https://nodejs.org/dist/${TARGET_NODE_VERSION}/node-${TARGET_NODE_VERSION}-${darwinArch}.tar.gz`;
    const tmpTar = join(outDir, 'node-darwin.tar.gz');
    await downloadFile(tarUrl, tmpTar);
    execSync(`tar -xzf "${tmpTar}" -C "${outDir}" --strip-components=2 "node-${TARGET_NODE_VERSION}-${darwinArch}/bin/node"`);
    copyFileSync(join(outDir, 'node'), targetPath);
    execSync(`rm -f "${tmpTar}" "${join(outDir, 'node')}"`);
    chmodSync(targetPath, 0o755);
  }

  console.log(`[Sidecar] Pronto! Binário preparado com sucesso em: ${targetPath}`);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Falha no download (Status: ${res.statusCode}) de ${url}`));
      }
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
      file.on('error', (err) => {
        reject(err);
      });
    }).on('error', reject);
  });
}

prepare().catch((err) => {
  console.error('[Sidecar] Erro:', err.message);
  process.exit(1);
});
