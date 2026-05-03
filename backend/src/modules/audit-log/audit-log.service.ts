// ============================================================
// Audit Log Service — Record & Query audit events
// ============================================================
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditCategory } from '../../common/entities/audit-log.entity';
import { Message } from '../../common/entities/message.entity';
import { Conversation } from '../../common/entities/conversation.entity';
import { Contact } from '../../common/entities/contact.entity';
import { Stage } from '../../common/entities/stage.entity';
import { CtaEvent } from '../../common/entities/cta-event.entity';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
    @InjectRepository(Message) private messageRepo: Repository<Message>,
    @InjectRepository(Conversation) private conversationRepo: Repository<Conversation>,
    @InjectRepository(Contact) private contactRepo: Repository<Contact>,
    @InjectRepository(Stage) private stageRepo: Repository<Stage>,
    @InjectRepository(CtaEvent) private ctaRepo: Repository<CtaEvent>,
  ) {}

  // ── Record an audit event ────────────────────────────
  async log(data: {
    organizationId: string;
    category: AuditCategory;
    action: string;
    userId?: string;
    userName?: string;
    targetId?: string;
    targetType?: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
  }) {
    const entry = this.auditRepo.create(data);
    return this.auditRepo.save(entry);
  }

  // ── Query logs ───────────────────────────────────────
  async findAll(orgId: string, options?: {
    category?: AuditCategory;
    page?: number;
    limit?: number;
  }) {
    const page = options?.page || 1;
    const limit = options?.limit || 50;

    const qb = this.auditRepo.createQueryBuilder('log')
      .where('log.organizationId = :orgId', { orgId })
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (options?.category) {
      qb.andWhere('log.category = :category', { category: options.category });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Delete old logs (retention) ──────────────────────
  async purgeOldLogs(orgId: string, daysToKeep = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    const result = await this.auditRepo
      .createQueryBuilder()
      .delete()
      .where('organizationId = :orgId', { orgId })
      .andWhere('createdAt < :cutoff', { cutoff })
      .execute();

    return { deleted: result.affected };
  }

  // ── Message History ──────────────────────────────────
  async getMessageHistory(orgId: string, options: {
    page?: number;
    limit?: number;
    search?: string;
    direction?: string;
    status?: string;
    statuses?: string[];
    type?: string;
    channelId?: string;
    channelIds?: string[];
    departmentIds?: string[];
    sourceChannels?: string[];
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
  } = {}) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 25, 100);

    const qb = this.messageRepo.createQueryBuilder('m')
      .innerJoin('m.conversation', 'c')
      .leftJoin('c.contact', 'contact')
      .leftJoin('c.whatsappChannel', 'ch')
      .where('c.organizationId = :orgId', { orgId })
      .select([
        'm.id', 'm.direction', 'm.type', 'm.content', 'm.status',
        'm.senderType', 'm.mediaFilename', 'm.createdAt',
        'c.id', 'c.channel',
        'contact.id', 'contact.name', 'contact.phone',
        'ch.id', 'ch.name',
      ])
      .orderBy('m.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (options.search) {
      qb.andWhere('(m.content ILIKE :search OR contact.name ILIKE :search OR contact.phone ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }
    if (options.direction) {
      qb.andWhere('m.direction = :direction', { direction: options.direction });
    }
    if (options.status) {
      qb.andWhere('m.status = :status', { status: options.status });
    }
    if (options.statuses && options.statuses.length > 0) {
      qb.andWhere('m.status IN (:...mStatuses)', { mStatuses: options.statuses });
    }
    if (options.type) {
      qb.andWhere('m.type = :type', { type: options.type });
    }
    if (options.channelId) {
      qb.andWhere('c.whatsappChannelId = :channelId', { channelId: options.channelId });
    }
    if (options.channelIds && options.channelIds.length > 0) {
      qb.andWhere('c.whatsappChannelId IN (:...channelIds)', { channelIds: options.channelIds });
    }
    if (options.departmentIds && options.departmentIds.length > 0) {
      qb.andWhere('c.departmentId IN (:...departmentIds)', { departmentIds: options.departmentIds });
    }
    if (options.sourceChannels && options.sourceChannels.length > 0) {
      qb.andWhere('c.sourceChannel IN (:...sourceChannels)', { sourceChannels: options.sourceChannels });
    }
    if (options.tags && options.tags.length > 0) {
      qb.andWhere('contact.tags && (:tagList)::text[]', { tagList: options.tags });
    }
    if (options.dateFrom) {
      qb.andWhere('m.createdAt >= :dateFrom', { dateFrom: new Date(options.dateFrom) });
    }
    if (options.dateTo) {
      qb.andWhere('m.createdAt <= :dateTo', { dateTo: new Date(options.dateTo) });
    }

    const [messages, total] = await qb.getManyAndCount();

    return {
      data: messages.map(m => ({
        id: m.id,
        direction: m.direction,
        type: m.type,
        content: m.content ? m.content.substring(0, 200) : null,
        status: m.status,
        senderType: m.senderType,
        mediaFilename: m.mediaFilename,
        createdAt: m.createdAt,
        contactName: m.conversation?.contact?.name || null,
        contactPhone: m.conversation?.contact?.phone || null,
        channelName: m.conversation?.whatsappChannel?.name || m.conversation?.channel || null,
        conversationId: m.conversation?.id || null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Conversation History ─────────────────────────────
  async getConversationHistory(orgId: string, options: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    statuses?: string[];
    channelId?: string;
    channelIds?: string[];
    departmentId?: string;
    departmentIds?: string[];
    sourceChannels?: string[];
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
  } = {}) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 25, 100);

    const qb = this.conversationRepo.createQueryBuilder('c')
      .leftJoin('c.contact', 'contact')
      .leftJoin('c.assignedAgent', 'agent')
      .leftJoin('c.department', 'dept')
      .leftJoin('c.whatsappChannel', 'ch')
      .leftJoin('c.stage', 'stg')
      .loadRelationCountAndMap('c.messageCount', 'c.messages')
      .where('c.organizationId = :orgId', { orgId })
      .select([
        'c.id', 'c.channel', 'c.status', 'c.lastMessagePreview',
        'c.unreadCount', 'c.createdAt', 'c.updatedAt', 'c.closedAt',
        'c.interestLevel', 'c.firstReplyAt', 'c.sourceChannel', 'c.snoozedUntil',
        'contact.id', 'contact.name', 'contact.phone',
        'agent.id', 'agent.fullName',
        'dept.id', 'dept.name',
        'ch.id', 'ch.name',
        'stg.id', 'stg.name', 'stg.color', 'stg.category',
      ])
      .orderBy('c.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (options.search) {
      qb.andWhere('(contact.name ILIKE :search OR contact.phone ILIKE :search OR c.lastMessagePreview ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }
    if (options.status) {
      qb.andWhere('c.status = :status', { status: options.status });
    }
    if (options.statuses && options.statuses.length > 0) {
      qb.andWhere('c.status IN (:...statuses)', { statuses: options.statuses });
    }
    if (options.channelId) {
      qb.andWhere('c.whatsappChannelId = :channelId', { channelId: options.channelId });
    }
    if (options.channelIds && options.channelIds.length > 0) {
      qb.andWhere('c.whatsappChannelId IN (:...channelIds)', { channelIds: options.channelIds });
    }
    if (options.departmentId) {
      qb.andWhere('c.departmentId = :departmentId', { departmentId: options.departmentId });
    }
    if (options.departmentIds && options.departmentIds.length > 0) {
      qb.andWhere('c.departmentId IN (:...departmentIds)', { departmentIds: options.departmentIds });
    }
    if (options.sourceChannels && options.sourceChannels.length > 0) {
      qb.andWhere('c.sourceChannel IN (:...sourceChannels)', { sourceChannels: options.sourceChannels });
    }
    if (options.tags && options.tags.length > 0) {
      qb.andWhere('contact.tags && (:tagList)::text[]', { tagList: options.tags });
    }
    if (options.dateFrom) {
      qb.andWhere('c.createdAt >= :dateFrom', { dateFrom: new Date(options.dateFrom) });
    }
    if (options.dateTo) {
      qb.andWhere('c.createdAt <= :dateTo', { dateTo: new Date(options.dateTo) });
    }

    const [conversations, total] = await qb.getManyAndCount();

    // ── Aggregate CTA events per conversation for this page ──
    const convIds = conversations.map(c => c.id);
    const ctaMap = new Map<string, { callCount: number; callDuration: number; whatsappCount: number }>();
    if (convIds.length > 0) {
      const rows = await this.ctaRepo.createQueryBuilder('e')
        .select('e.conversation_id', 'conversationId')
        .addSelect("COUNT(*) FILTER (WHERE e.type='call')", 'callCount')
        .addSelect("COALESCE(SUM(e.duration_seconds) FILTER (WHERE e.type='call'),0)", 'callDuration')
        .addSelect("COUNT(*) FILTER (WHERE e.type='whatsapp')", 'whatsappCount')
        .where('e.organization_id = :orgId', { orgId })
        .andWhere('e.conversation_id IN (:...ids)', { ids: convIds })
        .groupBy('e.conversation_id')
        .getRawMany();
      for (const r of rows) {
        ctaMap.set(r.conversationId, {
          callCount: Number(r.callCount) || 0,
          callDuration: Number(r.callDuration) || 0,
          whatsappCount: Number(r.whatsappCount) || 0,
        });
      }
    }

    return {
      data: conversations.map(conv => {
        const cta = ctaMap.get(conv.id) || { callCount: 0, callDuration: 0, whatsappCount: 0 };
        return ({
        id: conv.id,
        channel: conv.channel,
        status: conv.status,
        lastMessage: conv.lastMessagePreview ? conv.lastMessagePreview.substring(0, 150) : null,
        unreadCount: conv.unreadCount,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        closedAt: conv.closedAt,
        snoozedUntil: conv.snoozedUntil || null,
        contactName: conv.contact?.name || null,
        contactPhone: conv.contact?.phone || null,
        agentName: conv.assignedAgent?.fullName || null,
        departmentName: conv.department?.name || null,
        channelName: conv.whatsappChannel?.name || conv.channel || null,
        stageName: (conv as any).stage?.name || null,
        stageColor: (conv as any).stage?.color || null,
        stageCategory: (conv as any).stage?.category || null,
        messageCount: (conv as any).messageCount || 0,
        interestLevel: conv.interestLevel || null,
        firstReplyAt: conv.firstReplyAt || null,
        sourceChannel: conv.sourceChannel || null,
        replied: !!conv.firstReplyAt,
        firstReplySeconds: conv.firstReplyAt && conv.createdAt
          ? Math.round((new Date(conv.firstReplyAt).getTime() - new Date(conv.createdAt).getTime()) / 1000)
          : null,
        callCount: cta.callCount,
        callDurationSeconds: cta.callDuration,
        whatsappClickCount: cta.whatsappCount,
      });
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Export Messages as CSV ───────────────────────────
  async exportMessagesCsv(orgId: string, options: {
    search?: string; direction?: string; status?: string; type?: string;
    channelId?: string; dateFrom?: string; dateTo?: string;
  } = {}): Promise<string> {
    const result = await this.getMessageHistory(orgId, { ...options, page: 1, limit: 10000 });
    const header = 'Date,Direction,Type,Status,Contact Name,Contact Phone,Channel,Content';
    const rows = result.data.map(m => {
      const date = m.createdAt ? new Date(m.createdAt).toISOString() : '';
      return [
        date, m.direction || '', m.type || '', m.status || '',
        this._csvEscape(m.contactName), this._csvEscape(m.contactPhone),
        this._csvEscape(m.channelName), this._csvEscape(m.content),
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }

  // ── Export Conversations as CSV ──────────────────────
  async exportConversationsCsv(orgId: string, options: {
    search?: string; status?: string; channelId?: string;
    departmentId?: string; dateFrom?: string; dateTo?: string;
  } = {}): Promise<string> {
    const result = await this.getConversationHistory(orgId, { ...options, page: 1, limit: 10000 });
    const header = 'Date Created,Contact Name,Contact Phone,Agent,Department,Channel,Status,Source,Interest Level,Replied,1st Reply Time (s),Closed At,Stage,Message Count';
    const rows = result.data.map(c => {
      const created = c.createdAt ? new Date(c.createdAt).toISOString() : '';
      const closed = c.closedAt ? new Date(c.closedAt).toISOString() : '';
      return [
        created, this._csvEscape(c.contactName), this._csvEscape(c.contactPhone),
        this._csvEscape(c.agentName), this._csvEscape(c.departmentName),
        this._csvEscape(c.channelName), c.status || '',
        c.sourceChannel || '', c.interestLevel || '',
        c.replied ? 'Yes' : 'No', c.firstReplySeconds ?? '',
        closed, this._csvEscape(c.stageName),
        c.messageCount || 0,
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }

  private _csvEscape(val: string | null | undefined): string {
    if (!val) return '';
    const s = val.replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  }
}
