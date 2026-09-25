'use strict';

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', isClientError = false) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isClientError = isClientError;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationFailError extends AppError {
  constructor(message = 'Validasi payload gagal.') {
    super(message, 400, 'VALIDATION_FAILED', true);
  }
}

class ExternalAPIError extends AppError {
  constructor(message = 'Komunikasi dengan layanan eksternal gagal.') {
    super(message, 502, 'EXTERNAL_API_ERROR', false);
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Terjadi kesalahan pada basis data.') {
    super(message, 500, 'DATABASE_ERROR', false);
  }
}

class BrokerError extends AppError {
  constructor(message = 'Gagal mempublikasikan pesan ke antrean pesan.') {
    super(message, 500, 'BROKER_ERROR', false);
  }
}

class ConfigurationError extends AppError {
  constructor(message = 'Konfigurasi sistem tidak valid.') {
    super(message, 500, 'CONFIGURATION_ERROR', false);
  }
}

module.exports = {
  AppError,
  ValidationFailError,
  ExternalAPIError,
  DatabaseError,
  BrokerError,
  ConfigurationError
};
