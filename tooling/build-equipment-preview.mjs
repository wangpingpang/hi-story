import {build} from 'vite';
import {resolve} from 'node:path';
const out=process.argv[2];if(!out)throw Error('Usage: node tooling/build-equipment-preview.mjs /absolute/output');
await build({configFile:false,base:'./',publicDir:false,build:{outDir:resolve(out),emptyOutDir:true,lib:{entry:resolve('src/application/equipment-preview.ts'),formats:['es'],fileName:()=> 'equipment-engine.js'},minify:true}});
