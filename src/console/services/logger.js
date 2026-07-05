import { LogSDK } from '@xiaohao0725/logs-sdk'

export const logger = new LogSDK({
  endpoint: process.env.LOGS_ENDPOINT || 'https://api.logs.codexs.cn/api/v1/ingest/logs',
  apiKey: process.env.LOGS_API_KEY || '',
  apiSecret: process.env.LOGS_API_SECRET || '',
  projectSlug: 'vcards',
  environment: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  serviceName: 'console',
  bufferSize: 500,
  flushInterval: 5,
  maxBodySize: 4096,
})

export async function logsPlugin(fastify) {
  await fastify.register(logger.fastifyPlugin())

  fastify.addHook('onClose', async () => {
    await logger.close()
  })
}
