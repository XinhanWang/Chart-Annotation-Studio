import assert from 'node:assert/strict';
import {runInPage} from './browser-runner.mjs';
const task=async()=>{
 const $=id=>document.getElementById(id),wait=()=>new Promise(r=>setTimeout(r,300));
 await $('demo').onclick();await wait();const base=structuredClone(chartStudio.bundle);
 const upload=async kind=>{const data=structuredClone(base);data.queue=[];data.activeId=null;const p=data.current.project;p.kind=kind;p.rows=[];p.evidence=[];p.legend=false;delete p.assist;const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(data)],'points.project.json',{type:'application/json'}));$('projectInput').files=dt.files;await $('projectInput').onchange({target:$('projectInput')});await wait();document.querySelector('[data-tool="point"]').click();};
 const point=(x,y)=>{const c=$('canvas'),b=c.getBoundingClientRect(),size=chartStudio.snapshot().imageSize;c.dispatchEvent(new PointerEvent('pointerdown',{clientX:b.left+x*b.width/size.width,clientY:b.top+y*b.height/size.height,bubbles:true,pointerId:1}));c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));};
 const checks=[],ok=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 for(const kind of ['scatter_1','line_1']){
  await upload(kind);point(440,260);point(200,240);point(200,160);await wait();
  const snapshot=chartStudio.snapshot(),p=snapshot.project,gt=snapshot.lastSpec;
  ok(p.rows.length===3&&snapshot.renderOk,kind+' actual clicks render');
  ok(p.evidence[0].pixel.x>p.evidence[1].pixel.x,kind+' project retains click order');
  if(kind==='scatter_1'){ok(gt.data.values[0].x===gt.data.values[1].x&&gt.data.values[0].y>gt.data.values[1].y&&gt.data.values[2].x>gt.data.values[1].x,'scatter output is left-to-right then top-to-bottom');}
  else {ok(gt.data.values[0].x>gt.data.values[1].x&&gt.data.values.every(r=>Number.isFinite(r.path_order)),'line output keeps real retreat path and supplies rank');}
 }
 return {passed:true,checks};
};
const result=await runInPage(`(${task.toString()})()`,process.argv[2]);assert(result.passed);console.log(JSON.stringify(result,null,2));
