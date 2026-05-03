// ============================================================
// Dashboard Service — Role-Based Aggregate Stats
// ============================================================
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import {
  Conversation,
  ConversationStatus,
} from '../../common/entities/conversation.entity';
import { Contact, SourceChannel } from '../../common/entities/contact.entity';
import { Message } from '../../common/entities/message.entity';
import { User, UserStatus } from '../../common/entities/user.entity';
import { Broadcast, BroadcastStatus } from '../../common/entities/broadcast.entity';
import { ConversionEvent } from '../../common/entities/conversion-event.entity';
import { Stage, StageCategory } from '../../common/entities/stage.entity';
import { MessageStatus } from '../../common/entities/message.entity';
import { CtaEvent } from '../../common/entities/cta-event.entity';

// Estimated cost per WhatsApp message in IDR (rough industry average for business conversations).
// Used to compute approximate broadcast spend until per-channel pricing is persisted.
const WA_MESSAGE_COST_IDR = 300;

type DashboardFilters = {
  channelId?: string;
  departmentId?: string;
  sourceChannel?: string;
  tag?: string;
  dateRange?: string;
  dateFrom?: string;
  dateTo?: string;
};

type DateWindow = {
  startDate: Date;
  endDate: Date;
  label: string;
  trendDays: number;
};

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Broadcast)
    private readonly broadcastRepo: Repository<Broadcast>,
    @InjectRepository(ConversionEvent)
    private readonly conversionRepo: Repository<ConversionEvent>,
    @InjectRepository(Stage)
    private readonly stageRepo: Repository<Stage>,
    @InjectRepository(CtaEvent)
    private readonly ctaRepo: Repository<CtaEvent>,
  ) {}

  async getStats(
    orgId: string,
    userId?: string,
    userRole?: string,
    filters: DashboardFilters = {},
  ) {
    const range = this._resolveDateRange(filters.dateRange, filters.dateFrom, filters.dateTo);
    const isAgent = userRole === 'agent';
    const isManager =
      userRole === 'manager' || userRole === 'admin' || userRole === 'owner';

    const conversationBase = this._conversationBaseQuery(orgId, filters);
    const rangedConversations = conversationBase
      .clone()
      .andWhere('c.created_at >= :startDate', { startDate: range.startDate })
      .andWhere('c.created_at < :endDate', { endDate: range.endDate });

    const messageBase = this._messageBaseQuery(orgId, filters);

    const agentMetrics = userId
        ? await this._getAgentMetrics(orgId, userId, filters, range)
        : null;

    const [
      activeConversations,
      totalConversations,
      conversationsInRange,
      totalContacts,
      contactsInRange,
      totalAgents,
      totalMessages,
      messagesInRange,
      unassignedConversations,
    ] = await Promise.all([
      conversationBase
          .clone()
          .andWhere('c.status = :status', { status: ConversationStatus.OPEN })
          .getCount(),
      conversationBase.clone().getCount(),
      rangedConversations.clone().getCount(),
      this.contactRepo.count({ where: { organizationId: orgId } }),
      this.contactRepo
          .createQueryBuilder('contact')
          .where('contact.organization_id = :orgId', { orgId })
          .andWhere('contact.created_at >= :startDate', {
            startDate: range.startDate,
          })
          .andWhere('contact.created_at < :endDate', { endDate: range.endDate })
          .getCount(),
      this.userRepo.count({
        where: { organizationId: orgId, status: UserStatus.ACTIVE },
      }),
      messageBase.clone().getCount(),
      messageBase
          .clone()
          .andWhere('m.created_at >= :startDate', { startDate: range.startDate })
          .andWhere('m.created_at < :endDate', { endDate: range.endDate })
          .getCount(),
      conversationBase
          .clone()
          .andWhere('c.status = :status', { status: ConversationStatus.OPEN })
          .andWhere('c.assigned_agent_id IS NULL')
          .getCount(),
    ]);

    const statusBreakdown = await conversationBase
      .clone()
      .select('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.status')
      .getRawMany();
    const byStatus: Record<string, number> = {};
    statusBreakdown.forEach((row) => {
      byStatus[row.status] = parseInt(row.count, 10);
    });

    const [dailyTrend, messageTrend, repliedTrend, contactTrend, recentConversations] = await Promise.all([
      this._getDailyTrend(orgId, filters, range),
      this._getMessageTrend(orgId, filters, range),
      this._getRepliedTrend(orgId, filters, range),
      this._getContactTrend(orgId, filters, range),
      this._getRecentConversations(orgId, filters),
    ]);

    const agentLeaderboard = isAgent
        ? []
        : await this._getAgentLeaderboard(orgId, filters, range);
    const channelDistribution = isManager
        ? await this._getChannelDistribution(orgId, filters, range)
        : [];
    const broadcastStats = isManager
        ? await this._getBroadcastStats(orgId, filters, range)
        : null;

    const avgFirstResponseResult = await conversationBase
      .clone()
      .select(
        'AVG(EXTRACT(EPOCH FROM (c.first_reply_at - c.created_at)))',
        'avgSeconds',
      )
      .andWhere('c.first_reply_at IS NOT NULL')
      .andWhere('c.created_at >= :startDate', { startDate: range.startDate })
      .andWhere('c.created_at < :endDate', { endDate: range.endDate })
      .getRawOne()
      .catch(() => null);
    const avgFirstResponseSeconds = avgFirstResponseResult?.avgSeconds
      ? Math.round(parseFloat(avgFirstResponseResult.avgSeconds))
      : 0;

    // Average agent response time across ALL replies (not just first).
    // For each agent message, find the most recent contact message before it
    // in the same conversation, then average the time difference.
    // Does NOT rely on reply_to_id (which may be null).
    const avgAgentResponseResult = await this.messageRepo
      .query(
        `SELECT AVG(reply_gap) as "avgSeconds" FROM (
          SELECT EXTRACT(EPOCH FROM (m.created_at - (
            SELECT MAX(prev.created_at)
            FROM messages prev
            WHERE prev.conversation_id = m.conversation_id
              AND prev.sender_type = 'contact'
              AND prev.created_at < m.created_at
          ))) as reply_gap
          FROM messages m
          INNER JOIN conversations c ON c.id = m.conversation_id
          WHERE c.organization_id = $1
            AND m.sender_type = 'agent'
            AND m.created_at >= $2
            AND m.created_at < $3
        ) sub
        WHERE reply_gap IS NOT NULL AND reply_gap > 0 AND reply_gap < 86400`,
        [orgId, range.startDate, range.endDate],
      )
      .catch(() => []);
    const avgAgentResponseSeconds = avgAgentResponseResult?.[0]?.avgSeconds
      ? Math.round(parseFloat(avgAgentResponseResult[0].avgSeconds))
      : 0;

    const closedInRange = await conversationBase
      .clone()
      .andWhere('c.status = :status', { status: ConversationStatus.CLOSED })
      .andWhere('c.updated_at >= :startDate', { startDate: range.startDate })
      .andWhere('c.updated_at < :endDate', { endDate: range.endDate })
      .getCount();
    const resolutionRate =
      conversationsInRange > 0
        ? Math.round((closedInRange / conversationsInRange) * 100)
        : 0;


    return {
      userRole: userRole || 'agent',
      dateRangeLabel: range.label,
      appliedFilters: {
        channelId: filters.channelId || null,
        departmentId: filters.departmentId || null,
        sourceChannel: filters.sourceChannel || null,
        dateRange: filters.dateRange || 'last7d',
      },
      totalConversations,
      activeConversations,
      conversationsToday: conversationsInRange,
      totalContacts,
      contactsToday: contactsInRange,
      totalMessages,
      messagesToday: messagesInRange,
      totalAgents,
      onlineAgents: totalAgents,
      unassignedConversations,
      avgFirstResponseSeconds,
      avgAgentResponseSeconds,
      resolutionRate,
      resolvedThisWeek: closedInRange,
      byStatus,
      dailyTrend,
      messageTrend,
      repliedTrend,
      contactTrend,
      agentLeaderboard,
      channelDistribution,
      recentConversations,
      broadcastStats,
      agentMetrics,
    };
  }

  private _conversationBaseQuery(orgId: string, filters: DashboardFilters) {
    const qb = this.conversationRepo
      .createQueryBuilder('c')
      .where('c.organization_id = :orgId', { orgId });
    return this._applyConversationFilters(qb, filters);
  }

  private _messageBaseQuery(orgId: string, filters: DashboardFilters) {
    const qb = this.messageRepo
      .createQueryBuilder('m')
      .innerJoin('m.conversation', 'c')
      .where('c.organization_id = :orgId', { orgId });
    return this._applyConversationFilters(qb, filters, 'c');
  }

  private _applyConversationFilters(
    qb: SelectQueryBuilder<any>,
    filters: DashboardFilters,
    alias = 'c',
  ) {
    if (filters.channelId) {
      qb.andWhere(`${alias}.whatsapp_channel_id = :channelId`, {
        channelId: filters.channelId,
      });
    }
    if (filters.departmentId) {
      qb.andWhere(`${alias}.department_id = :departmentId`, {
        departmentId: filters.departmentId,
      });
    }
    if (filters.sourceChannel) {
      const list = filters.sourceChannel.split(',').map(s => s.trim()).filter(Boolean);
      if (list.length === 1) {
        qb.andWhere(`${alias}.source_channel = :sourceChannel`, {
          sourceChannel: list[0],
        });
      } else if (list.length > 1) {
        qb.andWhere(`${alias}.source_channel IN (:...sourceChannelList)`, {
          sourceChannelList: list,
        });
      }
    }
    if (filters.tag) {
      const tags = filters.tag.split(',').map(t => t.trim()).filter(Boolean);
      if (tags.length > 0) {
        // Ensure contact join exists (avoid duplicate joins)
        const hasContactJoin = qb.expressionMap.joinAttributes.some(
          (j) => j.alias?.name === 'dashContact',
        );
        if (!hasContactJoin) {
          qb.leftJoin('contacts', 'dashContact', `dashContact.id = ${alias}.contact_id`);
        }
        qb.andWhere('dashContact.tags && (:tagList)::text[]', { tagList: tags });
      }
    }
    return qb;
  }

  private _resolveDateRange(dateRange?: string, dateFrom?: string, dateTo?: string): DateWindow {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    if (dateRange === 'custom' && dateFrom && dateTo) {
      const start = new Date(dateFrom);
      const end = new Date(dateTo);
      // Normalize to inclusive day range
      const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      e.setDate(e.getDate() + 1);
      const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000));
      const fmt = (d: Date) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear().toString().slice(-2)}`;
      return {
        startDate: s,
        endDate: e,
        label: `${fmt(s)} – ${fmt(end)}`,
        trendDays: Math.min(days, 90),
      };
    }

    switch (dateRange) {
      case 'today':
        return {
          startDate: todayStart,
          endDate: tomorrowStart,
          label: 'Today',
          trendDays: 1,
        };
      case 'yesterday': {
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        return {
          startDate: yesterdayStart,
          endDate: todayStart,
          label: 'Yesterday',
          trendDays: 1,
        };
      }
      case 'last30d': {
        const startDate = new Date(todayStart);
        startDate.setDate(startDate.getDate() - 29);
        return {
          startDate,
          endDate: tomorrowStart,
          label: 'Last 30 Days',
          trendDays: 30,
        };
      }
      case 'last7d':
      default: {
        const startDate = new Date(todayStart);
        startDate.setDate(startDate.getDate() - 6);
        return {
          startDate,
          endDate: tomorrowStart,
          label: 'Last 7 Days',
          trendDays: 7,
        };
      }
    }
  }

  private async _getDailyTrend(
    orgId: string,
    filters: DashboardFilters,
    range: DateWindow,
  ) {
    const raw = await this._conversationBaseQuery(orgId, filters)
      .select('DATE(c.created_at)', 'date')
      .addSelect('COUNT(*)', 'count')
      .andWhere('c.created_at >= :startDate', { startDate: range.startDate })
      .andWhere('c.created_at < :endDate', { endDate: range.endDate })
      .groupBy('DATE(c.created_at)')
      .orderBy('DATE(c.created_at)', 'ASC')
      .getRawMany();
    return this._buildTrendData(raw, range);
  }

  private async _getMessageTrend(
    orgId: string,
    filters: DashboardFilters,
    range: DateWindow,
  ) {
    const raw = await this._messageBaseQuery(orgId, filters)
      .select('DATE(m.created_at)', 'date')
      .addSelect('COUNT(*)', 'count')
      .andWhere('m.created_at >= :startDate', { startDate: range.startDate })
      .andWhere('m.created_at < :endDate', { endDate: range.endDate })
      .groupBy('DATE(m.created_at)')
      .orderBy('DATE(m.created_at)', 'ASC')
      .getRawMany();
    return this._buildTrendData(raw, range);
  }

  private async _getContactTrend(
    orgId: string,
    filters: DashboardFilters,
    range: DateWindow,
  ) {
    const qb = this.contactRepo
      .createQueryBuilder('contact')
      .where('contact.organization_id = :orgId', { orgId })
      .andWhere('contact.created_at >= :startDate', { startDate: range.startDate })
      .andWhere('contact.created_at < :endDate', { endDate: range.endDate });

    if (filters.sourceChannel) {
      const list = filters.sourceChannel.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length === 1) {
        qb.andWhere('contact.source_channel = :sourceChannel', { sourceChannel: list[0] });
      } else if (list.length > 1) {
        qb.andWhere('contact.source_channel IN (:...sourceChannelList)', { sourceChannelList: list });
      }
    }
    if (filters.tag) {
      const tags = filters.tag.split(',').map((t) => t.trim()).filter(Boolean);
      if (tags.length > 0) {
        qb.andWhere('contact.tags && (:tagList)::text[]', { tagList: tags });
      }
    }

    const raw = await qb
      .select('DATE(contact.created_at)', 'date')
      .addSelect('COUNT(*)', 'count')
      .groupBy('DATE(contact.created_at)')
      .orderBy('DATE(contact.created_at)', 'ASC')
      .getRawMany();
    return this._buildTrendData(raw, range);
  }

  private async _getRepliedTrend(
    orgId: string,
    filters: DashboardFilters,
    range: DateWindow,
  ) {
    // Count unique conversations per day where an agent sent a message
    const raw = await this._messageBaseQuery(orgId, filters)
      .select('DATE(m.created_at)', 'date')
      .addSelect('COUNT(DISTINCT m.conversation_id)', 'count')
      .andWhere("m.sender_type = 'agent'")
      .andWhere('m.created_at >= :startDate', { startDate: range.startDate })
      .andWhere('m.created_at < :endDate', { endDate: range.endDate })
      .groupBy('DATE(m.created_at)')
      .orderBy('DATE(m.created_at)', 'ASC')
      .getRawMany();
    return this._buildTrendData(raw, range);
  }

  private _buildTrendData(
    raw: Array<{ date: string | Date; count: string }>,
    range: DateWindow,
  ) {
    const data: Array<{ date: string; count: number }> = [];
    for (let i = 0; i < range.trendDays; i++) {
      const current = new Date(range.startDate);
      current.setDate(current.getDate() + i);
      const dateStr = current.toISOString().split('T')[0];
      const found = raw.find((row) => {
        const rowDate =
          row.date instanceof Date
            ? row.date.toISOString().split('T')[0]
            : String(row.date).split('T')[0];
        return rowDate === dateStr;
      });
      data.push({ date: dateStr, count: found ? parseInt(found.count, 10) : 0 });
    }
    return data;
  }

  private async _getRecentConversations(
    orgId: string,
    filters: DashboardFilters,
  ) {
    const rows = await this._conversationBaseQuery(orgId, filters)
      .leftJoinAndSelect('c.contact', 'contact')
      .orderBy('c.updatedAt', 'DESC')
      .take(5)
      .getMany();

    return rows.map((conversation) => ({
      id: conversation.id,
      contactName: conversation.contact?.name || 'Unknown',
      contactPhone: conversation.contact?.phone || '',
      status: conversation.status,
      lastMessageAt: conversation.updatedAt,
      unreadCount: conversation.unreadCount || 0,
      assignedAgentId: conversation.assignedAgentId,
    }));
  }

  private async _getAgentLeaderboard(
    orgId: string,
    filters: DashboardFilters,
    range: DateWindow,
  ) {
    const rows = await this._conversationBaseQuery(orgId, filters)
      .leftJoin('stages', 's', 's.id = c.stage_id')
      .select('c.assigned_agent_id', 'agentId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        `SUM(CASE WHEN c.status = '${ConversationStatus.CLOSED}' THEN 1 ELSE 0 END)`,
        'closed',
      )
      .addSelect(
        `SUM(CASE WHEN c.status = '${ConversationStatus.OPEN}' THEN 1 ELSE 0 END)`,
        'open',
      )
      .addSelect(
        `SUM(CASE WHEN s.category = 'won' THEN 1 ELSE 0 END)`,
        'won',
      )
      .addSelect(
        `SUM(CASE WHEN s.category = 'lost' THEN 1 ELSE 0 END)`,
        'lost',
      )
      .addSelect(
        `SUM(CASE WHEN c.first_reply_at IS NOT NULL THEN 1 ELSE 0 END)`,
        'replied',
      )
      .addSelect(
        'AVG(EXTRACT(EPOCH FROM (c.first_reply_at - c.created_at)))',
        'avgResponseSec',
      )
      .addSelect(
        `SUM(CASE WHEN c.first_reply_at IS NOT NULL AND EXTRACT(EPOCH FROM (c.first_reply_at - c.created_at)) <= 300 THEN 1 ELSE 0 END)`,
        'fastReplies',
      )
      .andWhere('c.assigned_agent_id IS NOT NULL')
      .andWhere('c.created_at >= :startDate', { startDate: range.startDate })
      .andWhere('c.created_at < :endDate', { endDate: range.endDate })
      .groupBy('c.assigned_agent_id')
      .orderBy('COUNT(*)', 'DESC')
      .limit(10)
      .getRawMany();

    const agentNames = await this._resolveAgentNames(
      rows.map((r) => r.agentId ?? r.agentid),
    );

    // CTA metrics per agent in the same window
    const agentIds = rows.map((r) => r.agentId ?? r.agentid).filter(Boolean);
    const ctaMap = agentIds.length > 0 ? await this._getAgentCtaMap(orgId, agentIds, range, filters.sourceChannel) : new Map();

    return rows.map((row) => {
      const agentId = row.agentId ?? row.agentid;
      const total = parseInt(row.total, 10);
      const replied = parseInt(row.replied || '0', 10);
      const avgSec = row.avgResponseSec ?? row.avgresponsesec;
      const parsedAvg = avgSec ? Math.round(parseFloat(avgSec)) : null;
      const fastReplies = parseInt(row.fastReplies ?? row.fastreplies ?? '0', 10);
      const won = parseInt(row.won || '0', 10);
      const lost = parseInt(row.lost || '0', 10);
      const closedStages = won + lost;
      const cta = ctaMap.get(agentId) || { calls: 0, whatsapps: 0, avgCallDurationSeconds: null };
      return {
        agentId,
        name: agentNames[agentId] || 'Unknown Agent',
        total,
        closed: parseInt(row.closed || '0', 10),
        open: parseInt(row.open || '0', 10),
        active: parseInt(row.open || '0', 10),
        won,
        lost,
        conversionRate: closedStages > 0 ? Math.round((won / closedStages) * 100) : 0,
        repliedCount: replied,
        responseRate: total > 0 ? Math.round((replied / total) * 100) : 0,
        avgFirstReplySeconds: parsedAvg,
        fastReplies,
        fastReplyRate: replied > 0 ? Math.round((fastReplies / replied) * 100) : 0,
        calls: cta.calls,
        whatsappCtas: cta.whatsapps,
        avgCallDurationSeconds: cta.avgCallDurationSeconds,
      };
    });
  }

  /**
   * Aggregate CTA call/whatsapp counts + avg call duration per agent within a date window.
   * Returned map: agentId -> { calls, whatsapps, avgCallDurationSeconds }
   */
  private async _getAgentCtaMap(
    orgId: string,
    agentIds: string[],
    range: DateWindow,
    sourceChannel?: string,
  ): Promise<Map<string, { calls: number; whatsapps: number; avgCallDurationSeconds: number | null }>> {
    const qb = this.ctaRepo
      .createQueryBuilder('cta')
      .select('cta.agent_id', 'agentId')
      .addSelect(`SUM(CASE WHEN cta.type = 'call' THEN 1 ELSE 0 END)`, 'calls')
      .addSelect(`SUM(CASE WHEN cta.type = 'whatsapp' THEN 1 ELSE 0 END)`, 'whatsapps')
      .addSelect(
        `AVG(CASE WHEN cta.type = 'call' AND cta.duration_seconds IS NOT NULL THEN cta.duration_seconds END)`,
        'avgCallDuration',
      )
      .where('cta.organization_id = :orgId', { orgId })
      .andWhere('cta.agent_id IN (:...agentIds)', { agentIds })
      .andWhere('cta.created_at >= :start', { start: range.startDate })
      .andWhere('cta.created_at < :end', { end: range.endDate })
      .groupBy('cta.agent_id');
    if (sourceChannel) {
      const list = sourceChannel.split(',').map(s => s.trim()).filter(Boolean);
      if (list.length === 1) qb.andWhere('cta.source_channel = :sc', { sc: list[0] });
      else if (list.length > 1) qb.andWhere('cta.source_channel IN (:...scList)', { scList: list });
    }
    const rows = await qb.getRawMany();
    const map = new Map<string, any>();
    rows.forEach((r) => {
      const id = r.agentId ?? r.agentid;
      const avg = r.avgCallDuration ?? r.avgcallduration;
      map.set(id, {
        calls: parseInt(r.calls || '0', 10),
        whatsapps: parseInt(r.whatsapps || '0', 10),
        avgCallDurationSeconds: avg ? Math.round(parseFloat(avg)) : null,
      });
    });
    return map;
  }

  /**
   * Aggregate CTA stats per source channel. Returns map: sourceChannel -> { calls, whatsapps, avgCallDurationSeconds }
   */
  private async _getSourceCtaMap(
    orgId: string,
    range: DateWindow,
    sourceChannel?: string,
  ): Promise<Map<string, { calls: number; whatsapps: number; avgCallDurationSeconds: number | null }>> {
    const qb = this.ctaRepo
      .createQueryBuilder('cta')
      .select('cta.source_channel', 'channel')
      .addSelect(`SUM(CASE WHEN cta.type = 'call' THEN 1 ELSE 0 END)`, 'calls')
      .addSelect(`SUM(CASE WHEN cta.type = 'whatsapp' THEN 1 ELSE 0 END)`, 'whatsapps')
      .addSelect(
        `AVG(CASE WHEN cta.type = 'call' AND cta.duration_seconds IS NOT NULL THEN cta.duration_seconds END)`,
        'avgCallDuration',
      )
      .where('cta.organization_id = :orgId', { orgId })
      .andWhere('cta.created_at >= :start', { start: range.startDate })
      .andWhere('cta.created_at < :end', { end: range.endDate })
      .groupBy('cta.source_channel');
    if (sourceChannel) {
      const list = sourceChannel.split(',').map(s => s.trim()).filter(Boolean);
      if (list.length === 1) qb.andWhere('cta.source_channel = :sc', { sc: list[0] });
      else if (list.length > 1) qb.andWhere('cta.source_channel IN (:...scList)', { scList: list });
    }
    const rows = await qb.getRawMany();
    const map = new Map<string, any>();
    rows.forEach((r) => {
      const ch = r.channel || 'UNKNOWN';
      const avg = r.avgCallDuration ?? r.avgcallduration;
      map.set(ch, {
        calls: parseInt(r.calls || '0', 10),
        whatsapps: parseInt(r.whatsapps || '0', 10),
        avgCallDurationSeconds: avg ? Math.round(parseFloat(avg)) : null,
      });
    });
    return map;
  }

  private async _resolveAgentNames(
    agentIds: string[],
  ): Promise<Record<string, string>> {
    const ids = [...new Set(agentIds)].filter(Boolean);
    if (ids.length === 0) return {};
    const agents = await this.userRepo
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .addSelect('u.fullName', 'name')
      .where('u.id IN (:...ids)', { ids })
      .getRawMany();
    return agents.reduce((acc, a) => {
      acc[a.id] = a.name || 'Agent';
      return acc;
    }, {} as Record<string, string>);
  }

  private async _getChannelDistribution(
    orgId: string,
    filters: DashboardFilters,
    range: DateWindow,
  ) {
    const rows = await this._conversationBaseQuery(orgId, filters)
      .select('c.channel', 'channel')
      .addSelect('COUNT(*)', 'count')
      .andWhere('c.created_at >= :startDate', { startDate: range.startDate })
      .andWhere('c.created_at < :endDate', { endDate: range.endDate })
      .groupBy('c.channel')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany();
    const total = rows.reduce((sum, row) => sum + parseInt(row.count, 10), 0);
    return rows.map((row) => ({
      channel: row.channel || 'unknown',
      count: parseInt(row.count, 10),
      percent: total > 0 ? Math.round((parseInt(row.count, 10) / total) * 100) : 0,
    }));
  }

  private async _getBroadcastStats(
    orgId: string,
    filters: DashboardFilters,
    range: DateWindow,
  ) {
    const broadcastBase = this.broadcastRepo
      .createQueryBuilder('b')
      .where('b.organization_id = :orgId', { orgId })
      .andWhere('b.created_at >= :startDate', { startDate: range.startDate })
      .andWhere('b.created_at < :endDate', { endDate: range.endDate });

    if (filters.channelId) {
      broadcastBase.andWhere('b.channel_id = :channelId', {
        channelId: filters.channelId,
      });
    }

    const [total, sent, draft, volumeRow] = await Promise.all([
      broadcastBase.clone().getCount(),
      broadcastBase
        .clone()
        .andWhere('b.status = :status', { status: BroadcastStatus.SENT })
        .getCount(),
      broadcastBase
        .clone()
        .andWhere('b.status = :status', { status: BroadcastStatus.DRAFT })
        .getCount(),
      broadcastBase
        .clone()
        .select('COALESCE(SUM(b.sent_count), 0)', 'totalSent')
        .addSelect('COALESCE(SUM(b.delivered_count), 0)', 'totalDelivered')
        .addSelect('COALESCE(SUM(b.read_count), 0)', 'totalRead')
        .addSelect('COALESCE(SUM(b.failed_count), 0)', 'totalFailed')
        .andWhere('b.status = :status', { status: BroadcastStatus.SENT })
        .getRawOne(),
    ]);
    const recent = await broadcastBase
      .clone()
      .orderBy('b.created_at', 'DESC')
      .take(5)
      .getMany();

    const totalSent = parseInt(volumeRow?.totalSent ?? volumeRow?.totalsent ?? '0', 10);
    const totalDelivered = parseInt(volumeRow?.totalDelivered ?? volumeRow?.totaldelivered ?? '0', 10);
    const totalRead = parseInt(volumeRow?.totalRead ?? volumeRow?.totalread ?? '0', 10);
    const totalFailed = parseInt(volumeRow?.totalFailed ?? volumeRow?.totalfailed ?? '0', 10);
    const totalSpent = totalSent * WA_MESSAGE_COST_IDR;

    return {
      total,
      sent,
      draft,
      totalSent,
      totalDelivered,
      totalRead,
      totalFailed,
      totalSpent,
      deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
      readRate: totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0,
      recentBroadcasts: recent.map((broadcast) => ({
        id: broadcast.id,
        name: broadcast.name,
        status: broadcast.status,
        broadcastType: broadcast.broadcastType,
        sentCount: broadcast.sentCount ?? 0,
        failedCount: broadcast.failedCount ?? 0,
        sentAt: broadcast.sentAt,
        createdAt: broadcast.createdAt,
      })),
    };
  }

  private async _getAgentMetrics(
    orgId: string,
    userId: string,
    filters: DashboardFilters,
    range: DateWindow,
  ) {
    const assignedBase = this._conversationBaseQuery(orgId, filters).andWhere(
      'c.assigned_agent_id = :userId',
      { userId },
    );

    const [totalChats, activeChats, closedInRange] = await Promise.all([
      assignedBase.clone().getCount(),
      assignedBase
          .clone()
          .andWhere('c.status = :status', { status: ConversationStatus.OPEN })
          .getCount(),
      assignedBase
          .clone()
          .andWhere('c.status = :status', { status: ConversationStatus.CLOSED })
          .andWhere('c.updated_at >= :startDate', { startDate: range.startDate })
          .andWhere('c.updated_at < :endDate', { endDate: range.endDate })
          .getCount(),
    ]);

    const totalReplied = await this._messageBaseQuery(orgId, filters)
      .andWhere('c.assigned_agent_id = :userId', { userId })
      .andWhere('m.sender_type = :senderType', { senderType: 'agent' })
      .select('COUNT(DISTINCT c.id)', 'count')
      .getRawOne()
      .then((row) => parseInt(row?.count || '0', 10));

    const avgReplyBase = this.messageRepo
      .createQueryBuilder('m')
      .innerJoin('m.conversation', 'c')
      .leftJoin('messages', 'prev', 'prev.id = m.reply_to_id')
      .where('c.organization_id = :orgId', { orgId })
      .andWhere('c.assigned_agent_id = :userId', { userId })
      .andWhere('m.sender_type = :senderType', { senderType: 'agent' })
      .andWhere('m.reply_to_id IS NOT NULL')
      .andWhere('m.created_at >= :startDate', { startDate: range.startDate })
      .andWhere('m.created_at < :endDate', { endDate: range.endDate });
    this._applyConversationFilters(avgReplyBase, filters, 'c');
    const avgReplyResult = await avgReplyBase
      .select(
        'AVG(EXTRACT(EPOCH FROM (m.created_at - prev.created_at)))',
        'avgSeconds',
      )
      .getRawOne()
      .catch(() => null);

    return {
      totalChats,
      totalReplied,
      avgReplyTimeSeconds: avgReplyResult?.avgSeconds
          ? Math.round(parseFloat(avgReplyResult.avgSeconds))
          : 0,
      closedToday: closedInRange,
      activeChats,
    };
  }

  // ══════════════════════════════════════════════════════
  // OMNICHANNEL ANALYTICS
  // ══════════════════════════════════════════════════════

  // ── Source Channel Distribution ───────────────────────
  async getSourceChannelStats(orgId: string, dateRange?: string, sourceChannel?: string, dateFrom?: string, dateTo?: string, _tag?: string) {
    const range = this._resolveDateRange(dateRange, dateFrom, dateTo);
    const sourceFilter = sourceChannel && sourceChannel.length > 0 ? sourceChannel : null;

    // Conversations by source channel (+ response metrics)
    const convQb = this.conversationRepo
      .createQueryBuilder('c')
      .select('c.source_channel', 'channel')
      .addSelect('COUNT(*)', 'count')
      .addSelect(
        `SUM(CASE WHEN c.first_reply_at IS NOT NULL THEN 1 ELSE 0 END)`,
        'replied',
      )
      .addSelect(
        'AVG(EXTRACT(EPOCH FROM (c.first_reply_at - c.created_at)))',
        'avgResponseSec',
      )
      .addSelect(
        `SUM(CASE WHEN c.status = '${ConversationStatus.CLOSED}' THEN 1 ELSE 0 END)`,
        'closed',
      )
      .where('c.organization_id = :orgId', { orgId })
      .andWhere('c.created_at >= :start', { start: range.startDate })
      .andWhere('c.created_at < :end', { end: range.endDate })
      .groupBy('c.source_channel')
      .orderBy('COUNT(*)', 'DESC');
    if (sourceFilter) convQb.andWhere('c.source_channel = :sourceFilter', { sourceFilter });
    const convBySource = await convQb.getRawMany();

    // Contacts by source channel
    const contactsQb = this.contactRepo
      .createQueryBuilder('ct')
      .select('ct.source_channel', 'channel')
      .addSelect('COUNT(*)', 'count')
      .where('ct.organization_id = :orgId', { orgId })
      .andWhere('ct.created_at >= :start', { start: range.startDate })
      .andWhere('ct.created_at < :end', { end: range.endDate })
      .groupBy('ct.source_channel')
      .orderBy('COUNT(*)', 'DESC');
    if (sourceFilter) contactsQb.andWhere('ct.source_channel = :sourceFilter', { sourceFilter });
    const contactsBySource = await contactsQb.getRawMany();

    // Conversions by source channel
    const convsQb = this.conversionRepo
      .createQueryBuilder('ce')
      .select('ce.channel_credited', 'channel')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(ce.amount)', 'revenue')
      .where('ce.organization_id = :orgId', { orgId })
      .andWhere('ce.converted_at >= :start', { start: range.startDate })
      .andWhere('ce.converted_at < :end', { end: range.endDate })
      .groupBy('ce.channel_credited');
    if (sourceFilter) convsQb.andWhere('ce.channel_credited = :sourceFilter', { sourceFilter });
    const conversionsBySource = await convsQb.getRawMany();

    // Won/Lost by source via stage category
    const wonLostQb = this.conversationRepo
      .createQueryBuilder('c')
      .leftJoin('stages', 's', 's.id = c.stage_id')
      .select('c.source_channel', 'channel')
      .addSelect(`SUM(CASE WHEN s.category = 'won' THEN 1 ELSE 0 END)`, 'won')
      .addSelect(`SUM(CASE WHEN s.category = 'lost' THEN 1 ELSE 0 END)`, 'lost')
      .where('c.organization_id = :orgId', { orgId })
      .andWhere('c.created_at >= :start', { start: range.startDate })
      .andWhere('c.created_at < :end', { end: range.endDate })
      .groupBy('c.source_channel');
    if (sourceFilter) wonLostQb.andWhere('c.source_channel = :sourceFilter', { sourceFilter });
    const wonLostBySource = await wonLostQb.getRawMany();

    const ctaMap = await this._getSourceCtaMap(orgId, range, sourceFilter || undefined);

    const channels = new Set<string>();
    [...convBySource, ...contactsBySource, ...conversionsBySource, ...wonLostBySource].forEach(
      (r) => channels.add(r.channel || 'WHATSAPP_DIRECT'),
    );
    ctaMap.forEach((_v, k) => { if (k && k !== 'UNKNOWN') channels.add(k); });

    const distribution = Array.from(channels).map((ch) => {
      const convRow = convBySource.find((r) => r.channel === ch);
      const conversations = parseInt(convRow?.count || '0', 10);
      const replied = parseInt(convRow?.replied || '0', 10);
      const closed = parseInt(convRow?.closed || '0', 10);
      const avgRespRaw = convRow?.avgResponseSec ?? convRow?.avgresponsesec;
      const avgResponseSeconds = avgRespRaw ? Math.round(parseFloat(avgRespRaw)) : null;

      const contacts = parseInt(contactsBySource.find((r) => r.channel === ch)?.count || '0', 10);
      const convEventRow = conversionsBySource.find((r) => r.channel === ch);
      const conversions = parseInt(convEventRow?.count || '0', 10);
      const revenue = parseFloat(convEventRow?.revenue || '0');

      const wlRow = wonLostBySource.find((r) => r.channel === ch);
      const won = parseInt(wlRow?.won || '0', 10);
      const lost = parseInt(wlRow?.lost || '0', 10);
      const closedStages = won + lost;

      const conversionRate = contacts > 0 ? Math.round((conversions / contacts) * 10000) / 100 : 0;
      const winRate = closedStages > 0 ? Math.round((won / closedStages) * 100) : 0;
      const responseRate = conversations > 0 ? Math.round((replied / conversations) * 100) : 0;
      const avgConversionValue = conversions > 0 ? Math.round(revenue / conversions) : 0;

      // Composite effectiveness: 40% conversionRate (normalized), 30% winRate, 20% responseRate,
      // 10% fast-response bonus (cap 1 min = 60s).
      const convRateScore = Math.min(conversionRate, 100);
      const fastResponseScore = avgResponseSeconds != null
        ? Math.max(0, 100 - Math.min(avgResponseSeconds, 600) / 6)
        : 0;
      const effectivenessScore = Math.round(
        convRateScore * 0.4 + winRate * 0.3 + responseRate * 0.2 + fastResponseScore * 0.1,
      );

      return {
        channel: ch,
        conversations,
        contacts,
        conversions,
        revenue,
        replied,
        closed,
        won,
        lost,
        conversionRate,
        winRate,
        responseRate,
        avgResponseSeconds,
        avgConversionValue,
        effectivenessScore,
        calls: (ctaMap.get(ch)?.calls) ?? 0,
        whatsappCtas: (ctaMap.get(ch)?.whatsapps) ?? 0,
        avgCallDurationSeconds: (ctaMap.get(ch)?.avgCallDurationSeconds) ?? null,
      };
    });

    distribution.sort((a, b) => b.conversations - a.conversations);

    const bestPerformer = distribution.length
      ? [...distribution].sort((a, b) => b.effectivenessScore - a.effectivenessScore)[0]
      : null;

    return {
      dateRange: range.label,
      appliedFilters: { sourceChannel: sourceFilter },
      distribution,
      totals: {
        conversations: distribution.reduce((s, d) => s + d.conversations, 0),
        contacts: distribution.reduce((s, d) => s + d.contacts, 0),
        conversions: distribution.reduce((s, d) => s + d.conversions, 0),
        revenue: distribution.reduce((s, d) => s + d.revenue, 0),
        won: distribution.reduce((s, d) => s + d.won, 0),
        lost: distribution.reduce((s, d) => s + d.lost, 0),
      },
      bestPerformer: bestPerformer
        ? { channel: bestPerformer.channel, effectivenessScore: bestPerformer.effectivenessScore }
        : null,
    };
  }

  // ── Agent Follow-up Performance ──────────────────────
  async getAgentPerformance(orgId: string, dateRange?: string, sourceChannel?: string, dateFrom?: string, dateTo?: string, _tag?: string) {
    const range = this._resolveDateRange(dateRange, dateFrom, dateTo);
    const sourceFilter = sourceChannel && sourceChannel.length > 0 ? sourceChannel : null;

    const statsQb = this.conversationRepo
      .createQueryBuilder('c')
      .leftJoin('stages', 's', 's.id = c.stage_id')
      .select('c.assigned_agent_id', 'agentId')
      .addSelect('COUNT(*)', 'totalConversations')
      .addSelect(
        `SUM(CASE WHEN c.status = '${ConversationStatus.CLOSED}' THEN 1 ELSE 0 END)`,
        'closed',
      )
      .addSelect(
        `SUM(CASE WHEN c.status = '${ConversationStatus.OPEN}' THEN 1 ELSE 0 END)`,
        'active',
      )
      .addSelect(`SUM(CASE WHEN s.category = 'won' THEN 1 ELSE 0 END)`, 'won')
      .addSelect(`SUM(CASE WHEN s.category = 'lost' THEN 1 ELSE 0 END)`, 'lost')
      .addSelect(
        'AVG(EXTRACT(EPOCH FROM (c.first_reply_at - c.created_at)))',
        'avgFirstReplySeconds',
      )
      .addSelect(
        'MIN(EXTRACT(EPOCH FROM (c.first_reply_at - c.created_at)))',
        'minFirstReplySeconds',
      )
      .addSelect(
        'MAX(EXTRACT(EPOCH FROM (c.first_reply_at - c.created_at)))',
        'maxFirstReplySeconds',
      )
      .addSelect(
        `SUM(CASE WHEN c.first_reply_at IS NOT NULL THEN 1 ELSE 0 END)`,
        'repliedCount',
      )
      .where('c.organization_id = :orgId', { orgId })
      .andWhere('c.assigned_agent_id IS NOT NULL')
      .andWhere('c.created_at >= :start', { start: range.startDate })
      .andWhere('c.created_at < :end', { end: range.endDate })
      .groupBy('c.assigned_agent_id')
      .orderBy('COUNT(*)', 'DESC');
    if (sourceFilter) statsQb.andWhere('c.source_channel = :sourceFilter', { sourceFilter });
    const agentStats = await statsQb.getRawMany();

    const breakdownQb = this.conversationRepo
      .createQueryBuilder('c')
      .select('c.assigned_agent_id', 'agentId')
      .addSelect('c.source_channel', 'sourceChannel')
      .addSelect('COUNT(*)', 'count')
      .where('c.organization_id = :orgId', { orgId })
      .andWhere('c.assigned_agent_id IS NOT NULL')
      .andWhere('c.created_at >= :start', { start: range.startDate })
      .andWhere('c.created_at < :end', { end: range.endDate })
      .groupBy('c.assigned_agent_id')
      .addGroupBy('c.source_channel');
    if (sourceFilter) breakdownQb.andWhere('c.source_channel = :sourceFilter', { sourceFilter });
    const agentSourceBreakdown = await breakdownQb.getRawMany();

    const agentNames = await this._resolveAgentNames(
      agentStats.map((r) => r.agentId ?? r.agentid),
    );

    return {
      dateRange: range.label,
      agents: agentStats.map((row) => {
        const agentId = row.agentId ?? row.agentid;
        const sourceBreakdown = agentSourceBreakdown
          .filter((s) => (s.agentId ?? s.agentid) === agentId)
          .map((s) => ({
            channel: s.sourceChannel ?? s.sourcechannel ?? 'WHATSAPP_DIRECT',
            count: parseInt(s.count, 10),
          }));

        const avgSec = row.avgFirstReplySeconds ?? row.avgfirstreplyseconds;
        const minSec = row.minFirstReplySeconds ?? row.minfirstreplyseconds;
        const maxSec = row.maxFirstReplySeconds ?? row.maxfirstreplyseconds;
        const won = parseInt(row.won || '0', 10);
        const lost = parseInt(row.lost || '0', 10);
        const closedStages = won + lost;
        return {
          agentId,
          name: agentNames[agentId] || 'Unknown',
          totalConversations: parseInt(row.totalConversations ?? row.totalconversations ?? '0', 10),
          resolved: parseInt(row.closed || '0', 10),
          active: parseInt(row.active || '0', 10),
          won,
          lost,
          conversionRate: closedStages > 0 ? Math.round((won / closedStages) * 100) : 0,
          repliedCount: parseInt(row.repliedCount ?? row.repliedcount ?? '0', 10),
          avgFirstReplySeconds: avgSec ? Math.round(parseFloat(avgSec)) : null,
          minFirstReplySeconds: minSec ? Math.round(parseFloat(minSec)) : null,
          maxFirstReplySeconds: maxSec ? Math.round(parseFloat(maxSec)) : null,
          sourceBreakdown,
        };
      }),
    };
  }

  // ── Conversion Funnel (by real stages) ────────────────
  async getConversionFunnel(orgId: string, dateRange?: string, sourceChannel?: string, dateFrom?: string, dateTo?: string, _tag?: string) {
    const range = this._resolveDateRange(dateRange, dateFrom, dateTo);
    const sourceFilter = sourceChannel && sourceChannel.length > 0 ? sourceChannel : null;

    const stages = await this.stageRepo.find({
      where: { organizationId: orgId, isActive: true },
      order: { sortOrder: 'ASC' },
    });

    // Counts per stage
    const perStageQb = this.conversationRepo
      .createQueryBuilder('c')
      .select('c.stage_id', 'stageId')
      .addSelect('COUNT(*)', 'count')
      .where('c.organization_id = :orgId', { orgId })
      .andWhere('c.stage_id IS NOT NULL')
      .andWhere('c.created_at >= :start', { start: range.startDate })
      .andWhere('c.created_at < :end', { end: range.endDate })
      .groupBy('c.stage_id');
    if (sourceFilter) perStageQb.andWhere('c.source_channel = :sourceFilter', { sourceFilter });
    const perStage = await perStageQb.getRawMany();
    const countByStage = new Map<string, number>();
    perStage.forEach((r) => {
      const sid = r.stageId ?? r.stageid;
      countByStage.set(sid, parseInt(r.count, 10));
    });

    // Total leads (new contacts) for rate base
    const leadsQb = this.contactRepo
      .createQueryBuilder('ct')
      .where('ct.organization_id = :orgId', { orgId })
      .andWhere('ct.created_at >= :start', { start: range.startDate })
      .andWhere('ct.created_at < :end', { end: range.endDate });
    if (sourceFilter) leadsQb.andWhere('ct.source_channel = :sourceFilter', { sourceFilter });
    const totalLeads = await leadsQb.getCount();

    // Revenue
    const revenueQb = this.conversionRepo
      .createQueryBuilder('ce')
      .select('SUM(ce.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('ce.organization_id = :orgId', { orgId })
      .andWhere('ce.converted_at >= :start', { start: range.startDate })
      .andWhere('ce.converted_at < :end', { end: range.endDate });
    if (sourceFilter) revenueQb.andWhere('ce.channel_credited = :sourceFilter', { sourceFilter });
    const revenueRow = await revenueQb.getRawOne();
    const totalRevenue = parseFloat(revenueRow?.total || '0');
    const totalConverted = parseInt(revenueRow?.count || '0', 10);

    const stageRows = stages.map((s) => {
      const count = countByStage.get(s.id) || 0;
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        category: s.category,
        sortOrder: s.sortOrder,
        count,
        rate: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0,
      };
    });

    const groupedTotals: Record<StageCategory, number> = {
      progressing: 0,
      won: 0,
      lost: 0,
    } as any;
    stageRows.forEach((r) => {
      groupedTotals[r.category as StageCategory] =
        (groupedTotals[r.category as StageCategory] || 0) + r.count;
    });

    const totalInStages =
      groupedTotals.progressing + groupedTotals.won + groupedTotals.lost;
    const closedStages = groupedTotals.won + groupedTotals.lost;

    return {
      dateRange: range.label,
      appliedFilters: { sourceChannel: sourceFilter },
      totalLeads,
      totalInStages,
      groupedTotals,
      conversionRate: closedStages > 0 ? Math.round((groupedTotals.won / closedStages) * 100) : 0,
      stages: stageRows,
      totalConverted,
      totalRevenue,
    };
  }

  // ── Source Channel Trend ─────────────────────────────
  async getSourceTrend(orgId: string, dateRange?: string, dateFrom?: string, dateTo?: string) {
    const range = this._resolveDateRange(dateRange, dateFrom, dateTo);

    const raw = await this.conversationRepo
      .createQueryBuilder('c')
      .select('DATE(c.created_at)', 'date')
      .addSelect('c.source_channel', 'channel')
      .addSelect('COUNT(*)', 'count')
      .where('c.organization_id = :orgId', { orgId })
      .andWhere('c.created_at >= :start', { start: range.startDate })
      .andWhere('c.created_at < :end', { end: range.endDate })
      .groupBy('DATE(c.created_at)')
      .addGroupBy('c.source_channel')
      .orderBy('DATE(c.created_at)', 'ASC')
      .getRawMany();

    // Group by date, with per-channel counts
    const dates: Record<string, Record<string, number>> = {};
    for (let i = 0; i < range.trendDays; i++) {
      const d = new Date(range.startDate);
      d.setDate(d.getDate() + i);
      dates[d.toISOString().split('T')[0]] = {};
    }
    raw.forEach((r) => {
      const dateStr = r.date instanceof Date
        ? r.date.toISOString().split('T')[0]
        : String(r.date).split('T')[0];
      const ch = r.channel || 'WHATSAPP_DIRECT';
      if (dates[dateStr]) {
        dates[dateStr][ch] = parseInt(r.count, 10);
      }
    });

    return {
      dateRange: range.label,
      trend: Object.entries(dates).map(([date, channels]) => ({
        date,
        ...channels,
        total: Object.values(channels).reduce((s, c) => s + c, 0),
      })),
    };
  }
}
