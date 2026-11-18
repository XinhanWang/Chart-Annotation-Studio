// Generate with the bundled Python pipeline, then export through Studio's contract.
const path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const {exportRun}=require('./export-generator.cjs');
const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
try{
  if(!args.includes('--config')||!args.includes('--output'))throw Error('Usage: npm run generate -- --config CONFIG --output NEW_RUN [--python PYTHON] [--allow-skips]');
  const root=path.resolve(__dirname,'..'),output=path.resolve(value('--output'));
  if(fs.existsSync(output)&&fs.readdirSync(output).length)throw Error('Generation requires a new, empty run directory');
  const python=args.includes('--python')?value('--python'):process.env.PYTHON||'python3';
  const result=spawnSync(python,[path.join(root,'generator/pipeline.py'),'generate','--config',path.resolve(value('--config')),'--output',output,'--node',process.execPath],{stdio:'inherit',env:{...process.env,RAYON_NUM_THREADS:process.env.RAYON_NUM_THREADS||'1'}});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('Generator validation failed; inspect '+path.join(output,'validation.json')+' and rejected.jsonl before importing accepted samples');
  const report=exportRun(output,path.join(output,'studio.project.json'),{allowSkips:args.includes('--allow-skips')});
  console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
}catch(error){console.error(error.message);process.exitCode=1;}
