// Scientific data, original-image measurement and native Vega preview for Radar Compact GT.
function newRadarState(){
  return {center:null,centerMode:'manual',centerPoints:[],anchor:null,tickPoints:[null,null],
    tickValues:[null,null],centerZero:false,domain:[0,100],orders:{},skips:{}};
}
const radarTargetKey=(category,series)=>JSON.stringify([category,series]);
const radarSkip=(p,category,series)=>p.radar.skips[radarTargetKey(category,series)];
function radarSeriesOrder(p,category){
  const keys=p.series.map(s=>s.key);
  return unique([...(p.radar.orders[category]??[]).filter(key=>keys.includes(key)),...keys]);
}
function radarRows(p,category){
  const rows=new Map(p.rows.filter(row=>categoryIdentity(row)===category).map(row=>[identity(row),row]));
  return radarSeriesOrder(p,category).map(key=>rows.get(key)).filter(Boolean);
}
function detachRadarBoundaries(p,category){
  if(!isRadarStack(p))return;
  p.rows.forEach((row,i)=>{
    if(categoryIdentity(row)===category&&p.evidence?.[i]?.pixel)
      p.evidence[i]={role:'transcribed',source:'manual_edit'};
  });
}
function radarDistance(point,center){return Math.hypot(point.x-center.x,point.y-center.y);}
function radarCalibration(p){
  const r=p.radar;
  if(!r.center)throw Error('请先定位雷达图圆心');
  const [first,second]=r.tickPoints,[firstValue,v2]=r.tickValues;
  const v1=r.centerZero?0:firstValue;
  if(!second||!r.centerZero&&!first||!finite(v1)||!finite(v2))throw Error('请取两个已知径向刻度并填写数值');
  const r1=r.centerZero?0:radarDistance(first,r.center),r2=radarDistance(second,r.center);
  if(Math.abs(r2-r1)<1)throw Error('两个刻度的径向距离须至少相差 1 个原图像素');
  if(v1===v2||(v2>v1)!==(r2>r1))throw Error('径向刻度数值须由内到外递增');
  const axis={p1:r1,p2:r2,v1,v2,type:'linear'};
  if(isPolarBar(p)){
    const zero=pixelToValue(0,axis);
    const tolerance=Math.abs((v2-v1)/(r2-r1)); // One source pixel at the measured scale.
    if(!finite(zero)||Math.abs(zero)>tolerance)throw Error('极坐标柱状图只支持圆心为零，请检查径向刻度或使用圆心零值');
  }
  return axis;
}

function radarObservationValue(p,row){
  return row._percentData?.value&&!percentLabels(p,'y')?shiftDecimal(row.value,-2):row.value;
}
function recalculateRadar(p,category){
  let axis;
  try{axis=radarCalibration(p);}catch{return;}
  const byRow=new Map(p.rows.map((row,i)=>[row,p.evidence?.[i]]));
  const percent=percentLabels(p,'y'),[min,max]=p.radar.domain;
  const quantize=value=>quantizeMeasurement(value,{percent,computed:true});
  if(!finite(min)||!finite(max)||min>=max)return;
  const tolerance=Number.EPSILON*16*Math.max(Math.abs(min),Math.abs(max));
  for(const cat of p.categoryObjects){
    if(category&&cat.key!==category)continue;
    let start=0,known=true;
    const rows=new Map(radarRows(p,cat.key).map(row=>[identity(row),row]));
    for(const key of radarSeriesOrder(p,cat.key)){
      const row=rows.get(key),evidence=byRow.get(row);
      if(!row){
        if(radarSkip(p,cat.key,key)!=='absent')known=false;
        continue;
      }
      if(!evidence?.pixel){
        const value=radarObservationValue(p,row);
        if(finite(value))start=decimalDifference(start,-value);
        else known=false;
        continue;
      }
      const distance=radarDistance(evidence.pixel,p.radar.center);
      const raw=pixelToValue(distance,axis);
      const end=raw<min&&min-raw<=tolerance?min:raw>max&&raw-max<=tolerance?max:raw;
      let issue='',value=null;
      if(!finite(end)||end<min||end>max)issue='测量值超出径向量程';
      else if(isRadarStack(p)){
        evidence.start=known?start:null;
        evidence.end=end;
        if(!known)issue='前一段边界待复核';
        else if(end<=start)issue='外边界须位于内边界之外，明确的零值请手填';
        else{
          value=quantize(decimalDifference(end,start));
          if(value===0){value=null;issue='舍入会抹去正堆叠段，请复核并手填';}
        }
      }else{
        value=distance===axis.p1||distance===axis.p2?end:quantize(end);
        if(isPolarBar(p)&&value===0){value=null;issue='明确的零值请手填，请复核该柱';}
      }
      row.value=value;
      evidence.issue=issue;
      if(isRadarStack(p)){
        if(finite(value))start=end;
        else known=false;
      }
    }
  }
}

function validateRadar(p){
  const issues=[];
  const error=message=>issues.push({severity:'error',message});
  try{checkRadarProject(p);}catch(e){return [{severity:'error',message:e.message}];}
  const {domain}=p.radar;
  const stacked=isRadarStack(p),categories=p.categoryObjects.map(c=>c.name),series=p.series.map(s=>s.name);
  const namesValid=names=>names.every(name=>typeof name==='string'&&name.trim())&&new Set(names).size===names.length;
  if(categories.length<3||!namesValid(categories))error('雷达图至少需要三个不同且非空的类别名称');
  if(!namesValid(series)||(isSingleRadar(p)?series.length!==1:series.length<(stacked?1:2)))
    error('系列数量与子类不符，系列名称须非空且唯一');
  const [min,max]=domain;
  const domainValid=domain.length===2&&finite(min)&&finite(max)&&min<max&&finite(max-min)&&(!isPolarBar(p)||min===0);
  if(!domainValid)error(isPolarBar(p)?'极坐标柱状图量程须从零开始且上限大于零':'径向量程须使用两个递增的有限数值');
  if(p.evidence?.some(evidence=>evidence?.pixel)){
    try{radarCalibration(p);}catch(e){error(e.message);}
  }
  if(p.kind==='polar_bar_n'&&p.series.some(s=>!p.rows.some(row=>identity(row)===s.key)))
    error('每个分组系列至少需要一条观测，才能在 Compact GT 中确定系列角度位置');
  const seen=new Set();
  p.rows.forEach((row,i)=>{
    const key=radarTargetKey(categoryIdentity(row),identity(row));
    if(seen.has(key))error('同一雷达类别和系列只允许一条数值');
    seen.add(key);
    if(p.evidence?.[i]?.issue)error(`第 ${i+1} 行待复核：${p.evidence[i].issue}`);
    if(!finite(row.value))error(`第 ${i+1} 行待复核：请填写或测量数值`);
    else if(domainValid&&(row.value<min||row.value>max))error(`第 ${i+1} 行数值超出径向量程`);
  });
  for(const category of p.categoryObjects){
    const missing=p.series.filter(s=>!seen.has(radarTargetKey(category.key,s.key))&&
      (!isPolarBar(p)||radarSkip(p,category.key,s.key)!=='absent'));
    if(missing.length)error(`${category.name} 待复核：${missing.map(s=>s.name).join('、')} 缺少数值`);
    if(stacked&&domainValid){
      const total=radarRows(p,category.key).filter(row=>finite(row.value))
        .reduce((sum,row)=>decimalDifference(sum,-row.value),0);
      if(total>max)error(`${category.name} 的累计数值超出径向量程，请复核各段数值`);
    }
  }
  return issues;
}

function makeRadarSpec(p,observation){
  const stacked=isRadarStack(p),polar=isPolarBar(p),withSeries=!isSingleRadar(p)||p.legend;
  const values=p.categoryObjects.flatMap(cat=>radarRows(p,cat.key).map((row,i)=>observation({
    category:row.category,value:row.value,...(stacked?{stack_order:i+1}:{}),...(withSeries?{series:row.series}:{})
  },row)));
  return {...(present(p.title)?{title:copy(p.title)}:{}),data:{values},mark:{type:polar?'bar':'line'},encoding:{
    x:{field:'category',type:'nominal',sort:p.categoryObjects.map(cat=>cat.name)},
    y:{field:'value',type:'quantitative',title:null,scale:{domain:[...p.radar.domain]},...(stacked?{stack:'zero'}:{})},
    ...(withSeries?{color:{field:'series',type:'nominal'}}:{}),
    ...(stacked?{order:{field:'stack_order',type:'quantitative'}}:{})
  },usermeta:{chartType:polar?'polar_bar':'radar'}};
}

function importRadarSpec(spec,percentAxis){
  const enc=spec.encoding??{}, {x,y,color,order}=enc, stacked=y?.stack==='zero';
  const polar=spec.usermeta.chartType==='polar_bar',legacyStack=!polar&&stacked;
  const rows=spec.data?.values,categories=x?.sort;
  const allow=(object,keys)=>object&&Object.keys(object).every(key=>keys.includes(key));
  if(!allow(spec,['$schema','title','data','mark','encoding','usermeta'])||!allow(spec.data,['values'])||
      !allow(enc,['x','y','color','order'])||!allow(spec.mark,['type'])||spec.mark.type!==(polar?'bar':'line')||
      x?.field!=='category'||x.type!=='nominal'||!allow(x,['field','type','sort'])||!Array.isArray(categories)||
      y?.field!=='value'||y.type!=='quantitative'||y.title!==null||!allow(y,['field','type','title','scale','stack','axis'])||
      !allow(y.scale,['domain'])||!Array.isArray(y.scale.domain)||!Array.isArray(rows)||!rows.length||
      color&&(color.field!=='series'||color.type!=='nominal'||!allow(color,['field','type','legend'])||
        Object.hasOwn(color,'legend')&&color.legend!==null)||
      (stacked?(!color||(!legacyStack||order)&&
        (order?.field!=='stack_order'||order.type!=='quantitative'||!allow(order,['field','type']))):
        (Object.hasOwn(y,'stack')||order)))throw Error('极坐标图须使用合法的 Compact 标记、顺时针类别顺序和共享线性量程');
  const columns=['category','value',...(color?['series']:[]),...(stacked?['stack_order']:[])];
  if(rows.some(row=>!allow(row,columns)||columns.some(key=>!Object.hasOwn(row,key))||!categories.includes(row.category)||
      !finite(row.value)))throw Error('雷达图观测字段或类别无效');
  const names=color?radarSeriesNames(rows,categories,!stacked):['Series 1'];
  const p=defaultProject(stacked?'polar_bar_stack':polar?(names.length>1?'polar_bar_n':'polar_bar_1'):
    names.length>1?'radar_n':'radar_1');
  p.title=spec.title??'';
  p.legend=!!color&&color.legend!==null;
  p.percentLabels=percentAxis?{y:true}:{};
  p.radar.domain=y.scale.domain.map(value=>percentAxis&&finite(value)?shiftDecimal(value,2):value);
  p.categories=[...categories];delete p.categoryObjects;
  p.series=names.map((name,i)=>({name,color:SERIES_COLORS[i%SERIES_COLORS.length]}));
  p.rows=rows.map(({category,value,series})=>({category,value,series:series??names[0]}));
  ensureIdentities(p);
  if(isPolarBar(p)){
    for(const cat of p.categoryObjects){
      const order=rows.filter(row=>row.category===cat.name);
      if(stacked)order.sort((a,b)=>a.stack_order-b.stack_order);
      if(stacked&&order.some((row,i)=>row.stack_order!==i+1))throw Error('各类别的 stack_order 须从 1 连续编号');
      const keys=new Map(p.series.map(s=>[s.name,s.key]));
      if(stacked)p.radar.orders[cat.key]=order.map(row=>keys.get(row.series));
      for(const s of p.series)if(!order.some(row=>row.series===s.name))p.radar.skips[radarTargetKey(cat.key,s.key)]='absent';
    }
  }
  const errors=validate(p).filter(issue=>issue.severity==='error');
  if(errors.length)throw Error(errors.map(issue=>issue.message).join('\n'));
  return p;
}

// Category-local row order carries series order even if an earlier category is sparse.
function radarSeriesNames(rows,categories,ordered){
  const names=unique(rows.map(row=>row.series??''));
  if(!ordered)return names;
  const before=new Map(names.map(name=>[name,new Set()]));
  for(const category of categories){
    const group=rows.filter(row=>row.category===category).map(row=>row.series??'');
    group.slice(1).forEach((name,i)=>{if(name!==group[i])before.get(name).add(group[i]);});
  }
  const remaining=new Set(names),result=[];
  while(remaining.size){
    const next=names.find(name=>remaining.has(name)&&[...before.get(name)].every(prev=>!remaining.has(prev)));
    if(next===undefined)return names;
    result.push(next);
    remaining.delete(next);
  }
  return result;
}

function checkRadarProject(p){
  const r=p.radar,point=value=>value===null||finite(value?.x)&&finite(value?.y);
  const pair=values=>Array.isArray(values)&&values.length===2;
  const dictionary=value=>value&&typeof value==='object'&&!Array.isArray(value);
  if(!r||!point(r.center)||!point(r.anchor)||!['manual','lines'].includes(r.centerMode)||
      !Array.isArray(r.centerPoints)||r.centerPoints.length>4||r.centerPoints.some(value=>!value||!point(value))||
      !pair(r.tickPoints)||!r.tickPoints.every(point)||!pair(r.tickValues)||!pair(r.domain)||
      [...r.tickValues,...r.domain].some(value=>value!==null&&!finite(value))||
      typeof r.centerZero!=='boolean'||!dictionary(r.orders)||!Object.values(r.orders).every(Array.isArray)||
      !dictionary(r.skips)||Object.values(r.skips).some(state=>!['absent','review'].includes(state))||
      p.evidence!==undefined&&(!Array.isArray(p.evidence)||p.evidence.some(e=>e?.pixel&&!point(e.pixel))))
    throw Error('极坐标图工程的圆心、校准或堆叠记录无效');
  return p;
}

function migrateRadarProject(p){
  if(p.kind!=='radar_stack')return;
  p.kind='polar_bar_stack';
  p.radar={...newRadarState(),...p.radar};
  ensureIdentities(p);
  for(const cat of p.categoryObjects){
    if(p.radar.orders[cat.key])continue;
    const rows=p.rows.filter(row=>categoryIdentity(row)===cat.key)
      .sort((a,b)=>(a.stack_order??Infinity)-(b.stack_order??Infinity));
    p.radar.orders[cat.key]=rows.map(identity);
    if(rows.some(row=>Number.isInteger(row.stack_order))){
      for(const s of p.series)if(!rows.some(row=>identity(row)===s.key))
        p.radar.skips[radarTargetKey(cat.key,s.key)]??='absent';
    }
  }
}

function radarAngle(index,count,rotation=-Math.PI/2){return rotation+index*2*Math.PI/count;}

function radarPreview(compact,project){
  const {x,y,color}=compact.encoding, categories=x.sort, [minimum,maximum]=y.scale.domain;
  const polar=compact.usermeta.chartType==='polar_bar'||y.stack==='zero';
  const stacked=y.stack==='zero',count=categories.length,center=120,radius=88;
  const series=radarSeriesNames(compact.data.values,categories,!stacked);
  const radial=value=>(value-minimum)/(maximum-minimum)*radius;
  const value=v=>({value:v}),field=name=>({field:name});
  const position=(r,angle)=>({x:center+r*Math.cos(angle),y:center+r*Math.sin(angle)});
  const observations=[],spokes=[],rings=[],labels=[];
  categories.forEach((category,index)=>{
    const angle=radarAngle(index,count),categoryRows=compact.data.values.filter(row=>row.category===category);
    const halfWidth=Math.PI/count*.78;
    let cumulative=0;
    for(const row of stacked?categoryRows.sort((a,b)=>a.stack_order-b.stack_order):categoryRows){
      const low=cumulative;
      if(stacked)cumulative=decimalDifference(cumulative,-row.value);
      const high=stacked?cumulative:row.value,seriesKey=row.series??'';
      const width=2*halfWidth/(stacked?1:series.length);
      const startAngle=angle+Math.PI/2-halfWidth+(stacked?0:series.indexOf(seriesKey)*width);
      observations.push({...row,...position(radial(high),angle),angleIndex:index,seriesKey,
        ...(polar?{innerRadius:stacked?radial(low):0,outerRadius:radial(high),
          startAngle,endAngle:startAngle+width*(stacked||series.length===1?1:.9)}:{})});
    }
    const edge=position(radius,angle);
    spokes.push({x:center,y:center,x2:edge.x,y2:edge.y});
    labels.push({...position(radius+11,angle),category,
      align:Math.abs(Math.cos(angle))<.1?'center':Math.cos(angle)<0?'right':'left'});
    for(let ring=1;ring<=4;ring++)rings.push({...position(radius*ring/4,angle),ring,angleIndex:index});
  });
  const ticks=Array.from({length:5},(_,i)=>({x:center+4,y:center-radius*i/4,
    value:minimum+(maximum-minimum)*(i/4)}));
  const seriesColor={scale:'radarColor',field:'seriesKey'};
  const fill=project?series.map(name=>project.series.find(s=>s.name===name)?.color??project.series[0]?.color):[];
  const outline={type:'group',from:{facet:{name:'radarSeries',data:'observations',groupby:'seriesKey'}},marks:[
    {type:'line',from:{data:'radarSeries'},sort:{field:'angleIndex'},encode:{enter:{
      x:field('x'),y:field('y'),interpolate:value('linear-closed'),stroke:seriesColor,strokeWidth:value(2)}}}
  ]};
  const arcs={type:'arc',from:{data:'observations'},encode:{enter:{
    x:value(center),y:value(center),innerRadius:field('innerRadius'),outerRadius:field('outerRadius'),
    startAngle:field('startAngle'),endAngle:field('endAngle'),fill:seriesColor,stroke:value('#ffffff'),strokeWidth:value(.6)}}};
  const text=(name,extra)=>({type:'text',from:{data:name},encode:{enter:{
    x:field('x'),y:field('y'),baseline:value('middle'),...extra}}});
  const format=y.axis?.format??'~g';
  return {$schema:'https://vega.github.io/schema/vega/v6.json',width:240,height:240,padding:38,
    ...(present(compact.title)?{title:compact.title}:{}),
    data:Object.entries({observations,spokes,rings,labels,ticks}).map(([name,values])=>({name,values})),
    scales:[{name:'radarColor',type:'ordinal',domain:series,range:fill.length&&fill.every(Boolean)?fill:{scheme:'tableau10'}}],
    ...(color&&(project?project.legend:color.legend!==null)?{legends:[{[polar?'fill':'stroke']:'radarColor'}]}:{}),
    marks:[
      {type:'group',from:{facet:{name:'radarRing',data:'rings',groupby:'ring'}},marks:[
        {type:'line',from:{data:'radarRing'},sort:{field:'angleIndex'},encode:{enter:{
          x:field('x'),y:field('y'),interpolate:value('linear-closed'),stroke:value('#d9e1ea')}}}]},
      {type:'rule',from:{data:'spokes'},encode:{enter:{
        x:field('x'),y:field('y'),x2:field('x2'),y2:field('y2'),stroke:value('#c2cdd9')}}},
      polar?arcs:outline,
      text('ticks',{text:{signal:`format(datum.value,${JSON.stringify(format)})`},fontSize:value(9),fill:value('#596779')}),
      text('labels',{text:field('category'),align:field('align'),fontSize:value(11)})
    ]};
}
