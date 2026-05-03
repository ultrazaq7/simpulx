// ============================================================
// Audit Log Controller — REST API
// ============================================================
import { Controller, Get, Post, Body, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuditLogService } from './audit-log.service';
import { CtaEventsService } from '../cta-events/cta-events.service';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { AuditCategory } from '../../common/entities/audit-log.entity';

function _splitCsv(v?: string): string[] | undefined {
  if (!v) return undefined;
  const arr = v.split(',').map((s) => s.trim()).filter(Boolean);
  return arr.length > 0 ? arr : undefined;
}

@Controller('audit-logs')
@UseGuards(JwtAuthGuard)
export class AuditLogController {
  constructor(
    private readonly service: AuditLogService,
    private readonly ctaEvents: CtaEventsService,
  ) {}

  @Post('cta')
  async logCta(
    @Req() req,
    @Body() body: {
      type: string;
      conversationId?: string;
      contactName?: string;
      phone?: string;
      durationSeconds?: number;
    },
  ) {
    // Dual-write: keep audit log entry AND write to cta_events for dashboard analytics
    const normalizedType: 'call' | 'whatsapp' =
      body.type === 'phone' || body.type === 'call' ? 'call' : 'whatsapp';
    const orgId = req.user.organizationId ?? req.user.orgId;
    const userId = req.user.id ?? req.user.sub;

    await this.ctaEvents.log({
      orgId,
      agentId: userId,
      type: normalizedType,
      conversationId: body.conversationId ?? null,
      durationSeconds: body.durationSeconds ?? null,
      metadata: {
        phone: body.phone,
        contactName: body.contactName,
      },
    });

    return this.service.log({
      organizationId: orgId,
      category: AuditCategory.CTA,
      action: normalizedType === 'call' ? 'cta_call' : 'cta_whatsapp',
      userId,
      userName: req.user.name,
      targetId: body.conversationId,
      targetType: 'conversation',
      metadata: {
        type: body.type,
        contactName: body.contactName,
        phone: body.phone,
        durationSeconds: body.durationSeconds ?? null,
      },
    });
  }

  @Get()
  findAll(
    @Req() req,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(req.user.organizationId, {
      category: category as AuditCategory,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('messages')
  getMessageHistory(
    @Req() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
    @Query('statuses') statuses?: string,
    @Query('type') type?: string,
    @Query('channelId') channelId?: string,
    @Query('channelIds') channelIds?: string,
    @Query('departmentIds') departmentIds?: string,
    @Query('sourceChannels') sourceChannels?: string,
    @Query('tags') tags?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getMessageHistory(req.user.organizationId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
      search, direction, status, type, channelId,
      statuses: _splitCsv(statuses),
      channelIds: _splitCsv(channelIds),
      departmentIds: _splitCsv(departmentIds),
      sourceChannels: _splitCsv(sourceChannels),
      tags: _splitCsv(tags),
      dateFrom, dateTo,
    });
  }

  @Get('conversations')
  getConversationHistory(
    @Req() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('statuses') statuses?: string,
    @Query('channelId') channelId?: string,
    @Query('channelIds') channelIds?: string,
    @Query('departmentId') departmentId?: string,
    @Query('departmentIds') departmentIds?: string,
    @Query('sourceChannels') sourceChannels?: string,
    @Query('tags') tags?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getConversationHistory(req.user.organizationId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
      search, status, channelId, departmentId,
      statuses: _splitCsv(statuses),
      channelIds: _splitCsv(channelIds),
      departmentIds: _splitCsv(departmentIds),
      sourceChannels: _splitCsv(sourceChannels),
      tags: _splitCsv(tags),
      dateFrom, dateTo,
    });
  }

  @Get('messages/export')
  async exportMessages(
    @Req() req,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('channelId') channelId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const csv = await this.service.exportMessagesCsv(req.user.organizationId, {
      search, direction, status, type, channelId, dateFrom, dateTo,
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=messages.csv');
    res.send(csv);
  }

  @Get('conversations/export')
  async exportConversations(
    @Req() req,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('channelId') channelId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const csv = await this.service.exportConversationsCsv(req.user.organizationId, {
      search, status, channelId, departmentId, dateFrom, dateTo,
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=conversations.csv');
    res.send(csv);
  }
}
