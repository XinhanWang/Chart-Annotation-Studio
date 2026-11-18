// Reuse the application's actual contract, rather than maintaining a second exporter.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
module.exports=function loadModel(){
  const root=path.resolve(__dirname,'..');
  const context=vm.createContext({console,setTimeout,clearTimeout,performance,structuredClone,TextEncoder});
  const libraries=fs.readFileSync(path.join(root,'vendor.bundle.html'),'utf8');
  for(const match of libraries.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))
    if(match[1].includes('.vega={}')||match[1].includes('.vegaLite={}'))vm.runInContext(match[1],context);
  const source=fs.readFileSync(path.join(root,'studio.js'),'utf8');
  const end=source.indexOf('const $=id=>');
  if(end<0)throw Error('Studio semantic model boundary not found');
  vm.runInContext(source.slice(0,end)+'\nglobalThis.model={generatedProject,makeSpec,importSpec,validate,renderSpec};',context);
  return {...context.model,compile:spec=>context.vega.parse(context.vegaLite.compile(context.model.renderSpec(spec)).spec)};
};
