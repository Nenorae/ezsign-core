'use strict';

const Fastify = require('fastify');
const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');
const crypto = require('crypto');
const controllerRoutes = require('./controller');

async function buildServer(options = {}) {
  const server = Fastify({
    logger: options.logger !== undefined ? options.logger : {
      level: process.env.LOG_LEVEL || 'info',
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: req.url,
            hostname: req.hostname,
            remoteAddress: req.ip,
            correlation_id: req.id
          };
        }
      }
    },
    genReqId: (req) => {
      const incomingId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
      return (typeof incomingId === 'string' && incomingId.trim().length > 0)
        ? incomingId.trim()
        : crypto.randomUUID();
    },
    requestIdHeader: 'x-correlation-id'
  });

  if (options.loggerCore) {
    server.decorate('loggerCore', options.loggerCore);
  }

  server.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-correlation-id', request.id);
    return payload;
  });

  await server.register(cors, {
    origin: options.cors?.origin ?? true,
    methods: options.cors?.methods ?? ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: options.cors?.allowedHeaders ?? [
      'Content-Type',
      'Authorization',
      'x-correlation-id',
      'x-request-id'
    ]
  });

  await server.register(rateLimit, {
    max: options.rateLimit?.max ?? Number(process.env.RATE_LIMIT_MAX || 5000),
    timeWindow: options.rateLimit?.timeWindow ?? (process.env.RATE_LIMIT_WINDOW || '1 minute'),
    errorResponseBuilder: (request, context) => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Terlalu banyak permintaan. Batas ${context.max} request per ${context.after} terlampaui.`
      },
      correlation_id: request.id
    })
  });

  server.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      request.log.warn({ err: error, correlation_id: request.id }, 'Request validation failed.');
      return reply.code(400).send({
        success: false,
        error: {
          code: 'FST_ERR_VALIDATION',
          message: error.message,
          details: error.validation.map((v) => ({
            field: v.instancePath ? v.instancePath.replace(/^\//, '') : (v.params?.missingProperty || ''),
            message: v.message
          }))
        },
        correlation_id: request.id
      });
    }

    if (error.statusCode === 429) {
      return reply.code(429).send({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: error.message
        },
        correlation_id: request.id
      });
    }

    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code || 'BAD_REQUEST',
          message: error.message
        },
        correlation_id: request.id
      });
    }

    request.log.error({ err: error, correlation_id: request.id }, 'Internal server error occurred.');
    return reply.code(500).send({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Terjadi kesalahan internal pada server.'
      },
      correlation_id: request.id
    });
  });

  server.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Rute ${request.method} ${request.url} tidak ditemukan.`
      },
      correlation_id: request.id
    });
  });

  server.get('/health', async (request, reply) => {
    return reply.code(200).send({
      status: 'UP',
      timestamp: new Date().toISOString(),
      correlation_id: request.id
    });
  });

  await server.register(controllerRoutes, {
    loggerCore: options.loggerCore
  });

  return server;
}

async function startServer(options = {}) {
  const server = await buildServer(options);
  const port = options.port ?? Number(process.env.PORT || 3000);
  const host = options.host ?? (process.env.HOST || '0.0.0.0');

  try {
    await server.listen({ port, host });
    server.log.info(`[Middleware API] Berjalan pada http://${host}:${port}`);
    return server;
  } catch (error) {
    server.log.error(`Gagal memulai Fastify server: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildServer,
  startServer
};
