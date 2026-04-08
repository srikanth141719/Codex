const amqp = require('amqplib');

let channel = null;
let connection = null;
const QUEUE_NAME = 'submissions';

async function connectRabbitMQ() {
  const url = process.env.RABBITMQ_URL || 'amqp://codex:codex_secret@localhost:5672';
  let retries = 10;

  while (retries > 0) {
    try {
      connection = await amqp.connect(url);
      channel = await connection.createChannel();
      await channel.assertQueue(QUEUE_NAME, { durable: true });
      console.log('✓ RabbitMQ connected, queue asserted:', QUEUE_NAME);
      
      connection.on('close', () => {
        console.error('RabbitMQ connection closed, reconnecting...');
        setTimeout(connectRabbitMQ, 5000);
      });
      
      return channel;
    } catch (err) {
      retries--;
      console.error(`RabbitMQ connection failed, retries left: ${retries}`, err.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('Failed to connect to RabbitMQ after retries');
}

function publishSubmission(submissionData) {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }
  const msg = JSON.stringify(submissionData);
  channel.sendToQueue(QUEUE_NAME, Buffer.from(msg), { persistent: true });
  console.log(`Published submission ${submissionData.submission_id} to queue`);
}

function getChannel() {
  return channel;
}

module.exports = { connectRabbitMQ, publishSubmission, getChannel, QUEUE_NAME };
