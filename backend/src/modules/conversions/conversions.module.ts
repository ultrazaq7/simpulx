// ============================================================
// Conversions Module — Track lead-to-conversion events
// ============================================================
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact, SourceChannel } from '../../common/entities/contact.entity';
import { Conversation } from '../../common/entities/conversation.entity';
import { ConversionEvent } from '../../common/entities/conversion-event.entity';
import {
  ChannelInteraction,
  InteractionType,
} from '../../common/entities/channel-interaction.entity';
import { JwtAuthGuard } from '../auth/jwt.strategy';

// ── Service ─────────────────────────────────────────────
@Injectable()
export class ConversionsService {
  private readonly logger = new Logger(ConversionsService.name);

  constructor(
    @InjectRepository(ConversionEvent)
    private conversionRepo: Repository<ConversionEvent>,
    @InjectRepository(Contact)
    private contactRepo: Repository<Contact>,
    @InjectRepository(Conversation)
    private convRepo: Repository<Conversation>,
    @InjectRepository(ChannelInteraction)
    private interactionRepo: Repository<ChannelInteraction>,
  ) {}

  // ── Mark as Converted ────────────────────────────────
  async markConverted(
    orgId: string,
    data: {
      contactId?: string;
      conversationId?: string;
      amount?: number;
      metadata?: Record<string, any>;
    },
    userId: string,
  ) {
    let contact: Contact | null = null;
    let conversation: Conversation | null = null;
    let channelCredited: SourceChannel = SourceChannel.WHATSAPP_DIRECT;

    if (data.conversationId) {
      conversation = await this.convRepo.findOne({
        where: { id: data.conversationId, organizationId: orgId },
        relations: ['contact'],
      });
      if (!conversation) throw new NotFoundException('Conversation not found');
      contact = conversation.contact;
      channelCredited =
        conversation.sourceChannel || contact?.sourceChannel || SourceChannel.WHATSAPP_DIRECT;
    } else if (data.contactId) {
      contact = await this.contactRepo.findOne({
        where: { id: data.contactId, organizationId: orgId },
      });
      if (!contact) throw new NotFoundException('Contact not found');
      channelCredited = contact.sourceChannel || SourceChannel.WHATSAPP_DIRECT;
    } else {
      throw new NotFoundException('contactId or conversationId required');
    }

    // Create conversion event
    const event = this.conversionRepo.create({
      organizationId: orgId,
      contactId: contact!.id,
      conversationId: conversation?.id,
      channelCredited,
      amount: data.amount || 0,
      metadata: { ...data.metadata, markedBy: userId },
      convertedAt: new Date(),
    });
    await this.conversionRepo.save(event);

    // Update contact
    await this.contactRepo.update(contact!.id, {
      convertedAt: new Date(),
      conversionValue: data.amount || 0,
      conversionMetadata: { ...data.metadata, eventId: event.id } as any,
    });

    // Record interaction
    await this.interactionRepo.save(
      this.interactionRepo.create({
        organizationId: orgId,
        contactId: contact!.id,
        channel: channelCredited,
        interactionType: InteractionType.CONVERSION,
        metadata: {
          eventId: event.id,
          amount: data.amount,
          conversationId: conversation?.id,
        },
      }),
    );

    this.logger.log(
      `✅ Conversion: contact=${contact!.id}, channel=${channelCredited}, amount=${data.amount || 0}`,
    );

    return event;
  }

  // ── List Conversions ────────────────────────────────
  async getConversions(
    orgId: string,
    filters: {
      page?: number;
      limit?: number;
      dateRange?: string;
      channel?: SourceChannel;
    },
  ) {
    const { page = 1, limit = 50, channel } = filters;
    const qb = this.conversionRepo
      .createQueryBuilder('ce')
      .leftJoinAndSelect('ce.contact', 'contact')
      .leftJoinAndSelect('ce.conversation', 'conv')
      .where('ce.organization_id = :orgId', { orgId })
      .orderBy('ce.converted_at', 'DESC');

    if (channel) {
      qb.andWhere('ce.channel_credited = :channel', { channel });
    }

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { conversions: items, total, page, limit };
  }

  // ── Funnel Stats (for dashboard) ─────────────────────
  async getFunnelStats(orgId: string, dateRange?: string) {
    const range = this._resolveDateRange(dateRange);

    // Total leads per channel
    const leadsByChannel = await this.contactRepo
      .createQueryBuilder('c')
      .select('c.source_channel', 'channel')
      .addSelect('COUNT(*)', 'count')
      .where('c.organization_id = :orgId', { orgId })
      .andWhere('c.created_at >= :start', { start: range.startDate })
      .andWhere('c.created_at < :end', { end: range.endDate })
      .groupBy('c.source_channel')
      .getRawMany();

    // Conversions per channel
    const conversionsByChannel = await this.conversionRepo
      .createQueryBuilder('ce')
      .select('ce.channel_credited', 'channel')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(ce.amount)', 'totalAmount')
      .where('ce.organization_id = :orgId', { orgId })
      .andWhere('ce.converted_at >= :start', { start: range.startDate })
      .andWhere('ce.converted_at < :end', { end: range.endDate })
      .groupBy('ce.channel_credited')
      .getRawMany();

    // Engaged (had at least one agent reply)
    const engagedByChannel = await this.convRepo
      .createQueryBuilder('conv')
      .select('conv.source_channel', 'channel')
      .addSelect('COUNT(*)', 'count')
      .where('conv.organization_id = :orgId', { orgId })
      .andWhere('conv.first_reply_at IS NOT NULL')
      .andWhere('conv.created_at >= :start', { start: range.startDate })
      .andWhere('conv.created_at < :end', { end: range.endDate })
      .groupBy('conv.source_channel')
      .getRawMany();

    // Build funnel per channel
    const channels = new Set<string>();
    [...leadsByChannel, ...conversionsByChannel, ...engagedByChannel].forEach(
      (r) => channels.add(r.channel || 'WHATSAPP_DIRECT'),
    );

    const funnel = Array.from(channels).map((ch) => {
      const leads = parseInt(
        leadsByChannel.find((r) => r.channel === ch)?.count || '0',
        10,
      );
      const engaged = parseInt(
        engagedByChannel.find((r) => r.channel === ch)?.count || '0',
        10,
      );
      const converted = parseInt(
        conversionsByChannel.find((r) => r.channel === ch)?.count || '0',
        10,
      );
      const revenue = parseFloat(
        conversionsByChannel.find((r) => r.channel === ch)?.totalAmount || '0',
      );
      return {
        channel: ch,
        leads,
        engaged,
        converted,
        revenue,
        engagementRate: leads > 0 ? Math.round((engaged / leads) * 100) : 0,
        conversionRate: leads > 0 ? Math.round((converted / leads) * 100) : 0,
      };
    });

    return {
      funnel,
      totals: {
        leads: funnel.reduce((s, f) => s + f.leads, 0),
        engaged: funnel.reduce((s, f) => s + f.engaged, 0),
        converted: funnel.reduce((s, f) => s + f.converted, 0),
        revenue: funnel.reduce((s, f) => s + f.revenue, 0),
      },
    };
  }

  private _resolveDateRange(dateRange?: string) {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    switch (dateRange) {
      case 'today':
        return { startDate: todayStart, endDate: tomorrowStart };
      case 'last30d': {
        const s = new Date(todayStart);
        s.setDate(s.getDate() - 29);
        return { startDate: s, endDate: tomorrowStart };
      }
      case 'last7d':
      default: {
        const s = new Date(todayStart);
        s.setDate(s.getDate() - 6);
        return { startDate: s, endDate: tomorrowStart };
      }
    }
  }
}

// ── Controller ──────────────────────────────────────────
@ApiTags('conversions')
@Controller('conversions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConversionsController {
  constructor(private readonly service: ConversionsService) {}

  @Post()
  @ApiOperation({ summary: 'Mark contact/conversation as converted' })
  markConverted(
    @Request() req,
    @Body()
    body: {
      contactId?: string;
      conversationId?: string;
      amount?: number;
      metadata?: Record<string, any>;
    },
  ) {
    return this.service.markConverted(req.user.orgId, body, req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'List conversion events' })
  getConversions(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('dateRange') dateRange?: string,
    @Query('channel') channel?: SourceChannel,
  ) {
    return this.service.getConversions(req.user.orgId, {
      page,
      limit,
      dateRange,
      channel,
    });
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Get conversion funnel stats by channel' })
  getFunnel(@Request() req, @Query('dateRange') dateRange?: string) {
    return this.service.getFunnelStats(req.user.orgId, dateRange);
  }
}

// ── Module ──────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversionEvent,
      Contact,
      Conversation,
      ChannelInteraction,
    ]),
  ],
  controllers: [ConversionsController],
  providers: [ConversionsService],
  exports: [ConversionsService],
})
export class ConversionsModule {}
