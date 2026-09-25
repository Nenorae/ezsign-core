'use strict';

let ValidationFailError;
try {
  ({ ValidationFailError } = require('../utils/errors'));
} catch {
  // Graceful fallback jika utils/errors belum terhubung
}

function isClientError(err) {
  if (!err) return false;
  return Boolean(
    (ValidationFailError && err instanceof ValidationFailError) ||
    err.name === 'ValidationFailError' ||
    err.code === 'VALIDATION_FAILED' ||
    err.code === 'BAD_REQUEST' ||
    (err.statusCode >= 400 && err.statusCode < 500) ||
    err.isClientError
  );
}

const verifyIdentitySchema = {
  body: {
    type: 'object',
    required: ['uuid', 'client_type'],
    additionalProperties: true,
    properties: {
      uuid: { type: 'string', minLength: 1, pattern: '^\\S+$' },
      client_type: { type: 'string', enum: ['web2', 'web3'] },
      signature: { type: 'string' },
      docType: { type: 'string' },
      doc_type: { type: 'string' },
      metadata: { type: 'object' },
      timestamp: {
        anyOf: [
          { type: 'integer' },
          { type: 'string' }
        ]
      }
    }
  }
};

function createController(injectedLoggerCore) {
  return {
    async handleVerifyIdentity(request, reply) {
      const loggerCore = injectedLoggerCore || request.server.loggerCore;

      if (!loggerCore) {
        request.log.error('LoggerCore instance not found in dependency injection.');
        return reply.code(500).send({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Service is not initialized.'
          },
          correlation_id: request.id
        });
      }

      const cleanPayload = {
        uuid: String(request.body.uuid).trim(),
        client_type: request.body.client_type,
        signature: request.body.signature || null,
        docType: request.body.docType || request.body.doc_type || 'KTP',
        metadata: request.body.metadata || {},
        timestamp: request.body.timestamp || Math.floor(Date.now() / 1000)
      };

      try {
        const executionContext = { correlationId: request.id };

        const result = await (typeof loggerCore.process === 'function'
          ? loggerCore.process(cleanPayload, executionContext)
          : typeof loggerCore.enqueue === 'function'
          ? loggerCore.enqueue(cleanPayload, executionContext)
          : typeof loggerCore.handle === 'function'
          ? loggerCore.handle(cleanPayload, executionContext)
          : loggerCore(cleanPayload, executionContext));

        return reply.code(202).send({
          success: true,
          status: 'ACCEPTED',
          correlation_id: request.id,
          data: result || {
            status: 'QUEUED',
            queued_at: new Date().toISOString()
          }
        });
      } catch (error) {
        if (isClientError(error)) {
          return reply.code(400).send({
            success: false,
            error: {
              code: error.code || 'BAD_REQUEST',
              message: error.message || 'Permintaan verifikasi identitas tidak valid.'
            },
            correlation_id: request.id
          });
        }

        request.log.error({ err: error, correlation_id: request.id }, 'LoggerCore execution failed.');
        return reply.code(500).send({
          success: false,
          error: {
            code: error.code || 'INTERNAL_SERVER_ERROR',
            message: 'Gagal memproses verifikasi identitas ke antrean logging.'
          },
          correlation_id: request.id
        });
      }
    }
  };
}

async function controllerRoutes(fastify, options = {}) {
  const loggerCore = options.loggerCore || fastify.loggerCore;
  const controller = createController(loggerCore);

  fastify.post('/api/v1/verify-identity', {
    schema: verifyIdentitySchema,
    handler: controller.handleVerifyIdentity
  });

  fastify.post('/api/v1/log', {
    schema: verifyIdentitySchema,
    handler: controller.handleVerifyIdentity
  });
}

module.exports = controllerRoutes;
module.exports.controllerRoutes = controllerRoutes;
module.exports.createController = createController;
module.exports.verifyIdentitySchema = verifyIdentitySchema;
