import QRCode from 'qrcode';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CAMERA_DIR = path.resolve('tmp/camera');

export async function prepareCamera({
  source,
  content,
}) {
  if (Boolean(source) === Boolean(content)) {
    throw new Error(
      'Informe exatamente um dos campos: source ou content.'
    );
  }

  await fs.mkdir(CAMERA_DIR, { recursive: true });

  const imagePath = path.join(CAMERA_DIR, 'qrcode.png');
  const videoPath = path.join(CAMERA_DIR, 'qrcode.y4m');

  if (source) {
    const resolvedSource = path.resolve(source);
    const image = await fs.readFile(resolvedSource);

    await fs.writeFile(imagePath, image);
  } else {
    await QRCode.toFile(imagePath, String(content), {
      width: 640,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
  }

  await new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-loop', '1',
      '-i', imagePath,
      '-t', '10',
      '-r', '10',
      '-vf', 'scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2:white',
      '-pix_fmt', 'yuv420p',
      '-f', 'yuv4mpegpipe',
      videoPath,
    ]);

    let stderr = '';

    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on('error', reject);

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg falhou: ${stderr}`));
    });
  });

  return { imagePath, videoPath };
}