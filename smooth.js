// Compact smooth curves and their preview-only position labels.
const otherAxis=axis=>axis==='x'?'y':'x';
const discreteSmooth=p=>isSmoothLine(p)&&lineCategoryAxis(p);
const freeSmoothRow=(p,row)=>!!discreteSmooth(p)&&row?.[lineCategoryAxis(p)]===null;
const freeSmoothPhase=p=>!!discreteSmooth(p)&&(p.smoothPhase??(p.rows.some(row=>freeSmoothRow(p,row))?'free':'fixed'))==='free';
const smoothTargetKey=target=>JSON.stringify([target.category,target.series]);
const smoothTargetSkipped=(p,target)=>!!p.smoothSkipped?.[smoothTargetKey(target)];

function smoothFixedDone(p,target){
  const axis=otherAxis(lineCategoryAxis(p));
  return smoothTargetSkipped(p,target)||p.rows.some(row=>row._categoryKey===target.category&&
    identity(row)===target.series&&finite(row[axis]));
}
const smoothPositionAxis=gt=>['x','y'].find(axis=>gt?.encoding?.[axis]?.type==='quantitative'&&gt.encoding[axis].field===axis+'_id');
const verticalSmooth=gt=>smoothGT(gt)&&(smoothPositionAxis(gt)==='y'||nominalType(gt.encoding.y.type));

function smoothCategoryPositions(p,usePixelPositions=true){
  return new Map(p.categoryObjects.map((c,i)=>[c.key,usePixelPositions?c.curvePosition??i:i]));
}
function smoothRowPosition(p,row,positions=smoothCategoryPositions(p)){
  const axis=lineCategoryAxis(p);
  if(!axis)return row.x;
  return row[axis]===null?row._curvePosition:positions.get(row._categoryKey);
}
function validateSmoothLine(p,issue){
  const axis=lineCategoryAxis(p),positions=smoothCategoryPositions(p);
  if(axis){
    const values=[...positions.values()];
    if(values.some((value,i)=>!finite(value)||i>0&&value<=values[i-1]))
      issue('error','类别位置必须按画面顺序严格递增');
    if(p.categoryObjects.some(category=>typeof category.name!=='string'||!category.name.trim()))
      issue('error','请填写非空类别标签');
  }
  const labels=new Set(positions.values()),paths=new Map();
  for(const [index,row] of p.rows.entries()){
    const position=smoothRowPosition(p,row,positions),key=identity(row);
    if(row.path_order!==undefined||row._curveReview)
      issue('error',`第 ${index+1} 行：断点、尖角或显式回走待复核，请拆分为独立曲线或使用普通折线`);
    if(!finite(position)){
      issue('error',`第 ${index+1} 行：平滑曲线需要有限的采样位置`);
      continue;
    }
    if(axis&&row[axis]===null&&labels.has(position))
      issue('error',`第 ${index+1} 行：该采样位置与类别位置重合，请选择相应类别或复核测量`);
    if(axis){
      if(!paths.has(key))paths.set(key,new Set());
      const series=paths.get(key);
      if(series.has(position))issue('error',`第 ${index+1} 行：同一系列的 ${axis.toUpperCase()} 采样位置重合`);
      series.add(position);
      continue;
    }
    const path=paths.get(key);
    if(path){
      const direction=Math.sign(position-path.last);
      if(!direction||path.direction&&direction!==path.direction)
        issue('error',`第 ${index+1} 行：平滑曲线的 ${(axis??'x').toUpperCase()} 采样位置重合或回走，请复核路径`);
      path.direction||=direction;
      path.last=position;
    }else paths.set(key,{last:position,direction:0});
  }
}

// With sort:null a nominal axis follows its first occurrences in the grouped rows.
function needsSmoothPositionIDs(axis,categories,positions,rows){
  if(rows.some(row=>row[axis]===null)||
      unique(categories.map(category=>category.name)).length<categories.length||
      categories.some((category,i)=>positions.get(category.key)!==i))return true;
  const observed=unique(rows.map(row=>row._categoryKey));
  return observed.some((key,i)=>i>0&&positions.get(key)<positions.get(observed[i-1]));
}

function makeSmoothSpec(p,observation){
  const axis=lineCategoryAxis(p),positions=smoothCategoryPositions(p);
  const categories=p.categoryObjects,observedSeries=new Set(p.rows.map(identity));
  const seriesKeys=axis?p.series.map(series=>series.key).filter(key=>observedSeries.has(key)):[...observedSeries];
  const seriesRank=new Map(seriesKeys.map((key,i)=>[key,i]));
  const withSeries=p.legend||seriesKeys.length>1;
  const repeatedSeries=p.legend&&unique(seriesKeys.map(key=>seriesName(p,key))).length<seriesKeys.length;
  const id=axis+'_id';
  const ordered=axis?[...p.rows].sort((a,b)=>seriesRank.get(identity(a))-seriesRank.get(identity(b))||
    smoothRowPosition(p,a,positions)-smoothRowPosition(p,b,positions)):p.rows;
  const positioned=axis&&needsSmoothPositionIDs(axis,categories,positions,ordered);
  const rows=ordered.map(row=>{
    const out={x:row.x,y:row.y};
    if(positioned)out[id]=smoothRowPosition(p,row,positions)+0;
    if(withSeries){
      const index=seriesRank.get(identity(row));
      out.series=p.legend?row.series:'Series '+(index+1);
      if(repeatedSeries)out.series_id='S'+(index+1);
    }
    return observation(orderRow(out),row);
  });
  const encoding=Object.fromEntries(['x','y'].map(channel=>{
    const title=p[channel+'Title'],cal=p.axes[channel];
    const heading=present(title)&&(typeof title!=='string'||title.trim())?{title:copy(title)}:{};
    if(channel===axis){
      if(positioned)return [channel,{field:id,type:'quantitative',...heading}];
      return [channel,{field:channel,type:'nominal',...heading,sort:null}];
    }
    const reverse=cal.calibrated?(cal.v2-cal.v1)/(cal.p2-cal.p1)*(channel==='x'?1:-1)<0:cal.reverse;
    return [channel,{field:channel,type:'quantitative',...heading,
      ...(cal.type==='log'||reverse?{scale:{...(cal.type==='log'?{type:'log'}:{}),...(reverse?{reverse:true}:{})}}:{})}];
  }));
  if(withSeries)encoding.color={field:repeatedSeries?'series_id':'series',type:'nominal',sort:null};
  const observed=new Set(p.rows.map(row=>row._categoryKey));
  const missing=axis?categories.filter(c=>!observed.has(c.key)).map(c=>({position:positions.get(c.key),label:c.name})):[];
  return {...(present(p.title)?{title:copy(p.title)}:{}),data:{values:rows},
    mark:{type:'line',interpolate:'monotone'},encoding,
    ...(missing.length?{usermeta:{[axis+'_labels']:missing}}:{})};
}

function smoothLabelEntries(gt,axis){
  const entries=gt.usermeta?.[axis+'_labels']??[];
  if(!Array.isArray(entries)||entries.some(row=>!row||!finite(row.position)||typeof row.label!=='string'||!row.label.trim())||
      new Set(entries.map(row=>row.position)).size!==entries.length)throw Error('平滑曲线缺测类别位置映射无效');
  return entries;
}
function smoothCategories(gt,axis,positioned){
  const def=gt.encoding[axis],id=axis+'_id',rows=gt.data.values;
  const missing=smoothLabelEntries(gt,axis);
  const observed=new Map();
  for(const row of rows){
    const key=row[def.field],name=row[axis];
    if(positioned&&!finite(key))throw Error('平滑曲线采样位置必须是有限数字');
    if(positioned&&name===null)continue;
    if(typeof name!=='string'||!name.trim()||!present(key))throw Error('平滑曲线类别标签缺失');
    if(observed.has(key)&&observed.get(key)!==name)throw Error('同一采样位置的类别标签冲突');
    observed.set(key,name);
  }
  if(positioned){
    if(missing.some(item=>observed.has(item.position))||
        rows.some(row=>row[axis]===null&&(observed.has(row[id])||missing.some(item=>item.position===row[id]))))
      throw Error('空类别采样点、已标注类别与轴标签的位置重合');
    return [...[...observed].map(([position,label])=>({position,label,key:position})),
      ...missing.map(({position,label})=>({position,label,key:position}))].sort((a,b)=>a.position-b.position);
  }
  const keys=Array.isArray(def.sort)?def.sort:[...observed.keys()],count=keys.length+missing.length;
  const empty=new Map(missing.map(({position,label})=>[position,label]));
  if(missing.some(({position})=>!Number.isInteger(position)||position<0||position>=count)||
      keys.length!==observed.size||new Set(keys).size!==keys.length||keys.some(key=>!observed.has(key)))
    throw Error('普通类别轴标签须按从 0 开始的类别序位保存');
  let next=0;
  return Array.from({length:count},(_,position)=>empty.has(position)?
    {position,label:empty.get(position),missing:true}:{position,label:observed.get(keys[next]),key:keys[next++]});
}

function importSmoothSpec(gt,percentAxes){
  const enc=gt.encoding,mark=gt.mark,rows=gt.data.values;
  if(gt.layer||gt.transform||Object.keys(mark).some(key=>!['type','interpolate'].includes(key))||
      Object.keys(enc).some(key=>!['x','y','color'].includes(key)))
    throw Error('平滑曲线仅支持直接映射的单一 monotone 路径，请复核断点或混合线型');
  const positioned=smoothPositionAxis(gt);
  if(positioned&&percentAxes[positioned])throw Error('类别位置不能使用百分比数值格式');
  const discrete=['x','y'].filter(axis=>nominalType(enc[axis].type)||axis===positioned);
  if(discrete.length>1)throw Error('平滑曲线至少需要一条连续数值轴');
  const axis=discrete[0];
  for(const channel of ['x','y']){
    const def=enc[channel];
    if(def.field!==(channel===axis&&def.field===channel+'_id'?channel+'_id':channel)||
        (channel!==axis&&def.type!=='quantitative')||def.axis?.labelExpr||def.condition||
        def.aggregate||def.bin||def.timeUnit||def.datum!==undefined||def.value!==undefined||
        def.scale?.type&&!['linear','log'].includes(def.scale.type)||
        channel===positioned&&def.scale?.type==='log'||
        channel!==axis&&def.sort!=null)throw Error('平滑曲线的轴映射不符合 Compact GT');
    if(channel!==axis&&gt.usermeta?.[channel+'_labels']!==undefined)throw Error('轴标签映射只用于实际离散的轴');
  }
  const seriesField=enc.color?.field;
  const fields=new Set(['x','y',...(axis?[axis+'_id']:[]),...(seriesField?['series',seriesField]:[])]);
  if(enc.color&&(!['series','series_id'].includes(seriesField)||enc.color.type!=='nominal'||enc.color.sort!=null))
    throw Error('平滑曲线系列须使用 nominal 的 series 映射');
  if(rows.some(row=>!row||Object.keys(row).some(key=>!fields.has(key))||
      ['x','y'].some(channel=>channel!==axis&&!finite(row[channel]))))
    throw Error('平滑曲线包含断点、无效数值或显式回走，请先复核原始数据');
  const names=new Map();
  for(const row of rows){
    const key=seriesField?row[seriesField]:'Series 1',name=seriesField?row.series??key:key;
    if(!present(key)||typeof name!=='string'||names.has(key)&&names.get(key)!==name)throw Error('平滑曲线系列身份冲突');
    names.set(key,name);
  }
  const categories=axis?smoothCategories(gt,axis,!!positioned):[];
  const p=defaultProject(names.size>1?'line_smooth_n':'line_smooth_1');
  p.title=typeof gt.title==='object'&&!Array.isArray(gt.title)?gt.title?.text??'':gt.title??'';
  p.legend=!!seriesField&&enc.color.legend!==null;
  p.xType=axis==='x'?'nominal':'quantitative';
  p.yType=axis==='y'?'nominal':'quantitative';
  p.smoothPositioned=!!positioned;
  for(const channel of ['x','y']){
    const def=enc[channel];
    p[channel+'Title']=def.title??def.axis?.title??'';
    p.axes[channel].type=def.scale?.type??'linear';
    p.axes[channel].reverse=!!def.scale?.reverse;
    if(p.axes[channel].type==='log')p.axes[channel].v1=1;
  }
  const bySeries=new Map();
  p.series=[...names].map(([id,name],index)=>{
    const key=newKey('series');bySeries.set(id,key);
    return {name,key,color:SERIES_COLORS[index%SERIES_COLORS.length]};
  });
  const byCategory=new Map();
  p.categoryObjects=categories.map(({position,label,key:id,missing})=>{
    const key=newKey('category');
    if(!missing)byCategory.set(id,key);
    return {name:label,key,...(positioned?{curvePosition:position,curveFixedPosition:true}:{})};
  });
  p.rows=rows.map(row=>{
    const out={x:row.x,y:row.y,_seriesKey:bySeries.get(seriesField?row[seriesField]:'Series 1')};
    if(axis){
      if(positioned&&row[axis]===null)out._curvePosition=row[axis+'_id'];
      else out._categoryKey=byCategory.get(row[enc[axis].field]);
    }
    return out;
  });
  ensureIdentities(p);
  if(axis){
    const observed=new Set(p.rows.filter(row=>row._categoryKey).map(row=>
      smoothTargetKey({category:row._categoryKey,series:identity(row)})));
    p.smoothSkipped={};
    for(const category of p.categoryObjects)for(const series of p.series){
      const key=smoothTargetKey({category:category.key,series:series.key});
      if(!observed.has(key))p.smoothSkipped[key]=true;
    }
  }
  const errors=validate(p).filter(issue=>issue.severity==='error');
  if(errors.length)throw Error(errors.map(issue=>issue.message).join('\n'));
  return p;
}

function styleSmoothPreview(spec){
  for(const channel of ['x','y'])spec.encoding[channel].title??=null;
  const positioned=smoothPositionAxis(spec);
  const axis=positioned??['x','y'].find(channel=>nominalType(spec.encoding[channel].type));
  if(axis&&(positioned||spec.usermeta?.[axis+'_labels']?.length)){
    const def=spec.encoding[axis];
    const labels=smoothCategories(spec,axis,!!positioned);
    const used=new Set(labels.filter(entry=>!entry.missing).map(entry=>entry.key));
    const values=labels.map(entry=>{
      if(positioned)return entry.position;
      if(!entry.missing)return entry.key;
      let key='__smooth_missing_'+entry.position;
      while(used.has(key))key='_'+key;
      used.add(key);
      return key;
    });
    def.axis={...def.axis,values,
      labelExpr:JSON.stringify(labels.map(entry=>entry.label))+'[indexof('+JSON.stringify(values)+',datum.value)]'};
    if(positioned){
      const domain=[Infinity,-Infinity];
      for(const position of [...spec.data.values.map(row=>row[def.field]),...values]){
        domain[0]=Math.min(domain[0],position);domain[1]=Math.max(domain[1],position);
      }
      def.scale={...def.scale,zero:false,domain,...(axis==='y'?{reverse:true}:{})};
    }else def.scale={...def.scale,domain:values};
  }
  if(verticalSmooth(spec))spec.mark.orient='horizontal';
  return spec;
}

function compileStudioVega(spec,compiler){
  const native=compiler.compile(spec).spec;
  if(verticalSmooth(spec)){
    // Vega-Lite uses orient for sort but omits it from the line item. Vega needs it for MonotoneY.
    const orient=marks=>{
      for(const mark of marks??[]){
        if(mark.type==='line')mark.encode.update.orient={value:'horizontal'};
        orient(mark.marks);
      }
    };
    orient(native.marks);
  }
  return native;
}

function smoothAnchorProfile(p){
  const categories=p.categoryObjects;
  if(categories.length<2||categories.some((category,index)=>!finite(category.curvePixel)||
      index>0&&category.curvePixel<=categories[index-1].curvePixel))
    throw Error('请先从左到右或从上到下定位所有类别刻度（至少两个）');
  const origin=categories[0].curvePixel,unit=categories[1].curvePixel-origin;
  const profile=categories.map((category,i)=>({
    category,pixel:category.curvePixel,position:category.curvePosition??i,
    raw:category.curveFixedPosition?category.curvePosition:
      category.curveRawPosition??(category.curvePixel-origin)/unit
  }));
  if(profile.some((item,index)=>!finite(item.raw)||!finite(item.position)||
      index>0&&(item.raw<=profile[index-1].raw||item.position<=profile[index-1].position)))
    throw Error('类别的连续位置必须严格递增，请复核定位');
  return profile;
}

function roundSmoothPosition(value,places=2){
  if(!finite(value))throw Error('采样位置超出数值范围，请复核');
  return roundMeasurementAt(value,decimalParts(value),-places)||0;
}

function sampleSmoothPosition(profile,pixel){
  const closest=profile.reduce((best,item)=>Math.abs(item.pixel-pixel)<Math.abs(best.pixel-pixel)?item:best);
  if(Math.abs(closest.pixel-pixel)<=1)return {category:closest.category,position:closest.position};
  const right=profile.findIndex(item=>item.pixel>pixel),index=right<0?profile.length-2:Math.max(0,right-1);
  const a=profile[index],b=profile[index+1];
  const raw=a.raw+(pixel-a.pixel)/(b.pixel-a.pixel)*(b.raw-a.raw);
  return {category:null,raw,position:roundSmoothPosition(raw)};
}

// Refine only competing IDs. A single new ID should move first when that can
// preserve the exact ordering against the already saved ID.
function refineSmoothPosition(entry,accept){
  if(!entry.refinable||!accept(entry.raw))return false;
  for(let places=entry.places+1;places<=entry.limit;places++){
    const candidate=roundSmoothPosition(entry.raw,places);
    if(!accept(candidate))continue;
    entry.id=candidate;
    entry.places=places;
    return true;
  }
  return false;
}

function allocateSmoothPositions(entries){
  for(const entry of entries){
    entry.pending=entry.id===undefined;
    if(entry.pending)entry.id=roundSmoothPosition(entry.raw);
    entry.places??=Math.max(2,-decimalParts(entry.id).exponent);
    entry.limit=Math.max(2,-decimalParts(entry.raw).exponent);
  }
  entries.sort((a,b)=>a.raw-b.raw);
  for(let i=1;i<entries.length;i++){
    if(entries[i-1].raw===entries[i].raw)
      throw Error('该位置已有采样点或类别刻度，请修改已有记录');
  }
  for(let i=1;i<entries.length;){
    const left=entries[i-1],right=entries[i];
    if(left.id<right.id){i++;continue;}
    const refineLeft=()=>refineSmoothPosition(left,id=>id<right.id);
    const refineRight=()=>refineSmoothPosition(right,id=>id>left.id);
    if(!(right.pending&&refineRight()||left.pending&&refineLeft()||refineRight()||refineLeft()||
        refineSmoothPosition(left,id=>id<left.id)||refineSmoothPosition(right,id=>id>right.id)))
      throw Error('采样位置与同系列观测或类别刻度重合，请复核位置');
    i=Math.max(1,i-1);
  }
}

function projectSmoothSamplePositions(p,rows){
  const bySeries=new Map();
  const categories=p.categoryObjects;
  const unit=categories[1]?.curvePixel-categories[0]?.curvePixel;
  const reserved=categories.map((category,i)=>{
    const id=category.curvePosition??i;
    const raw=category.curveRawPosition??(category.curveFixedPosition||!(unit>0)||!finite(category.curvePixel)?
      id:(category.curvePixel-categories[0].curvePixel)/unit);
    return {category,id,raw,originalID:id,refinable:!category.curveFixedPosition&&raw!==id};
  });
  for(const row of rows){
    if(!freeSmoothRow(p,row))continue;
    const key=identity(row);
    if(!bySeries.has(key))bySeries.set(key,[]);
    const refinable=finite(row._curveRawPosition);
    bySeries.get(key).push({row,refinable,id:row._curvePosition,
      raw:refinable?row._curveRawPosition:row._curvePosition});
  }
  // A rounded tick that must gain precision is shared by every series.
  // Recheck series already projected against its previous ID.
  let previous;
  do{
    previous=reserved.map(entry=>entry.id);
    for(const samples of bySeries.values())allocateSmoothPositions([...reserved,...samples]);
  }while(reserved.some((entry,i)=>entry.id!==previous[i]));
  return {samples:[...bySeries.values()].flat(),categories:reserved};
}
function applySmoothSamplePositions(projection){
  for(const {row,id} of projection.samples)row._curvePosition=id;
  for(const {category,id,originalID} of projection.categories){
    if(id!==originalID)category.curvePosition=id;
  }
}

function refreshSmoothPositions(p){
  const axis=discreteSmooth(p),cats=p.categoryObjects;
  if(!axis||cats.length<2||cats.some((c,i)=>!finite(c.curvePixel)||i&&c.curvePixel<=cats[i-1].curvePixel))return;
  const origin=cats[0].curvePixel,unit=cats[1].curvePixel-origin;
  const entries=cats.map(category=>({category,refinable:!category.curveFixedPosition,
    id:category.curveFixedPosition?category.curvePosition:undefined,
    raw:category.curveFixedPosition?category.curvePosition:(category.curvePixel-origin)/unit}));
  allocateSmoothPositions(entries);
  for(const {category,raw,id} of entries){
    category.curveRawPosition=raw;
    category.curvePosition=id;
  }
  const profile=smoothAnchorProfile(p);
  if(profile.some((item,i)=>item.position!==i))p.smoothPositioned=true;
  for(const [i,row] of p.rows.entries()){
    const pixel=p.evidence?.[i]?.pixel;
    if(!pixel)continue;
    if(freeSmoothRow(p,row)){
      const sample=sampleSmoothPosition(profile,pixel[axis]);
      if(sample.category)throw Error('重新定位后自由采样点与类别刻度重合，请移动该点再标定');
      row._curveRawPosition=sample.raw;
      row._curvePosition=undefined;
    }
  }
  applySmoothSamplePositions(projectSmoothSamplePositions(p,p.rows));
}

function smoothPointData(pt){
  const axis=discreteSmooth(p),sample=sampleSmoothPosition(smoothAnchorProfile(p),pt[axis]);
  calibrated();
  const numeric=otherAxis(axis);
  return {[axis]:sample.category?.name??null,[numeric]:measureProjectAxis(p,numeric,pt[numeric]),
    _categoryKey:sample.category?.key,_curveRawPosition:sample.raw,_curvePosition:sample.position};
}
function smoothFreeData(pt){
  const data=smoothPointData(pt);
  if(data._categoryKey)throw Error('此处是类别刻度，请在固定点标注阶段编辑该位置');
  return {...data,_curvePosition:undefined};
}
function editSmoothFreePoint(index,pt){
  const row=p.rows[index],draft={...row,...smoothFreeData(pt)};
  if(draft._curveRawPosition===row._curveRawPosition)draft._curvePosition=row._curvePosition;
  const rows=p.rows.map(entry=>entry===row?draft:entry);
  const projection=projectSmoothSamplePositions(p,rows);
  applySmoothSamplePositions(projection);
  Object.assign(row,draft);
  p.evidence[index].pixel=pt;
}

function smoothInsertionIndex(project,row){
  const positions=smoothCategoryPositions(project);
  const samples=project.rows.map((sample,i)=>({sample,i})).filter(entry=>identity(entry.sample)===identity(row));
  if(samples.length<2)return samples.length?samples[0].i+1:project.rows.length;
  const position=smoothRowPosition(project,row,positions);
  const first=smoothRowPosition(project,samples[0].sample,positions);
  const last=smoothRowPosition(project,samples.at(-1).sample,positions);
  const direction=Math.sign(last-first)||1;
  return samples.find(({sample})=>direction*(smoothRowPosition(project,sample,positions)-position)>0)?.i??
    samples.at(-1).i+1;
}

function appendSmoothSample(row,evidence,insert=false){
  const index=insert?smoothInsertionIndex(p,row):p.rows.length;
  p.evidence??=[];
  while(p.evidence.length<p.rows.length)p.evidence.push(null);
  p.rows.splice(index,0,row);p.evidence.splice(index,0,evidence);
  selected=index;selectedHandle='pixel';
}
function recordSmoothPoint(raw,insert=false){
  const a=assist(),axis=discreteSmooth(p);
  if(axis){recordDiscreteSmoothPoint(raw,a,axis);return;}
  const pt=constrainAdd(raw),data=measureAt(pt);
  const row={...data,series:seriesName(p,a.series),_seriesKey:a.series};
  const evidence={pixel:pt,role:$('role').value,source:'pixel_measurement',
    ...(a.lockX?{fixedX:{value:a.fixedXValue,pixel:pt.x}}:{})};
  change(()=>{
    appendSmoothSample(row,evidence,insert);
    if(insert)setTool('point');
  });
}

function recordDiscreteSmoothPoint(raw,target,axis){
  const pt=bounded(raw),numeric=otherAxis(axis);
  if(freeSmoothPhase(p)){
    const data=smoothFreeData(pt),row={...data,series:seriesName(p,target.series),_seriesKey:target.series};
    const projection=projectSmoothSamplePositions(p,[...p.rows,row]);
    change(()=>{
      applySmoothSamplePositions(projection);
      p.smoothPositioned=true;
      appendSmoothSample(row,{pixel:pt,role:'curve_sample',source:'pixel_measurement'});
    });
    return;
  }
  calibrated();
  const anchor=smoothAnchorProfile(p).find(item=>item.category.key===target.category);
  if(!anchor)throw Error('请选择待标注的类别');
  const index=targetIndex(target);
  if(smoothTargetSkipped(p,target))throw Error('请先取消跳过该目标，再标注固定点');
  if(finite(p.rows[index]?.[numeric]))throw Error('该系列在此类别已有固定点，请前往待标目标或编辑记录');
  pt[axis]=anchor.pixel;
  const value=measureProjectAxis(p,numeric,pt[numeric]);
  const evidence={pixel:pt,role:'observation',source:'pixel_measurement'};
  change(()=>{
    if(index<0)appendSmoothSample({[axis]:anchor.category.name,[numeric]:value,
      series:seriesName(p,target.series),_seriesKey:target.series,_categoryKey:target.category},evidence);
    else{
      const row=p.rows[index];
      row[numeric]=value;clearMeasuredField(row,numeric);
      (p.evidence??=[])[index]=evidence;
      selected=index;selectedHandle='pixel';
    }
    nextTarget();
  });
}
function addManualSmoothRow(){
  const a=assist(),axis=discreteSmooth(p);
  if(freeSmoothPhase(p)){toast('自由采样时请直接在原图点击取点');return;}
  if(axis&&!a.category){toast('请先添加并选择类别');return;}
  const row={x:null,y:null,_seriesKey:a.series,series:seriesName(p,a.series)};
  if(axis){
    const index=targetIndex(a);
    if(index>=0){selected=index;refresh();return;}
    row[axis]=categoryName(p,a.category);row._categoryKey=a.category;
  }
  change(()=>{
    if(axis&&p.smoothSkipped)delete p.smoothSkipped[smoothTargetKey(a)];
    appendSmoothSample(row,{role:'transcribed',source:'manual_entry'});
  });
  document.querySelector(`[data-i="${selected}"][data-key="${axis?otherAxis(axis):'x'}"]`)?.focus();
}
function editSmoothPositionCell(index,input){
  const row=p.rows[index],raw=input.value.trim(),position=Number(raw);
  if(!freeSmoothRow(p,row))return;
  if(!raw||!finite(position)){toast('请输入有限的采样位置');table();return;}
  change(()=>{
    const saved=position===(row._curveRawPosition??row._curvePosition)?row._curvePosition:undefined;
    const draft={...row,_curvePosition:saved,_curveRawPosition:position};
    const projection=projectSmoothSamplePositions(p,p.rows.map(entry=>entry===row?draft:entry));
    applySmoothSamplePositions(projection);
    Object.assign(row,draft);
    const evidence=p.evidence?.[index];
    if(evidence?.pixel)delete evidence.pixel;
  });
  table();
}

function editSmoothTarget(index,object,key){
  change(()=>{
    const row=p.rows[index],axis=discreteSmooth(p),draft={...row};
    if(object==='category'){
      if(freeSmoothRow(p,row))return;
      draft._categoryKey=key;
      draft[axis]=categoryName(p,key);
    }else{
      draft._seriesKey=key;
      draft.series=seriesName(p,key);
    }
    const target={series:identity(draft),category:draft._categoryKey};
    if(target.category&&p.rows.some((entry,i)=>i!==index&&entry._categoryKey===target.category&&identity(entry)===target.series))
      throw Error('该类别和系列已有固定点');
    applySmoothSamplePositions(projectSmoothSamplePositions(p,p.rows.map(entry=>entry===row?draft:entry)));
    Object.assign(row,draft);
    if(object==='category'&&p.evidence?.[index]?.pixel)delete p.evidence[index].pixel;
    if(target.category&&p.smoothSkipped)delete p.smoothSkipped[smoothTargetKey(target)];
  });
  table();
}

function editSmoothValue(index,field,raw,scale){
  change(()=>{
    const row=p.rows[index],target=assist();
    const prev=finite(row[field]),value=raw.trim()===''?null:Number(raw);
    recordTablePercent(row,field,scale);
    row[field]=value;
    (p.evidence??=[])[index]={role:'transcribed',source:'manual_edit'};
    if(!freeSmoothPhase(p)&&!prev&&finite(value)&&
        row._categoryKey===target.category&&identity(row)===target.series)nextTarget();
  });
}

function syncSmoothForm(){
  const smooth=isSmoothLine(p),axis=discreteSmooth(p);
  $('smoothControls').hidden=!smooth;
  $('smoothStageButtons').hidden=!axis;
  $('smoothInsertPoint').hidden=!!axis;
  if(!smooth)return;
  $('tableNote').textContent='取点保留原图端点、峰谷和曲率变化位置。断点和尖角可标记待复核。';
}

function syncSmoothAssist(){
  const axis=discreteSmooth(p),free=freeSmoothPhase(p);
  $('lockCategory').closest('label').hidden=!!axis;
  if(!isSmoothLine(p))return;
  $('advancedFieldsLabel').hidden=true;
  $('smoothReviewPoint').disabled=selected<0;
  $('smoothReviewPoint').textContent=p.rows[selected]?._curveReview?'清除此点的待复核标记':'标记断点或尖角待复核';
  $('smoothAnchorList').hidden=!axis||free;
  $('smoothSkipTarget').hidden=!axis||free;
  if(axis){
    const target=assist(),pairs=targetPairs(),positions=smoothCategoryPositions(p,true);
    $('smoothFixedPhase').setAttribute('aria-pressed',String(!free));
    $('smoothFreePhase').setAttribute('aria-pressed',String(free));
    $('activeCategoryLabel').hidden=free;
    $('sequenceLabel').hidden=true;
    $('categoryLock').hidden=free;
    if(free){
      $('nextTarget').hidden=$('targetGrid').hidden=true;
      $('targetTop').textContent=$('targetHint').textContent='自由采样 · '+seriesName(p,target.series);
      $('targetProgress').textContent=p.rows.filter(row=>freeSmoothRow(p,row)&&identity(row)===target.series).length+' 个自由采样点';
      $('hint').textContent='选择系列后直接点击曲线，采样位置会自动计算和排序。';
    }else{
      const skipped=smoothTargetSkipped(p,target);
      $('smoothSkipTarget').textContent=skipped?'取消跳过当前目标':'跳过当前目标';
      $('smoothSkipTarget').disabled=!target.category||!target.series||
        !skipped&&finite(p.rows[targetIndex(target)]?.[otherAxis(axis)]);
      const done=pairs.filter(item=>smoothFixedDone(p,item)).length;
      $('targetProgress').textContent=`固定点 ${done} / ${pairs.length} 已处理`;
      $('hint').textContent=tool==='anchor'?'点击原图标定当前类别刻度。':
        pairs.length&&pairs.length===done?'固定点已处理，可直接导出或进入自由采样。':
          '先校准连续轴和类别刻度，再点击原图记录当前固定点。';
      $('smoothAnchorList').innerHTML=p.categoryObjects.map(category=>
        `<span>${esc(category.name)} · ${finite(category.curvePixel)?positions.get(category.key):'未定位'}</span>`).join(' · ');
    }
  }
  if(tool==='curve-insert')$('hint').textContent='点击原图，在当前系列的路径中插入采样点。';
}
function bindSmoothTools(){
  $('smoothFixedPhase').onclick=()=>{
    if(freeSmoothPhase(p))change(()=>{p.smoothPhase='fixed';});
    setTool(image?'point':'select');
  };
  $('smoothFreePhase').onclick=()=>{
    try{
      if(!image)throw Error('请先加载原图');
      calibrated();
      smoothAnchorProfile(p);
      if(!targetPairs().every(target=>smoothFixedDone(p,target)))throw Error('请标注或跳过所有固定点，再进入自由采样');
      if(!freeSmoothPhase(p))change(()=>{p.smoothPhase='free';});
      setTool('point');
    }catch(error){toast(error.message);}
  };
  $('smoothSkipTarget').onclick=()=>change(()=>{
    const target=assist(),key=smoothTargetKey(target),index=targetIndex(target);
    if(!target.category||!target.series)return;
    const skipped=p.smoothSkipped??={};
    if(skipped[key]){delete skipped[key];return;}
    if(finite(p.rows[index]?.[otherAxis(discreteSmooth(p))]))throw Error('该目标已有固定点，请先删除该记录');
    if(index>=0){p.rows.splice(index,1);p.evidence?.splice(index,1);selected=-1;}
    skipped[key]=true;
    nextTarget();
  });
  $('smoothInsertPoint').onclick=()=>{if(!image)toast('请先加载原图');else setTool('curve-insert');};
  $('smoothReviewPoint').onclick=()=>{
    if(selected<0)return;
    change(()=>{
      const row=p.rows[selected];
      if(row._curveReview)delete row._curveReview;
      else row._curveReview=true;
    });
  };
}
