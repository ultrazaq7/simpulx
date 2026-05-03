// ============================================================
// Meta Messaging Service — Instagram DM + Facebook Messenger
// Uses the Meta Send API (Graph API v21.0)
// ============================================================
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';
import { MetaChannel } from '../../common/entities/meta-channel.entity';

@Injectable()
export class MetaMessagingService {
  private logger = new Logger('MetaMessagingService');
  private apiClient: AxiosInstance;

  constructor(
    private configService: ConfigService,
    @InjectRepository(MetaChannel) private channelRepo: Repository<MetaChannel>,
  ) {
    this.apiClient = axios.create({
      baseURL: configService.get('WHATSAPP_API_URL', 'https://graph.facebook.com/v21.0'),
      timeout: 30000,
    });
  }

  // ── Send Text Message ─────────────────────────────────
  async sendTextMessage(
    channelId: string,
    recipientId: string, // IGSID or PSID
    text: string,
  ): Promise<string> {
    const channel = await this.getChannel(channelId);

    const response = await this.apiClient.post(
      `/${channel.pageId}/messages`,
      {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text },
      },
      {
        headers: {
          Authorization: `Bearer ${channel.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const messageId = response.data.message_id;
    this.logger.log(`📤 [${channel.platform}] Message sent to ${recipientId}: ${messageId}`);
    return messageId;
  }

  // ── Send Media (Image/Video/File via URL) ─────────────
  async sendMediaMessage(
    channelId: string,
    recipientId: string,
    mediaType: 'image' | 'video' | 'audio' | 'file',
    mediaUrl: string,
    caption?: string,
  ): Promise<string> {
    const channel = await this.getChannel(channelId);

    const payload: any = {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: {
        attachment: {
          type: mediaType === 'file' ? 'file' : mediaType,
          payload: { url: mediaUrl, is_reusable: true },
        },
      },
    };

    const response = await this.apiClient.post(
      `/${channel.pageId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${channel.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const messageId = response.data.message_id;
    this.logger.log(`📤 [${channel.platform}] Media sent to ${recipientId}: ${messageId}`);

    // If there's a caption, send it as a follow-up text
    if (caption) {
      await this.sendTextMessage(channelId, recipientId, caption);
    }

    return messageId;
  }

  // ── Mark Message as Seen ──────────────────────────────
  async markAsSeen(
    channelId: string,
    senderId: string,
  ): Promise<void> {
    const channel = await this.getChannel(channelId);

    await this.apiClient.post(
      `/${channel.pageId}/messages`,
      {
        recipient: { id: senderId },
        sender_action: 'mark_seen',
      },
      {
        headers: {
          Authorization: `Bearer ${channel.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
  }

  // ── Get Channel Config ────────────────────────────────
  async getChannel(channelId: string): Promise<MetaChannel> {
    const channel = await this.channelRepo.findOne({
      where: { id: channelId, isActive: true },
    });
    if (!channel) {
      throw new Error(`Meta channel ${channelId} not found or inactive`);
    }
    return channel;
  }

  // ── Find channel by page ID ───────────────────────────
  async findChannelByPageId(pageId: string): Promise<MetaChannel | null> {
    return this.channelRepo.findOne({
      where: { pageId, isActive: true },
    });
  }

  // ── Find channel by Instagram Account ID ──────────────
  async findChannelByInstagramAccountId(igAccountId: string): Promise<MetaChannel | null> {
    return this.channelRepo.findOne({
      where: { instagramAccountId: igAccountId, isActive: true },
    });
  }
}
