// ============================================================
// Message Queue Service — BullMQ for High-volume Processing
// ============================================================
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export const INCOMING_MESSAGE_QUEUE = 'incoming-messages';
export const STATUS_UPDATE_QUEUE = 'status-updates';
export const AUTOMATION_QUEUE = 'automation-triggers';

@Injectable()
export class MessageQueueService {
  private logger = new Logger('MessageQueueService');

  constructor(
    @InjectQueue(INCOMING_MESSAGE_QUEUE) private incomingQueue: Queue,
    @InjectQueue(STATUS_UPDATE_QUEUE) private statusQueue: Queue,
    @InjectQueue(AUTOMATION_QUEUE) private automationQueue: Queue,
  ) {}

  // ── Queue Incoming Message ────────────────────────────
  async addIncomingMessage(data: {
    orgId: string;
    waMessageId: string;
    from: string;
    timestamp: Date;
    type: string;
    content: string;
    mediaUrl?: string;
    contactName?: string;
    referral?: {
      sourceId?: string;
      sourceType?: string;
      sourceUrl?: string;
      headline?: string;
      body?: string;
      ctwaClid?: string;
    };
    // IG / FB Messenger routing
    metaChannelId?: string;
    metaPlatform?: string; // 'instagram' | 'messenger'
  }) {
    await this.incomingQueue.add('process-incoming', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });
    this.logger.debug(`📥 Queued incoming message: ${data.waMessageId}`);
  }

  // ── Queue Status Update ───────────────────────────────
  async addStatusUpdate(data: {
    orgId: string;
    waMessageId: string;
    status: string;
    timestamp: Date;
    errors?: any[];
  }) {
    await this.statusQueue.add('process-status', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: { count: 500 },
    });
  }

  // ── Queue Automation Trigger ──────────────────────────
  async addAutomationTrigger(data: {
    orgId: string;
    triggerType: string;
    conversationId: string;
    messageId?: string;
    contactId?: string;
    metadata?: Record<string, any>;
    /** Push notification data to send AFTER automation routing completes */
    pushNotification?: {
      contactName: string;
      contactPhone?: string;
      messageContent?: string;
      mediaFilename?: string;
      messageSenderId?: string;
    };
  }) {
    await this.automationQueue.add('evaluate-rules', data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 500 },
    });
  }
}
