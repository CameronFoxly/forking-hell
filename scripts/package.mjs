import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { zipSync, unzipSync } from 'fflate';

const entries = {};
const fixedDate = new Date(1980, 0, 1, 0, 0, 0);
async function collect(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) entries[relative('dist', path).replaceAll('\\', '/')] = [
      new Uint8Array(await readFile(path)), { mtime: fixedDate, os: 3, attrs: 0o100644 << 16 },
    ];
    else throw new Error(`Unexpected non-file build entry: ${path}`);
  }
}
await collect('dist');
if (!entries['index.html']) throw new Error('Build dist/index.html before packaging');
for (const path of ['LICENSE', 'ASSET-LICENSE.md', 'docs/DEPLOYMENT.md']) {
  entries[path.split('/').at(-1)] = [new Uint8Array(await readFile(path)), { mtime: fixedDate, os: 3, attrs: 0o100644 << 16 }];
}
const zip = zipSync(entries, { level: 9 });
const files = unzipSync(zip);
if (!files['index.html'] || !files['assets/octocat.png'] || !files['assets/hazards.png']) {
  throw new Error('The HTML5 ZIP is missing required entrypoint/artwork');
}
await mkdir('releases', { recursive: true });
await writeFile('releases/forking-hell-html5.zip', zip);
const sha256 = createHash('sha256').update(zip).digest('hex');
await writeFile('releases/forking-hell-html5.zip.sha256', `${sha256}  forking-hell-html5.zip\n`);
console.log(`releases/forking-hell-html5.zip: ${zip.length} bytes, ${Object.keys(files).length} files\nSHA-256 ${sha256}`);
