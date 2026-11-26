// Independent Precision V2 reference for raw browser measurements.
function quantize(value,percent=false){
 if(value===0)return 0;
 const [coefficient,power='0']=String(Math.abs(value)).split('e');
 if(!percent&&Number.isInteger(value)&&Math.abs(value)<1e16)return value;
 const exponent=percent?-2:Math.abs(value)<1||Math.abs(value)>=1e16?
   Math.floor(Math.log10(Math.abs(value)))-3:-2;
 const scaled=Number(coefficient+'e'+(Number(power)-exponent));
 const floor=Math.floor(scaled);
 const units=floor+(scaled-floor>=.5?1:0);
 return units===0?0:Number(Math.sign(value)*units+'e'+exponent);
}
function at(pixel,axis){
 if(pixel===axis.p1)return axis.v1;
 if(pixel===axis.p2)return axis.v2;
 const fraction=(pixel-axis.p1)/(axis.p2-axis.p1);
 return axis.type==='log'?Math.exp(Math.log(axis.v1)+fraction*(Math.log(axis.v2)-Math.log(axis.v1))):
   axis.v1+fraction*(axis.v2-axis.v1);
}
function measurement(pixel,axis,percent=false){
 const value=at(pixel,axis);
 return pixel===axis.p1||pixel===axis.p2?value:quantize(value,percent);
}
function interval(start,end,axis){return quantize(at(end,axis)-at(start,axis));}
module.exports={measurement,interval,browserSource:[quantize,at,measurement,interval].map(fn=>fn.toString()).join(';')+';'};
