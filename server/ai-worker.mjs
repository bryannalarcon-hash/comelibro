import { listenAiWorker } from './ai-socket.mjs';
const server = await listenAiWorker(process.env.AI_SOCKET_PATH, { allowedUserId: process.env.AI_ALLOWED_USER_ID });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { server.close(); server.closeAllConnections(); });
