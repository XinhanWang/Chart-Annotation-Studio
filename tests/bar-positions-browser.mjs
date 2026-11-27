import {readFileSync} from 'node:fs';
import {runInPage} from './browser-runner.mjs';

const examples=['single','grouped','stacked'].map(name=>JSON.parse(readFileSync(
  new URL('../examples/bar-positions/'+name+'.gt.json',import.meta.url),'utf8')));

async function checkBarPositions(examples){
  const $=id=>document.getElementById(id);
  const state=()=>chartStudio.snapshot();
  const project=()=>state().project;
  const names=()=>project().categoryObjects.map(c=>c.name);
  const wait=async fn=>{
    for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}
    throw Error($('renderState').textContent);
  };
  const change=(el,value)=>{
    el.value=value;
    el.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const eq=(a,b,message)=>{
    if(JSON.stringify(a)!==JSON.stringify(b))throw Error(message+' '+JSON.stringify({actual:a,expected:b}));
  };
  const upload=async(id,data)=>{
    const input=$(id),dt=new DataTransfer();
    dt.items.add(new File([JSON.stringify(data)],'bar-positions.json',{type:'application/json'}));
    input.files=dt.files;
    await input.onchange({target:input});
  };
  await $('demo').onclick();
  const bundle=structuredClone(chartStudio.bundle);
  const p=bundle.current.project;
  p.kind='barv_1';
  p.series=p.series.slice(0,1);
  p.rows=[];p.evidence=[];p.legend=false;
  await upload('projectInput',bundle);
  eq($('barPositionTools').hidden,false,'bar tools visible');
  $('categories').value='1993\n1996\n1999';
  $('barPositionCount').value=7;
  $('resizeBarPositions').click();
  $('barPositionInterval').value=3;
  $('fillBarPositionInterval').click();
  eq(names(),['1993','null','null','1996','null','null','1999'],'stride with three labels');
  const keys=project().categoryObjects.map(c=>c.key);
  $('categories').value='Early\nLate';
  $('barPositionFirst').value=2;
  $('barPositionRepeats').value=2;
  $('fillBarPositionRepeats').click();
  eq(names(),['null','Early','Early','Late','Late','null','null'],'repetition starts at chosen position');
  $('categories').value='Early\nLate';
  $('barPositionInterval').value=4;
  $('fillBarPositionInterval').click();
  eq(names(),['null','Early','null','null','null','Late','null'],'first position also applies to interval fill');
  const categoryInput=i=>document.querySelectorAll('#categoryObjects [data-category]')[i];
  change(categoryInput(0),'Mid');
  change(categoryInput(1),'  ');
  eq(names().slice(0,3),['Mid','null','null'],'individual edit and clear');
  eq(project().categoryObjects.map(c=>c.key),keys,'fill and rename preserve keys');

  document.querySelector('[data-tool="point"]').click();
  const point=(x,y)=>{
    const canvas=$('canvas'),rect=canvas.getBoundingClientRect(),size=state().imageSize;
    for(const type of ['pointerdown','pointerup'])canvas.dispatchEvent(new PointerEvent(type,{
      bubbles:true,pointerId:1,clientX:rect.left+x*rect.width/size.width,clientY:rect.top+y*rect.height/size.height
    }));
  };
  point(150,330);point(210,300);point(270,260);
  eq(project().rows.map(row=>row._categoryKey),keys.slice(0,3),'automatic capture visits each unnamed position');
  eq(project().assist.category,keys[3],'next target is the next physical position');
  eq(project().rows.map(row=>row.category),['Mid','null','null'],'capture retains unnamed rows');
  if(project().rows[1].value===project().rows[2].value)throw Error('Capture did not retain distinct bar values');

  const originalConfirm=window.confirm;
  try{
    window.confirm=()=>true;
    document.querySelectorAll('#categoryObjects [data-remove-category]')[1].click();
    eq(project().rows.map(row=>row._categoryKey),[keys[0],keys[2]],'delete only the selected unnamed position');
    $('undo').click();
    eq(project().rows.map(row=>row._categoryKey),keys.slice(0,3),'undo restores exact bindings');
  }finally{window.confirm=originalConfirm;}
  await wait(()=>state().renderOk);
  eq(state().lastSpec.data.values.map(row=>row.category_id),['C1','C2','C3'],'captured rows keep distinct GT positions');

  p.kind='barv_stack';
  p.categoryObjects=p.categoryObjects.slice(0,2);
  p.categoryObjects.forEach(c=>c.name='null');
  p.categories=['null','null'];
  await upload('projectInput',bundle);
  document.querySelector('[data-tool="point"]').click();
  point(150,400);
  if(!state().pendingStart)throw Error('Expected a pending stack start');
  document.querySelector('#categoryObjects [data-remove-category]').click();
  eq(state().pendingStart,null,'removing the active position clears its pending stack start');
  point(260,400);point(260,330);
  eq(project().rows.map(row=>row._categoryKey),[p.categoryObjects[1].key],'stack capture binds to the remaining unnamed position');

  for(const gt of examples){
    await upload('specInput',gt);
    await wait(()=>state().renderOk&&JSON.stringify(state().lastSpec)===JSON.stringify(gt));
    const svg=$('preview').querySelector('svg');
    const barCount=svg.querySelectorAll('.mark-rect.role-mark path').length;
    eq(barCount,gt.data.values.length,'example renders every observation');
    const visible=[...svg.querySelectorAll('.role-axis-label text')].map(node=>node.textContent);
    if(visible.includes('null')||visible.some(text=>/^C[0-9]+$/.test(text)))throw Error('Preview exposed an internal category label');
    eq(project().evidence.map(row=>row.source),gt.data.values.map(()=> 'imported_gt'),'GT restores editable rows');
    const blank=project().categoryObjects.find(c=>c.name==='null').key;
    const target=[...$('targetGrid').children].find(button=>button.textContent.includes('未命名'));
    target.click();
    eq(project().rows[state().selected]._categoryKey,blank,'imported unnamed row can be selected');
  }
  return 'PASS category fill, capture, delete, undo and three GT examples rendered as SVG';
}

const result=await runInPage('('+checkBarPositions.toString()+')('+JSON.stringify(examples)+')',process.argv[2]);
console.log(result);
