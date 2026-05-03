// ============================================================
// Follow-Ups Module — CRUD + CRON for scheduled follow-ups
// ============================================================
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Module,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, IsNull } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { FollowUp, FollowUpStatus } from '../../common/entities/follow-up.entity';
import { ChatGateway } from '../chat/chat.gateway';
import { ChatModule } from '../chat/chat.module';
import { PushNotificationService } from '../chat/push-notification.service';

@Injectable()
export class FollowUpsService {
  private readonly logger = new Logger(FollowUpsService.name);

  constructor(
    @InjectRepository(FollowUp)
    private readonly repo: Repository<FollowUp>,
    private readonly chatGateway: ChatGateway,
    private readonly pushService: PushNotificationService,
  ) {}

  async create(orgId: string, agentId: string, dto: { conversationId: string; note?: string; scheduledAt: string }) {
    // Cancel all existing pending follow-ups for this conversation (reschedule behavior)
    await this.repo.update(
      { organizationId: orgId, conversationId: dto.conversationId, status: FollowUpStatus.PENDING },
      { status: FollowUpStatus.CANCELLED },
    );

    const followUp = this.repo.create({
      organizationId: orgId,
      conversationId: dto.conversationId,
      agentId,
      note: dto.note?.trim() || null,
      scheduledAt: new Date(dto.scheduledAt),
      status: FollowUpStatus.PENDING,
    });
    return this.repo.save(followUp);
  }

  async findByConversation(orgId: string, conversationId: string) {
    return this.repo.find({
      where: { organizationId: orgId, conversationId },
      order: { scheduledAt: 'ASC' },
      relations: ['agent'],
    });
  }

  async findMyPending(orgId: string, agentId: string) {
    return this.repo.find({
      where: { organizationId: orgId, agentId, status: FollowUpStatus.PENDING },
      order: { scheduledAt: 'ASC' },
      relations: ['conversation'],
    });
  }

  async findAllPending(orgId: string) {
    return this.repo.find({
      where: { organizationId: orgId, status: FollowUpStatus.PENDING },
      order: { scheduledAt: 'ASC' },
      relations: ['agent', 'conversation'],
    });
  }

  async complete(orgId: string, id: string) {
    await this.repo.update(
      { id, organizationId: orgId },
      { status: FollowUpStatus.COMPLETED, completedAt: new Date() },
    );
    return { success: true };
  }

  async cancel(orgId: string, id: string) {
    await this.repo.update(
      { id, organizationId: orgId },
      { status: FollowUpStatus.CANCELLED },
    );
    return { success: true };
  }

  async remove(orgId: string, id: string) {
    await this.repo.delete({ id, organizationId: orgId });
    return { success: true };
  }

  async completeByConversation(orgId: string, agentId: string, conversationId: string) {
    const result = await this.repo.update(
      { organizationId: orgId, conversationId, status: FollowUpStatus.PENDING },
      { status: FollowUpStatus.COMPLETED, completedAt: new Date() },
    );
    this.logger.log(`Completed ${result.affected} follow-up(s) for conversation ${conversationId}`);
    return { success: true, completed: result.affected };
  }

  // CRON: Check for overdue follow-ups every minute — only notify once per follow-up
  @Cron(CronExpression.EVERY_MINUTE)
  async handleOverdueFollowUps() {
    const now = new Date();
    const overdue = await this.repo.find({
      where: {
        status: FollowUpStatus.PENDING,
        scheduledAt: LessThanOrEqual(now),
        notifiedAt: IsNull(),
      },
      relations: ['agent', 'conversation', 'conversation.contact'],
    });

    if (overdue.length === 0) return;

    this.logger.log(`⏰ Found ${overdue.length} new overdue follow-up(s) to notify`);

    for (const fu of overdue) {
      this.logger.log(`Processing follow-up ${fu.id} for agent ${fu.agentId} (scheduled: ${fu.scheduledAt})`);
      // Notify agent via WebSocket
      this.chatGateway.server.to(`user:${fu.agentId}`).emit('followUpDue', {
        id: fu.id,
        conversationId: fu.conversationId,
        note: fu.note,
        scheduledAt: fu.scheduledAt,
      });
      // Send FCM push notification with schedule details
      const contactName = fu.conversation?.contact?.name || fu.conversation?.contact?.phone || undefined;
      try {
        await this.pushService.notifyFollowUpDue(fu.agentId, {
          id: fu.id,
          conversationId: fu.conversationId,
          note: fu.note,
          scheduledAt: fu.scheduledAt,
        }, contactName);
        this.logger.log(`✅ FCM notification sent for follow-up ${fu.id}`);
      } catch (err) {
        this.logger.error(`❌ FCM notification failed for follow-up ${fu.id}: ${err.message}`);
      }
      // Mark as notified so we don't fire again
      await this.repo.update(fu.id, { notifiedAt: now });
    }

    // Separately: mark >30 min overdue as missed
    const allOverdue = await this.repo.find({
      where: {
        status: FollowUpStatus.PENDING,
        scheduledAt: LessThanOrEqual(new Date(now.getTime() - 30 * 60000)),
      },
    });
    for (const fu of allOverdue) {
      await this.repo.update(fu.id, { status: FollowUpStatus.MISSED });
      this.logger.warn(`Follow-up ${fu.id} marked as missed`);
    }
  }

  async getStats(orgId: string) {
    const qb = this.repo.createQueryBuilder('f')
      .where('f.organization_id = :orgId', { orgId });

    const pending = await qb.clone()
      .andWhere('f.status = :s', { s: FollowUpStatus.PENDING })
      .getCount();

    const overdue = await qb.clone()
      .andWhere('f.status = :s', { s: FollowUpStatus.PENDING })
      .andWhere('f.scheduled_at <= NOW()')
      .getCount();

    const completedToday = await qb.clone()
      .andWhere('f.status = :s', { s: FollowUpStatus.COMPLETED })
      .andWhere('f.completed_at >= CURRENT_DATE')
      .getCount();

    return { pending, overdue, completedToday };
  }
}

@ApiTags('follow-ups')
@Controller('follow-ups')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FollowUpsController {
  constructor(private readonly service: FollowUpsService) {}

  @Post()
  @ApiOperation({ summary: 'Schedule a follow-up' })
  create(@Request() req, @Body() body: { conversationId: string; note?: string; scheduledAt: string }) {
    return this.service.create(req.user.organizationId, req.user.id, body);
  }

  @Get('my-pending')
  @ApiOperation({ summary: 'Get my pending follow-ups' })
  myPending(@Request() req) {
    return this.service.findMyPending(req.user.organizationId, req.user.id);
  }

  @Get('all-pending')
  @ApiOperation({ summary: 'Get all pending follow-ups (manager)' })
  allPending(@Request() req) {
    return this.service.findAllPending(req.user.organizationId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get follow-up stats' })
  stats(@Request() req) {
    return this.service.getStats(req.user.organizationId);
  }

  @Get('conversation/:conversationId')
  @ApiOperation({ summary: 'Get follow-ups for a conversation' })
  byConversation(@Request() req, @Param('conversationId') conversationId: string) {
    return this.service.findByConversation(req.user.organizationId, conversationId);
  }

  @Patch('conversation/:conversationId/complete')
  @ApiOperation({ summary: 'Complete all pending follow-ups for a conversation' })
  completeByConversation(@Request() req, @Param('conversationId') conversationId: string) {
    return this.service.completeByConversation(req.user.organizationId, req.user.id, conversationId);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Mark follow-up as completed' })
  complete(@Request() req, @Param('id') id: string) {
    return this.service.complete(req.user.organizationId, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a follow-up' })
  cancel(@Request() req, @Param('id') id: string) {
    return this.service.cancel(req.user.organizationId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a follow-up' })
  remove(@Request() req, @Param('id') id: string) {
    return this.service.remove(req.user.organizationId, id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([FollowUp]), ChatModule],
  controllers: [FollowUpsController],
  providers: [FollowUpsService],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
