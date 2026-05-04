// ============================================================
// Message Queue Processor — BullMQ Workers
// ============================================================
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatService } from '../chat/chat.service';
import { Message, MessageStatus } from '../../common/entities/message.entity';
import { MessageQueueService, INCOMING_MESSAGE_QUEUE, STATUS_UPDATE_QUEUE } from './message-queue.service';

@Processor(INCOMING_MESSAGE_QUEUE)
export class IncomingMessageProcessor extends WorkerHost {
  private logger = new Logger('IncomingMessageProcessor');

  constructor(
    private chatService: ChatService,
    private messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async process(job: Job) {
    const data = job.data;
    this.logger.log(`⚙️ Processing incoming message: ${data.waMessageId}`);

    try {
      const result = await this.chatService.processIncomingMessage(
        data.orgId,
        data.from,
        {
          waMessageId: data.waMessageId,
          type: data.type,
          content: data.content,
          mediaUrl: data.mediaUrl,
          timestamp: new Date(data.timestamp),
          phoneNumberId: data.phoneNumberId,
          referral: data.referral,
          contactName: data.contactName,
          metaChannelId: data.metaChannelId,
          metaPlatform: data.metaPlatform,
        },
      );

      // Trigger automation rules AND include push notification data so the
      // push is sent AFTER automation routing completes (correct agent targeting).
      await this.messageQueueService.addAutomationTrigger({
        orgId: data.orgId,
        triggerType: result.isNewConversation ? 'new_conversation' : 'new_message',
        conversationId: result.conversation.id,
        messageId: result.message.id,
        contactId: result.contact.id,
        metadata: {
          content: data.content,
          type: data.type,
          referral: data.referral,
          sourceId: data.referral?.sourceId,
          sourceType: data.referral?.sourceType,
          ctwaClid: data.referral?.ctwaClid,
          headline: data.referral?.headline,
        },
        pushNotification: {
          contactName: result.contact?.name || result.contact?.phone || 'Customer',
          contactPhone: result.contact?.phone,
          messageContent: result.message.content,
          mediaFilename: result.message.mediaFilename,
          messageSenderId: result.message.senderId,
        },
      });

      this.logger.log(`✅ Processed message ${data.waMessageId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to process message: ${error.message}`);
      throw error; // Retry via BullMQ
    }
  }
}

@Processor(STATUS_UPDATE_QUEUE)
export class StatusUpdateProcessor extends WorkerHost {
  private logger = new Logger('StatusUpdateProcessor');

  constructor(
    @InjectRepository(Message) private msgRepo: Repository<Message>,
  ) {
    super();
  }

  async process(job: Job) {
    const data = job.data;

    const statusMap: Record<string, { status: MessageStatus; field: string }> = {
      sent: { status: MessageStatus.SENT, field: 'sentAt' },
      delivered: { status: MessageStatus.DELIVERED, field: 'deliveredAt' },
      read: { status: MessageStatus.READ, field: 'readAt' },
      failed: { status: MessageStatus.FAILED, field: '' },
    };

    const mapping = statusMap[data.status];
    if (!mapping) return;

    const update: any = { status: mapping.status };
    if (mapping.field) {
      update[mapping.field] = new Date(data.timestamp);
    }
    if (data.status === 'failed' && data.errors?.length) {
      update.errorCode = data.errors[0].code?.toString();
      update.errorMessage = data.errors[0].title || data.errors[0].message;
      this.logger.warn(
        `WhatsApp delivery failed: code=${update.errorCode ?? 'unknown'} message=${update.errorMessage ?? 'unknown'}`,
      );
    }

    await this.msgRepo.update(
      { whatsappMessageId: data.waMessageId, organizationId: data.orgId },
      update,
    );

    this.logger.debug(`📊 Status updated: ${data.waMessageId} → ${data.status}`);
  }
}
