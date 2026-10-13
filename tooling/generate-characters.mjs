import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';

async function main() {
  const args=process.argv.slice(2);let seed=randomUUID(),count=1,paramsFile;const seen=new Set();
  for(let i=0;i<args.length;i+=2) {
    const key=args[i],value=args[i+1];
    if(!value || !['--seed','--count','--params'].includes(key)) throw Error('用法：--seed <种子> --count <1–100>，或 --params <JSON 文件>');
    seen.add(key);
    if(key==='--params')paramsFile=value;
    else if(key==='--seed')seed=value;
    else {if(!/^\d+$/.test(value))throw Error('调用次数须为整数');count=Number(value);}
  }
  if(!Number.isInteger(count)||count<1||count>100)throw Error('调用次数须为 1–100');
  if(!seed.trim()||seed.length>120)throw Error('批次种子须为 1–120 个字符，且不能全为空白');
  if(paramsFile&&(seen.has('--seed')||seen.has('--count')))throw Error('--params 不能与 --seed 或 --count 混用');
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,logLevel:'error',server:{middlewareMode:true},appType:'custom'});
  try {
    const {generateCharacter,generateCharacterWithParams,RANDOM_CHARACTER_VERSION}=await server.ssrLoadModule('/src/modules/characters/index.ts');
    const characters=[];
    if(paramsFile){const data=JSON.parse(await readFile(paramsFile,'utf8'));const records=Array.isArray(data)?data:[data];if(!records.length||records.length>100)throw Error('参数文件须包含 1–100 个人物参数对象');records.forEach(params=>characters.push(generateCharacterWithParams(params)));}
    else for(let index=1;index<=count;index++) characters.push(generateCharacter(`${seed}:${index}`));
    process.stdout.write(JSON.stringify({generatorVersion:RANDOM_CHARACTER_VERSION,seed:paramsFile?null:seed,source:paramsFile?'params':'random',callCount:characters.length,characters},null,2)+'\n');
  } finally {await server.close();}
}
main().catch(error=>{process.stderr.write((error instanceof Error?error.message:String(error))+'\n');process.exitCode=1;});
