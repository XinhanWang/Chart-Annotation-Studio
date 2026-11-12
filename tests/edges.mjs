import assert from 'node:assert/strict';
import {runInPage} from './browser-runner.mjs';
const target = process.argv[2];
const task = async () => {
  const checks = window.__edgeProgress = [], $ = id => document.getElementById(id);
  const ok = (condition, message) => { if (!condition) throw Error(message); checks.push(message); };
  const wait = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));
  const originalPrompt = window.prompt, originalConfirm = window.confirm;
  let frame;
  try {
    await $('demo').onclick(); await wait();
    const demo = chartStudio.bundle, base = structuredClone(demo.current.project), image = demo.current.image;
    const upload = async data => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify(data)], 'edge.project.json', {type:'application/json'}));
      $('projectInput').files = transfer.files;
      await $('projectInput').onchange({target:$('projectInput')}); await wait();
    };
    const load = async kind => {
      const legacyBase=structuredClone(base);delete legacyBase.categoryObjects;const p = {...legacyBase, kind, errorBars:true, legend:false, categories:['A'], rows:[], evidence:[]};
      await upload({format:'chart-studio-project',version:1,activeId:'bar',queue:[{id:'bar',name:'bar.png',image,project:p}],current:{project:p,image,name:'bar.png'}});
      document.querySelector('[data-tool="point"]').click();
    };
    const hit = (x,y,type='pointerdown') => {
      const c=$('canvas'), bounds=c.getBoundingClientRect();
      c.dispatchEvent(new PointerEvent(type,{clientX:bounds.left+x*bounds.width/640,clientY:bounds.top+y*bounds.height/460,bubbles:true,pointerId:1}));
    };
    const point=(x,y)=>{hit(x,y);hit(x,y,'pointerup');};
    const uncalibrated=structuredClone(demo);uncalibrated.current.project.axes.x.calibrated=false;uncalibrated.current.project.axes.y.calibrated=false;
    await upload(uncalibrated);
    const context=$('canvas').getContext('2d'),nativeText=context.fillText,painted=[];
    context.fillText=function(text,...args){painted.push(text);return nativeText.call(this,text,...args);};
    try{hit(150,330,'pointermove');ok(!painted.some(s=>/^X:|^Y:/.test(s)),'uncalibrated images do not display empty numeric projection labels');ok(!$('magnifier').hidden,'native-pixel magnifier remains usable before calibration');}finally{context.fillText=nativeText;}
    await load('barv_1'); point(150,330); point(155,295); point(145,365);
    document.querySelector('[data-tool="select"]').click();
    hit(150,330); hit(170,330,'pointermove'); hit(170,330,'pointerup');
    let p=chartStudio.snapshot().project;
    ok(p.evidence[0].pixel.x===170&&p.evidence[0].lowerPixel.x===170&&p.evidence[0].upperPixel.x===170,'vertical value drag keeps both error endpoints centered');
    ok(Math.abs(p.rows[0].lower-10)<1e-7&&Math.abs(p.rows[0].upper-30)<1e-7,'cross-axis drag preserves numeric uncertainty bounds');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    p=chartStudio.snapshot().project;
    ok(p.evidence[0].pixel.x===171&&p.evidence[0].upperPixel.x===171,'keyboard nudge also centers error endpoints');
    $('undo').click(); p=chartStudio.snapshot().project;
    ok(p.evidence[0].pixel.x===170&&p.evidence[0].lowerPixel.x===170,'undo restores aligned endpoint geometry');
    await load('barh_1'); point(176,150); point(224,155); point(128,145);
    document.querySelector('[data-tool="select"]').click();
    hit(176,150); hit(176,175,'pointermove'); hit(176,175,'pointerup');
    p=chartStudio.snapshot().project;
    ok(p.evidence[0].pixel.y===175&&p.evidence[0].upperPixel.y===175&&p.evidence[0].lowerPixel.y===175,'horizontal value drag keeps both error endpoints centered');
    const good=chartStudio.bundle, before=JSON.stringify(p);
    const invalidId=structuredClone(good); invalidId.activeId='missing'; await upload(invalidId);
    ok(JSON.stringify(chartStudio.snapshot().project)===before&&$('toast').textContent.includes('ID'),'invalid archive active ID is rejected before replacing live data');
    const wrongProject=structuredClone(good); wrongProject.projects=[{id:'other',name:'Other'}]; wrongProject.currentProjectId='other'; await upload(wrongProject);
    ok(JSON.stringify(chartStudio.snapshot().project)===before&&$('toast').textContent.includes('不一致'),'archive cannot attach the current image to a different project');
    const badQueued=structuredClone(good);
    badQueued.projects=[{id:'broken-project',name:'Broken'}];
    badQueued.queue.push({id:'broken',projectId:'broken-project',name:'broken.png',image:'data:image/png;base64,bm90LWltYWdl',project:structuredClone(p)});
    await upload(badQueued);
    $('projectSelect').value='broken-project'; await $('projectSelect').onchange();
    ok(chartStudio.snapshot().currentProjectId===null&&JSON.stringify(chartStudio.snapshot().project)===before,'unreadable queued image leaves current project and annotation unchanged');
    ok(chartStudio.snapshot().imageSize.width===640,'failed project switch keeps the source image available');
    const button=document.querySelector('[data-queue="bar"]');
    const pending=$('queue').onclick({target:button});
    window.prompt=()=> 'Pending selection test'; await $('newProject').onclick(); await pending;
    ok(chartStudio.snapshot().imageSize===null&&chartStudio.snapshot().project.rows.length===0,'creating an empty project cancels a pending image selection');
    const workspace=document.querySelector('.workspace'), nativeFullscreen=workspace.requestFullscreen;
    workspace.requestFullscreen=()=>Promise.reject(Error('Testing CSS fallback'));
    try {
      await $('focusToggle').onclick(); await wait();
      ok(chartStudio.snapshot().focusMode,'focus remains usable when native fullscreen is unavailable');
      const input=document.querySelector('[data-axis]');
      input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await wait();
      ok(!chartStudio.snapshot().focusMode,'Escape exits CSS focus mode even when a numeric input has focus');
    } finally { workspace.requestFullscreen=nativeFullscreen; }
    // A real iframe supplies distinct CSS viewports without changing the user's browser window.
    frame=document.createElement('iframe');
    frame.style.cssText='position:fixed;top:0;left:0;width:1024px;height:800px;border:0;z-index:9999;background:white';
    frame.src=location.href; document.body.append(frame);
    await new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=reject;}); await wait(750);
    const w=frame.contentWindow,d=frame.contentDocument;
    await d.getElementById('demo').onclick(); await wait();
    const area=d.querySelector('.workspace');area.requestFullscreen=()=>Promise.reject(Error('QA CSS fallback'));
    for(const width of [375,740,1024,1280,1920]) {
      frame.style.width=width+'px'; await wait();
      ok(d.documentElement.scrollWidth<=w.innerWidth+1,width+'px: normal layout has no horizontal page overflow');
      const canvas=d.getElementById('canvas'),bounds=canvas.getBoundingClientRect();
      canvas.dispatchEvent(new w.PointerEvent('pointermove',{clientX:bounds.left+50,clientY:bounds.top+50,bubbles:true}));
      const lens=d.getElementById('lens').getBoundingClientRect();
      ok(Math.abs(lens.width-140)<1&&Math.abs(lens.height-140)<1,width+'px: responsive magnifier preserves true 5x original-pixel scaling');
      await d.getElementById('focusToggle').onclick();await wait();
      const source=d.getElementById('canvasWrap').getBoundingClientRect(),dock=d.querySelector('.lens-dock').getBoundingClientRect();
      ok(source.right<=dock.left+1||source.bottom<=dock.top+1||dock.bottom<=source.top+1,width+'px: focus magnifier never overlaps the source canvas');
      ok(d.documentElement.scrollWidth<=w.innerWidth+1,width+'px: focus layout has no horizontal page overflow');
      d.querySelector('[data-axis]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait();
    }
    return {checks};
  } finally { window.prompt=originalPrompt;window.confirm=originalConfirm;frame?.remove(); }
};
const value=await runInPage('('+task.toString()+')()',target);
assert(value.checks.length>=34);console.log(JSON.stringify(value,null,2));
