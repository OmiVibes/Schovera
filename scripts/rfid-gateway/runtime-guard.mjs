export function assertGatewayRuntime(version=process.versions.node){
  const [major,minor]=version.split('.').map(Number);
  if(!Number.isInteger(major)||!Number.isInteger(minor)||major<22||(major===22&&minor<13))throw new Error('Local SQLite gateway requires Node.js 22.13 or newer. Pending data was not opened; upgrade the runtime before retrying.');
}
