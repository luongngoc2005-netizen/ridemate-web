import {fileURLToPath} from 'node:url';
import {createApp} from './app.js';
import {serverConfig} from './config.js';
import {providerConfigured} from './ai-provider.js';

try{
  const port=Number(process.env.PORT||10000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be between 1 and 65535.');
  const config=serverConfig();
  const server=await createApp({...config,distDirectory:fileURLToPath(new URL('../dist',import.meta.url))});
  server.on('error',()=>{console.error('RideMate could not bind to its port.');process.exitCode=1;});
  server.listen(port,'0.0.0.0',()=>console.log(`RideMate listening on port ${port}; AI ${providerConfigured(config)?'configured (login and quota required)':'disabled'}.`));
  const shutdown=()=>{server.close(()=>process.exit(0));setTimeout(()=>{server.closeAllConnections();process.exit(0);},40000).unref();};
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
}catch(error){
  // Do not print provider errors, request data or environment values.
  console.error('RideMate startup failed. Check the build directory and required server configuration.');
  process.exitCode=1;
}
