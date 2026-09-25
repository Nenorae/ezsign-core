'use strict';

const path = require('path');
const dotenv = require('dotenv');
const pino = require('pino');
const { ConfigurationError } = require('./errors');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const SECRET_KEY = process.env.SECRET_KEY || process.env.SALT_SECRET;

if (!RABBITMQ_URL) {
  throw new ConfigurationError('Variabel lingkungan RABBITMQ_URL wajib dikonfigurasi.');
}

if (!SECRET_KEY) {
  throw new ConfigurationError('Variabel lingkungan SECRET_KEY atau SALT_SECRET wajib dikonfigurasi.');
}

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'password', 'secret', '*.secret', 'uuid'],
    censor: '[TERLINDUNGI]'
  }
});

const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  rabbitmqUrl: RABBITMQ_URL,
  secretKey: SECRET_KEY,
  web2Queue: process.env.RABBITMQ_WEB2_QUEUE || 'web2_pending_signature_queue',
  web3Queue: process.env.RABBITMQ_WEB3_QUEUE || 'web3_ready_queue',
  ezsignApiUrl: process.env.EZSIGN_API_URL || 'http://localhost:8000/api/v1',
  ezsignApiTimeout: Math.min(Math.max(Number(process.env.EZSIGN_API_TIMEOUT || 150), 100), 200),
  db: {
    connectionString: process.env.DATABASE_URL || '',
    client: process.env.DB_CLIENT || (process.env.DATABASE_URL?.startsWith('postgres') ? 'pg' : 'mysql2')
  }
};

module.exports = {
  config,
  logger
};
