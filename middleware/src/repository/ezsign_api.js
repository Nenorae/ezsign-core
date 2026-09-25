'use strict';

const axios = require('axios');
const { ExternalAPIError, ValidationFailError } = require('../utils/errors');

class EzsignApiRepository {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.EZSIGN_API_URL || 'http://localhost:8000/api/v1';
    const rawTimeout = Number(options.timeout || process.env.EZSIGN_API_TIMEOUT || 150);
    this.timeout = Math.min(Math.max(rawTimeout, 100), 200);
    this.mockMode = process.env.MOCK_EZSIGN_API === 'true';

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ezsign-middleware/1.0'
      }
    });
  }

  async verifyUUID(uuid, context = {}) {
    if (!uuid || typeof uuid !== 'string' || uuid.trim().length === 0) {
      throw new ValidationFailError('UUID pengguna tidak boleh kosong.');
    }

    const cleanUuid = uuid.trim();

    if (this.mockMode || process.env.NODE_ENV === 'test') {
      if (cleanUuid === 'invalid-uuid' || cleanUuid.startsWith('mock-invalid')) {
        throw new ValidationFailError('UUID pengguna tidak ditemukan pada ezSign backend (Mock).');
      }
      return {
        valid: true,
        uuid: cleanUuid,
        verifiedAt: Math.floor(Date.now() / 1000)
      };
    }

    try {
      const response = await this.client.get(`/users/${encodeURIComponent(cleanUuid)}/verify`, {
        headers: {
          'x-correlation-id': context.correlationId || ''
        }
      });

      if (response.status === 200 && response.data?.valid !== false) {
        return {
          valid: true,
          uuid: cleanUuid,
          data: response.data
        };
      }

      throw new ValidationFailError('UUID tidak terverifikasi oleh ezSign API.');
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new ExternalAPIError(
          `Batas waktu verifikasi UUID ezSign API terlampaui (> ${this.timeout}ms). Permintaan dibatalkan.`
        );
      }

      if (error.response) {
        const status = error.response.status;
        if (status === 404 || status === 400 || status === 422) {
          throw new ValidationFailError(
            error.response.data?.message || 'UUID pengguna tidak terdaftar pada backend ezSign.'
          );
        }
        throw new ExternalAPIError(
          `ezSign API mengembalikan status error ${status}: ${error.response.data?.message || 'Layanan bermasalah'}`
        );
      }

      if (error instanceof ValidationFailError || error instanceof ExternalAPIError) {
        throw error;
      }

      throw new ExternalAPIError(`Gagal menghubungi server ezSign API: ${error.message}`);
    }
  }
}

const defaultEzsignApi = new EzsignApiRepository();

module.exports = defaultEzsignApi;
module.exports.EzsignApiRepository = EzsignApiRepository;
