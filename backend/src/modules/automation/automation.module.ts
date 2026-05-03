// ============================================================
// Automation Module
// ============================================================
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AutomationController } from './automation.controller';
import { AutomationService, AutomationProcessor } from './automation.service';
import { GoogleSheetsService } from './google-sheets.service';
import { AutomationRule } from '../../common/entities/automation-rule.entity';
import { Conversation } from '../../common/entities/conversation.entity';
import { Contact } from '../../common/entities/contact.entity';
import { Department } from '../../common/entities/department.entity';
import { User } from '../../common/entities/user.entity';
import { ChatModule } from '../chat/chat.module';
import { WebhookModule } from '../webhook/webhook.module';
import { AUTOMATION_QUEUE } from '../webhook/message-queue.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AutomationRule, Conversation, Contact, Department, User]),
    BullModule.registerQueue({ name: AUTOMATION_QUEUE }),
    forwardRef(() => ChatModule),
    forwardRef(() => WebhookModule),
  ],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationProcessor, GoogleSheetsService],
  exports: [AutomationService],
})
export class AutomationModule {}
