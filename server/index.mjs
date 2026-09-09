import { createApp } from './app.mjs';
const runtime=createApp();
const server=runtime.app.listen(Number(process.env.PORT||3300),'127.0.0.1',()=>console.log(`Comelibro listening on 127.0.0.1:${server.address().port}`));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(async()=>{await runtime.close();process.exit(0);}));
