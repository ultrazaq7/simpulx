// ============================================================
// WhatsApp Service — Meta Cloud API Integration
// ============================================================
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { Organization } from '../../common/entities/organization.entity';
import { WhatsappChannel } from '../../common/entities/whatsapp-channel.entity';

type WhatsappMessagingConfig = {
  phoneNumberId: string;
  accessToken: string;
};

@Injectable()
export class WhatsappService {
  private logger = new Logger('WhatsappService');
  private apiClient: AxiosInstance;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
    @InjectRepository(WhatsappChannel) private channelRepo: Repository<WhatsappChannel>,
  ) {
    this.apiClient = axios.create({
      baseURL: configService.get('WHATSAPP_API_URL', 'https://graph.facebook.com/v21.0'),
      timeout: 30000,
    });
  }

  // ── Send Text Message ─────────────────────────────────
  async sendTextMessage(
    orgId: string,
    recipientPhone: string,
    text: string,
    channelId?: string | null,
  ): Promise<string> {
    const config = await this.getMessagingConfig(orgId, channelId);

    const response = await this.apiClient.post(
      `/${config.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const waMessageId = response.data.messages?.[0]?.id;
    this.logger.log(`📤 Message sent to ${recipientPhone}: ${waMessageId}`);
    return waMessageId;
  }

  // ── Send Template Message ─────────────────────────────
  async sendTemplateMessage(
    orgId: string,
    recipientPhone: string,
    templateName: string,
    languageCode: string,
    components?: any[],
    channelId?: string | null,
  ): Promise<string> {
    const config = await this.getMessagingConfig(orgId, channelId);

    const payload: any = {
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    if (components) {
      payload.template.components = components;
    }

    const response = await this.apiClient.post(
      `/${config.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.messages?.[0]?.id;
  }

  // ── Send Interactive Message (Buttons / Lists) ────────
  async sendInteractiveMessage(
    orgId: string,
    recipientPhone: string,
    interactive: Record<string, any>,
    channelId?: string | null,
  ): Promise<string> {
    const config = await this.getMessagingConfig(orgId, channelId);

    const response = await this.apiClient.post(
      `/${config.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'interactive',
        interactive,
      },
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const waMessageId = response.data.messages?.[0]?.id;
    this.logger.log(`📤 Interactive message sent to ${recipientPhone}: ${waMessageId}`);
    return waMessageId;
  }

  // ── Send Media Message ────────────────────────────────
  async sendMediaMessage(
    orgId: string,
    recipientPhone: string,
    mediaType: 'image' | 'document' | 'audio' | 'video',
    mediaUrl: string,
    caption?: string,
    channelId?: string | null,
  ): Promise<string> {
    const config = await this.getMessagingConfig(orgId, channelId);

    const mediaPayload: any = { link: mediaUrl };
    if (caption && (mediaType === 'image' || mediaType === 'document')) {
      mediaPayload.caption = caption;
    }

    const response = await this.apiClient.post(
      `/${config.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: mediaType,
        [mediaType]: mediaPayload,
      },
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.messages?.[0]?.id;
  }

  // ── Upload Media to WhatsApp ──────────────────────────
  async uploadMedia(
    orgId: string,
    fileBuffer: Buffer,
    mimeType: string,
    filename: string,
    channelId?: string | null,
  ): Promise<string> {
    const config = await this.getMessagingConfig(orgId, channelId);
    const FormData = require('form-data');
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', fileBuffer, { filename, contentType: mimeType });
    form.append('type', mimeType);

    const response = await this.apiClient.post(
      `/${config.phoneNumberId}/media`,
      form,
      { headers: { ...form.getHeaders(), Authorization: `Bearer ${config.accessToken}` } },
    );

    this.logger.log(`📎 Media uploaded: ${response.data.id}`);
    return response.data.id;
  }

  // ── Send Media by ID ──────────────────────────────────
  async sendMediaById(
    orgId: string,
    recipientPhone: string,
    mediaType: 'image' | 'document' | 'audio' | 'video',
    mediaId: string,
    caption?: string,
    filename?: string,
    channelId?: string | null,
  ): Promise<string> {
    const config = await this.getMessagingConfig(orgId, channelId);
    const mediaPayload: any = { id: mediaId };
    if (caption && (mediaType === 'image' || mediaType === 'document')) {
      mediaPayload.caption = caption;
    }
    if (filename && mediaType === 'document') {
      mediaPayload.filename = filename;
    }

    const response = await this.apiClient.post(
      `/${config.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: mediaType,
        [mediaType]: mediaPayload,
      },
      { headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' } },
    );

    return response.data.messages?.[0]?.id;
  }

  // ── Download Media from WhatsApp ──────────────────────
  async downloadMedia(orgId: string, mediaId: string, channelId?: string | null): Promise<{ url: string; mimeType: string }> {
    const config = await this.getMessagingConfig(orgId, channelId);

    // Step 1: Get media URL from Meta
    const mediaInfo = await this.apiClient.get(`/${mediaId}`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });

    return {
      url: mediaInfo.data.url,
      mimeType: mediaInfo.data.mime_type,
    };
  }

  // ── Fetch Media Bytes from a Signed Meta URL ──────────
  async fetchMediaBytes(
    orgId: string,
    signedUrl: string,
    channelId?: string | null,
  ): Promise<Buffer> {
    const config = await this.getMessagingConfig(orgId, channelId);
    const response = await axios.get(signedUrl, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    return Buffer.from(response.data);
  }

  // ── Mark Message as Read ──────────────────────────────
  async markAsRead(orgId: string, waMessageId: string, channelId?: string | null): Promise<void> {
    const config = await this.getMessagingConfig(orgId, channelId);

    await this.apiClient.post(
      `/${config.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: waMessageId,
      },
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
  }

  // ── Verify Webhook Token ──────────────────────────────
  async verifyWebhookToken(orgSlug: string, token: string): Promise<boolean> {
    const org = await this.orgRepo.findOne({ where: { slug: orgSlug } });
    return org?.webhookVerifyToken === token;
  }

  // ── Get Org Config ────────────────────────────────────
  private async getOrgConfig(orgId: string): Promise<Organization> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org || !org.whatsappAccessToken || !org.whatsappPhoneNumberId) {
      throw new Error('WhatsApp not configured for this organization');
    }
    return org;
  }

  private async getMessagingConfig(
    orgId: string,
    channelId?: string | null,
  ): Promise<WhatsappMessagingConfig> {
    if (channelId) {
      const channel = await this.channelRepo.findOne({
        where: { id: channelId, organizationId: orgId, isActive: true },
      });

      if (!channel || !channel.accessToken || !channel.phoneNumberId) {
        throw new Error('WhatsApp channel is not configured');
      }

      return {
        phoneNumberId: channel.phoneNumberId,
        accessToken: channel.accessToken,
      };
    }

    const channel = await this.channelRepo.findOne({
      where: { organizationId: orgId, isActive: true },
      order: { createdAt: 'ASC' },
    });

    if (channel?.accessToken && channel.phoneNumberId) {
      return {
        phoneNumberId: channel.phoneNumberId,
        accessToken: channel.accessToken,
      };
    }

    const org = await this.getOrgConfig(orgId);
    return {
      phoneNumberId: org.whatsappPhoneNumberId,
      accessToken: org.whatsappAccessToken,
    };
  }
}
