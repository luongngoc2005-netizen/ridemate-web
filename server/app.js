import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {realpath,stat} from 'node:fs/promises';
import {extname,resolve,relative,isAbsolute,sep} from 'node:path';
import {assistantMiddleware} from './assistant-api.js';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.wasm':'application/wasm'};
const inside=(root,path)=>{const rel=relative(root,path);return rel!== '..'&&!rel.startsWith(`..${sep}`)&&!isAbsolute(rel);};

export async function createApp({distDirectory=resolve('dist'),...options}={}){
  const root=await realpath(distDirectory);
  const index=await realpath(resolve(root,'index.html'));
  if(!inside(root,index))throw new Error('Invalid build directory.');
  const api=assistantMiddleware(options);
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');
    const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
    try{
      const rawPath=req.url?.split('?')[0]||'/';
      if(rawPath==='/healthz')return ['GET','HEAD'].includes(req.method)?send(200,{status:'ok'}):send(405,{error:'METHOD_NOT_ALLOWED'});
      let fallthrough=false;await api(req,res,()=>{fallthrough=true;});if(!fallthrough)return;
      if(rawPath==='/api'||rawPath.startsWith('/api/'))return send(404,{error:'NOT_FOUND'});
      if(!['GET','HEAD'].includes(req.method))return send(405,{error:'METHOD_NOT_ALLOWED'});
      let path;try{path=decodeURIComponent(rawPath);}catch{return send(400,{error:'BAD_PATH'});}
      if(path.includes('\\')||path.includes('\0')||path.split('/').some(part=>part.startsWith('.')))return send(404,{error:'NOT_FOUND'});
      let file=path==='/'?index:resolve(root,`.${path}`);if(!inside(root,file))return send(404,{error:'NOT_FOUND'});
      let info;
      try{file=await realpath(file);if(!inside(root,file))return send(404,{error:'NOT_FOUND'});info=await stat(file);if(!info.isFile())throw new Error('not_file');}
      catch{
        // Missing assets/API files must never receive index.html with status 200.
        if(extname(path)||path.startsWith('/assets/')||!(req.headers.accept||'').includes('text/html'))return send(404,{error:'NOT_FOUND'});
        file=index;info=await stat(file);
      }
      const type=types[extname(file)];if(!type)return send(404,{error:'NOT_FOUND'});
      res.writeHead(200,{'Content-Type':type,'Content-Length':info.size,'Cache-Control':file===index?'no-cache':path.startsWith('/assets/')?'public, max-age=31536000, immutable':'public, max-age=3600'});
      if(req.method==='HEAD')return res.end();
      const stream=createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    }catch{if(!res.headersSent)send(500,{error:'SERVER_ERROR'});else res.destroy();}
  });
  server.requestTimeout=30000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  return server;
}
