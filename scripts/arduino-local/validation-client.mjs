import http from 'node:http';
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {validateMessage} from './protocol.mjs';

export const ENDPOINT='http://127.0.0.1:3187/v1/dry-run';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function validateAccess(access) {
  if (!access || Object.keys(access).sort().join(',')!=='endpoint,sessionId,token'
    || access.endpoint!==ENDPOINT || !UUID.test(access.sessionId)
    || typeof access.token!=='string' || !/^[a-f0-9]{64}$/.test(access.token)) throw Error('invalid_private_host_access');
  return access;
}
export function loadHostAccess(file,cwd=process.cwd()) {
  // Only the M7A receiver's private per-session file in this QA checkout.
  const absolute=path.resolve(cwd,file), relative=path.relative(cwd,absolute);
  const parts=relative.split(path.sep);
  if (parts.length!==4 || parts[0]!=='.local' || parts[1]!=='arduino-dry-run'
    || !UUID.test(parts[2]) || parts[3]!=='host-access.json') throw Error('private_access_path_required');
  let current=cwd;
  for(const part of parts) { current=path.join(current,part); if(lstatSync(current).isSymbolicLink())throw Error('linked_access_path_refused'); }
  const stat=lstatSync(absolute);
  if(!stat.isFile() || stat.size>2048 || realpathSync(absolute)!==path.join(realpathSync(cwd),relative))throw Error('private_access_file_refused');
  let access;try { access=JSON.parse(readFileSync(absolute,'utf8')); } catch { throw Error('invalid_private_host_access'); }
  validateAccess(access);
  if(access.sessionId!==parts[2])throw Error('access_session_path_mismatch');
  return access;
}

// No proxy lookup, redirect following, configurable network host or Serial token.
export function postValidation(text,access) {
  validateAccess(access);
  const expected=validateMessage(text,{sessionId:access.sessionId});
  return new Promise((resolve,reject)=>{
    let settled=false;
    const fail=code=>{if(!settled){settled=true;reject(Error(code));}};
    const req=http.request({hostname:'127.0.0.1',port:3187,path:'/v1/dry-run',method:'POST',agent:false,
      headers:{Host:'127.0.0.1:3187',Origin:'http://127.0.0.1:3187',Authorization:'Bearer '+access.token,
        'Content-Type':'application/json','Content-Length':Buffer.byteLength(text)}},res=>{
      let size=0,body='';res.setEncoding('utf8');
      res.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>2048){fail('invalid_validation_response');res.destroy();}else body+=chunk;});
      res.on('aborted',()=>fail('validation_response_lost'));
      res.on('error',()=>fail('validation_response_lost'));
      res.on('end',()=>{
        if(settled)return;
        if(res.statusCode!==200){fail(res.statusCode===403?'receiver_authorization_denied':res.statusCode===422?'receiver_session_or_schema_refused':'receiver_request_refused');return;}
        try {
          const value=JSON.parse(body);
          const allowed=['outcome','acquisition','synthetic','durable','destinationDelivered','physicalHardwareVerified','duplicate','sequence_state'];
          assert.ok(Object.keys(value).every(k=>allowed.includes(k)));
          assert.equal(value.outcome,'validated_only');assert.equal(value.synthetic,true);
          assert.equal(value.durable,false);assert.equal(value.destinationDelivered,false);assert.equal(value.physicalHardwareVerified,false);
          assert.equal(typeof value.duplicate,'boolean');assert.deepEqual(value.acquisition,expected);
          assert.ok(value.duplicate ? value.sequence_state===undefined : ['in_order','gap','out_of_order'].includes(value.sequence_state));
          settled=true;resolve(value);
        } catch { fail('invalid_validation_response'); }
      });
    });
    const deadline=setTimeout(()=>{fail('validation_timeout');req.destroy();},5000);
    req.on('close',()=>clearTimeout(deadline));req.on('error',()=>fail('receiver_unavailable_or_response_lost'));
    req.end(text);
  });
}
