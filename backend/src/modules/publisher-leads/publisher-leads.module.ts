// ============================================================
// Publisher Leads Module — Inbound leads from external publishers
// ============================================================
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  UseGuards,
  Request,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Contact, SourceChannel } from '../../common/entities/contact.entity';
import {
  Conversation,
  ConversationStatus,
  ConversationChannel,
} from '../../common/entities/conversation.entity';
import { Publisher } from '../../common/entities/publisher.entity';
import {
  ChannelInteraction,
  InteractionType,
} from '../../common/entities/channel-interaction.entity';
import {
  Message,
  MessageDirection,
  MessageType,
  MessageStatus,
} from '../../common/entities/message.entity';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { ChatGateway } from '../chat/chat.gateway';
import { ChatModule } from '../chat/chat.module';
import { MessageQueueService } from '../webhook/message-queue.service';
import { WebhookModule } from '../webhook/webhook.module';
import { Organization } from '../../common/entities/organization.entity';

// ── Service ─────────────────────────────────────────────
@Injectable()
export class PublisherLeadsService {
  private readonly logger = new Logger(PublisherLeadsService.name);

  constructor(
    @InjectRepository(Publisher)
    private publisherRepo: Repository<Publisher>,
    @InjectRepository(Contact)
    private contactRepo: Repository<Contact>,
    @InjectRepository(Conversation)
    private convRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private msgRepo: Repository<Message>,
    @InjectRepository(ChannelInteraction)
    private interactionRepo: Repository<ChannelInteraction>,
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
    private chatGateway: ChatGateway,
    private messageQueueService: MessageQueueService,
  ) {}

  // ── CRUD publishers ──────────────────────────────────
  async getPublishers(orgId: string) {
    return this.publisherRepo.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
    });
  }

  async getPublisher(orgId: string, id: string) {
    const pub = await this.publisherRepo.findOne({
      where: { id, organizationId: orgId },
    });
    if (!pub) throw new NotFoundException('Publisher not found');
    return pub;
  }

  async createPublisher(
    orgId: string,
    data: { name: string; slug?: string; autoAssignDeptId?: string; autoTemplateName?: string; webhookUrl?: string },
  ) {
    const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const apiKey = crypto.randomBytes(32).toString('hex');
    const publisher = this.publisherRepo.create({
      organizationId: orgId,
      name: data.name,
      slug,
      apiKey,
      autoAssignDeptId: data.autoAssignDeptId,
      autoTemplateName: data.autoTemplateName,
      webhookUrl: data.webhookUrl,
    });
    return this.publisherRepo.save(publisher);
  }

  async updatePublisher(orgId: string, id: string, updates: Partial<Publisher>) {
    const pub = await this.getPublisher(orgId, id);
    // Don't let them overwrite apiKey or orgId
    delete updates.apiKey;
    delete (updates as any).organizationId;
    Object.assign(pub, updates);
    return this.publisherRepo.save(pub);
  }

  async deletePublisher(orgId: string, id: string) {
    const pub = await this.getPublisher(orgId, id);
    await this.publisherRepo.remove(pub);
    return { deleted: true };
  }

  async regenerateApiKey(orgId: string, id: string) {
    const pub = await this.getPublisher(orgId, id);
    pub.apiKey = crypto.randomBytes(32).toString('hex');
    return this.publisherRepo.save(pub);
  }

  // ── Inbound lead (public API) ────────────────────────
  async ingestLead(
    apiKey: string,
    lead: {
      phone: string;
      name?: string;
      email?: string;
      notes?: string;
      metadata?: Record<string, any>;
    },
  ) {
    // Validate API key
    const publisher = await this.publisherRepo.findOne({
      where: { apiKey, isActive: true },
    });
    if (!publisher) {
      throw new UnauthorizedException('Invalid or inactive API key');
    }
    if (!lead.phone) {
      throw new BadRequestException('Phone number is required');
    }

    const orgId = publisher.organizationId;
    const phone = lead.phone.replace(/[^0-9]/g, '');

    // Find or create contact
    let contact = await this.contactRepo.findOne({
      where: { organizationId: orgId, phone },
    });
    if (!contact) {
      contact = await this.contactRepo.findOne({
        where: { organizationId: orgId, whatsappId: phone },
      });
    }

    const isNewContact = !contact;
    if (!contact) {
      contact = this.contactRepo.create({
        organizationId: orgId,
        whatsappId: phone,
        phone,
        name: lead.name || phone,
        email: lead.email,
        sourceChannel: SourceChannel.PUBLISHER,
        sourceCampaignId: publisher.id,
        sourceCampaignName: publisher.name,
        sourceMetadata: { publisherSlug: publisher.slug, ...lead.metadata },
        firstContactedAt: new Date(),
      });
      await this.contactRepo.save(contact);
    }

    // Create conversation with system message
    const conversation = this.convRepo.create({
      organizationId: orgId,
      contactId: contact.id,
      channel: ConversationChannel.WHATSAPP,
      status: ConversationStatus.OPEN,
      sourceChannel: SourceChannel.PUBLISHER,
      crossChannelGroupId: contact.crossChannelGroupId || contact.id,
      departmentId: publisher.autoAssignDeptId || undefined,
      lastMessageAt: new Date(),
      lastMessagePreview: `📥 Lead from ${publisher.name}`,
      lastMessageSenderType: 'system',
    });
    await this.convRepo.save(conversation);

    // Create system message card
    const systemContent = [
      `📥 New lead from **${publisher.name}**`,
      `👤 ${lead.name || phone}`,
      lead.email ? `📧 ${lead.email}` : null,
      lead.notes ? `📝 ${lead.notes}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const message = this.msgRepo.create({
      conversationId: conversation.id,
      organizationId: orgId,
      senderType: 'system',
      direction: MessageDirection.INBOUND,
      type: MessageType.TEXT,
      content: systemContent,
      status: MessageStatus.DELIVERED,
      deliveredAt: new Date(),
    });
    await this.msgRepo.save(message);

    // Record interaction
    await this.interactionRepo.save(
      this.interactionRepo.create({
        organizationId: orgId,
        contactId: contact.id,
        channel: SourceChannel.PUBLISHER,
        interactionType: InteractionType.LEAD_CREATED,
        metadata: {
          publisherId: publisher.id,
          publisherName: publisher.name,
          conversationId: conversation.id,
          ...lead.metadata,
        },
      }),
    );

    // Broadcast new conversation
    const loaded = await this.convRepo.findOne({
      where: { id: conversation.id },
      relations: ['contact'],
    });
    if (loaded) {
      this.chatGateway.broadcastNewConversation(orgId, loaded);
    }

    // Trigger automation rules for new publisher lead
    try {
      await this.messageQueueService.addAutomationTrigger({
        orgId,
        triggerType: 'new_conversation',
        conversationId: conversation.id,
        contactId: contact.id,
        metadata: {
          source: 'publisher',
          publisherId: publisher.id,
          publisherName: publisher.name,
        },
      });
    } catch (e) {
      this.logger.warn(`Automation trigger failed for publisher lead: ${e.message}`);
    }

    this.logger.log(
      `📥 Lead ingested from publisher "${publisher.name}" → contact ${contact.id}`,
    );

    return {
      success: true,
      contactId: contact.id,
      conversationId: conversation.id,
      isNewContact,
    };
  }

  // ── Form lead (public, no API key) ────────────────────
  async ingestFormLead(lead: {
    orgSlug: string;
    phone: string;
    name?: string;
    email?: string;
    notes?: string;
    metadata?: Record<string, any>;
  }) {
    const org = await this.orgRepo.findOne({ where: { slug: lead.orgSlug } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const orgId = org.id;
    const phone = lead.phone.replace(/[^0-9]/g, '');

    let contact = await this.contactRepo.findOne({
      where: { organizationId: orgId, phone },
    });
    if (!contact) {
      contact = await this.contactRepo.findOne({
        where: { organizationId: orgId, whatsappId: phone },
      });
    }

    const isNewContact = !contact;
    if (!contact) {
      contact = this.contactRepo.create({
        organizationId: orgId,
        whatsappId: phone,
        phone,
        name: lead.name || phone,
        email: lead.email,
        sourceChannel: SourceChannel.FORM,
        sourceMetadata: lead.metadata,
        firstContactedAt: new Date(),
      });
      await this.contactRepo.save(contact);
    }

    const conversation = this.convRepo.create({
      organizationId: orgId,
      contactId: contact.id,
      channel: ConversationChannel.WHATSAPP,
      status: ConversationStatus.OPEN,
      sourceChannel: SourceChannel.FORM,
      crossChannelGroupId: contact.crossChannelGroupId || contact.id,
      lastMessageAt: new Date(),
      lastMessagePreview: `📋 Form submission from ${lead.name || phone}`,
      lastMessageSenderType: 'system',
    });
    await this.convRepo.save(conversation);

    const systemContent = [
      `📋 New form submission`,
      `👤 ${lead.name || phone}`,
      lead.email ? `📧 ${lead.email}` : null,
      lead.notes ? `📝 ${lead.notes}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const message = this.msgRepo.create({
      conversationId: conversation.id,
      organizationId: orgId,
      senderType: 'system',
      direction: MessageDirection.INBOUND,
      type: MessageType.TEXT,
      content: systemContent,
      status: MessageStatus.DELIVERED,
      deliveredAt: new Date(),
    });
    await this.msgRepo.save(message);

    await this.interactionRepo.save(
      this.interactionRepo.create({
        organizationId: orgId,
        contactId: contact.id,
        channel: SourceChannel.FORM,
        interactionType: InteractionType.LEAD_CREATED,
        metadata: { source: 'landing_form', conversationId: conversation.id, ...lead.metadata },
      }),
    );

    const loaded = await this.convRepo.findOne({
      where: { id: conversation.id },
      relations: ['contact'],
    });
    if (loaded) {
      this.chatGateway.broadcastNewConversation(orgId, loaded);
    }

    try {
      await this.messageQueueService.addAutomationTrigger({
        orgId,
        triggerType: 'new_conversation',
        conversationId: conversation.id,
        contactId: contact.id,
        metadata: { source: 'form' },
      });
    } catch (e) {
      this.logger.warn(`Automation trigger failed for form lead: ${e.message}`);
    }

    this.logger.log(`📋 Form lead ingested → contact ${contact.id}`);

    return { success: true, contactId: contact.id, conversationId: conversation.id, isNewContact };
  }
}

// ── Controller (authenticated — publisher CRUD) ─────────
@ApiTags('publishers')
@Controller('publishers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PublishersController {
  constructor(private readonly service: PublisherLeadsService) {}

  @Get()
  @ApiOperation({ summary: 'List publishers' })
  getPublishers(@Request() req) {
    return this.service.getPublishers(req.user.orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get publisher details' })
  getPublisher(@Request() req, @Param('id') id: string) {
    return this.service.getPublisher(req.user.orgId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create publisher' })
  createPublisher(
    @Request() req,
    @Body() body: { name: string; slug?: string; autoAssignDeptId?: string; autoTemplateName?: string; webhookUrl?: string },
  ) {
    return this.service.createPublisher(req.user.orgId, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update publisher' })
  updatePublisher(
    @Request() req,
    @Param('id') id: string,
    @Body() body: Partial<Publisher>,
  ) {
    return this.service.updatePublisher(req.user.orgId, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete publisher' })
  deletePublisher(@Request() req, @Param('id') id: string) {
    return this.service.deletePublisher(req.user.orgId, id);
  }

  @Post(':id/regenerate-key')
  @ApiOperation({ summary: 'Regenerate API key' })
  regenerateKey(@Request() req, @Param('id') id: string) {
    return this.service.regenerateApiKey(req.user.orgId, id);
  }
}

// ── Controller (public — lead ingestion) ────────────────
@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly service: PublisherLeadsService) {}

  @Post('publisher')
  @ApiOperation({ summary: 'Ingest lead from publisher (public, API-key auth)' })
  ingestLead(
    @Headers('x-api-key') apiKey: string,
    @Body()
    body: {
      phone: string;
      name?: string;
      email?: string;
      notes?: string;
      metadata?: Record<string, any>;
    },
  ) {
    if (!apiKey) {
      throw new UnauthorizedException('x-api-key header required');
    }
    return this.service.ingestLead(apiKey, body);
  }

  @Post('form')
  @ApiOperation({ summary: 'Submit lead from landing page form (public, org slug)' })
  ingestFormLead(
    @Body()
    body: {
      orgSlug: string;
      phone: string;
      name?: string;
      email?: string;
      notes?: string;
      metadata?: Record<string, any>;
    },
  ) {
    if (!body.orgSlug) {
      throw new BadRequestException('orgSlug is required');
    }
    if (!body.phone) {
      throw new BadRequestException('Phone number is required');
    }
    return this.service.ingestFormLead(body);
  }
}

// ── Module ──────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Publisher,
      Contact,
      Conversation,
      Message,
      ChannelInteraction,
      Organization,
    ]),
    ChatModule,
    WebhookModule,
  ],
  controllers: [PublishersController, LeadsController],
  providers: [PublisherLeadsService],
  exports: [PublisherLeadsService],
})
export class PublisherLeadsModule {}
