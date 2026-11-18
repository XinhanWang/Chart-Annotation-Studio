import {runInPage} from './browser-runner.mjs';
const task=async()=>{
  const checks=[],ok=(condition,message)=>{if(!condition)throw Error(message);checks.push(message);};
  const $=id=>document.getElementById(id),wait=()=>new Promise(r=>setTimeout(r,300));
  await $('demo').onclick();await wait();
  const before=chartStudio.bundle,image=before.current.image;
  const imageBlob=await(await fetch(image)).blob();
  const good={title:'Generated voltage',data:{values:[{category:'A',value:1.1234567890123},{category:'B',value:2}]},mark:{type:'bar'},encoding:{x:{field:'category',type:'nominal',sort:null},y:{field:'value',type:'quantitative',title:'Voltage (mV)'}}};
  const bad={...good,transform:[{filter:'datum.value>0'}]};
  const row=(id)=>({id,kind:'barv_1',status:'accepted',compact:`samples/${id}/compact.vl.json`,image:`samples/${id}/chart.png`});
  const data=new DataTransfer();
  function add(name,body,type='application/json'){
    const file=new File([body],name.split('/').at(-1),{type});
    Object.defineProperty(file,'webkitRelativePath',{value:'generated-run/'+name});data.items.add(file);
  }
  add('manifest.jsonl',[row('good'),row('bad'),row('missing')].map(r=>JSON.stringify(r)).join('\n'));
  for(const [id,spec] of [['good',good],['bad',bad]]){
    add(`samples/${id}/compact.vl.json`,JSON.stringify(spec));add(`samples/${id}/chart.png`,imageBlob,'image/png');
  }
  const input=$('generatedInput');input.files=data.files;await input.onchange({target:input});await wait();
  const snapshot=chartStudio.snapshot();
  ok(snapshot.queue.length===before.queue.length+1,'generated folder appends without replacing existing annotations');
  ok(snapshot.project.kind==='barv_1'&&snapshot.project.rows.length===2,'image and GT are paired by manifest sample paths');
  ok(snapshot.project.rows[0].value===1.1234567890123,'original numeric precision survives import');
  ok(!snapshot.project.reviewed&&Object.values(snapshot.project.axes).every(a=>!a.calibrated),'import cannot fake human review or calibration');
  ok(snapshot.project.generatedSource.sampleId==='good'&&snapshot.project.evidence.every(e=>e.source==='synthetic_gt'),'generation provenance is preserved separately from GT');
  ok(snapshot.imageSize.width===640&&snapshot.renderOk,'original PNG decodes and semantic preview compiles');
  ok($('generatedStatus').textContent.includes('跳过 2')&&!$('generatedReport').hidden,'unsupported and missing samples remain visible in report');
  const backup=chartStudio.bundle;
  const restoreInput=$('projectInput'),dt=new DataTransfer();dt.items.add(new File([JSON.stringify(backup)],'roundtrip.project.json',{type:'application/json'}));
  restoreInput.files=dt.files;await restoreInput.onchange({target:restoreInput});await wait();
  ok(chartStudio.snapshot().project.generatedSource.sampleId==='good','v2 workspace restores generated provenance and annotations');
  const cell=document.querySelector('input[data-key="value"]');ok(!!cell,'imported values remain editable in existing table');
  cell.value='7.25';cell.dispatchEvent(new Event('change',{bubbles:true}));await wait();
  ok(chartStudio.snapshot().project.rows[0].value===7.25,'edits use the normal annotation workflow');
  const unchanged=chartStudio.snapshot().queue.length;
  const noManifest=new DataTransfer();noManifest.items.add(new File(['{}'],'compact.vl.json',{type:'application/json'}));input.files=noManifest.files;await input.onchange({target:input});
  ok(chartStudio.snapshot().queue.length===unchanged,'invalid folder import does not damage the existing queue');
  return {passed:true,checks};
};
console.log(JSON.stringify(await runInPage('('+task.toString()+')()',process.argv[2]),null,2));
