// Radar controls reuse the studio's canvas, target navigation, table and project history.
function radarTargetState(target){
  return radarSkip(p,target.category,target.series);
}
function radarTargetDone(target){
  return finite(p.rows[targetIndex(target)]?.value)||!!radarTargetState(target);
}
function radarTargetPrefix(target){
  const state=radarTargetState(target);
  return state==='absent'?'缺 ':state==='review'?'待复核 ':'';
}
function radarActiveHint(){
  if(tool==='radar-center'){
    const count=p.radar.centerPoints.length;
    return p.radar.centerMode==='lines'?
      `已取 ${count}/4 点，请在第 ${count<2?1:2} 条径向轴上点击第 ${count%2+1} 个点。`:'请在原图点击圆心。';
  }
  if(tool==='radar-anchor')return '请在第一个类别的径向轴上取一点，辅助轴从这里开始顺时针排列。';
  if(tool==='radar-tick1'||tool==='radar-tick2')return '点击原图中的已知径向刻度，再在校准区填写该刻度的实际数值。';
  if(tool==='radar-retake')return '点击新的端点。更新堆叠外边界时会同时重算相邻段。';
  if(tool==='point'){
    try{radarCalibration(p);}catch(e){return e.message;}
    if(targetPairs().every(radarTargetDone))return '取点已结束，可选中记录复核或重取。';
    return isRadarStack(p)?'依次点击当前类别各段的外边界。明确为零的段请手填 0。':'点击当前目标实际端点，辅助轴仅供定位。';
  }
  return '先定位圆心并标定径向刻度，也可以直接在表格填写原图数值。';
}

function syncRadarForm(){
  const active=isRadar(p);
  $('radarControls').hidden=!active;
  $('axisTitles').hidden=active;
  document.querySelector('[data-tool="calibrate"]').hidden=active||
    isHeatmap(p)&&!requiredAxes(p).length||isPie(p);
  if(!active)return;
  $('calibrationPanel').hidden=true;
  const r=p.radar;
  $('radarCenterMode').value=r.centerMode;
  $('radarCenterX').value=r.center?.x??'';
  $('radarCenterY').value=r.center?.y??'';
  $('radarTickValue1').value=r.centerZero?0:r.tickValues[0]??'';
  $('radarTickValue2').value=r.tickValues[1]??'';
  $('radarDomainMin').value=r.domain[0]??'';
  $('radarDomainMax').value=r.domain[1]??'';
  $('radarDomainMin').disabled=isPolarBar(p);
  $('radarZero').checked=r.centerZero;
  $('radarTick1').disabled=r.centerZero;
  $('radarTickValue1').disabled=r.centerZero;
  $('radarPercent').checked=percentLabels(p,'y');
  $('radarCategoryCount').value=p.categoryObjects.length;
  $('radarSeriesCount').value=p.series.length;
  $('radarSeriesCount').disabled=isSingleRadar(p);
  $('radarTick1').textContent=r.tickPoints[0]?'重取刻度 1':'取刻度 1';
  $('radarTick2').textContent=r.tickPoints[1]?'重取刻度 2':'取刻度 2';
  $('radarAnchor').textContent=r.anchor?'重取首类别方向':'标定首类别方向';
  $('tableNote').textContent=isRadarStack(p)?
    '数值列填写各段自身的值。堆叠顺序按类别编辑，径向边界保存在工程中。':'每行对应一个类别和系列的径向端点。';
}
function syncRadarAssist(){
  const active=isRadar(p),stacked=active&&isRadarStack(p),polar=active&&isPolarBar(p);
  $('radarStackControls').hidden=!polar;
  $('radarOrder').hidden=!stacked;
  $('radarStackCategory').hidden=!stacked;
  $('projections').closest('label').hidden=active;
  $('dragAxis').closest('label').hidden=active;
  if(!active)return;
  $('sequenceLabel').hidden=$('categoryLock').hidden=$('unlockPoint').hidden=true;
  $('hint').textContent=radarActiveHint();
  const {category,series}=assist();
  const i=targetIndex({category,series}),row=p.rows[i];
  $('radarRetake').disabled=!image||!category||!series||!!row&&finite(row.value)&&!p.evidence?.[i]?.pixel;
  let calibration;
  try{radarCalibration(p);calibration='径向刻度已校准';}catch(e){calibration=e.message;}
  $('radarCalibrationStatus').textContent=calibration;
  if(!polar)return;
  $('radarStackCategory').textContent=categoryName(p,category)??'';
  $('radarOrder').innerHTML=stacked?radarSeriesOrder(p,category).map((key,index,list)=>{
    const state=radarSkip(p,category,key);
    return `<div class="series-row"><span>${index+1} · ${esc(seriesName(p,key))}${state==='absent'?'（缺失）':state==='review'?'（待复核）':''}</span>
      <button type="button" data-radar-series="${esc(key)}" data-delta="-1" ${index===0?'disabled':''} aria-label="向内移动 ${esc(seriesName(p,key))}">↑</button>
      <button type="button" data-radar-series="${esc(key)}" data-delta="1" ${index===list.length-1?'disabled':''} aria-label="向外移动 ${esc(seriesName(p,key))}">↓</button></div>`;
  }).join(''):'';
  $('radarSkip').disabled=$('radarReview').disabled=!category||!series||finite(row?.value);
  $('radarUnskip').disabled=!radarTargetState({category,series});
}
function storeRadarTarget(target,value=null){
  let index=targetIndex(target);
  if(index<0){
    index=p.rows.length;
    if(isRadarStack(p))p.radar.orders[target.category]??=radarSeriesOrder(p,target.category);
    p.rows.push({category:categoryName(p,target.category),series:seriesName(p,target.series),
      _categoryKey:target.category,_seriesKey:target.series,value});
    (p.evidence??=[])[index]={role:'transcribed',source:'manual_entry'};
  }
  delete p.radar.skips[radarTargetKey(target.category,target.series)];
  selected=index;
  selectedHandle='pixel';
  return index;
}
function addRadarRow(){
  const target=assist();
  if(!target.category||!target.series){toast('请先建立类别和系列');return;}
  if(targetIndex(target)>=0){selected=targetIndex(target);table();return;}
  calibrateChange(()=>storeRadarTarget(target));
  document.querySelector(`[data-i="${selected}"][data-key="value"]`)?.focus();
}
function editRadarCell(index,key,object,input,scale){
  calibrateChange(()=>{
    const row=p.rows[index],oldCategory=categoryIdentity(row),target={category:oldCategory,series:identity(row)};
    if(object){
      if(target[object]===input.value)return;
      target[object]=input.value;
      if(targetIndex(target)>=0)throw Error('该类别和系列已有记录');
      row._categoryKey=target.category;row.category=categoryName(p,target.category);
      row._seriesKey=target.series;row.series=seriesName(p,target.series);
    }else if(key==='value'){
      recordTablePercent(row,'value',scale);
      row.value=input.value.trim()===''?null:Number(input.value);
    }
    delete p.radar.skips[radarTargetKey(target.category,target.series)];
    (p.evidence??=[])[index]={role:'transcribed',source:'manual_edit'};
    recalculateRadar(p,oldCategory);
    if(oldCategory!==target.category)recalculateRadar(p,target.category);
    if(!object&&finite(row.value)&&assist().category===target.category&&assist().series===target.series)nextTarget();
  });
}
function retakeRadarEndpoint(index,point){
  radarCalibration(p);
  const row=p.rows[index],evidence=p.evidence[index],category=categoryIdentity(row);
  const complete=radarRows(p,category).filter(row=>finite(row.value));
  const previous=evidence.pixel;
  evidence.pixel=point;
  recalculateRadar(p,category);
  if(!finite(row.value)||complete.some(row=>!finite(row.value))){
    const message=evidence.issue;
    evidence.pixel=previous;
    recalculateRadar(p,category);
    throw Error(message||'外边界与相邻段冲突，请重新定位');
  }
}
function recordRadarPoint(point){
  const r=p.radar;
  if(tool==='radar-center'){
    const points=r.centerMode==='lines'?[...r.centerPoints,point]:[];
    const center=r.centerMode==='lines'?locateCenterFromPoints('lines',points,0):point;
    calibrateChange(()=>{
      r.centerPoints=points;
      if(center){r.center=center;recalculateRadar(p);}
    },{form:true});
    if(center)setTool('select');
    return;
  }
  if(tool==='radar-anchor'){
    if(!r.center||radarDistance(point,r.center)<1)throw Error('先确定圆心，再取离开圆心的径向轴位置');
    calibrateChange(()=>{r.anchor=point;},{form:true});setTool('select');return;
  }
  if(tool==='radar-tick1'||tool==='radar-tick2'){
    const index=tool==='radar-tick1'?0:1;
    calibrateChange(()=>{r.tickPoints[index]=point;recalculateRadar(p);},{form:true});
    setTool('select');$('radarTickValue'+(index+1)).focus();return;
  }
  radarCalibration(p);
  const target=assist(),retake=tool==='radar-retake';
  if(!target.category||!target.series)throw Error('请先填写类别和系列');
  const index=targetIndex(target),row=p.rows[index];
  if(finite(row?.value)&&(!retake||!p.evidence?.[index]?.pixel)||!retake&&radarTargetState(target))
    throw Error(targetPairs().every(radarTargetDone)?'自动取点已结束，可在表格复核或单独重取':'请选择待测目标；已有手填值优先保留');
  if(isRadarStack(p)){
    const order=radarSeriesOrder(p,target.category),earlier=order.slice(0,order.indexOf(target.series));
    if(earlier.some(series=>!finite(p.rows[targetIndex({category:target.category,series})]?.value)&&
      radarSkip(p,target.category,series)!=='absent'))throw Error('请先确认当前类别中更靠内的堆叠段');
  }
  calibrateChange(()=>{
    if(retake&&p.evidence?.[index]?.pixel){
      retakeRadarEndpoint(index,point);
      setTool('select');
      return;
    }
    const i=storeRadarTarget(target);
    clearMeasuredField(p.rows[i],'value');
    p.evidence[i]={pixel:point,role:'observation',source:'pixel_measurement'};
    recalculateRadar(p,target.category);
    if(retake)setTool('select');
    else if(finite(p.rows[i].value))nextTarget();
  });
}

function bindRadarTools(){
  $('radarCenterMode').onchange=e=>calibrateChange(()=>{p.radar.centerMode=e.target.value;p.radar.centerPoints=[];},{form:true});
  $('radarCenter').onclick=()=>{
    if(!image){toast('请先添加雷达图原图');return;}
    calibrateChange(()=>{p.radar.centerPoints=[];});
    setTool('radar-center');
  };
  for(const [id,mode] of [['radarTick1','radar-tick1'],['radarTick2','radar-tick2'],['radarAnchor','radar-anchor'],['radarRetake','radar-retake']])
    $(id).onclick=()=>{if(!image)toast('请先添加雷达图原图');else setTool(mode);};
  $('radarAdjustCenter').onclick=()=>calibrateChange(()=>{
    const xs=['radarCenterX','radarCenterY'].map(id=>$(id).value.trim());
    const [x,y]=xs.map(Number);
    if(xs.some(raw=>raw==='')||!finite(x)||!finite(y))throw Error('请输入两个有限的圆心坐标');
    p.radar.center={x,y};p.radar.centerPoints=[];recalculateRadar(p);
  },{form:true});
  $('radarZero').onchange=e=>calibrateChange(()=>{p.radar.centerZero=e.target.checked;recalculateRadar(p);},{form:true});
  $('radarPercent').onchange=e=>calibrateChange(()=>{
    (p.percentLabels??={}).y=e.target.checked;
    recalculateRadar(p);
  },{form:true});
  for(const [id,field,index] of [['radarTickValue1','tickValues',0],['radarTickValue2','tickValues',1],
    ['radarDomainMin','domain',0],['radarDomainMax','domain',1]]){
    $(id).onchange=e=>calibrateChange(()=>{
      const raw=e.target.value.trim(),percent=printedPercent(raw),value=raw===''?null:percent??Number(raw);
      if(value!==null&&!finite(value))throw Error('请输入有限的数值或带 % 的刻度');
      if(percent!==null)recordPercentScale('y',percent);
      p.radar[field][index]=value;
      if(field==='domain'&&p.percentGuides?.y)delete p.percentGuides.y.domain;
      recalculateRadar(p);
    },{form:true});
  }
  for(const [id,kind,field,input] of [['radarCategoryCount','category','categoryObjects','categories'],
    ['radarSeriesCount','series','series','seriesNames']]){
    $(id).onchange=e=>{
      const count=Number(e.target.value),names=p[field].map(item=>item.name);
      if(!Number.isSafeInteger(count)||count<1){syncRadarForm();toast('数量须为正整数');return;}
      for(let i=names.length;i<count;i++){
        const prefix=kind==='series'?'Series ':'类别 ';
        let suffix=i+1;
        while(names.includes(prefix+suffix))suffix++;
        names.push(prefix+suffix);
      }
      $(input).value=names.slice(0,count).join('\n');
      applyBulkNames(kind,input);
      syncRadarForm();
    };
  }
  $('radarOrder').onclick=e=>{
    const {radarSeries,delta}=e.target.dataset;
    if(!radarSeries)return;
    change(()=>{
      const {category}=assist(),order=radarSeriesOrder(p,category),i=order.indexOf(radarSeries),j=i+Number(delta);
      if(j<0||j>=order.length)return;
      [order[i],order[j]]=[order[j],order[i]];
      p.radar.orders[category]=order;
      // Outer endpoints describe the old physical order. Preserve valid segment amounts.
      detachRadarBoundaries(p,category);
    });
  };
  for(const [id,state] of [['radarSkip','absent'],['radarReview','review'],['radarUnskip',null]]){
    $(id).onclick=()=>change(()=>{
      const target=assist(),key=radarTargetKey(target.category,target.series),index=targetIndex(target);
      if(state){
        if(index>=0&&finite(p.rows[index].value))return;
        if(index>=0){p.rows.splice(index,1);p.evidence?.splice(index,1);selected=-1;}
        p.radar.skips[key]=state;
      }else delete p.radar.skips[key];
      recalculateRadar(p,target.category);
      if(state)nextTarget();
    });
  }
}

function drawRadarGuides(mark){
  const r=p.radar,{center}=r;
  ctx.save();
  const segment=(a,b)=>{ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();};
  if(r.centerMode==='lines'&&tool==='radar-center'){
    ctx.strokeStyle='#6750a4';
    for(let i=0;i+1<r.centerPoints.length;i+=2)segment(r.centerPoints[i],r.centerPoints[i+1]);
    r.centerPoints.forEach((point,i)=>mark(point,'#6750a4','轴 '+(i+1)));
  }
  if(center){
    const radius=Math.max(image.width,image.height),current=assist().category;
    if(r.anchor&&p.categoryObjects.length){
      const rotation=Math.atan2(r.anchor.y-center.y,r.anchor.x-center.x);
      p.categoryObjects.forEach((category,i)=>{
        const angle=radarAngle(i,p.categoryObjects.length,rotation),active=category.key===current;
        ctx.lineWidth=(active?2:1)/zoom;
        ctx.strokeStyle=active?'#006ee6':'#7d92ae';
        ctx.setLineDash([6/zoom,4/zoom]);
        segment(center,{x:center.x+radius*Math.cos(angle),y:center.y+radius*Math.sin(angle)});
        ctx.setLineDash([]);
        ctx.font=`${12/zoom}px sans-serif`;ctx.fillStyle=ctx.strokeStyle;
        ctx.fillText(category.name,center.x+28/zoom*Math.cos(angle),center.y+28/zoom*Math.sin(angle));
      });
    }
    mark(center,'#f05c35',r.centerZero?'圆心 / 0':'圆心',true);
    r.tickPoints.forEach((point,i)=>{if(i||!r.centerZero)mark(point,'#6750a4','刻度 '+(i+1));});
  }
  p.rows.forEach((row,i)=>mark(p.evidence?.[i]?.pixel,p.series.find(s=>s.key===identity(row))?.color||'#008b7e',
    String(i+1),i===selected));
  ctx.restore();
}
