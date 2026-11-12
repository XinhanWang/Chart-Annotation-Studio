import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
// --headless uses a fresh browser context and an ephemeral loopback-only server.
// A supplied target ID instead uses an already-owned web-access test tab.
export async function runInPage(expression,target){
  if(target==='--headless'){
    const {chromium}=require('playwright');
    const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
    const server=createServer(async(req,res)=>{try{
      let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
      if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      if(file===root)file=path.join(root,'index.html');
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');
      res.end(await readFile(file));
    }catch{res.writeHead(404).end();}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let browser;
    try{
      browser=await chromium.launch({channel:process.env.STUDIO_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
      const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1.25,acceptDownloads:true});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));if(process.env.STUDIO_TEST_PROGRESS)page.on('console',m=>console.error(m.text()));
      await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>!!window.chartStudio);
      const result=await Promise.race([page.evaluate(expression),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Browser suite timed out')),120000);t.unref();})]);
      if(errors.length)throw Error('Uncaught page errors: '+errors.join('; '));
      if(process.env.STUDIO_QA_OUTPUT){const dir=path.resolve(process.env.STUDIO_QA_OUTPUT);await mkdir(dir,{recursive:true});await page.screenshot({path:path.join(dir,path.basename(process.argv[1],'.mjs')+'.png'),fullPage:true});}
      return result;
    }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
  }
  if(!target)throw Error('Pass --headless or an owned CDP target ID (web-access proxy)');
  const evaluate=async body=>{const r=await(await fetch('http://localhost:3456/eval?target='+target,{method:'POST',body})).json();if(r.error)throw Error(JSON.stringify(r));return r.value;};
  // Do not keep one proxy command open past its 30-second limit. Background tabs
  // may throttle timers; all suites use the same bounded asynchronous polling.
  const key='__studioSuite'+Date.now();
  await evaluate('window['+JSON.stringify(key)+']=null;Promise.resolve().then(()=>('+expression+')).then(value=>window['+JSON.stringify(key)+']={value},error=>window['+JSON.stringify(key)+']={error:error.message,stack:error.stack});true');
  try{for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,1000));const result=await evaluate('window['+JSON.stringify(key)+']');if(result){if(result.error)throw Error(result.error+'\n'+result.stack);return result.value;}}throw Error('Browser suite timed out; use --headless to avoid background-tab throttling');}
  finally{await evaluate('delete window['+JSON.stringify(key)+']');}
}
