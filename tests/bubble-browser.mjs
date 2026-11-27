import assert from 'node:assert/strict';
import {runInPage} from './browser-runner.mjs';

async function run(){
  const checks=[], $=id=>document.getElementById(id),snapshot=()=>chartStudio.snapshot();
  const project=()=>snapshot().project,gt=()=>snapshot().lastSpec;
  function check(condition,test){
    if(!condition)throw Error(test+' '+JSON.stringify({toast:$('toast').textContent,issues:$('issues').textContent,tool:snapshot().tool}));
    checks.push(test);
  }
  async function waitFor(fn){
    for(let i=0;i<60;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,50));}
    check(false,'preview should have settled');
  }
  const edit=(element,value)=>{
    element.value=String(value);
    element.dispatchEvent(new Event('change',{bubbles:true}));
  };
  async function upload(id,data){
    const input=$(id),dt=new DataTransfer();
    dt.items.add(new File([JSON.stringify(data)],'test.json',{type:'application/json'}));
    input.files=dt.files;
    await input.onchange({target:input});
  }
  const tool=mode=>document.querySelector('[data-tool="'+mode+'"]').click();
  function pointer(type,x,y){
    const canvas=$('canvas'),rect=canvas.getBoundingClientRect(),size=snapshot().imageSize;
    canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,pointerId:1,
      clientX:rect.left+x*rect.width/size.width,clientY:rect.top+y*rect.height/size.height}));
  }
  function point(x,y){pointer('pointerdown',x,y);pointer('pointerup',x,y);}
  const cell=(index,key)=>document.querySelector('[data-i="'+index+'"][data-key="'+key+'"]');
  const row=index=>document.querySelector('[data-row="'+index+'"] td');
  const count=n=>{$('bubbleCount').value=String(n);$('bubbleSetCount').click();};
  const history=(scope,action)=>document.querySelector('[data-history-scope="'+scope+'"][data-history-action="'+action+'"]').click();
  const sizeRows=()=>gt()?.data.values;
  const bounds=(left,top,right,bottom)=>{$('bubblePickBounds').click();point(left,top);point(right,bottom);};
  await $('demo').onclick();
  const demo=structuredClone(chartStudio.bundle);
  check([...$('kind').options].map(o=>o.value).join()==='scatter_1,scatter_n,scatter_bubble_1,scatter_bubble_n',
    'Scatter family includes both original subtypes and both bubble subtypes');
  window.confirm=()=>true;
  async function setup(kind,scale=1){
    edit($('kind'),kind);
    const bundle=structuredClone(chartStudio.bundle);
    bundle.current.image=demo.current.image;
    bundle.current.project.axes=structuredClone(demo.current.project.axes);
    if(scale!==1){
      const image=new Image();image.src=demo.current.image;await image.decode();
      const canvas=document.createElement('canvas');
      canvas.width=image.width*scale;canvas.height=image.height*scale;
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      bundle.current.image=canvas.toDataURL();
      for(const axis of Object.values(bundle.current.project.axes)){
        axis.p1*=scale;axis.p2*=scale;
        for(const point of [axis.point1,axis.point2]){point.x*=scale;point.y*=scale;}
      }
    }
    await upload('projectInput',bundle);
  }

  await setup('scatter_bubble_n');
  edit($('bubbleMode'),'relative');
  bounds(80,50,560,400);
  count(2);
  const [,second]=project().series;
  edit(document.querySelector('[data-i="1"][data-object="series"]'),second.key);
  tool('point');point(200,250);point(210,250);
  check(snapshot().selected===1&&project().assist.series===second.key&&$('hint').textContent.includes('圆心'),
    'Completing one bubble advances to the next record and resets geometry step');
  $('zoomIn').click();$('zoomIn').click();
  point(200,250);point(220,250);
  await waitFor(()=>snapshot().renderOk&&sizeRows()?.length===2);
  const relative=structuredClone(gt());
  check(sizeRows().map(r=>r.size_relative).join()==='0.00187,0.00748'&&
    sizeRows()[0].x===sizeRows()[1].x&&sizeRows()[0].y===sizeRows()[1].y,'Overlapping bubbles remain independent after image zoom');
  check(project().evidence.every((e,i)=>Math.abs(e.bubbleRadius-10*(i+1))<1e-9),'Geometry uses original image pixels');
  check($('preview').querySelectorAll('g.mark-symbol.role-mark path').length===2,'Relative bubbles render as SVG circles');
  bounds(80,50,480,400);
  await waitFor(()=>sizeRows()?.[0].size_relative===.002244);
  history('size','undo');
  await waitFor(()=>JSON.stringify(gt())===JSON.stringify(relative));
  history('size','redo');
  await waitFor(()=>sizeRows()?.[0].size_relative===.002244);
  history('size','undo');
  edit(document.querySelector('[data-axis="x"][data-field="v2"]'),20);
  await waitFor(()=>sizeRows()?.[0].x===5);
  $('undoCalibration').click();
  await waitFor(()=>JSON.stringify(gt())===JSON.stringify(relative));
  check(project().rows.length===2&&project().evidence[1].bubbleRadius>19.99,'Size and numeric calibration undo leave observations intact');
  $('undo').click();
  check(project().evidence[1].bubblePoints.length===1,'Data undo returns to the preceding circle step');
  $('redo').click();
  await waitFor(()=>JSON.stringify(gt())===JSON.stringify(relative));
  const backup=structuredClone(chartStudio.bundle);
  await upload('projectInput',backup);
  await waitFor(()=>JSON.stringify(gt())===JSON.stringify(relative));
  check(project().bubble.calibration.bounds.length===2&&project().evidence.every(e=>e.bubbleRadius),
    'Project restore retains plot geometry, evidence, and series');
  row(0).click();tool('select');
  pointer('pointerdown',200,250);pointer('pointermove',215,240);pointer('pointerup',215,240);
  await waitFor(()=>snapshot().renderOk&&sizeRows()?.some(r=>r.x!==2.5));
  check(sizeRows().some(r=>r.size_relative===.00187),'Moving a center leaves its relative area unchanged');
  $('undo').click();await waitFor(()=>JSON.stringify(gt())===JSON.stringify(relative));
  await upload('specInput',relative);
  await waitFor(()=>JSON.stringify(gt())===JSON.stringify(relative));
  check(project().bubble.mode==='relative'&&cell(0,'size_relative').value==='0.00187','Relative GT restores editable observation rows');

  await setup('scatter_bubble_n',2);
  edit($('bubbleMode'),'relative');
  bounds(160,100,1120,800);
  tool('point');point(400,500);point(420,500);
  await waitFor(()=>snapshot().renderOk&&sizeRows()?.[0].size_relative===.00187);
  check(sizeRows()[0].x===relative.data.values[0].x&&sizeRows()[0].y===relative.data.values[0].y,
    'A 2× image produces the same calibrated coordinates and relative area');

  await setup('scatter_bubble_1');
  count(2);
  tool('point');point(200,250);
  edit(cell(0,'size'),'25%');
  check(snapshot().selected===1&&$('hint').textContent.includes('圆心'),'Entering a manual size advances the preassigned record');
  point(300,150);edit(cell(1,'size'),'50');
  await waitFor(()=>snapshot().renderOk&&sizeRows()?.[1].size===.5);
  check(sizeRows()[0].size===.25&&gt().encoding.size.legend.format.endsWith('p'),'Manual center-only entry keeps size percentage semantics');

  await setup('scatter_bubble_n');
  edit($('bubbleMode'),'calibrated');
  edit($('bubbleRefValue0'),20);edit($('bubbleRefValue1'),80);
  $('bubbleRefPick0').click();point(200,260);point(205,260);
  $('bubbleRefPick1').click();point(325,240);point(335,240);
  check($('bubbleScaleStatus').textContent==='大小校准有效','Two known reference circles calibrate real size');
  edit($('bubbleMethod'),'circumference');
  tool('point');point(242,200);point(250,192);point(258,200);
  await waitFor(()=>snapshot().renderOk&&sizeRows()?.[0].size===51.2);
  check(Math.abs(project().evidence[0].bubbleRadius-8)<1e-9,'Three visible circumference points recover a partly occluded bubble');
  edit(cell(0,'size'),'60.123456789');
  await waitFor(()=>sizeRows()?.[0].size===60.123456789);
  edit($('bubbleRefValue1'),90);
  await waitFor(()=>sizeRows()?.[0].size===60.123456789);
  check(sizeRows()[0].size===60.123456789,'Manual true size stays authoritative after size recalibration');
  tool('point');point(310,200);point(320,200);point(330,200);
  check(project().rows[1].needs_review&&!project().evidence[1].pixel,'Collinear observations are marked for review without guessed geometry');
  row(1).click();$('deleteRow').click();
  await waitFor(()=>snapshot().renderOk&&sizeRows()?.length===1);
  return checks;
}

const checks=await runInPage('('+run.toString()+')()',process.argv[2]);
assert(checks.length>=15);
console.log(checks.join('\n'));
