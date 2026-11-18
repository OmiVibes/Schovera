import {SerialLines} from '../arduino-local/serial-lines.mjs';
import {validateMessage} from '../arduino-local/protocol.mjs';
import {UsbCaptureRefusal} from './capture.mjs';

export class DurableUsbBridge {
  constructor({capture,write,report=()=>{},source='simulated_serial'}) {
    if(!['usb_serial','simulated_serial'].includes(source))throw Error('Explicit source required');
    this.capture=capture;this.write=write;this.report=report;this.source=source;
    this.pending=null;this.busy=null;this.releaseId=null;this.connected=true;
    this.lines=new SerialLines(line=>this.line(line));
  }
  feed(bytes){if(this.connected)this.lines.push(bytes);}
  line(line) {
    if(line.type==='diag'){
      this.report({event:'diagnostic',code:line.code});
      if(line.code==='discarded_ram_only'&&this.releaseId){
        this.capture.releaseIntent(this.releaseId);this.pending=null;this.releaseId=null;
        this.report({event:'firmware_ram_released_by_operator',durableQueuePreserved:true});
      }
      if(line.code==='boot')this.report({event:'device_boot_observed',sourceRamMayBeLost:true,queueUnchanged:true});
      return;
    }
    if(line.type==='rejected'){this.report({event:'serial_refused',code:line.code,durable:false});return;}
    try {
      const acquisition=validateMessage(line.text,{sessionId:this.capture.scope.sessionId});
      if(this.releaseId||(this.pending&&this.pending!==line.text))throw new UsbCaptureRefusal('single_source_slot_busy');
      this.pending=line.text;
      this.report({event:'synthetic_acquisition_bytes_received',source:this.source,acquisitionId:acquisition.acquisitionId,rfidScanVerified:false});
      void this.forward();
    }catch{this.report({event:'serial_refused',code:'invalid_foreign_or_competing_acquisition',durable:false,firmwareNotCleared:true});}
  }
  forward() {
    if(this.busy)return this.busy;
    if(!this.pending)return Promise.resolve();
    this.busy=(async()=>{
      try{
        const result=await this.capture.receive(this.pending);
        this.report({event:'local_gateway_receipt',source:this.source,...result});
      }catch(error){this.report({event:'capture_unconfirmed_or_refused',code:error instanceof UsbCaptureRefusal?error.code:'gateway_capture_failed',
        durable:false,firmwareNotCleared:true,retainedInHostRam:true});}
    })().finally(()=>{this.busy=null;});return this.busy;
  }
  async command(command) {
    if(!this.connected)throw new UsbCaptureRefusal('serial_closed_select_again');
    if(command==='status'){await this.write('STATUS');return;}
    if(command==='retry'){await this.write('RETRY');return;}
    if(command==='retry-capture'){await this.forward();return;}
    if(command.startsWith('release ')){
      if(this.busy||this.releaseId)throw new UsbCaptureRefusal('capture_or_release_busy');
      const id=command.slice(8);this.capture.receipt(id); // Read actual committed row BEFORE any CLEAR.
      this.releaseId=id;await this.write('CLEAR '+id);return;
    }
    if(command!=='arm'||this.pending||this.releaseId)throw new UsbCaptureRefusal('unsupported_or_pending_operator_command');
    const intent=await this.capture.issueIntent();await this.write(intent.command);
    this.report({event:'synthetic_arm_sent',acquisitionId:intent.acquisition.acquisitionId,durable:false,incomingBytesNotYetProven:true});
  }
  disconnected(){this.connected=false;this.lines.reset();this.report({event:'usb_closed',queuePreserved:true,sourceRamDurability:false});}
}
