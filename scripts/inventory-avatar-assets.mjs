import { readdir, stat, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'Avatar');
const supported = new Set(['.blend', '.fbx', '.obj', '.glb', '.gltf']);
const images = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp']);
const rows = [];

async function walk(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) { await walk(full); continue; }
    if (!entry.isFile()) continue;
    const info = await stat(full); const extension = path.extname(entry.name).toLowerCase();
    const handle = await open(full, 'r'); const header = Buffer.alloc(16); let bytesRead=0;
    try { ({ bytesRead } = await handle.read(header, 0, header.length, 0)); } finally { await handle.close(); }
    const format = identify(extension, header.subarray(0,bytesRead));
    rows.push({filename:entry.name,extension:extension||'(none)',sizeBytes:info.size,location:path.relative(projectRoot,full).split(path.sep).join('/'),format,possibleRig:supported.has(extension)?'UNKNOWN':'NO SUPPORTED MODEL FORMAT',possibleAnimation:supported.has(extension)?'UNKNOWN':'NO SUPPORTED MODEL FORMAT',possibleBlendshape:supported.has(extension)?'UNKNOWN':'NO SUPPORTED MODEL FORMAT',texturePresence:images.has(extension)?'IMAGE TEXTURE CANDIDATE · unconfirmed':'UNKNOWN',materialPresence:'UNKNOWN'});
  }
}
function identify(extension, bytes) {
  if(extension==='.jpg'||extension==='.jpeg')return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff?'JPEG (signature verified)':'JPEG extension · signature mismatch';
  if(extension==='.png')return bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'PNG (signature verified)':'PNG extension · signature mismatch';
  if(extension==='.glb')return bytes.length>=4&&bytes.toString('ascii',0,4)==='glTF'?'GLB container (signature verified) · internals not parsed':'GLB extension · signature mismatch';
  if(supported.has(extension))return `${extension.slice(1).toUpperCase()} extension · contents not parsed`;
  return `${extension.slice(1).toUpperCase()||'UNKNOWN'} · unclassified`;
}
await walk(sourceRoot);
console.log(JSON.stringify({sourceRoot:path.relative(projectRoot,sourceRoot).split(path.sep).join('/'),workingRoot:'Avatar/WORKING (not created)',exportRoot:'Avatar/EXPORT (not created)',assetCount:rows.length,assets:rows},null,2));
