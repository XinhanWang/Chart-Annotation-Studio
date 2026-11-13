import assert from 'node:assert/strict';
import {runInPage} from './browser-runner.mjs';
const task=async()=>{
 const checks=[],ok=(x,m)=>{if(!x)throw Error(m);checks.push(m);},near=(a,b)=>Math.abs(a-b)<1e-7,$=id=>document.getElementById(id),wait=()=>new Promise(r=>setTimeout(r,350));
 await $('demo').onclick();await wait();const base=structuredClone(chartStudio.bundle),image=base.current.image;
 const upload=async data=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(data)],'stack.project.json',{type:'application/json'}));$('projectInput').files=dt.files;await $('projectInput').onchange({target:$('projectInput')});await wait();};
 const point=(x,y)=>{const c=$('canvas'),b=c.getBoundingClientRect(),size=chartStudio.snapshot().imageSize;c.dispatchEvent(new PointerEvent('pointerdown',{clientX:b.left+x*b.width/size.width,clientY:b.top+y*b.height/size.height,bubbles:true,pointerId:1}));c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));};
 for(const kind of ['barv_stack','barh_stack']){
  const h=kind==='barh_stack',p=structuredClone(base.current.project);delete p.categoryObjects;p.kind=kind;p.legend=true;p.errorBars=false;p.rows=[];p.evidence=[];p.categories=['A','B'];p.series=[{name:'First',color:'#4263eb'},{name:'Second',color:'#e8590c'},{name:'Third',color:'#008b7e'}];p.assist={sequence:'category'};p.axes={x:{p1:80,p2:560,v1:0,v2:60,type:'linear',reverse:false,calibrated:true},y:{p1:400,p2:100,v1:0,v2:60,type:'linear',reverse:false,calibrated:true}};
  await upload({format:'chart-studio-project',version:1,activeId:'stack',queue:[{id:'stack',name:'stack.png',image,project:p}],current:{project:p,image,name:'stack.png'}});
  ok([...$('kind').options].some(o=>o.value==='barh_stack'),'horizontal stack subtype exists');document.querySelector('[data-tool="point"]').click();const positions=h?[80,160,320,560]:[400,350,250,100],click=(i,category=0)=>h?point(positions[i],150+150*category):point(150+150*category,positions[i]);
  click(0);ok(chartStudio.snapshot().project.rows.length===0,kind+' start click creates no segment');click(1);click(2);ok(chartStudio.snapshot().project.rows.length===2,kind+' three clicks create two segments');
  $('undo').click();ok(chartStudio.snapshot().project.rows.length===1,kind+' undo removes last segment');click(2);ok(near(chartStudio.snapshot().project.rows[1].value,20),kind+' undo resumes shared boundary');
  const partial=structuredClone(chartStudio.bundle);await upload(partial);document.querySelector('[data-tool="point"]').click();click(3);ok(chartStudio.snapshot().project.rows.length===3,kind+' reload resumes final segment from boundary');
  let snap=chartStudio.snapshot();ok(snap.project.rows.every((r,i)=>near(r.value,[10,20,30][i])),kind+' values are segment amounts');ok(snap.project.evidence[1].startPixel[h?'x':'y']===positions[1]&&snap.project.evidence[2].startPixel[h?'x':'y']===positions[2],kind+' shared endpoints are exact');
  click(0,1);ok(chartStudio.snapshot().project.rows.length===3,kind+' next category needs fresh start');for(let i=1;i<4;i++)click(i,1);await wait();snap=chartStudio.snapshot();ok(snap.project.rows.length===6&&snap.renderOk,kind+' two stacks render after eight clicks');
  const gt=snap.lastSpec;ok(gt.data.values.every((r,i)=>near(r.value,[10,20,30][i%3])),kind+' exported GT follows physical stack direction');ok(gt.encoding[h?'x2':'y2'].field==='start'&&gt.encoding[h?'x':'y'].field==='end',kind+' explicit endpoint encoding uses value axis');
  document.querySelector('[data-tool="select"]').click();h?point(320,150):point(150,250);const old=structuredClone(chartStudio.snapshot().project.rows);$('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:h?'ArrowRight':'ArrowUp',bubbles:true}));snap=chartStudio.snapshot();ok(near(snap.project.rows[1].end,snap.project.rows[2].start)&&!near(snap.project.rows[1].value,old[1].value),kind+' boundary nudge updates adjacent segments');$('undo').click();ok(chartStudio.snapshot().project.rows.every((r,i)=>near(r.value,old[i].value)),kind+' boundary edit undo restores both segments');
 }
 return {passed:true,assertions:checks.length,checks};
};
const result=await runInPage('('+task.toString()+')()',process.argv[2]);assert.equal(result.passed,true);console.log(JSON.stringify(result,null,2));
