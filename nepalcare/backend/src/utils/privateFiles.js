import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './httpError.js';

const privateDirectory = path.resolve(process.cwd(), 'uploads', 'private');
const allowedDirectories = new Set([
  'volunteer-certificates',
  'item-donations',
  'expenses',
  'campaign-updates'
]);

function imageExtension(file) {
  const { buffer, mimetype } = file;
  if (mimetype === 'image/jpeg' && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return '.jpg';
  if (mimetype === 'image/png' && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (mimetype === 'image/webp' && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return '.webp';
  return '';
}

export function validatePrivateFile(file, { imagesOnly = false } = {}) {
  if (!file?.buffer || file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new HttpError(400, 'Uploaded files must not exceed 5 MB.');
  }
  const image = imageExtension(file);
  if (image) return image;
  const isPdf = !imagesOnly && file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-';
  if (isPdf) return '.pdf';
  throw new HttpError(400, imagesOnly
    ? 'Image content must be a valid JPG, PNG or WebP.'
    : 'File content must be a valid PDF, JPG, PNG or WebP.');
}

function getPrivateDirectory(directory) {
  if (!allowedDirectories.has(directory)) throw new Error('Unsupported private file directory.');
  return path.join(privateDirectory, directory);
}

export async function storePrivateFile(file, directory, { imagesOnly = false } = {}) {
  const extension = validatePrivateFile(file, { imagesOnly });
  const storageKey = `${crypto.randomBytes(24).toString('hex')}${extension}`;
  const targetDirectory = getPrivateDirectory(directory);
  await fs.mkdir(targetDirectory, { recursive: true });
  const filePath = path.join(targetDirectory, storageKey);
  const handle = await fs.open(filePath, 'wx');
  try {
    await handle.writeFile(file.buffer);
  } catch (error) {
    await handle.close();
    await fs.rm(filePath, { force: true });
    throw error;
  }
  await handle.close();
  return {
    storageKey,
    originalName: path.basename(file.originalname).slice(0, 255),
    mimeType: file.mimetype,
    size: file.size
  };
}

export async function removePrivateFiles(files, directory) {
  const targetDirectory = getPrivateDirectory(directory);
  await Promise.all(files.filter(Boolean).map(({ storageKey }) => {
    if (!storageKey || path.basename(storageKey) !== storageKey) return Promise.resolve();
    return fs.rm(path.join(targetDirectory, storageKey), { force: true });
  }));
}

export async function sendPrivateFile(res, file, directory, { inline = false } = {}) {
  if (!file?.storageKey || path.basename(file.storageKey) !== file.storageKey) {
    throw new HttpError(404, 'File not found.');
  }
  const filePath = path.resolve(getPrivateDirectory(directory), file.storageKey);
  const expectedPrefix = `${path.resolve(getPrivateDirectory(directory))}${path.sep}`;
  if (!filePath.startsWith(expectedPrefix)) throw new HttpError(404, 'File not found.');
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new HttpError(404, 'File not found.');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.code === 'ENOENT') throw new HttpError(404, 'File not found.');
    throw error;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.originalName || 'download')}"`
  );
  res.sendFile(filePath);
}
