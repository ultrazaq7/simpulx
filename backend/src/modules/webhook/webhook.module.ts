// ============================================================
// Webhook Module
// ============================================================
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { WebhookController } from './webhook.controller';
import { MetaWebhookController } from './meta-webhook.controller';
import { WhatsappService } from './whatsapp.service';
import { MetaMessagingService } from './meta-messaging.service';
import { MessageQueueService, INCOMING_MESSAGE_QUEUE, STATUS_UPDATE_QUEUE, AUTOMATION_QUEUE } from './message-queue.service';
import { IncomingMessageProcessor, StatusUpdateProcessor } from './message-queue.processor';
import { Organization } from '../../common/entities/organization.entity';
import { Message } from '../../common/entities/message.entity';
import { WhatsappChannel } from '../../common/entities/whatsapp-channel.entity';
import { MetaChannel } from '../../common/entities/meta-channel.entity';
import { ChatModule } from '../chat/chat.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, Message, WhatsappChannel, MetaChannel]),
    BullModule.registerQueue(
      { name: INCOMING_MESSAGE_QUEUE },
      { name: STATUS_UPDATE_QUEUE },
      { name: AUTOMATION_QUEUE },
    ),
    forwardRef(() => ChatModule),
    forwardRef(() => AutomationModule),
  ],
  controllers: [WebhookController, MetaWebhookController],
  providers: [
    WhatsappService,
    MetaMessagingService,
    MessageQueueService,
    IncomingMessageProcessor,
    StatusUpdateProcessor,
  ],
  exports: [WhatsappService, MetaMessagingService, MessageQueueService],
})
export class WebhookModule {}
