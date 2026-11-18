"""Optional real renderer and pinned-font support for regression tests."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


def font_file(name):
    directories = [ROOT / 'assets' / 'fonts']
    if os.environ.get('VSR_TEST_FONT_DIR'):
        directories.insert(0, Path(os.environ['VSR_TEST_FONT_DIR']))
    for directory in directories:
        candidate = directory / name
        if candidate.is_file():
            return candidate
    return None


def render_specs(specs):
    """Compile/run real Vega-Lite; return SVG, scale positions and axis labels."""
    node = shutil.which('node')
    modules = os.environ.get('VSR_TEXT_TEST_MODULES')
    if not node or not modules:
        raise unittest.SkipTest('Set VSR_TEXT_TEST_MODULES to installed Vega dependencies and put node on PATH')
    js = r'''
const fs=require('fs'),path=require('path'),{createRequire}=require('module'),{pathToFileURL}=require('url');
const req=createRequire(path.resolve(process.env.VSR_TEXT_TEST_MODULES,'__regression.cjs'));
(async()=>{
 const v=await import(pathToFileURL(req.resolve('vega'))),vl=await import(pathToFileURL(req.resolve('vega-lite')));
 const results=[];
 for(const spec of JSON.parse(fs.readFileSync(0,'utf8'))){
   const warnings=[];const logger=v.logger(v.Warn);
   logger.warn=(...args)=>{warnings.push(args.join(' '));return logger};
   const compiled=vl.compile(spec,{logger}).spec;
   const view=new v.View(v.parse(compiled),{renderer:'none',logger});await view.runAsync();
   const scales={};
   for(const definition of compiled.scales||[]){
     const scale=view.scale(definition.name),domain=scale.domain();
     scales[definition.name]={domain,positions:domain.map(value=>scale(value))};
   }
   const labels=[],marks=[];
   function visit(scene){
     for(const item of scene.items||[]){
       if(scene.role==='axis-label')labels.push({text:item.text,x:item.x,y:item.y,value:item.datum?.value});
       if(scene.role==='mark'&&item.datum?.row_id)marks.push({name:scene.name,marktype:scene.marktype,row_id:item.datum.row_id,x:item.x,y:item.y,width:item.width,height:item.height,datum:item.datum});
       if(item.items)visit(item);
     }
   }
   visit(view.scenegraph().root);
   results.push({svg:await view.toSVG(),warnings,scales,labels,marks});view.finalize();
 }
 process.stdout.write(JSON.stringify(results));
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
'''
    result = subprocess.run([node, '-e', js], input=json.dumps(specs, ensure_ascii=False),
                            text=True, encoding='utf-8', capture_output=True, check=True, timeout=90)
    return json.loads(result.stdout)
