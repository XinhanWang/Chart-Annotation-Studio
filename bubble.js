// Pixel geometry and calibration live in the project. Compact rows carry only observations.
const bubbleField=p=>p.bubble.mode==='relative'?'size_relative':'size';
function newBubbleSettings(){
  return {mode:'manual',method:'center',title:'',legend:true,calibration:{bounds:[],references:[{},{}]}};
}
const bubbleValue=value=>finite(value)&&value>=0;
const bubbleDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

function fitBubble(points,method,maxRadius=Infinity){
  const [a,b,c]=points;
  if(method==='center')return {center:a};
  if(method==='center-edge'){
    const radius=bubbleDistance(a,b);
    if(!(radius>0))throw Error('圆心与边缘不能重合');
    return {center:a,radius};
  }
  const u={x:b.x-a.x,y:b.y-a.y},v={x:c.x-a.x,y:c.y-a.y};
  const uu=u.x*u.x+u.y*u.y,vv=v.x*v.x+v.y*v.y,det=u.x*v.y-u.y*v.x;
  const longest=Math.max(uu,vv,(u.x-v.x)**2+(u.y-v.y)**2);
  if(!longest||Math.abs(det)<longest*0.025)throw Error('圆周点共线或圆弧太短，请选择分散的可见圆周点');
  const center={x:a.x+(uu*v.y-vv*u.y)/(2*det),y:a.y+(vv*u.x-uu*v.x)/(2*det)};
  const radius=bubbleDistance(a,center);
  if(!finite(radius)||radius<=0||radius>maxRadius)throw Error('拟合圆尺寸异常，请核对圆周点');
  return {center,radius};
}

function bubblePlotArea(bounds){
  if(bounds?.length!==2)return null;
  const [a,b]=bounds;
  const area=Math.abs((a.x-b.x)*(a.y-b.y));
  return finite(area)&&area>0?area:null;
}
function bubbleSizeMapping(references){
  const [first,last]=references;
  if(!bubbleValue(first?.value)||!bubbleValue(last?.value)||
      !finite(first?.radius)||first.radius<=0||!finite(last?.radius)||last.radius<=0)
    throw Error('请填写两个已知大小，并测量两个参考气泡');
  if(Math.abs(first.radius-last.radius)<Math.max(0.5,Math.max(first.radius,last.radius)*0.001))
    throw Error('两个参考半径过于接近，请选尺寸差距更大的参考气泡');
  const slope=(last.value-first.value)/(last.radius**2-first.radius**2);
  const intercept=first.value-slope*first.radius**2;
  if(!finite(slope)||slope<=0||!finite(intercept))
    throw Error('参考气泡大小须随面积递增，请复核大小数值或圆周位置');
  return {slope,intercept,first,last};
}

function bubbleObservation(p,row,evidence){
  const out={x:row.x,y:row.y};
  if(evidence?.pixel)for(const axis of ['x','y']){
    if(!finite(out[axis])&&p.axes[axis].calibrated){
      try{out[axis]=measureProjectAxis(p,axis,evidence.pixel[axis]);}
      catch{out[axis]=null;} // Axis validation reports invalid calibration separately.
    }
  }
  const field=bubbleField(p),radius=evidence?.bubbleRadius;
  if(p.bubble.mode==='relative'&&finite(radius)){
    const area=bubblePlotArea(p.bubble.calibration.bounds);
    if(area)out[field]=quantizeMeasurement(Math.PI*radius**2/area,{computed:true});
    else out.problem='请先标定有效的绘图区边界';
  }else if(bubbleValue(row[field]))out[field]=row[field];
  else if(p.bubble.mode==='calibrated'&&finite(radius)){
    try{
      const {slope,intercept,first,last}=bubbleSizeMapping(p.bubble.calibration.references);
      const raw=radius===first.radius?first.value:radius===last.radius?last.value:slope*radius**2+intercept;
      if(!bubbleValue(raw))throw Error('参考气泡外推得到无效大小，请手动输入或重新校准');
      out[field]=quantizeMeasurement(raw,{percent:percentLabels(p,'size'),computed:true});
      const tolerance=8*Number.EPSILON*Math.max(radius,first.radius,last.radius);
      if(radius<Math.min(first.radius,last.radius)-tolerance||radius>Math.max(first.radius,last.radius)+tolerance)
        out.warning='大小超出参考气泡范围，已外推，请复核';
    }catch(error){out.problem=error.message;}
  }
  return out;
}

function validateBubbles(p,issue){
  const field=bubbleField(p);
  if(p.xType!=='quantitative')issue('error','气泡图须使用双连续数值轴');
  if(typeof p.bubble.title!=='string'&&!(Array.isArray(p.bubble.title)&&p.bubble.title.every(s=>typeof s==='string')))
    issue('error','大小指标名称需要文字');
  for(const [i,row] of p.rows.entries()){
    const prefix=`第 ${i+1} 行：`,observed=bubbleObservation(p,row,p.evidence?.[i]);
    if(row.needs_review)issue('error',prefix+'气泡标记为 needs_review，请复核后确认或移除该记录');
    for(const axis of ['x','y']){
      if(!finite(observed[axis])||p.axes[axis].type==='log'&&observed[axis]<=0)
        issue('error',prefix+axis.toUpperCase()+' 圆心坐标需为有效数值');
    }
    if(!bubbleValue(observed[field]))issue('error',prefix+(observed.problem??'请填写或测量有效的气泡大小'));
    if(observed.warning)issue('warning',prefix+observed.warning);
  }
}

function checkBubbleImport(spec){
  if(spec.layer)throw Error('Compact GT 气泡图仅支持单层 point');
  const {x,y,color,size}=spec.encoding;
  if(Object.keys(spec.encoding).some(key=>!['x','y','size','color'].includes(key))||
      ['x','y'].some(axis=>spec.encoding[axis].type!=='quantitative'||spec.encoding[axis].field!==axis)||
      size.type!=='quantitative'||!['size','size_relative'].includes(size.field)||
      color&&(!['series','series_id'].includes(color.field)||color.type!=='nominal')||
      typeof spec.mark==='object'&&Object.keys(spec.mark).some(key=>key!=='type'))
    throw Error('气泡图须使用双连续轴、point 和直接大小映射');
  if(size.field==='size_relative'&&(size.legend!==null||size.title!==undefined||size.scale!==undefined))
    throw Error('相对大小须使用 quantitative 的 size_relative 和 legend: null');
  const fields=new Set([x.field,y.field,size.field,...(color?['series',color.field]:[])]);
  for(const row of spec.data.values)
    if(!row||Object.keys(row).some(key=>!fields.has(key))||!bubbleValue(row[size.field])||
        !finite(row.x)||!finite(row.y)||color&&(!present(row[color.field])||typeof row.series!=='string'))
      throw Error('气泡观测必须包含圆心坐标和同一种有效大小');
}

function checkBubbleProject(p){
  const b=p.bubble,c=b?.calibration;
  if(!['manual','calibrated','relative'].includes(b?.mode)||!Object.hasOwn(bubbleSteps,b?.method)||
      b.mode!=='manual'&&b.method==='center'||!Array.isArray(c?.bounds)||
      !Array.isArray(c?.references)||c.references.length!==2)
    throw Error('气泡工程缺少有效的大小模式或测量配置');
}

function styleBubblePreview(spec){
  spec.mark={type:'point',filled:true,shape:'circle'};
  const size=spec.encoding.size;
  if(size.field==='size_relative'){
    // Vega's circle uses a diameter of sqrt(symbol size), so multiply area by 4 / π.
    spec.encoding.size={value:{expr:'datum.size_relative * width * height * 4 / PI'}};
  }else size.title??=null;
  return spec;
}

const bubbleSteps={center:['圆心'],'center-edge':['圆心','边缘'],circumference:['圆周点 1','圆周点 2','圆周点 3']};
function bubbleComplete(index){
  const row=p.rows[index],value=bubbleObservation(p,row,p.evidence?.[index]);
  return ['x','y',bubbleField(p)].every(key=>finite(value[key]));
}
function bubbleTarget(){
  const row=p.rows[selected],series=assist().series;
  if(row&&identity(row)===series&&(row.needs_review||p.evidence?.[selected]?.bubbleRetake||!bubbleComplete(selected)))return selected;
  return p.rows.findIndex((item,i)=>identity(item)===series&&!item.needs_review&&!bubbleComplete(i));
}
function appendBubble(series=assist().series){
  const index=p.rows.length;
  p.rows.push({x:null,y:null,series:seriesName(p,series),_seriesKey:series});
  (p.evidence??=[])[index]={role:'transcribed',source:'manual_entry'};
  return index;
}
function advanceBubble(index){
  selected=-1;
  for(let offset=1;offset<=p.rows.length;offset++){
    const i=(index+offset)%p.rows.length;
    if(i!==index&&!p.rows[i].needs_review&&!bubbleComplete(i)){
      selected=i;assist().series=identity(p.rows[i]);break;
    }
  }
  selectedHandle='pixel';
}
const bubbleMaxRadius=()=>Math.hypot(image.width,image.height)*2;

function setBubbleCenter(row,evidence,point){
  row.x=row.y=null;
  for(const axis of ['x','y'])clearMeasuredField(row,axis);
  evidence.pixel={...point};
}

function recordBubblePoint(point){
  calibrated();
  change(()=>{
    let index=bubbleTarget();
    if(index<0)index=appendBubble();
    selected=index;selectedHandle='pixel';
    const settings=p.bubble,row=p.rows[index],evidence=(p.evidence??=[])[index]??={};
    const points=(evidence.bubblePoints??=[]);
    points.push(point);
    if(points.length<bubbleSteps[settings.method].length)return;
    delete evidence.bubblePoints;
    delete evidence.bubbleRetake;
    let geometry;
    try{geometry=fitBubble(points,settings.method,bubbleMaxRadius());}
    catch(error){row.needs_review=true;toast(error.message);return;}
    setBubbleCenter(row,evidence,geometry.center);
    delete row.needs_review;
    Object.assign(evidence,{role:'observation',source:'pixel_measurement'});
    if(geometry.radius!==undefined)evidence.bubbleRadius=geometry.radius;
    else delete evidence.bubbleRadius;
    if(bubbleComplete(index))advanceBubble(index);
  });
}

function recordBubbleCalibration(point){
  const calibration=p.bubble.calibration,draft=calibration.capture;
  if(!draft)return;
  change(()=>{
    draft.points.push(point);
    if(draft.target==='bounds'){
      if(draft.points.length<2)return;
      if(!bubblePlotArea(draft.points)){draft.points.pop();toast('绘图区需有有效宽度和高度');return;}
      calibration.bounds=draft.points;
    }else{
      if(draft.points.length<bubbleSteps[p.bubble.method].length)return;
      let geometry;
      try{geometry=fitBubble(draft.points,p.bubble.method,bubbleMaxRadius());}
      catch(error){draft.points=[];toast(error.message);return;}
      Object.assign(calibration.references[draft.target],geometry);
    }
    delete calibration.capture;
    setTool('select');
  },{scope:'size'});
}

function syncBubbleControls(){
  const panel=$('bubbleControls');
  panel.hidden=!isBubble(p);
  if(panel.hidden)return;
  const settings=p.bubble,cal=settings.calibration,relative=settings.mode==='relative',manual=settings.mode==='manual';
  $('bubbleMode').value=settings.mode;
  options($('bubbleMethod'),[
    ...(manual?[['center','仅取圆心']]:[]),
    ['center-edge','圆心＋边缘'],['circumference','三点定圆']
  ],settings.method);
  $('bubbleSizeSemantics').hidden=relative;
  $('bubbleTitle').value=settings.title;
  $('bubblePercent').checked=percentLabels(p,'size');
  $('bubbleBounds').hidden=!relative;
  $('bubbleReferences').hidden=settings.mode!=='calibrated';
  const area=bubblePlotArea(cal.bounds);
  $('bubbleBoundsStatus').textContent=area?'绘图区面积 '+area.toPrecision(6)+' px²':'待标定绘图区';
  for(const [i,ref] of cal.references.entries()){
    $('bubbleRefValue'+i).value=ref.value??'';
    $('bubbleRefStatus'+i).textContent=ref.radius>0?'半径 '+ref.radius.toPrecision(5)+' px':'待测量';
  }
  let status='';
  if(settings.mode==='calibrated'){
    try{bubbleSizeMapping(cal.references);status='大小校准有效';}
    catch(error){status=error.message;}
  }
  $('bubbleScaleStatus').textContent=status;
  $('bubbleCount').value=p.rows.length;
  $('bubbleRetake').disabled=!p.rows[selected];
  $('bubbleReview').textContent=p.rows[selected]?.needs_review?'清除当前复核标记':'标记需要复核';
  if(tool==='bubble-size'&&cal.capture){
    const {target,points}=cal.capture;
    $('hint').textContent=target==='bounds'?(points.length?'点击绘图区的对角':'点击绘图区的一个角'):
      '参考气泡 '+(target+1)+' · 取'+bubbleSteps[settings.method][points.length];
    return;
  }
  if(tool!=='point')return;
  const index=bubbleTarget(),points=p.evidence?.[index]?.bubblePoints??[];
  const missingSize=manual&&index>=0&&p.evidence?.[index]?.pixel&&!bubbleValue(p.rows[index].size)&&!points.length;
  $('hint').textContent=missingSize?'请在表格填写当前气泡的大小。':'点击原图取'+bubbleSteps[settings.method][points.length]+
    (index>=0?' · 第 '+(index+1)+' 条记录':' · 新记录');
  $('targetTop').textContent=$('targetHint').textContent+=' · '+(index<0?'新气泡':'第 '+(index+1)+' 条记录');
}

function drawBubbleGuides(mark){
  const cal=p.bubble.calibration;
  function circle(point,radius,color){
    if(!point||!finite(radius))return;
    ctx.strokeStyle=color;ctx.lineWidth=1.7/zoom;
    ctx.beginPath();ctx.arc(point.x,point.y,radius,0,Math.PI*2);ctx.stroke();
  }
  for(const [i,row] of p.rows.entries()){
    const evidence=p.evidence?.[i],color=row.needs_review?'#e85b35':p.series.find(s=>s.key===identity(row))?.color;
    circle(evidence?.pixel,evidence?.bubbleRadius,color||'#008b7e');
    evidence?.bubblePoints?.forEach((pt,j)=>mark(pt,'#ffae00',String(j+1)));
  }
  if(p.bubble.mode==='relative'&&bubblePlotArea(cal.bounds)){
    const [a,b]=cal.bounds;
    ctx.save();ctx.setLineDash([5/zoom,4/zoom]);ctx.strokeStyle='#168179';ctx.lineWidth=1.4/zoom;
    ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.restore();
  }
  if(tool==='bubble-size'){
    if(p.bubble.mode==='calibrated')cal.references.forEach((ref,i)=>{
      circle(ref.center,ref.radius,'#e85b35');mark(ref.center,'#e85b35','参考 '+(i+1));
    });
    cal.capture?.points.forEach((pt,i)=>mark(pt,'#ffae00',String(i+1)));
  }
}
function cancelBubbleCapture(){
  if(!isBubble(p))return false;
  if(tool==='bubble-size'){
    change(()=>{delete p.bubble.calibration.capture;setTool('select');},{scope:'size'});return true;
  }
  const evidence=p.evidence?.[bubbleTarget()];
  if(!evidence?.bubblePoints?.length)return false;
  change(()=>{delete evidence.bubblePoints;delete evidence.bubbleRetake;setTool('select');});
  return true;
}

function editBubbleCell(index,key,input){
  const raw=input.value.trim(),percent=key==='size_relative'?null:printedPercent(raw);
  const value=raw===''?null:percent??Number(raw);
  if(value!==null&&(!finite(value)||key.startsWith('size')&&value<0)){
    toast('请输入有效数值，大小须为非负数');table();return;
  }
  change(()=>{
    const row=p.rows[index],complete=bubbleComplete(index);
    row[key]=value;
    if(key==='x'||key==='y')recordTablePercent(row,key,percent!==null?key:undefined);
    else clearMeasuredField(row,key);
    if(percent!==null&&key==='size'){(p.percentLabels??={}).size=true;p.bubble.legend=true;}
    if(!row.needs_review&&!complete&&bubbleComplete(index)&&selected===index)advanceBubble(index);
  });
}

function bindBubbleTools(){
  function changeSetup(fn){
    change(()=>{
      fn();
      for(const evidence of p.evidence??[])if(evidence)delete evidence.bubblePoints;
      if(tool==='bubble-size')setTool('select');
    });
  }
  $('bubbleMode').onchange=()=>{
    const mode=$('bubbleMode').value;
    changeSetup(()=>{
      p.bubble.mode=mode;
      if(mode!=='manual'&&p.bubble.method==='center')p.bubble.method='center-edge';
    });
  };
  $('bubbleMethod').onchange=()=>changeSetup(()=>{p.bubble.method=$('bubbleMethod').value;});
  $('bubbleTitle').onchange=()=>change(()=>{p.bubble.title=$('bubbleTitle').value;});
  $('bubblePercent').onchange=()=>change(()=>{
    (p.percentLabels??={}).size=$('bubblePercent').checked;
    if(p.percentLabels.size)p.bubble.legend=true;
  });
  $('bubbleSetCount').onclick=()=>{
    const count=$('bubbleCount').valueAsNumber;
    if(!Number.isSafeInteger(count)||count<1||count>10000){toast('记录数须为 1 至 10000 的整数');return;}
    if(count<p.rows.length&&!confirm('缩减记录数将删除末尾记录及其测量证据。继续？'))return;
    change(()=>{
      const series=assist().series;
      while(p.rows.length<count)appendBubble(series);
      p.rows.splice(count);p.evidence?.splice(count);
      if(selected>=count)selected=-1;
    });
  };
  function capture(target){
    if(!image){toast('请先添加原图');return;}
    change(()=>{
      p.bubble.calibration.capture={target,points:[]};
      setTool('bubble-size');
    },{scope:'size'});
    canvas.focus({preventScroll:true});
  }
  $('bubblePickBounds').onclick=()=>capture('bounds');
  for(let i=0;i<2;i++){
    $('bubbleRefPick'+i).onclick=()=>capture(i);
    const input=$('bubbleRefValue'+i);
    input.onchange=()=>{
      const raw=input.value.trim(),percent=printedPercent(raw),value=raw===''?null:percent??Number(raw);
      if(value!==null&&!bubbleValue(value)){toast('参考大小须为非负数');syncBubbleControls();return;}
      change(()=>{
        p.bubble.calibration.references[i].value=value;
        if(percent!==null){(p.percentLabels??={}).size=true;p.bubble.legend=true;}
      },{scope:'size'});
    };
  }
  $('bubbleRetake').onclick=()=>{
    if(!p.rows[selected])return;
    change(()=>{
      (p.evidence??=[])[selected]??={};
      p.evidence[selected].bubbleRetake=true;
      delete p.evidence[selected].bubblePoints;
      assist().series=identity(p.rows[selected]);
      setTool('point');
    });
  };
  $('bubbleReview').onclick=()=>{
    change(()=>{
      const index=selected>=0?selected:bubbleTarget();
      const i=index>=0?index:appendBubble(),row=p.rows[i],evidence=p.evidence?.[i];
      selected=i;
      if(row.needs_review)delete row.needs_review;
      else{
        row.needs_review=true;
        if(evidence){delete evidence.bubblePoints;delete evidence.bubbleRetake;}
        advanceBubble(i);
      }
    });
  };
}
