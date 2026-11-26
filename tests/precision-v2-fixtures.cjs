const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').split('<script type="module">')[1].split('const $=id=>')[0];
const context=vm.createContext({});vm.runInContext(source+';globalThis.api={defaultProject,makeSpec,importSpec,renderSpec,ensureIdentities,switchLineMode,requiredAxes,validate,quantizeMeasurement,percentageParts,measureProjectAxis,heatmapIntervals,preserveLegacyHeatmapIntervals,updateHeatmapIntervals,measureHeatmapColor,measuredAxisValue,measurePieSectors,syncPercentStackRatios,confirmPieFractions,applyPieCategoryNames};',context);
const app=context.api,plain=x=>JSON.parse(JSON.stringify(x));
function mixedLine(axis,repeated=false,retreat=false){
 const p=app.defaultProject('line_n');p.rows=[];p.categoryObjects=[];app.switchLineMode(p,axis);
 const numeric=axis==='x'?'y':'x';p[axis+'Title']='Category';p[numeric+'Title']='Scientific value';
 p.categoryObjects=[{key:'c1',name:'A'},{key:'c2',name:repeated?'A':'B'},{key:'c3',name:'C'}];
 const row=(category,value,series)=>({[axis]:category.name,[numeric]:value,series:series.name,_seriesKey:series.key,_categoryKey:category.key});
 p.rows=[row(p.categoryObjects[0],.1234567890123,p.series[0]),row(p.categoryObjects[2],.3456789012345,p.series[0]),...p.categoryObjects.map((c,i)=>row(c,i+.456789012345,p.series[1]))];
 if(retreat)p.rows.push(row(p.categoryObjects[0],4.1234567890123,p.series[0]));
 return p;
}
module.exports={app,plain,mixedLine};
