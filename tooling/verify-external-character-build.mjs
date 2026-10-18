import {readFileSync,readdirSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root=resolve(process.argv[2]||'dist');
const manifest=JSON.parse(readFileSync(process.argv[3]||'docs/evidence/external-character-release-manifest.json','utf8'));
function walk(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
 const path=join(directory,entry.name);return entry.isDirectory()?walk(path):[relative(root,path).split('\\').join('/')];
});}
assert.deepEqual(walk(root).sort(),manifest.files.map(file=>file.path).sort(),'Build file list differs from the tested release');
for(const file of manifest.files){
 const bytes=readFileSync(join(root,file.path));
 assert.equal(bytes.length,file.bytes,`${file.path}: byte length`);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,`${file.path}: SHA-256`);
}
console.log(`PASS: all ${manifest.files.length} build files match the tested v${manifest.productVersion} release.`);
