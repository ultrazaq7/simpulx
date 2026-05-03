import { Module, forwardRef, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { PushNotificationService } from './push-notification.service';
import { Conversation } from '../../common/entities/conversation.entity';
import { Message } from '../../common/entities/message.entity';
import { Contact } from '../../common/entities/contact.entity';
import { User } from '../../common/entities/user.entity';
import { WhatsappChannel } from '../../common/entities/whatsapp-channel.entity';
import { WhatsappTemplate } from '../../common/entities/whatsapp-template.entity';
import { Department } from '../../common/entities/department.entity';
import { Stage } from '../../common/entities/stage.entity';
import { InternalNote } from '../../common/entities/internal-note.entity';
import { ChannelInteraction } from '../../common/entities/channel-interaction.entity';
import { MetaChannel } from '../../common/entities/meta-channel.entity';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, Contact, User, WhatsappChannel, WhatsappTemplate, Department, Stage, InternalNote, ChannelInteraction, MetaChannel]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
    forwardRef(() => WebhookModule),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, PushNotificationService],
  exports: [ChatService, ChatGateway, PushNotificationService],
})
export class ChatModule implements OnModuleInit {
  private readonly logger = new Logger(ChatModule.name);

  constructor(private readonly chatService: ChatService) {}

  onModuleInit() {
    // Run snooze check every 60 seconds
    setInterval(async () => {
      try {
        const result = await this.chatService.reopenExpiredSnoozes();
        if (result.reopened > 0) {
          this.logger.log(`⏰ Snooze cron: reopened ${result.reopened} conversations`);
        }
      } catch (err) {
        this.logger.error(`Snooze cron error: ${(err as Error).message}`);
      }
    }, 60_000);
    this.logger.log('⏰ Snooze cron registered (every 60s)');
  }
}
