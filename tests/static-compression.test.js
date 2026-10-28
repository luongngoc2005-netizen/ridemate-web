import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {get} from 'node:http';
import {once} from 'node:events';
import {brotliDecompressSync, gunzipSync} from 'node:zlib';
import {compressBuild} from '../scripts/compress-build.js';
import {createApp} from '../server/app.js';
import {acceptedEncodings} from '../server/static-encoding.js';

test('encoding selection respects priorities, explicit refusal and identity fallback', () => {
  assert.deepEqual(acceptedEncodings(''),['identity']);
  assert.deepEqual(acceptedEncodings('gzip, br'),['br','gzip','identity']);
  assert.deepEqual(acceptedEncodings('br;q=0, gzip;q=0.5'),['gzip','identity']);
  assert.deepEqual(acceptedEncodings('gzip;q=0.5, identity;q=1'),['identity','gzip']);
  assert.deepEqual(acceptedEncodings('*;q=0'),[]);
  assert.deepEqual(acceptedEncodings('br;q=0, gzip;q=0, identity;q=0'),[]);
});

function rawRequest(url,encoding,method='GET') {
  return new Promise((resolve,reject)=>{
    const request=get(url,{method,headers:{'Accept-Encoding':encoding}},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));
      response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));
      response.on('error',reject);
    });request.on('error',reject);
  });
}

test('production serves lossless compressed assets, HEAD, fallback, caching and unchanged API',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ridemate-compression-'));
  let server;
  try{
    await mkdir(join(dir,'assets'));await writeFile(join(dir,'index.html'),'<html>RideMate</html>');
    const content=Buffer.from('window.example="Đường đi xe máy Việt Nam";\n'.repeat(200));
    await writeFile(join(dir,'assets','large.js'),content);
    await writeFile(join(dir,'assets','small.js'),'window.small=true');
    await writeFile(join(dir,'assets','logo.webp'),Buffer.from([0,1,2,3]));
    const summary=await compressBuild(dir);assert.ok(summary.brotliBytes<summary.originalBytes);
    assert.deepEqual(brotliDecompressSync(await readFile(join(dir,'assets','large.js.br'))),content);
    assert.deepEqual(gunzipSync(await readFile(join(dir,'assets','large.js.gz'))),content);
    server=await createApp({distDirectory:dir});server.listen(0,'127.0.0.1');await once(server,'listening');
    const origin=`http://127.0.0.1:${server.address().port}`;
    for(const [accept,expected] of [['br, gzip','br'],['gzip','gzip'],['br;q=0,gzip','gzip'],['br;q=0,gzip;q=0','identity']]){
      const response=await rawRequest(origin+'/assets/large.js',accept);
      assert.equal(response.status,200);assert.equal(response.headers['content-encoding'],expected==='identity'?undefined:expected);
      const decoded=expected==='br'?brotliDecompressSync(response.body):expected==='gzip'?gunzipSync(response.body):response.body;
      assert.deepEqual(decoded,content);assert.equal(+response.headers['content-length'],response.body.length);
      assert.equal(response.headers.vary,'Accept-Encoding');assert.match(response.headers['cache-control'],/immutable/);
    }
    const head=await rawRequest(origin+'/assets/large.js','br','HEAD');
    assert.equal(head.body.length,0);assert.equal(head.headers['content-encoding'],'br');
    assert.equal(+head.headers['content-length'],(await readFile(join(dir,'assets','large.js.br'))).length);
    const small=await rawRequest(origin+'/assets/small.js','br');assert.equal(small.status,200);assert.equal(small.headers['content-encoding'],undefined);
    const logo=await rawRequest(origin+'/assets/logo.webp','br');assert.equal(logo.status,200);assert.equal(logo.headers['content-encoding'],undefined);
    assert.equal((await rawRequest(origin+'/assets/large.js','identity;q=0,br;q=0,gzip;q=0')).status,406);
    const api=await rawRequest(origin+'/api/assistant/status','br');assert.equal(api.headers['content-encoding'],undefined);assert.equal(api.headers['cache-control'],'no-store');
    assert.equal((await rawRequest(origin+'/assets/large.js.br','identity')).status,404);
  }finally{
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await rm(dir,{recursive:true,force:true});
  }
});
