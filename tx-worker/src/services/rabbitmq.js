require('dotenv').config();
const amqp = require('amqplib');

class RabbitMQService {
  constructor() {
    this.url = process.env.RABBITMQ_URL || 'amqp://localhost';
    // Sesuai spesifikasi komponen: RabbitMQ dengan queue `tx_log_queue`
    this.queueName = 'tx_log_queue';
    this.connection = null;
    this.channel = null;
  }

  async connect() {
    if (!this.connection) {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();
      
      // Langkah 1: strict FIFO
      // Prefetch = 1 memastikan pesan didengarkan secara berurutan dan satu-satu
      await this.channel.prefetch(1);
      await this.channel.assertQueue(this.queueName, { durable: true });
    }
  }

  /**
   * Langkah 1: Consume
   * Mendengarkan pesan log secara pasif dan berurutan dari antrean RabbitMQ
   * 
   * @param {Function} onMessage - Callback(msg, content)
   */
  async consume(onMessage) {
    await this.connect();
    
    this.channel.consume(this.queueName, async (msg) => {
      if (msg !== null) {
        try {
          const content = JSON.parse(msg.content.toString());
          await onMessage(msg, content);
        } catch (error) {
          console.error('Error parsing message', error);
          // Jika payload cacat dari awal, nack agar tidak block pipeline
          this.nack(msg, false);
        }
      }
    }, { noAck: false }); // Membutuhkan explicit ACK sesuai Langkah 7
  }

  /**
   * Langkah 7: ACK pesan di RabbitMQ (Sukses atau Timeout)
   */
  ack(msg) {
    if (this.channel) {
      this.channel.ack(msg);
    }
  }

  /**
   * Digunakan untuk mengirim pesan kembali atau ke Dead Letter Queue (DLQ)
   */
  nack(msg, requeue = false) {
    if (this.channel) {
      this.channel.nack(msg, false, requeue);
    }
  }
}

module.exports = new RabbitMQService();
