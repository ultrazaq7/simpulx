// ============================================================
// Broadcasts Module â€” CRUD + Real WhatsApp Send Logic
// ============================================================
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseGuards, Request, Injectable, NotFoundException, Logger, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Raw, Repository } from 'typeorm';
import { Broadcast, BroadcastStatus } from '../../common/entities/broadcast.entity';
import { Contact } from '../../common/entities/contact.entity';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { WhatsappService } from '../webhook/whatsapp.service';
import { WebhookModule } from '../webhook/webhook.module';

// â”€â”€ Service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger('BroadcastsService');

  constructor(
    @InjectRepository(Broadcast) private broadcastRepo: Repository<Broadcast>,
    @InjectRepository(Contact) private contactRepo: Repository<Contact>,
    private readonly whatsappService: WhatsappService,
  ) {}

  async list(orgId: string, options: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = options;
    const [broadcasts, total] = await this.broadcastRepo.findAndCount({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['createdBy'],
    });
    return { data: broadcasts, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async get(orgId: string, id: string) {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id, organizationId: orgId },
      relations: ['createdBy'],
    });
    if (!broadcast) throw new NotFoundException('Broadcast not found');
    return broadcast;
  }

  async create(orgId: string, userId: string, data: {
    name: string;
    message?: string;
    broadcastType?: string;
    channelId?: string;
    templateName?: string;
    languageCode?: string;
    templateComponents?: any[];
    recipientFilter?: any;
    scheduledAt?: Date;
  }) {
    const selectedContactIds = Array.isArray(data.recipientFilter?.contactIds)
      ? data.recipientFilter.contactIds.filter((id: any) => typeof id === 'string' && id.trim().length > 0)
      : [];

    const recipientCount = selectedContactIds.length > 0
      ? await this.contactRepo.count({
          where: {
            organizationId: orgId,
            isBlocked: false,
            id: In(selectedContactIds),
          },
        })
      : await this.contactRepo.count({ where: { organizationId: orgId, isBlocked: false } });

    const recipientFilter = selectedContactIds.length > 0
      ? { mode: 'selected', contactIds: selectedContactIds }
      : (data.recipientFilter || { mode: 'all' });

    const broadcast = this.broadcastRepo.create({
      organizationId: orgId,
      createdById: userId,
      name: data.name,
      message: data.message,
      broadcastType: data.broadcastType || 'text',
      channelId: data.channelId,
      templateName: data.templateName,
      languageCode: data.languageCode || 'en_US',
      templateComponents: data.templateComponents,
      recipientFilter,
      totalRecipients: recipientCount,
      status: data.scheduledAt ? BroadcastStatus.SCHEDULED : BroadcastStatus.DRAFT,
      scheduledAt: data.scheduledAt || undefined,
    });
    return this.broadcastRepo.save(broadcast);
  }

  async sendTest(orgId: string, data: {
    broadcastType?: string;
    channelId?: string;
    message?: string;
    templateName?: string;
    languageCode?: string;
    templateComponents?: any[];
    contactId?: string;
    phone?: string;
  }) {
    let targetPhone = data.phone?.toString().trim();

    if (!targetPhone && data.contactId) {
      const contact = await this.contactRepo.findOne({
        where: { id: data.contactId, organizationId: orgId },
        select: ['id', 'phone', 'name'],
      });
      if (!contact) throw new NotFoundException('Contact not found');
      targetPhone = contact.phone?.toString().trim();
    }

    if (!targetPhone) {
      throw new BadRequestException('Target phone is required');
    }

    const type = data.broadcastType || 'text';
    if (type === 'template') {
      if (!data.templateName) {
        throw new BadRequestException('Template name is required for template test send');
      }
      await this.whatsappService.sendTemplateMessage(
        orgId,
        targetPhone,
        data.templateName,
        data.languageCode || 'en_US',
        data.templateComponents || [],
        data.channelId || null,
      );
    } else {
      if (!data.message?.trim()) {
        throw new BadRequestException('Message is required for text test send');
      }
      await this.whatsappService.sendTextMessage(
        orgId,
        targetPhone,
        data.message.trim(),
        data.channelId || null,
      );
    }

    return {
      ok: true,
      phone: targetPhone,
      mode: type,
    };
  }

  async update(orgId: string, id: string, updates: Partial<Broadcast>) {
    await this.broadcastRepo.update({ id, organizationId: orgId }, updates);
    return this.get(orgId, id);
  }

  async delete(orgId: string, id: string) {
    const result = await this.broadcastRepo.delete({ id, organizationId: orgId });
    if (result.affected === 0) throw new NotFoundException('Broadcast not found');
    return { deleted: true };
  }

  async send(orgId: string, id: string) {
    const broadcast = await this.get(orgId, id);

    // Mark as sending
    broadcast.status = BroadcastStatus.SENDING;
    broadcast.sentAt = new Date();
    await this.broadcastRepo.save(broadcast);

    const selectedContactIds = Array.isArray(broadcast.recipientFilter?.contactIds)
      ? broadcast.recipientFilter.contactIds.filter((contactId: any) => typeof contactId === 'string' && contactId.trim().length > 0)
      : [];

    const filterTags: string[] = Array.isArray(broadcast.recipientFilter?.tags)
      ? broadcast.recipientFilter.tags.filter((t: any) => typeof t === 'string' && t.trim().length > 0)
      : [];

    // Load unblocked contacts with phone numbers, optionally filtered by selected audience or tags
    const whereCondition: any = { organizationId: orgId, isBlocked: false };
    if (selectedContactIds.length > 0) {
      whereCondition.id = In(selectedContactIds);
    } else if (filterTags.length > 0) {
      whereCondition.tags = Raw((alias) => `${alias} && ARRAY[:...tags]::text[]`, { tags: filterTags });
    }

    const contacts = await this.contactRepo.find({
      where: whereCondition,
      select: ['id', 'phone', 'name'],
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const contact of contacts) {
      if (!contact.phone) { failedCount++; continue; }
      try {
        if (broadcast.broadcastType === 'template' && broadcast.templateName) {
          await this.whatsappService.sendTemplateMessage(
            orgId,
            contact.phone,
            broadcast.templateName,
            broadcast.languageCode || 'en_US',
            broadcast.templateComponents || [],
            broadcast.channelId || null,
          );
        } else if (broadcast.message) {
          await this.whatsappService.sendTextMessage(
            orgId,
            contact.phone,
            broadcast.message,
            broadcast.channelId || null,
          );
        }
        sentCount++;
      } catch (err) {
        this.logger.warn(`Broadcast ${id}: Failed to send to ${contact.phone}: ${err.message}`);
        failedCount++;
      }
    }

    broadcast.status = BroadcastStatus.SENT;
    broadcast.sentCount = sentCount;
    broadcast.failedCount = failedCount;
    broadcast.totalRecipients = contacts.length;
    await this.broadcastRepo.save(broadcast);

    this.logger.log(`Broadcast ${id} sent: ${sentCount} ok, ${failedCount} failed`);
    return broadcast;
  }
}

// â”€â”€ Controller â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@ApiTags('broadcasts')
@Controller('broadcasts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BroadcastsController {
  constructor(private readonly service: BroadcastsService) {}

  @Get()
  @ApiOperation({ summary: 'List broadcasts' })
  list(@Request() req, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.service.list(req.user.organizationId, { page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get broadcast' })
  get(@Request() req, @Param('id') id: string) {
    return this.service.get(req.user.organizationId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create broadcast' })
  create(@Request() req, @Body() body: any) {
    return this.service.create(req.user.organizationId, req.user.id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update broadcast' })
  update(@Request() req, @Param('id') id: string, @Body() body: Partial<Broadcast>) {
    return this.service.update(req.user.organizationId, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete broadcast' })
  remove(@Request() req, @Param('id') id: string) {
    return this.service.delete(req.user.organizationId, id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send broadcast' })
  send(@Request() req, @Param('id') id: string) {
    return this.service.send(req.user.organizationId, id);
  }

  @Post('test-send')
  @ApiOperation({ summary: 'Send test broadcast message' })
  sendTest(@Request() req, @Body() body: any) {
    return this.service.sendTest(req.user.organizationId, body);
  }
}

// â”€â”€ Module â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@Module({
  imports: [TypeOrmModule.forFeature([Broadcast, Contact]), WebhookModule],
  controllers: [BroadcastsController],
  providers: [BroadcastsService],
  exports: [BroadcastsService],
})
export class BroadcastsModule {}

