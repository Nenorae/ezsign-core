'use strict';

const { config, logger } = require('./src/utils/config');
const { RabbitMQBroker } = require('./src/broker/rabbitmq');
const { DatabaseRepository } = require('./src/repository/database');
const { EzsignApiRepository } = require('./src/repository/ezsign_api');
const { LoggerCoreService } = require('./src/service/logger_core');
const { buildServer } = require('./src/api/server');

async function main() {
  logger.info('[Startup] Inisialisasi Middleware (Logging Backend API)...');

  const ezsignApi = new EzsignApiRepository({
    baseUrl: config.ezsignApiUrl,
    timeout: config.ezsignApiTimeout
  });

  const rabbitmq = new RabbitMQBroker(config.rabbitmqUrl);
  try {
    await rabbitmq.connect();
    logger.info(`[Startup] RabbitMQ terhubung ke: ${config.rabbitmqUrl}`);
  } catch (error) {
    logger.fatal(`[Startup Fail-Fast] RabbitMQ connection error: ${error.message}`);
    process.exit(1);
  }

  const database = new DatabaseRepository({
    connectionString: config.db.connectionString,
    client: config.db.client
  });

  try {
    await database.init();
    if (database.inMemoryStore) {
      logger.info('[Startup] Database mode: In-Memory aktif (ALLOW_IN_MEMORY_DB=true).');
    } else {
      logger.info('[Startup] Pool database terhubung.');
    }
  } catch (error) {
    logger.fatal(`[Startup Fail-Fast] Database connection error: ${error.message}`);
    process.exit(1);
  }

  const loggerCore = new LoggerCoreService({
    ezsignApi,
    database,
    rabbitmq,
    config: {
      web2Queue: config.web2Queue,
      web3Queue: config.web3Queue
    }
  });

  const server = await buildServer({
    loggerCore,
    logger: false
  });

  try {
    await server.listen({
      port: config.port,
      host: config.host
    });
    logger.info(`[Startup] Fastify server running on http://${config.host}:${config.port}`);
  } catch (error) {
    logger.fatal(`[Startup Fail-Fast] Server listen error: ${error.message}`);
    process.exit(1);
  }

  const shutdown = async (signal) => {
    logger.info(`[Shutdown] Received signal ${signal}, closing gracefully...`);
    try {
      await server.close();
      await rabbitmq.close();
      await database.close();
      logger.info('[Shutdown] All connections closed.');
      process.exit(0);
    } catch (err) {
      logger.error(`[Shutdown Error] Error during shutdown: ${err.message}`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = { main };
