import assert from 'node:assert/strict';
import {runInPage} from './browser-runner.mjs';

const exercise=async()=>{
  const $=id=>document.getElementById(id),snap=()=>chartStudio.snapshot();
  const canvas=$('canvas'),wrap=$('canvasWrap'),checks=[];
  const equal=(actual,expected)=>JSON.stringify(actual)===JSON.stringify(expected);
  function check(condition,description){
    if(!condition)throw Error(description+' · '+$('toast').textContent);
    checks.push(description);
  }
  const clickTool=mode=>document.querySelector('[data-tool="'+mode+'"]').click();
  const key=(value,options={},type='keydown',target=canvas)=>target.dispatchEvent(
    new KeyboardEvent(type,{key:value,bubbles:true,cancelable:true,...options}));
  const undo=()=>key('z',{ctrlKey:true}),redo=()=>key('Z',{ctrlKey:true,shiftKey:true});
  const dispatchPointer=(type,x,y,options={})=>canvas.dispatchEvent(new PointerEvent(type,{
    bubbles:true,cancelable:true,button:0,buttons:type==='pointerup'?0:1,pointerId:1,
    clientX:x,clientY:y,...options
  }));
  function clientPoint(x,y){
    const rect=canvas.getBoundingClientRect(),{width,height}=snap().imageSize;
    return [rect.left+x*rect.width/width,rect.top+y*rect.height/height];
  }
  function point(x,y,options){
    const at=clientPoint(x,y);
    dispatchPointer('pointerdown',...at,options);dispatchPointer('pointerup',...at);
  }
  function edit(input,value){
    input.value=String(value);
    input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  const axisInput=(axis,field)=>document.querySelector('[data-axis="'+axis+'"][data-field="'+field+'"]');
  await $('demo').onclick();
  const demo=structuredClone(chartStudio.bundle);
  const useProject=async(kind,{uncalibrated=false}={})=>{
    const bundle=structuredClone(demo),project=bundle.current.project;
    bundle.queue=[];bundle.activeId=null;
    project.kind=kind;project.categories=['A','B'];delete project.categoryObjects;
    project.series=[{name:'S1',color:'#008b7e'},...(kind==='barv_stack'?[{name:'S2',color:'#344f5b'}]:[])];
    delete project.assist;
    if(uncalibrated)for(const axis of ['x','y']){
      project.axes[axis].calibrated=false;
      delete project.axes[axis].point1;
      delete project.axes[axis].point2;
    }
    const files=new DataTransfer(),input=$('projectInput');
    files.items.add(new File([JSON.stringify(bundle)],'interaction-project.json'));
    input.files=files.files;await input.onchange({target:input});
  };

  await useProject('scatter_1',{uncalibrated:true});
  for(const [tick,x,y] of [['x1',80,400],['x2',560,400],['y1',80,400],['y2',80,50]]){
    document.querySelector('[data-tick="'+tick+'"]').click();point(x,y);
  }
  const axes=snap().project.axes;
  check(axes.x.calibrated&&axes.y.calibrated&&$('undo').disabled&&!$('undoCalibration').disabled,
    'axes have their own undo history');
  clickTool('point');point(176,330);
  const first=snap();
  undo();
  check(!snap().project.rows.length&&equal(snap().project.axes,axes),'first data undo keeps both axes');
  undo();
  check($('undo').disabled&&equal(snap().project.axes,axes),'empty data history cannot fall through into calibration');
  redo();
  check(equal(snap().project.rows,first.project.rows)&&equal(snap().project.evidence,first.project.evidence)&&snap().selected===0,
    'redo restores exact evidence, values and selection');

  point(224,260);undo();
  const current=snap();
  edit(axisInput('y','v2'),200);
  const recalibrated=snap();
  check(recalibrated.project.rows.length===1&&recalibrated.project.rows[0].y===40&&
    equal(recalibrated.project.evidence,current.project.evidence)&&$('redo').disabled&&$('undo').disabled,
    'recalibration recomputes live data and discards stale data history');
  $('undoCalibration').click();
  check(snap().project.rows[0].y===20&&equal(snap().project.evidence,current.project.evidence),
    'calibration undo recomputes current observations without restoring old records');
  clickTool('point');point(224,260);undo();
  check(!$('redoCalibration').disabled&&!$('redo').disabled,'data actions leave the separate calibration redo intact');
  $('redoCalibration').click();
  check(snap().project.rows[0].y===40&&$('redo').disabled,'calibration redo recomputes to the new scale and rejects stale redo');
  document.querySelector('[data-tick="x2"]').click();undo();
  check(snap().project.axes.y.v2===100&&snap().project.rows[0].y===20,'Ctrl+Z uses calibration scope on the calibration canvas');
  redo();
  check(snap().project.axes.y.v2===200,'Ctrl+Shift+Z uses calibration scope');

  clickTool('point');point(224,260);point(272,225);
  key('v');key('ArrowLeft');
  check(snap().selected===1,'left selects previous record');
  key('ArrowRight');
  check(snap().selected===2,'right selects next record');
  key('Delete');check(snap().project.rows.length===2,'Delete removes selected record');
  undo();check(snap().project.rows.length===3&&snap().selected===2,'Delete is undoable with selection restoration');
  key('ArrowUp');
  check(snap().selected===2&&snap().project.assist.series===first.project.assist.series,
    'series navigation is inactive on a single-series chart');

  key('1');
  check($('zoomText').textContent==='100%','1 restores native scale');
  const cursor=clientPoint(170,160);
  canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,shiftKey:true,clientX:cursor[0],clientY:cursor[1],deltaY:-120}));
  const zoomed=clientPoint(170,160);
  check(Math.hypot(cursor[0]-zoomed[0],cursor[1]-zoomed[1])<2,'mouse-centered zoom keeps the source point under the pointer');
  const beforePan=snap(),beforeScroll=wrap.scrollLeft;
  key('p');key(' ',{code:'Space'});
  dispatchPointer('pointerdown',...zoomed);
  dispatchPointer('pointermove',zoomed[0]-45,zoomed[1]-25);
  dispatchPointer('pointerup',zoomed[0]-45,zoomed[1]-25);
  key(' ',{code:'Space'},'keyup');
  check(wrap.scrollLeft>beforeScroll&&snap().tool==='point'&&equal(snap().project.rows,beforePan.project.rows)&&
    equal(snap().project.axes,beforePan.project.axes),'temporary pan moves the view without sampling or changing tools');
  const beforeMode=[wrap.scrollLeft,wrap.scrollTop,$('zoomText').textContent];
  key('v');key('p');
  check(equal([wrap.scrollLeft,wrap.scrollTop,$('zoomText').textContent],beforeMode),'changing tools preserves zoom and pan');
  point(176,330,{altKey:true});
  check(snap().project.rows.length===4&&snap().project.rows.at(-1).y===beforePan.project.rows[0].y&&snap().project.rows.at(-1).x===beforePan.project.rows[0].x,
    'the same source pixel measures the same values after zoom and pan');
  const overlay=canvas.toDataURL();
  key('h');key(' ',{code:'Space'});
  check($('cursorInfo').hidden&&canvas.toDataURL()!==overlay&&wrap.classList.contains('pan-ready'),'H hides the overlay while held');
  key('h',{},'keyup');
  check(!$('cursorInfo').hidden&&canvas.toDataURL()===overlay,'releasing H restores the overlay');
  key('h');
  window.dispatchEvent(new Event('blur'));
  check(!$('cursorInfo').hidden&&!wrap.classList.contains('pan-ready')&&canvas.toDataURL()===overlay,
    'window blur clears the hide and pan keys');
  key('f');check($('zoomText').textContent!=='130%','F fits the image');

  const text=$('title'),nativeEvents=['ArrowLeft','ArrowUp','Tab','Delete','Escape','z','h',' '];
  text.focus();
  check(nativeEvents.every(value=>key(value,{ctrlKey:value==='z',code:value===' '?'Space':undefined},'keydown',text)),
    'shared shortcuts leave editing input events available to the browser');
  check(snap().project.rows.length===4&&!$('cursorInfo').hidden,'editing input neither deletes nor hides annotations');
  $('shortcutHelp').click();
  check($('shortcutDialog').open,'shortcut help is accessible');
  $('shortcutDialog').close();

  await useProject('barv_stack');
  clickTool('point');point(150,400);
  const start=snap().pendingStart;
  check(!!start&&!snap().project.rows.length,'stack start is an undoable action before a row exists');
  undo();check(!snap().pendingStart,'undo removes the temporary start');
  redo();check(equal(snap().pendingStart,start),'redo restores the exact temporary start');
  const initialSeries=snap().project.assist.series;
  point(150,330);
  const firstSegment=snap();
  undo();
  check(!snap().project.rows.length&&equal(snap().pendingStart,start)&&snap().project.assist.series===initialSeries,
    'undo restores the original series, target and temporary boundary');
  redo();
  check(equal(snap().project.rows,firstSegment.project.rows)&&equal(snap().project.evidence,firstSegment.project.evidence)&&
    snap().project.assist.series===firstSegment.project.assist.series&&equal(snap().pendingStart,firstSegment.pendingStart),
    'redo restores series advance and shared boundary');
  key('Escape');
  check(!snap().pendingStart&&snap().project.rows.length===1,'Esc cancels an unfinished segment without deleting completed rows');
  undo();check(equal(snap().pendingStart,firstSegment.pendingStart),'cancellation can be undone');
  key('ArrowUp');
  check(snap().project.assist.series===initialSeries,'up selects previous series');
  key('ArrowDown');
  check(snap().project.assist.series===firstSegment.project.assist.series,'down selects next series');

  await useProject('boxplot_v');
  clickTool('point');point(150,330);
  check(snap().project.assist.boxField==='q1','box plot advances the measurement item');
  undo();check(snap().project.assist.boxField==='lower'&&!snap().project.rows.length,'undo restores the previous box measurement item');
  redo();check(snap().project.assist.boxField==='q1'&&snap().selectedHandle==='lowerPixel','redo restores field and selected handle');
  key('Tab');check(snap().project.assist.boxField==='median','Tab advances the measurement item');
  key('Tab',{shiftKey:true});check(snap().project.assist.boxField==='q1','Shift+Tab selects the previous measurement item');
  point(150,315);undo();
  check(!$('redo').disabled&&snap().project.assist.boxField==='q1','undo leaves a redo for the same measurement item');
  point(150,310);
  check($('redo').disabled&&snap().project.assist.boxField==='median','a new sample discards only the data redo branch');

  const confirm=window.confirm;
  window.confirm=()=>true;
  try{edit($('family'),'heatmap');}finally{window.confirm=confirm;}
  $('heatmapColumns').value='2';$('heatmapRows').value='2';$('heatmapResize').click();
  $('heatmapCorners').click();point(100,100);
  const firstCorner=snap().heatmapCapture.first;
  undo();
  check(snap().tool==='heatmap-corners'&&!snap().heatmapCapture.first,'undo of a first heatmap corner stays in calibration');
  redo();
  check(equal(snap().heatmapCapture.first,firstCorner),'redo restores a first heatmap corner before geometry exists');
  point(300,300);
  check(snap().tool==='select'&&snap().project.heatmap.pixels.x[0]===100,'completed corners establish grid geometry');
  $('undoCalibration').click();
  check(snap().tool==='heatmap-corners'&&equal(snap().heatmapCapture.first,firstCorner)&&
    snap().project.heatmap.pixels.x.every(pixel=>pixel===null),'calibration undo restores the first corner and clears only grid geometry');
  $('redoCalibration').click();
  check(snap().tool==='select'&&snap().project.heatmap.pixels.x[0]===100,'calibration redo reconstructs the grid');

  await useProject('barv_1');
  document.querySelector('[data-tick="y1"]').click();point(80,420);
  edit($('kind'),'barv_1_error');
  check($('undoCalibration').disabled&&$('undo').disabled&&snap().project.errorBars,
    'replacing the chart subtype does not place old calibration in data history');
  return checks;
};
const checks=await runInPage('('+exercise.toString()+')()',process.argv[2]);
assert.ok(checks.length>=35);
console.log(checks.join('\n'));
