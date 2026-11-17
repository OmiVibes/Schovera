// Owned background wrapper; never reads an environment file itself.
import {spawn} from 'node:child_process';import {readState,qaDirectory,minimalEnvironment} from './guard.mjs';
import {fileURLToPath} from 'node:url';
const state=readState();if(!state||state.owner!==process.argv[2])throw Error('Owned competition start required');
const child=spawn(process.execPath,[fileURLToPath(new URL('../dev-rfid-local.mjs',import.meta.url)),'--port','3104'],{cwd:qaDirectory,env:minimalEnvironment(),stdio:'inherit',windowsHide:true});
child.on('error',()=>{process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
