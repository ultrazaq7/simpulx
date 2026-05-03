import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { CtaEventsService } from './cta-events.service';
import { CtaType } from '../../common/entities/cta-event.entity';

@ApiTags('cta-events')
@Controller('cta-events')
export class CtaEventsController {
  constructor(private readonly service: CtaEventsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log a CTA (call or whatsapp) tap' })
  async log(
    @Request() req,
    @Body()
    body: {
      type: CtaType;
      contactId?: string;
      conversationId?: string;
      durationSeconds?: number;
      metadata?: Record<string, any>;
    },
  ) {
    return this.service.log({
      orgId: req.user.orgId,
      agentId: req.user.sub,
      type: body.type,
      contactId: body.contactId ?? null,
      conversationId: body.conversationId ?? null,
      durationSeconds: body.durationSeconds ?? null,
      metadata: body.metadata ?? {},
    });
  }

  @Patch(':id/duration')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update call duration for an existing CTA event' })
  async updateDuration(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { durationSeconds: number },
  ) {
    return this.service.updateDuration(req.user.orgId, id, body.durationSeconds);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recent CTA events (for debug / audit)' })
  async list(@Request() req, @Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 50;
    return this.service.listRecent(req.user.orgId, isNaN(n) ? 50 : n);
  }
}
