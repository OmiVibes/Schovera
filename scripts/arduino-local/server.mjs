import http from 'node:http';import {timingSafeEqual} from 'node:crypto';import {DryRunSession,MAX_BYTES} from './protocol.mjs';
export function createDryRunServer({sessionId,token,now}={}){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Error('private_host_token_required');
  const session=new DryRunSession(sessionId,{now});
  const server=http.createServer((req,res)=>{
    const reply=(status,value)=>{if(!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}};
    const address=server.address(),origin=`http://127.0.0.1:${address.port}`;
    const received=Buffer.from(req.headers.authorization??''),expected=Buffer.from('Bearer '+token);
    if(req.socket.remoteAddress!=='127.0.0.1'||req.headers.host!==`127.0.0.1:${address.port}`||req.headers.origin!==origin||received.length!==expected.length||!timingSafeEqual(received,expected)){req.resume();reply(403,{error:'unauthorized_local_test'});return;}
    if(req.method!=='POST'||req.url!=='/v1/dry-run'||req.headers['content-type']!=='application/json'){req.resume();reply(400,{error:'request_shape'});return;}
    let size=0,body='';req.setEncoding('utf8');req.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size<=MAX_BYTES)body+=chunk;else reply(413,{error:'message_size'});});
    req.on('end',()=>{if(res.writableEnded)return;try{reply(200,session.accept(body));}catch(error){reply(422,{error:error.message});}});
    req.on('error',()=>reply(400,{error:'request_interrupted'}));
  });
  server.requestTimeout=5000;server.headersTimeout=3000;server.maxHeadersCount=16;
  return {server,session};
}
