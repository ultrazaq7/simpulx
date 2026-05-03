// ============================================================
// Meta Webhook Controller — Instagram DM + Facebook Messenger
// ============================================================
import {
  Controller,
  Get,
  Post,
  Query,
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
import { MetaChannel } from '../../common/entities/meta-channel.entity';
import { MessageType } from '../../common/entities/message.entity';
import { MessageQueueService } from './message-queue.service';
import { ChatService } from '../chat/chat.service';
import { AutomationService } from '../automation/automation.service';

@ApiTags('webhooks')
@Controller('webhook/meta')
export class MetaWebhookController {
  private logger = new Logger('MetaWebhookController');

  constructor(
    private configService: ConfigService,
    @InjectRepository(MetaChannel) private channelRepo: Repository<MetaChannel>,
    private messageQueue: MessageQueueService,
    private chatService: ChatService,
    private automationService: AutomationService,
  ) {}

  // ── Webhook Verification (GET) ────────────────────────
  @Get()
  @ApiOperation({ summary: 'Meta webhook verification (IG + Messenger)' })
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    this.logger.log(`🔐 Meta webhook verification: mode=${mode}, token=${token}`);

    if (mode !== 'subscribe') return 'Invalid mode';

    // Check static verify token from env (for initial setup)
    const staticToken = this.configService.get<string>('META_WEBHOOK_VERIFY_TOKEN');
    if (staticToken && token === staticToken) {
      this.logger.log(`✅ Meta webhook verified with static token`);
      return parseInt(challenge);
    }

    // Check channel-specific verify token from DB
    const channel = await this.channelRepo.findOne({
      where: { webhookVerifyToken: token, isActive: true },
    });

    if (channel) {
      this.logger.log(`✅ Meta webhook verified for channel: ${channel.name} (${channel.platform})`);
      return parseInt(challenge);
    }

    this.logger.warn('❌ Meta webhook verification failed');
    return 'Forbidden';
  }

  // ── Webhook Event Handler (POST) ──────────────────────
  @Post()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    this.verifySignature(req);

    const body = req.body;
    this.logger.debug(`📨 Meta webhook: ${JSON.stringify(body).substring(0, 300)}`);

    try {
      // Meta webhook can deliver for both Instagram and Messenger
      const object = body?.object; // 'instagram' | 'page'

      if (!body?.entry?.length) return 'OK';

      for (const entry of body.entry) {
        const pageId = entry.id; // Page ID (FB) or IG user ID

        // Instagram messaging events
        if (object === 'instagram' && entry.messaging?.length) {
          await this.processInstagramEvents(pageId, entry.messaging);
        }

        // Facebook Messenger events (object = 'page')
        if (object === 'page' && entry.messaging?.length) {
          await this.processMessengerEvents(pageId, entry.messaging);
        }
      }
    } catch (error) {
      this.logger.error(`❌ Meta webhook error: ${error.message}`, error.stack);
    }

    return 'OK';
  }

  // ── Process Instagram DM Events ───────────────────────
  private async processInstagramEvents(igUserId: string, events: any[]) {
    // Find channel by Instagram account ID
    const channel = await this.channelRepo.findOne({
      where: { instagramAccountId: igUserId, isActive: true },
    });

    if (!channel) {
      this.logger.warn(`No IG channel for account ${igUserId}`);
      return;
    }

    for (const event of events) {
      if (event.message && !event.message.is_echo) {
        await this.processIncomingMessage(channel, event, 'instagram');
      }
    }
  }

  // ── Process Facebook Messenger Events ─────────────────
  private async processMessengerEvents(pageId: string, events: any[]) {
    const channel = await this.channelRepo.findOne({
      where: { pageId, platform: 'messenger', isActive: true },
    });

    if (!channel) {
      this.logger.warn(`No Messenger channel for page ${pageId}`);
      return;
    }

    for (const event of events) {
      if (event.message && !event.message.is_echo) {
        await this.processIncomingMessage(channel, event, 'messenger');
      }

      // Delivery / read receipts
      if (event.delivery || event.read) {
        await this.processStatusEvent(channel, event);
      }
    }
  }

  // ── Process Incoming Message (IG + FB Messenger) ──────
  private async processIncomingMessage(
    channel: MetaChannel,
    event: any,
    platform: 'instagram' | 'messenger',
  ) {
    const senderId = event.sender?.id; // IGSID or PSID
    const message = event.message;

    if (!senderId || !message) return;

    const messageData: any = {
      orgId: channel.organizationId,
      waMessageId: message.mid, // Meta message ID (mid)
      from: senderId,
      phoneNumberId: channel.pageId, // Use pageId for routing
      timestamp: new Date(event.timestamp),
      type: MessageType.TEXT,
      content: '',
      contactName: undefined,
      // Extra fields for IG/FB routing
      metaChannelId: channel.id,
      metaPlatform: platform,
    };

    // Text message
    if (message.text) {
      messageData.content = message.text;
      messageData.type = MessageType.TEXT;
    }

    // Attachments (image, video, audio, file)
    if (message.attachments?.length) {
      const att = message.attachments[0];
      const attType = att.type; // 'image', 'video', 'audio', 'file', 'share'

      if (attType === 'image') messageData.type = MessageType.IMAGE;
      else if (attType === 'video') messageData.type = MessageType.VIDEO;
      else if (attType === 'audio') messageData.type = MessageType.AUDIO;
      else if (attType === 'file') messageData.type = MessageType.DOCUMENT;
      else messageData.type = MessageType.TEXT;

      messageData.mediaUrl = att.payload?.url || '';
      messageData.content = messageData.content || `[${attType}]`;
    }

    // Sticker (IG supports stickers)
    if (message.sticker) {
      messageData.type = MessageType.STICKER;
      messageData.mediaUrl = message.sticker;
    }

    // Process message INLINE for instant WebSocket delivery
    try {
      const result = await this.chatService.processIncomingMessage(
        channel.organizationId,
        senderId,
        {
          waMessageId: messageData.waMessageId,
          type: messageData.type,
          content: messageData.content,
          mediaUrl: messageData.mediaUrl,
          timestamp: messageData.timestamp,
          contactName: messageData.contactName,
          metaChannelId: messageData.metaChannelId,
          metaPlatform: messageData.metaPlatform,
        },
      );
      this.automationService.evaluateRules({
        orgId: channel.organizationId,
        triggerType: result.isNewConversation ? 'new_conversation' : 'new_message',
        conversationId: result.conversation.id,
        messageId: result.message.id,
        contactId: result.contact.id,
        metadata: { content: messageData.content, type: messageData.type },
      }).catch((err) => this.logger.error('Automation error: ' + err.message));
      this.logger.log('\u26a1 [' + platform + '] Processed inline from ' + senderId);
    } catch (error) {
      this.logger.error('Inline failed, queuing: ' + error.message);
      await this.messageQueue.addIncomingMessage(messageData);
    }
  }

  // ── Process Status Events (delivery / read) ───────────
  private async processStatusEvent(channel: MetaChannel, event: any) {
    if (event.delivery) {
      // Delivery receipts — could queue status updates if needed
      // For now, just log
      this.logger.debug(`📬 Delivery receipt: ${JSON.stringify(event.delivery.mids)}`);
    }

    if (event.read) {
      // Read receipt
      this.logger.debug(`👁️ Read receipt: watermark=${event.read.watermark}`);
    }
  }

  // ── Verify Meta Webhook Signature ─────────────────────
  private verifySignature(req: RawBodyRequest<Request>) {
    const appSecret = this.configService.get('META_APP_SECRET') ||
                      this.configService.get('WHATSAPP_APP_SECRET');
    if (!appSecret) return;

    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
      this.logger.warn('⚠️ Missing meta webhook signature');
      return;
    }

    const rawBody = req.rawBody;
    if (!rawBody) return;

    const expectedSignature =
      'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

    if (signature !== expectedSignature) {
      this.logger.warn('⚠️ Invalid meta webhook signature');
    }
  }
}
