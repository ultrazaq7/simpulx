// ============================================================
// Dashboard Module
// ============================================================
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Conversation } from '../../common/entities/conversation.entity';
import { Contact } from '../../common/entities/contact.entity';
import { Message } from '../../common/entities/message.entity';
import { User } from '../../common/entities/user.entity';
import { Broadcast } from '../../common/entities/broadcast.entity';
import { ConversionEvent } from '../../common/entities/conversion-event.entity';
import { Stage } from '../../common/entities/stage.entity';
import { CtaEvent } from '../../common/entities/cta-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Contact, Message, User, Broadcast, ConversionEvent, Stage, CtaEvent]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
