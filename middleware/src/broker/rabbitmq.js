'use strict';

const amqp = require('amqplib');
const { BrokerError } = require('../utils/errors');

class RabbitMQBroker {
  constructor(url) {
    this.url = url || process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    this.connection = null;
    this.channel = null;
    this.isConnecting = false;
    this.assertedQueues = new Set();
  }

  async connect() {
    if (this.channel && this.connection) {
      return this.channel;
    }

    if (this.isConnecting) {
      while (this.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      if (this.channel) return this.channel;
    }

    this.isConnecting = true;
    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();

      const resetState = () => {
        this.channel = null;
        this.connection = null;
        this.assertedQueues.clear();
      };

      this.connection.on('error', resetState);
      this.connection.on('close', resetState);
      this.channel.on('error', () => {
        this.channel = null;
        this.assertedQueues.clear();
      });
      this.channel.on('close', () => {
        this.channel = null;
        this.assertedQueues.clear();
      });

      return this.channel;
    } catch (error) {
      this.channel = null;
      this.connection = null;
      throw new BrokerError(`Gagal menghubungkan ke RabbitMQ: ${error.message}`);
    } finally {
      this.isConnecting = false;
    }
  }

  async publishToQueue(queueName, payload, options = {}) {
    if (!queueName || typeof queueName !== 'string') {
      throw new BrokerError('Nama antrean (queueName) wajib diisi.');
    }

    try {
      await this.connect();

      if (!this.assertedQueues.has(queueName)) {
        await this.channel.assertQueue(queueName, { durable: true });
        this.assertedQueues.add(queueName);
      }

      let messageBuffer;
      if (Buffer.isBuffer(payload)) {
        messageBuffer = payload;
      } else if (typeof payload === 'object') {
        messageBuffer = Buffer.from(JSON.stringify(payload));
      } else {
        messageBuffer = Buffer.from(String(payload));
      }

      return this.channel.sendToQueue(queueName, messageBuffer, {
        persistent: true,
        contentType: 'application/json',
        timestamp: Date.now(),
        ...options
      });
    } catch (error) {
      if (error instanceof BrokerError) throw error;
      throw new BrokerError(`Gagal mengirim pesan ke antrean "${queueName}": ${error.message}`);
    }
  }

  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.assertedQueues.clear();
    } catch {
      // Ignore errors on shutdown
    }
  }
}

const defaultBroker = new RabbitMQBroker();

module.exports = defaultBroker;
module.exports.RabbitMQBroker = RabbitMQBroker;
