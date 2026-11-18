const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const loadModel=require('./studio-model.cjs');

function exportRun(run,output,{name=path.basename(run),allowSkips=false}={}){
  const root=fs.realpathSync(run),model=loadModel();
  function source(relative){
    if(typeof relative!=='string'||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error('Run paths must stay inside the selected run');
    const file=fs.realpathSync(path.resolve(root,relative));
    if(!file.startsWith(root+path.sep))throw Error('Run path escapes the selected directory');
    return file;
  }
  const manifest=fs.readFileSync(path.join(root,'manifest.jsonl'),'utf8').split(/\r?\n/).filter(x=>x.trim()).map(x=>JSON.parse(x));
  const projectId=crypto.randomUUID(),queue=[],records=[],ids=new Set();
  for(const row of manifest){
    try{
      if(row.status!=='accepted')throw Error('Only validation-accepted samples can be imported');
      if(typeof row.id!=='string'||!row.id||ids.has(row.id))throw Error('Sample IDs must be nonempty and unique');
      ids.add(row.id);
      const specFile=source(row.compact),imageFile=source(row.image);
      const text=fs.readFileSync(specFile,'utf8'),spec=JSON.parse(text);
      const project=model.generatedProject(spec,{generator:'Vega-Lite-DG',sampleId:row.id,kind:row.kind,compactSha256:crypto.createHash('sha256').update(text).digest('hex')});
      const gt=model.makeSpec(project);model.compile(gt);
      const bytes=fs.readFileSync(imageFile);
      if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Source chart must be a PNG');
      queue.push({id:crypto.randomUUID(),projectId,name:row.id+'.png',image:'data:image/png;base64,'+bytes.toString('base64'),project});
      records.push({id:row.id,status:'imported',kind:project.kind,observations:project.rows.length});
    }catch(error){records.push({id:row.id??null,status:'skipped',reason:error.message});}
  }
  const report={format:'chart-studio-generator-import',version:1,project:name,imported:queue.length,skipped:records.filter(r=>r.status==='skipped').length,samples:records};
  const destination=path.resolve(output),reportFile=destination+'.report.json';
  if(fs.existsSync(destination)||fs.existsSync(reportFile))throw Error('Output already exists; choose a new workspace filename');
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
  if(!queue.length)throw Error('No supported accepted samples. See '+reportFile);
  const current=queue[0];
  const workspace={format:'chart-studio-project',version:2,projects:[{id:projectId,name}],currentProjectId:projectId,activeId:current.id,queue,current:{project:current.project,image:current.image,name:current.name}};
  fs.writeFileSync(destination,JSON.stringify(workspace,null,2)+'\n');
  return {...report,output:destination,report:reportFile,ok:allowSkips||report.skipped===0};
}
module.exports={exportRun};
if(require.main===module){
  const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
  try{
    if(!args.includes('--run')||!args.includes('--output'))throw Error('Usage: node tools/export-generator.cjs --run RUN --output WORKSPACE.project.json [--name NAME] [--allow-skips]');
    const report=exportRun(value('--run'),value('--output'),{name:args.includes('--name')?value('--name'):undefined,allowSkips:args.includes('--allow-skips')});
    console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1;}
}
