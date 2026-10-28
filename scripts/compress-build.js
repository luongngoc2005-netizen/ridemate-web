import {readdir, readFile, writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {brotliCompress, gzip, constants} from 'node:zlib';

const brotli = promisify(brotliCompress), gz = promisify(gzip);
const textTypes = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.wasm']);

export async function compressBuild(directory = resolve('dist')) {
  const files = [];
  async function visit(path) {
    for (const entry of await readdir(path, {withFileTypes:true})) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && textTypes.has(extname(entry.name))) files.push(file);
    }
  }
  await visit(directory);
  let originalBytes = 0, brotliBytes = 0, gzipBytes = 0;
  for (const file of files) {
    const input = await readFile(file);
    if (input.length < 1024) continue;
    const [br, gzipData] = await Promise.all([
      brotli(input, {params:{[constants.BROTLI_PARAM_QUALITY]:6}}), gz(input, {level:9}),
    ]);
    if (br.length < input.length) await writeFile(file + '.br', br);
    if (gzipData.length < input.length) await writeFile(file + '.gz', gzipData);
    originalBytes += input.length; brotliBytes += Math.min(br.length, input.length); gzipBytes += Math.min(gzipData.length, input.length);
  }
  return {originalBytes, brotliBytes, gzipBytes};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log('Static build compression:', await compressBuild());
}
