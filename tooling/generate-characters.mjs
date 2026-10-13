import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

async function main() {
  const args=process.argv.slice(2);let seed=randomUUID(),count=1;
  for(let i=0;i<args.length;i+=2) {
    const key=args[i],value=args[i+1];
    if(!value || !['--seed','--count'].includes(key)) throw Error('用法：npm run characters:generate -- --seed <种子> --count <1–100>');
    if(key==='--seed')seed=value;
    else {if(!/^\d+$/.test(value))throw Error('调用次数须为整数');count=Number(value);}
  }
  if(!Number.isInteger(count)||count<1||count>100)throw Error('调用次数须为 1–100');
  if(!seed.trim()||seed.length>120)throw Error('批次种子须为 1–120 个字符，且不能全为空白');
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,logLevel:'error',server:{middlewareMode:true},appType:'custom'});
  try {
    const {generateCharacter,RANDOM_CHARACTER_VERSION}=await server.ssrLoadModule('/src/modules/characters/index.ts');
    const characters=[];
    for(let index=1;index<=count;index++) characters.push(generateCharacter(`${seed}:${index}`));
    process.stdout.write(JSON.stringify({generatorVersion:RANDOM_CHARACTER_VERSION,seed,callCount:count,characters},null,2)+'\n');
  } finally {await server.close();}
}
main().catch(error=>{process.stderr.write((error instanceof Error?error.message:String(error))+'\n');process.exitCode=1;});
