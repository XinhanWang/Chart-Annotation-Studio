import assert from 'node:assert/strict';
import {runInPage} from './browser-runner.mjs';
const task=async()=>{
  const $=id=>document.getElementById(id),snap=()=>chartStudio.snapshot(),project=()=>snap().project;
  const checks=[];
  function check(ok,message){
    if(!ok)throw Error(message+' '+JSON.stringify({tool:snap().tool,issues:$('issues').textContent,toast:$('toast').textContent}));
    checks.push(message);
  }
  const change=(element,value)=>{
    element.value=value;
    element.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const waitFor=async test=>{
    for(let i=0;i<40;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,100));}
    check(false,'Expected updated preview state');
  };
  const clickTool=tool=>document.querySelector(`[data-tool="${tool}"]`).click();
  const point=(x,y)=>{
    const canvas=$('canvas'),rect=canvas.getBoundingClientRect(),image=snap().imageSize;
    canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,
      clientX:rect.left+x*rect.width/image.width,clientY:rect.top+y*rect.height/image.height}));
    canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));
  };
  const load=async (id,data)=>{
    const input=$(id),files=new DataTransfer();
    files.items.add(new File([JSON.stringify(data)],'smooth.json',{type:'application/json'}));
    input.files=files.files;await input.onchange({target:input});
  };
  const tick=(axis,n,pixel,value)=>{
    document.querySelector(`[data-tick="${axis}${n}"]`).click();
    point(axis==='x'?pixel:100,axis==='y'?pixel:300);
    const field=document.querySelector(`[data-axis="${axis}"][data-field="v${n}"]`);
    change(field,String(value));
  };
  const configureCategories=()=>{
    $('categories').value='A\n未取点 "B"\nC';
    $('applyCategoryNames').click();
  };
  const observed=gt=>gt.data.values.length;
  window.confirm=()=>true;
  await $('demo').onclick();
  change($('family'),'line');
  check([...$('kind').options].map(o=>o.value).join()==='line_1,line_n,line_smooth_1,line_smooth_n',
    'Folded and smooth subtypes share the line family');
  change($('kind'),'line_smooth_n');
  tick('x',1,100,0);tick('x',2,400,300);tick('y',1,400,0);tick('y',2,100,300);
  clickTool('point');
  point(120,320);point(240,160);point(360,300);
  $('smoothInsertPoint').click();point(175,280);
  check(project().rows.map(row=>row.x).join()==='20,75,140,260','Insertion retains the existing path and adds a point between neighbours');
  await waitFor(()=>snap().renderOk&&observed(snap().lastSpec)===4);
  check(snap().lastSpec.mark.interpolate==='monotone','Continuous preview exports the observed monotone samples');
  check($('preview').querySelector('g.mark-line path').getAttribute('d').includes('C'),'Actual browser preview contains a cubic path');
  $('smoothReviewPoint').click();
  await waitFor(()=>$('issues').textContent.includes('待复核')&&!snap().renderOk);
  $('smoothReviewPoint').click();
  point(150,250);
  await waitFor(()=>$('issues').textContent.includes('回走')&&!snap().renderOk);
  $('deleteRow').click();
  await waitFor(()=>snap().renderOk&&observed(snap().lastSpec)===4);
  check(project().rows.map(row=>row.x).join()==='20,75,140,260','Explicit review and backtrack do not reorder or fabricate values');

  for(const axis of ['x','y']){
    change($(axis+'Type'),'nominal');
    const numeric=axis==='x'?'y':'x',at=(position,measure)=>axis==='x'?point(position,measure):point(measure,position);
    configureCategories();
    tick(numeric,1,100,0);tick(numeric,2,400,300);
    const categories=project().categoryObjects,series=project().series;
    $('smoothFreePhase').click();
    check($('smoothFreePhase').getAttribute('aria-pressed')==='false',axis+' cannot bypass fixed calibration');
    for(const [i,pixel] of [100,200,380].entries()){
      change($('activeCategory'),categories[i].key);$('pickCategory').click();at(pixel,145);
    }
    check(project().categoryObjects.map(c=>c.curvePosition).join()==='0,1,2.8',axis+' retains actual relative category distances');
    check(project().assist.category===categories[0].key,axis+' selects the first pending fixed target after calibration');
    clickTool('point');
    at(115,130);
    check(project().rows[0][axis]==='A'&&project().assist.category===categories[1].key,axis+' fixes position to the active category and advances');
    $('smoothSkipTarget').click();at(390,172);
    check(project().assist.category===categories[0].key&&project().assist.series===series[1].key,axis+' advances to the next series');
    at(100,158);$('smoothSkipTarget').click();at(380,180);
    await waitFor(()=>snap().renderOk&&snap().lastSpec?.encoding[axis].field===axis+'_id'&&observed(snap().lastSpec)===4);
    check(snap().lastSpec.usermeta[axis+'_labels'][0].position===1,axis+' can export fixed points and skips directly');
    $('smoothFreePhase').click();
    check($('activeCategoryLabel').hidden&&$('targetGrid').hidden,axis+' free sampling needs no category selection');
    const active=project().assist.series;
    at(320,240);at(150.1892,205);
    at(320,242);at(380,250);
    check(project().rows.length===6&&project().assist.series===active,axis+' rejects duplicate and fixed positions while retaining the selected series');
    change($('activeSeries'),series[0].key);
    at(331.45,221);at(331.4,225);at(150,300);
    await waitFor(()=>snap().renderOk&&observed(snap().lastSpec)===9);
    const gt=snap().lastSpec;
    const seriesValues=gt.data.values.filter(row=>row.series===series[0].name).map(row=>row[axis+'_id']);
    check(seriesValues.every((id,i)=>!i||id>seriesValues[i-1]),axis+' exports both nearby points in spatial order even if rounded IDs would collide');
    const closeRows=project().rows.filter(row=>row[axis]===null&&row._curveRawPosition>2.31&&row._curveRawPosition<2.32)
      .sort((a,b)=>a._curveRawPosition-b._curveRawPosition);
    check(closeRows.length===2&&closeRows[0]._curvePosition<closeRows[1]._curvePosition&&
      closeRows.some(row=>row._curvePosition!==2.31)&&gt.data.values.every(row=>typeof row[axis+'_id']==='number'),
      axis+' rounds to numeric IDs and uses extra precision only for colliding positions');
    const exportedSeries=gt.data.values.map(row=>row.series);
    check(exportedSeries.join()===Array.from(exportedSeries).sort().join(),axis+' groups export by series');
    check(gt.data.values.filter(row=>row[axis]===null&&row[axis+'_id']===.5).length===2&&
      gt.data.values.some(row=>row[axis]===null&&row[axis+'_id']===2.2),axis+' series share positions and retain independent free samples');
    check(gt.usermeta[axis+'_labels'][0].position===1&&!gt.encoding[axis].axis,
      axis+' exports a missing label without manufacturing a sample or preview fields');
    check($('preview').textContent.includes('未取点 "B"'),axis+' labels render in the actual browser');
    check(document.querySelectorAll('[data-smooth-sample="fixed"]').length===4&&
      document.querySelectorAll('[data-smooth-sample="free"]').length===5,axis+' table distinguishes fixed and free points');

    const index=project().rows.findIndex(row=>row[axis]===null&&row._curvePosition===2.2);
    document.querySelector(`[data-row="${index}"] [data-smooth-sample]`).click();
    $('canvas').focus();
    $('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:axis==='x'?'ArrowRight':'ArrowDown',ctrlKey:true,bubbles:true}));
    check(project().rows[index]._curvePosition===2.21,axis+' moves a free sample along the discrete direction');
    change(document.querySelector(`[data-i="${index}"][data-key="_curvePosition"]`),'.60123456789');
    await waitFor(()=>snap().renderOk&&snap().lastSpec.data.values.some(row=>row[axis+'_id']===.6));
    check(project().rows[index]._curveRawPosition===.60123456789&&project().rows[index]._curvePosition===.6,
      axis+' table position edits keep raw precision and round the exported ID');
    const removed=closeRows[1]._curvePosition,retained=closeRows[0]._curvePosition;
    const remove=project().rows.findIndex(row=>row._curveRawPosition===closeRows[1]._curveRawPosition);
    document.querySelector(`[data-row="${remove}"] [data-smooth-sample]`).click();
    $('deleteRow').click();
    await waitFor(()=>snap().renderOk&&observed(snap().lastSpec)===8);
    check(!snap().lastSpec.data.values.some(row=>row[axis+'_id']===removed)&&
      snap().lastSpec.data.values.some(row=>row[axis+'_id']===retained),axis+' deletes a free sample without renumbering its neighbor');
    const backup=structuredClone(chartStudio.bundle),confirmed=snap().lastSpec;
    await load('projectInput',backup);
    check(project().smoothPhase==='free'&&project().categoryObjects[2].curvePixel===backup.current.project.categoryObjects[2].curvePixel,
      axis+' workspace saves calibration and sampling phase');
    await load('specInput',confirmed);
    await waitFor(()=>snap().renderOk&&JSON.stringify(snap().lastSpec)===JSON.stringify(confirmed));
    check(project().smoothPositioned&&project()[axis+'Type']==='nominal',axis+' GT restores the discrete axis and both sample types');
  }
  change($('kind'),'line_smooth_1');
  change($('xType'),'nominal');
  $('categories').value='同名\nB\n同名';$('applyCategoryNames').click();
  tick('y',1,100,0);tick('y',2,400,300);
  for(const [i,pixel] of [100,200,300].entries()){
    change($('activeCategory'),project().categoryObjects[i].key);$('pickCategory').click();point(pixel,145);
  }
  clickTool('point');
  point(104,160);$('smoothSkipTarget').click();point(300,180);
  await waitFor(()=>snap().renderOk&&snap().lastSpec?.encoding.x.type==='quantitative'&&observed(snap().lastSpec)===2);
  check(snap().lastSpec.data.values.map(row=>row.x_id).join()==='0,2','Fixed-only duplicate labels retain distinct numeric positions');
  check(project().categoryObjects.map(category=>category.curvePosition).join()==='0,1,2','Equal category spacing assigns sequential positions');
  $('smoothFreePhase').click();point(250,250);point(125,130);
  await waitFor(()=>snap().renderOk&&observed(snap().lastSpec)===4);
  check(snap().lastSpec.data.values.map(row=>row.x_id).join()==='0,0.25,1.5,2','Single series sorts free clicks and retains duplicate category positions');
  change(document.querySelector('[data-i="0"][data-key="y"]'),'150.123456789');
  await waitFor(()=>snap().renderOk&&snap().lastSpec.data.values[0].y===150.123456789);
  document.querySelector('[data-row="1"] [data-smooth-sample]').click();
  $('deleteRow').click();
  await waitFor(()=>snap().renderOk&&observed(snap().lastSpec)===3);
  check(snap().lastSpec.usermeta.x_labels.some(label=>label.position===2)&&snap().lastSpec.data.values[0].y===150.123456789,
    'A fixed value can be revised precisely and another fixed observation deleted without inventing data');
  for(const axis of ['x','y'])for(const count of [1,2]){
    const other=axis==='x'?'y':'x',kind=count===1?'line_smooth_1':'line_smooth_n';
    change($('kind'),kind);
    // Reset a mode already used earlier without changing any other chart workflow.
    change($('kind'),'line_1');change($('kind'),kind);
    change($(axis+'Type'),'temporal');
    check(project()[axis+'Type']==='temporal'&&project()[other+'Type']==='quantitative',kind+' enables '+axis+' temporal');
    const first=axis==='x'?100:400,last=axis==='x'?400:100;
    tick(axis,1,first,axis==='x'?'2024年1月1日':'一月');
    tick(axis,2,last,axis==='x'?'Mar 1, 2024':'Mar');
    tick(other,1,100,0);tick(other,2,400,300);
    check(project().axes[axis].calibrated,kind+' '+axis+' accepts Chinese and English tick values');
    const at=(t,v)=>axis==='x'?point(t,v):point(v,t);
    clickTool('point');
    at(last,300);at(first,180);at(first+(last-first)/2,240);
    check(project().rows.length===3,kind+' '+axis+' records free clicks regardless of time order');
    if(count===2){
      change($('activeSeries'),project().series[1].key);
      at(first,150);at(last,250);
      check(project().rows.length===5,kind+' '+axis+' accepts shared times in different series');
    }
    await waitFor(()=>snap().renderOk&&snap().lastSpec?.encoding[axis].type==='temporal'&&observed(snap().lastSpec)===3+2*(count-1));
    let gt=snap().lastSpec;
    check(gt.data.values.slice(0,3).map(row=>row[axis]).join()===
      (axis==='x'?'2024-01-01,2024-01-31,2024-03-01':'01-01,01-31,03-01'),
      kind+' '+axis+' uses calendar spacing, sorts times, and preserves the presence or absence of a year');
    check(gt.data.values.every(row=>!(axis+'_id' in row)&&!('_smoothTime' in row))&&!gt.encoding[axis].timeUnit&&
      $('preview').querySelectorAll('g.mark-line path').length===count,
      kind+' '+axis+' renders all paths and exports only compact time strings');
    const backup=structuredClone(chartStudio.bundle);
    change($(axis+'Type'),'quantitative');
    change($(axis+'Type'),'temporal');
    check(project().axes[axis].calibrated&&project().rows.length===backup.current.project.rows.length,
      kind+' '+axis+' switching back restores calibrated samples');
    if(count===1&&axis==='x'){
      const index=project().rows.findIndex(row=>row.x==='2024-01-31');
      document.querySelector(`[data-row="${index}"] td`).click();
      clickTool('select');
      $('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',ctrlKey:true,bubbles:true}));
      check(project().rows[index]._smoothTime>backup.current.project.rows[index]._smoothTime,
        'Canvas time correction updates the measured time coordinate');
      tick(axis,2,last,'Mar 31, 2024');
      check(project().rows[index].x==='2024-02-15','Changing a temporal tick recalculates measured observations');
      tick(axis,2,last,'Mar 1, 2024');
      check(project().rows[index].x==='2024-01-31','Restoring a tick restores the observation time');
      await load('projectInput',backup);
      check(project().axes[axis].calibrated&&project().rows[index].x==='2024-01-31','Project backup restores temporal calibration and values');
    }
    if(count===2&&axis==='x'){
      change($('activeSeries'),project().series[0].key);
      clickTool('point');
      at(250.05,220);
      check(project().rows.length===6&&project().rows.some(row=>row.x.includes('T')),
        'Nearby time observations refine precision without merging');
      at(250.05,200);
      check(project().rows.length===6,'Exactly coincident time in the same series is rejected');
      await waitFor(()=>snap().renderOk&&observed(snap().lastSpec)===6);
      gt=snap().lastSpec;
    }
    await load('specInput',gt);
    await waitFor(()=>snap().renderOk&&JSON.stringify(snap().lastSpec)===JSON.stringify(gt));
    const input=document.querySelector(`[data-i="0"][data-key="${axis}"]`);
    check(input.value===gt.data.values[0][axis],kind+' '+axis+' imports times into editable table cells');
    change(input,axis==='x'?'Jan 2, 2024':'一月2日');
    await waitFor(()=>snap().renderOk&&snap().lastSpec.data.values[0][axis]===(axis==='x'?'2024-01-02':'01-02'));
  }
  change($('kind'),'line_1');
  check(![...$('xType').options,...$('yType').options].some(option=>option.value==='temporal'),
    'Ordinary lines retain their original axis types');
  return {checks,passed:true};
};
const result=await runInPage('('+task.toString()+')()',process.argv[2]);
assert.ok(result.passed);
console.log(JSON.stringify(result,null,2));
