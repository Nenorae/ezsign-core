'use strict';

const { DatabaseError } = require('../utils/errors');

class DatabaseRepository {
  constructor(config = {}) {
    this.connectionString = config.connectionString || process.env.DATABASE_URL || '';
    this.clientType =
      config.client ||
      process.env.DB_CLIENT ||
      (this.connectionString.startsWith('postgres') ? 'pg' : 'mysql2');

    this.pool = config.pool || null;
    this.isInitialized = false;
  }

  async init() {
    if (this.pool) {
      this.isInitialized = true;
      return this.pool;
    }

    if (process.env.ALLOW_IN_MEMORY_DB === 'true' || process.env.NODE_ENV === 'test') {
      this.inMemoryStore = new Map();
      this.isInitialized = true;
      return null;
    }

    try {
      if (this.clientType === 'pg') {
        const { Pool } = require('pg');
        this.pool = new Pool({
          connectionString: this.connectionString || undefined,
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT || 5432),
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'ezsign_db',
          max: Number(process.env.DB_POOL_MAX || 20),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000
        });

        const client = await this.pool.connect();
        client.release();
      } else {
        const mysql = require('mysql2/promise');
        this.pool = mysql.createPool(
          this.connectionString
            ? this.connectionString
            : {
                host: process.env.DB_HOST || 'localhost',
                port: Number(process.env.DB_PORT || 3306),
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'ezsign_db',
                waitForConnections: true,
                connectionLimit: Number(process.env.DB_POOL_MAX || 20),
                queueLimit: 0
              }
        );

        const conn = await this.pool.getConnection();
        conn.release();
      }

      await this.ensureSchema();
      this.isInitialized = true;
      return this.pool;
    } catch (error) {
      if (process.env.NODE_ENV === 'test' || process.env.ALLOW_IN_MEMORY_DB === 'true') {
        this.inMemoryStore = new Map();
        this.isInitialized = true;
        return null;
      }
      throw new DatabaseError(`Gagal menginisialisasi connection pool basis data: ${error.message}`);
    }
  }

  async ensureSchema() {
    if (!this.pool) return;

    try {
      if (this.clientType === 'pg') {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS identity_mappings (
            uuid VARCHAR(128) PRIMARY KEY,
            user_hash VARCHAR(128) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
      } else {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS identity_mappings (
            uuid VARCHAR(128) PRIMARY KEY,
            user_hash VARCHAR(128) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
      }
    } catch (error) {
      throw new DatabaseError(`Gagal membuat skema tabel identity_mappings: ${error.message}`);
    }
  }

  async saveMapping(uuid, userHash) {
    if (!uuid || !userHash) {
      throw new DatabaseError('Parameter uuid dan userHash wajib diisi.');
    }

    if (!this.isInitialized && !this.pool && !this.inMemoryStore) {
      await this.init();
    }

    if (this.inMemoryStore) {
      this.inMemoryStore.set(uuid, { userHash, createdAt: new Date() });
      return true;
    }

    try {
      if (this.clientType === 'pg') {
        const text = `
          INSERT INTO identity_mappings (uuid, user_hash, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (uuid) DO UPDATE SET user_hash = EXCLUDED.user_hash
        `;
        await this.pool.query({ text, values: [uuid, userHash] });
      } else {
        const sql = `
          INSERT INTO identity_mappings (uuid, user_hash, created_at)
          VALUES (?, ?, NOW())
          ON DUPLICATE KEY UPDATE user_hash = VALUES(user_hash)
        `;
        await this.pool.execute(sql, [uuid, userHash]);
      }

      return true;
    } catch (error) {
      throw new DatabaseError(`Gagal menyimpan relasi pemetaan identitas: ${error.message}`);
    }
  }

  async getMapping(uuid) {
    if (!this.isInitialized && !this.pool && !this.inMemoryStore) {
      await this.init();
    }

    if (this.inMemoryStore) {
      const found = this.inMemoryStore.get(uuid);
      return found ? { uuid, userHash: found.userHash, createdAt: found.createdAt } : null;
    }

    try {
      if (this.clientType === 'pg') {
        const text = 'SELECT uuid, user_hash, created_at FROM identity_mappings WHERE uuid = $1 LIMIT 1';
        const res = await this.pool.query({ text, values: [uuid] });
        if (res.rows.length === 0) return null;
        return {
          uuid: res.rows[0].uuid,
          userHash: res.rows[0].user_hash,
          createdAt: res.rows[0].created_at
        };
      } else {
        const sql = 'SELECT uuid, user_hash, created_at FROM identity_mappings WHERE uuid = ? LIMIT 1';
        const [rows] = await this.pool.execute(sql, [uuid]);
        if (rows.length === 0) return null;
        return {
          uuid: rows[0].uuid,
          userHash: rows[0].user_hash,
          createdAt: rows[0].created_at
        };
      }
    } catch (error) {
      throw new DatabaseError(`Gagal mengambil pemetaan identitas: ${error.message}`);
    }
  }

  async close() {
    try {
      if (this.pool && typeof this.pool.end === 'function') {
        await this.pool.end();
        this.pool = null;
      }
      this.isInitialized = false;
    } catch {
      // Ignore errors on close
    }
  }
}

const defaultDatabase = new DatabaseRepository();

module.exports = defaultDatabase;
module.exports.DatabaseRepository = DatabaseRepository;
