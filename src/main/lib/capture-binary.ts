import path from 'path';

export interface CaptureBinarySource {
  sourceDirectory: string;
  binaryName: string;
}

/** Resolves the SDK layout used by each supported packaged target. */
export function getCaptureBinarySource(
  binBase: string,
  platform: NodeJS.Platform
): CaptureBinarySource {
  if (platform === 'darwin') {
    return {
      sourceDirectory: path.join(binBase, 'VideoDBCapture.app', 'Contents', 'MacOS'),
      binaryName: 'capture',
    };
  }

  if (platform === 'win32') {
    return {
      sourceDirectory: binBase,
      binaryName: 'capture.exe',
    };
  }

  throw new Error(`VideoDB capture is unsupported on ${platform}`);
}

export function isCaptureCommand(command: string, binaryName: string): boolean {
  const normalized = command.replace(/\\/g, '/');
  return path.posix.basename(normalized).toLowerCase() === binaryName.toLowerCase();
}
