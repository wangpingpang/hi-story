import { readdirSync,readFileSync } from 'node:fs';
import { join,relative,resolve } from 'node:path';
const files=(dir)=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
const errors=[];
for(const file of files('src').filter(f=>f.endsWith('.ts'))){const source=readFileSync(file,'utf8');for(const [,path] of source.matchAll(/from\s+['"]([^'"]+)['"]/g)){const target=relative(resolve('src'),resolve(file,'..',path)).replaceAll('\\','/');if(file.startsWith('src/modules/')&&/^(application|presentation|input|infrastructure)\//.test(target))errors.push(`${file} imports ${path}`);if(target.startsWith('modules/')&&target.split('/').length>2&&!target.endsWith('/index'))errors.push(`${file} imports private module ${path}`);if(file.startsWith('src/presentation/')&&target.startsWith('modules/'))errors.push(`${file} directly imports domain ${path}`);}if(file.startsWith('src/modules/')&&/\b(document|window|localStorage)\b/.test(source))errors.push(`${file}: browser dependency`);}
if(errors.length)throw Error(errors.join('\n'));console.log('PASS: domain/public-interface/presentation/browser boundaries');
