import {existsSync} from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {assertLocalTestEnvironment} from '../lib/local-test-env.mjs';
import {loadHostAccess} from './validation-client.mjs';
import {SerialBridge} from './serial-bridge.mjs';
import {WindowsSerial,listSerialPorts} from './windows-serial.mjs';

if(existsSync(path.resolve('.env.local')))throw Error('Use isolated QA; developer env contents were not read');
assertLocalTestEnvironment(process.env,{requireServiceRole:false});
if(process.env.SCHOVERA_ARDUINO_TEST_MODE!=='synthetic')throw Error('Explicit synthetic test mode required');
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='list') {
  console.log(JSON.stringify({ports:await listSerialPorts(),metadataIsNotAttestation:true},null,2));
} else {
  if(args.length!==7||args[0]!=='connect'||args[1]!=='--port'||args[3]!=='--confirm-pnp-id'||args[5]!=='--access')
    throw Error('Use list, or connect --port COMn --confirm-pnp-id <exact listed ID> --access <private host-access.json>');
  const access=loadHostAccess(args[6]);
  const transport=new WindowsSerial({port:args[2],pnpId:args[4]});
  const report=value=>console.log(JSON.stringify(value));
  const bridge=new SerialBridge({access,write:line=>transport.write(line),report});
  const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  transport.on('opened',()=>{report({event:'serial_opened',port:args[2],baud:115200,hardwareIdentityAuthenticated:false});
    console.log('Commands: status | arm | retry | retry-validation | discard <synthetic acquisition UUID> | close. No durable acceptance or delivery.');});
  transport.on('bytes',bytes=>bridge.feed(bytes));
  transport.on('failure',code=>{report({event:'serial_error',code});process.exitCode=1;input.close();transport.close();});
  transport.on('closed',()=>{bridge.disconnected();input.close();});
  input.on('line',line=>{if(line==='close'){input.close();transport.close();return;}
    void bridge.command(line).catch(()=>report({event:'operator_command_refused_or_write_failed'}));});
  input.on('close',()=>transport.close());
  process.on('SIGINT',()=>{input.close();transport.close();});
}
