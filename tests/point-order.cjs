const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../studio.js'),'utf8');
const ctx=vm.createContext({console,structuredClone});
vm.runInContext(app.slice(0,app.indexOf("let p=defaultProject('scatter_1')"))+';globalThis.test={defaultProject,makeSpec,importSpec,ensureIdentities};',ctx);
const {defaultProject,makeSpec,importSpec,ensureIdentities}=ctx.test,plain=x=>JSON.parse(JSON.stringify(x));
let groups=0;
for(const xr of [false,true])for(const yr of [false,true]){
 const p=defaultProject('scatter_n');p.axes.x.reverse=xr;p.axes.y.reverse=yr;
 p.rows=[{x:2,y:1,series:'Series 2'},{x:1,y:2,series:'Series 1'},{x:1,y:4,series:'Series 2'},{x:2,y:3,series:'Series 1'}];ensureIdentities(p);p.evidence=p.rows.map((_,i)=>({pixel:{x:i,y:i+5}}));
 const before=JSON.stringify(p),gt=plain(makeSpec(p)),expected=plain(p.rows).sort((a,b)=>(xr?-1:1)*(a.x-b.x)||(yr?1:-1)*(a.y-b.y));
 assert.deepEqual(gt.data.values.map(r=>[r.x,r.y]),expected.map(r=>[r.x,r.y]));assert.equal(JSON.stringify(p),before);groups++;
}
for(const [xs,reverse,needed] of [[[3,2,1],false,true],[[1,2,3],false,false],[[1,1,2],false,false],[[1,3,2],false,true],[[3,2,1],true,false],[[3,1,2],true,true]]){
 const p=defaultProject('line_n');p.axes.x.reverse=reverse;p.rows=[];
 for(let i=0;i<xs.length;i++)for(const s of p.series)p.rows.push({x:xs[i],y:i+1,series:s.name,path_order:i});
 const gt=plain(makeSpec(p));assert.equal(gt.data.values.every(r=>'path_order'in r),needed);
 assert.equal('order'in gt.encoding,needed);assert.deepEqual(gt.data.values.map(r=>r.x),xs.flatMap(x=>[x,x]));
 // Reverse axes and real path ranks both survive canonical import/export.
 assert.deepEqual(plain(makeSpec(importSpec(gt))),gt);
 groups++;
}
for(const repeated of [false,true]){
 const p=defaultProject('line_1');p.xType='ordinal';if(repeated)p.categoryObjects[1].name='A';
 p.rows=[0,2,1].map((i,n)=>({x:p.categoryObjects[i].name,y:n+1,_categoryKey:p.categoryObjects[i].key,series:p.series[0].name}));
 const gt=plain(makeSpec(p));assert(Array.isArray(gt.encoding.x.sort));assert(gt.data.values.every(r=>'path_order'in r));
 assert.deepEqual(plain(makeSpec(importSpec(gt))),gt);groups++;
}
console.log(JSON.stringify({passed:true,testGroups:groups}));
