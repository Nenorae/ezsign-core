'use strict';

const cryptoUtils = require('../utils/crypto');
const { ValidationFailError } = require('../utils/errors');
const defaultEzsignApi = require('../repository/ezsign_api');
const defaultDatabase = require('../repository/database');
const defaultRabbitmq = require('../broker/rabbitmq');

class LoggerCoreService {
  constructor(dependencies = {}) {
    this.ezsignApi = dependencies.ezsignApi || defaultEzsignApi;
    this.database = dependencies.database || defaultDatabase;
    this.rabbitmq = dependencies.rabbitmq || defaultRabbitmq;
    this.crypto = dependencies.crypto || cryptoUtils;

    this.web2Queue =
      dependencies.config?.web2Queue ||
      process.env.RABBITMQ_WEB2_QUEUE ||
      'web2_pending_signature_queue';

    this.web3Queue =
      dependencies.config?.web3Queue ||
      process.env.RABBITMQ_WEB3_QUEUE ||
      'web3_ready_queue';
  }

  async process(payload, context = {}) {
    const { uuid, client_type, signature, docType, metadata, timestamp } = payload;

    await this.ezsignApi.verifyUUID(uuid, context);
    const userHash = this.crypto.generateUserHash(uuid);
    await this.database.saveMapping(uuid, userHash);

    const queuedPayload = {
      userHash,
      docType: docType || 'KTP',
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      metadata: metadata || {}
    };

    let targetQueue;

    if (client_type === 'web2') {
      queuedPayload.clientType = 'web2';
      queuedPayload.signature = this.crypto.generateSimulatedSignature(userHash);
      targetQueue = this.web2Queue;

      await this.rabbitmq.publishToQueue(this.web2Queue, queuedPayload, {
        headers: {
          correlationId: context.correlationId || '',
          clientType: 'web2'
        }
      });
    } else if (client_type === 'web3') {
      if (!signature || typeof signature !== 'string' || signature.trim().length === 0) {
        throw new ValidationFailError(
          'Klien Web3 wajib menyertakan parameter signature kriptografis dari wallet.'
        );
      }

      queuedPayload.clientType = 'web3';
      queuedPayload.signature = signature.trim();
      targetQueue = this.web3Queue;

      await this.rabbitmq.publishToQueue(this.web3Queue, queuedPayload, {
        headers: {
          correlationId: context.correlationId || '',
          clientType: 'web3'
        }
      });
    } else {
      throw new ValidationFailError(`Tipe klien "${client_type}" tidak didukung.`);
    }

    return {
      status: 'QUEUED',
      userHash,
      clientType: client_type,
      signature: queuedPayload.signature,
      targetQueue,
      queuedAt: new Date().toISOString()
    };
  }
}

const defaultLoggerCore = new LoggerCoreService();

module.exports = defaultLoggerCore;
module.exports.LoggerCoreService = LoggerCoreService;
