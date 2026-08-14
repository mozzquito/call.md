const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const tar = require('tar');

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'call-md-builder' } }, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        download(response.headers.location, destination).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`VideoDB capture download failed: HTTP ${response.statusCode}`));
        return;
      }

      const output = fs.createWriteStream(destination, { mode: 0o600 });
      response.pipe(output);
      output.on('finish', () => output.close(resolve));
      output.on('error', reject);
    });
    request.on('error', reject);
  });
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
    input.on('error', reject);
  });
}

async function prepareVideoDBCapture(projectDir, platform, arch) {
  const packagePath = path.join(projectDir, 'node_modules', 'videodb', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const config = packageJson.binaryConfig;
  const platformKey = `${platform}-${arch}`;
  const expectedChecksum = config?.checksums?.[platformKey];

  if (!expectedChecksum) {
    throw new Error(`VideoDB capture does not publish a ${platformKey} artifact`);
  }

  const binDir = path.join(projectDir, 'node_modules', 'videodb', 'bin');
  const expectedBinary = platform === 'win32'
    ? path.join(binDir, 'capture.exe')
    : path.join(binDir, 'VideoDBCapture.app', 'Contents', 'MacOS', 'capture');

  if (fs.existsSync(expectedBinary)) {
    console.log(`VideoDB capture already staged for ${platformKey}`);
    return;
  }

  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'call-md-capture-'));
  const archivePath = path.join(temporaryDir, 'capture.tar.gz');
  const extractedPath = path.join(temporaryDir, 'extracted');
  fs.mkdirSync(extractedPath);

  try {
    const url = `${config.baseUrl}/v${config.version}/capture-${platformKey}.tar.gz`;
    console.log(`Downloading checksum-pinned VideoDB capture artifact: ${platformKey}`);
    await download(url, archivePath);

    const actualChecksum = await sha256(archivePath);
    if (actualChecksum !== expectedChecksum) {
      throw new Error(
        `VideoDB capture checksum mismatch for ${platformKey}: ` +
        `expected ${expectedChecksum}, got ${actualChecksum}`
      );
    }

    await tar.extract({ file: archivePath, cwd: extractedPath });
    const extractedBinary = platform === 'win32'
      ? path.join(extractedPath, 'capture.exe')
      : path.join(extractedPath, 'VideoDBCapture.app');

    if (!fs.existsSync(extractedBinary)) {
      throw new Error(`VideoDB capture archive did not contain the expected ${platformKey} binary`);
    }

    fs.mkdirSync(binDir, { recursive: true });
    if (platform === 'win32') {
      fs.copyFileSync(extractedBinary, expectedBinary);
    } else {
      fs.cpSync(extractedBinary, path.join(binDir, 'VideoDBCapture.app'), { recursive: true });
    }
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
}

module.exports = { prepareVideoDBCapture };
