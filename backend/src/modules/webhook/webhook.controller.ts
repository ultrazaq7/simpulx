// ============================================================
// WhatsApp Webhook Controller — Meta API Webhook Handler
// ============================================================
import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpCode,
  Logger,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Request } from 'express';
import { Organization } from '../../common/entities/organization.entity';
import { WhatsappChannel } from '../../common/entities/whatsapp-channel.entity';
import { MessageType } from '../../common/entities/message.entity';
import { MessageQueueService } from './message-queue.service';
import { ChatService } from '../chat/chat.service';
import { AutomationService } from '../automation/automation.service';

@ApiTags('webhooks')
@Controller('webhook/whatsapp')
export class WebhookController {
  private logger = new Logger('WebhookController');

  constructor(
    private configService: ConfigService,
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
    @InjectRepository(WhatsappChannel) private channelRepo: Repository<WhatsappChannel>,
    private messageQueue: MessageQueueService,
    private chatService: ChatService,
    private automationService: AutomationService,
  ) {}

  // ── Webhook Verification (GET) ────────────────────────
  @Get()
  @ApiOperation({ summary: 'WhatsApp webhook verification endpoint' })
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    this.logger.log(`🔐 Webhook verification: mode=${mode}`);

    if (mode !== 'subscribe') {
      return 'Invalid mode';
    }

    // Check token against all organizations
    const org = await this.orgRepo.findOne({
      where: { webhookVerifyToken: token },
    });

    if (org) {
      this.logger.log(`✅ Webhook verified for org: ${org.name}`);
      return parseInt(challenge);
    }

    this.logger.warn('❌ Webhook verification failed');
    return 'Forbidden';
  }

  // ── Webhook Event Handler (POST) ──────────────────────
  @Post()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    // Verify signature (security)
    this.verifySignature(req);

    const body = req.body;
    this.logger.debug(`📨 Webhook received: ${JSON.stringify(body).substring(0, 200)}`);

    try {
      const entry = body?.entry?.[0];
      if (!entry) return 'OK';

      const changes = entry.changes?.[0];
      if (!changes || changes.field !== 'messages') return 'OK';

      const value = changes.value;
      const phoneNumberId = value?.metadata?.phone_number_id;

      // Prefer channel-level routing. Organization-level WhatsApp fields remain
      // as a fallback for older single-channel installations.
      const channel = phoneNumberId
        ? await this.channelRepo.findOne({
            where: { phoneNumberId },
            relations: ['organization'],
          })
        : null;
      const org = channel?.organization || await this.orgRepo.findOne({
        where: { whatsappPhoneNumberId: phoneNumberId },
      });

      if (!org) {
        this.logger.warn(`No organization/channel found for phone_number_id: ${phoneNumberId}`);
        return 'OK';
      }

      // Process incoming messages
      if (value.messages) {
        for (const message of value.messages) {
          await this.processIncomingMessage(org.id, message, value.contacts?.[0], phoneNumberId);
        }
      }

      // Process status updates (sent, delivered, read)
      if (value.statuses) {
        for (const status of value.statuses) {
          await this.processStatusUpdate(org.id, status);
        }
      }
    } catch (error) {
      this.logger.error(`❌ Webhook processing error: ${error.message}`, error.stack);
    }

    return 'OK';
  }

  // ── Process Incoming Message ──────────────────────────
  private async processIncomingMessage(
    orgId: string,
    waMessage: any,
    waContact: any,
    phoneNumberId: string,
  ) {
    const messageData = {
      orgId,
      waMessageId: waMessage.id,
      from: waMessage.from,
      phoneNumberId,
      timestamp: new Date(parseInt(waMessage.timestamp) * 1000),
      type: this.mapMessageType(waMessage.type),
      content: '',
      mediaUrl: undefined as string | undefined,
      contactName: waContact?.profile?.name || waMessage.from,
      referral: undefined as any,
    };

    // Extract referral data from CTWA (Click-To-WhatsApp) ads
    if (waMessage.referral) {
      messageData.referral = {
        sourceId: waMessage.referral.source_id,
        sourceType: waMessage.referral.source_type,
        sourceUrl: waMessage.referral.source_url,
        headline: waMessage.referral.headline,
        body: waMessage.referral.body,
        ctwaClid: waMessage.referral.ctwa_clid,
      };
      this.logger.log(`📢 Referral detected: ad=${waMessage.referral.source_id}, headline="${waMessage.referral.headline}"`);
    }

    // Extract content based on type
    switch (waMessage.type) {
      case 'text':
        messageData.content = waMessage.text?.body || '';
        break;
      case 'image':
        messageData.content = waMessage.image?.caption || '';
        messageData.mediaUrl = waMessage.image?.id; // Will be resolved later
        break;
      case 'video':
        messageData.content = waMessage.video?.caption || '';
        messageData.mediaUrl = waMessage.video?.id;
        break;
      case 'audio':
        messageData.mediaUrl = waMessage.audio?.id;
        break;
      case 'document':
        messageData.content = waMessage.document?.caption || waMessage.document?.filename || '';
        messageData.mediaUrl = waMessage.document?.id;
        break;
      case 'location':
        messageData.content = `📍 Location: ${waMessage.location?.latitude}, ${waMessage.location?.longitude}`;
        break;
      case 'sticker':
        messageData.mediaUrl = waMessage.sticker?.id;
        break;
      case 'reaction':
        messageData.content = waMessage.reaction?.emoji || '';
        break;
      default:
        messageData.content = `[Unsupported: ${waMessage.type}]`;
    }

    // Queue message for async processing (BullMQ)
    await this.messageQueue.addIncomingMessage(messageData);

    this.logger.log(`📥 Queued message from ${messageData.from}: ${messageData.type}`);
  }

  // ── Process Status Update ─────────────────────────────
  private async processStatusUpdate(orgId: string, status: any) {
    await this.messageQueue.addStatusUpdate({
      orgId,
      waMessageId: status.id,
      status: status.status, // 'sent', 'delivered', 'read', 'failed'
      timestamp: new Date(parseInt(status.timestamp) * 1000),
      errors: status.errors,
    });
  }

  // ── Map WhatsApp type to our enum ─────────────────────
  private mapMessageType(waType: string): MessageType {
    const typeMap: Record<string, MessageType> = {
      text: MessageType.TEXT,
      image: MessageType.IMAGE,
      video: MessageType.VIDEO,
      audio: MessageType.AUDIO,
      document: MessageType.DOCUMENT,
      location: MessageType.LOCATION,
      sticker: MessageType.STICKER,
      contacts: MessageType.CONTACTS,
      interactive: MessageType.INTERACTIVE,
      reaction: MessageType.REACTION,
    };
    return typeMap[waType] || MessageType.TEXT;
  }

  // ── Verify Meta Webhook Signature ─────────────────────
  private verifySignature(req: RawBodyRequest<Request>) {
    const appSecret = this.configService.get('WHATSAPP_APP_SECRET');
    if (!appSecret) return; // Skip in dev

    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
      this.logger.warn('⚠️ Missing webhook signature');
      return;
    }

    const rawBody = req.rawBody;
    if (!rawBody) return;

    const expectedSignature =
      'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

    if (signature !== expectedSignature) {
      this.logger.error('❌ Invalid webhook signature');
      throw new Error('Invalid webhook signature');
    }
  }
}
