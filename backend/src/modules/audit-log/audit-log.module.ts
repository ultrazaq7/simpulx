// ============================================================
// Audit Log Module
// ============================================================
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from '../../common/entities/audit-log.entity';
import { Message } from '../../common/entities/message.entity';
import { Conversation } from '../../common/entities/conversation.entity';
import { Contact } from '../../common/entities/contact.entity';
import { Stage } from '../../common/entities/stage.entity';
import { CtaEvent } from '../../common/entities/cta-event.entity';
import { CtaEventsModule } from '../cta-events/cta-events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, Message, Conversation, Contact, Stage, CtaEvent]),
    CtaEventsModule,
  ],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
