import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const packageJson=JSON.parse(readFileSync(resolve(projectRoot,'package.json'),'utf8'));

// Deliberately supports the project's existing engines syntax without a dependency.
export function supportsNodeVersion(version,range=packageJson.engines.node){
 const parsed=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
 if(!parsed)return false;
 const actual=parsed.slice(1).map(Number);
 return range.split('||').some(alternative=>{
  const condition=/^(\^|>=)(\d+)\.(\d+)\.(\d+)$/.exec(alternative.trim());
  if(!condition)throw Error(`Unsupported engines syntax: ${range}. Update tooling/check-local.mjs.`);
  const minimum=condition.slice(2).map(Number);
  const atLeast=actual[0]>minimum[0]||(actual[0]===minimum[0]&&(actual[1]>minimum[1]||(actual[1]===minimum[1]&&actual[2]>=minimum[2])));
  return atLeast&&(condition[1]==='>='||actual[0]===minimum[0]);
 });
}

function runNpm(argumentsForNpm){
 console.log(`\n> npm ${argumentsForNpm.join(' ')}`);
 // npm.cmd must run through cmd.exe on Windows. All arguments below are fixed.
 const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',argumentsForNpm,{cwd:projectRoot,stdio:'inherit',shell:process.platform==='win32'});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error(`npm ${argumentsForNpm.join(' ')} failed (${result.signal??result.status}).`);
}

function main(){
 const options=new Set(process.argv.slice(2));
 const allowed=new Set(['--node-only','--skip-install','--install-browser','--e2e']);
 for(const option of options)if(!allowed.has(option))throw Error(`Unknown option: ${option}`);
 if(!supportsNodeVersion(process.versions.node))throw Error(`Node ${process.versions.node} is unsupported; package.json requires ${packageJson.engines.node}. Install a supported Node version first.`);
 console.log(`Node ${process.versions.node}: OK (required ${packageJson.engines.node})`);
 if(options.has('--node-only'))return;
 if(!options.has('--skip-install'))runNpm(['ci']);
 for(const check of ['typecheck','check:boundaries','test','build'])runNpm(['run',check]);
 if(options.has('--install-browser'))runNpm(['exec','--','playwright','install','chromium']);
 if(options.has('--e2e'))runNpm(['run','test:e2e']);
 console.log('\nLocal checks passed. No Git push or deployment was performed.');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{main();}catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
}
