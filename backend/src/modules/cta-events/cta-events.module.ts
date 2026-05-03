import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CtaEvent } from '../../common/entities/cta-event.entity';
import { Contact } from '../../common/entities/contact.entity';
import { Conversation } from '../../common/entities/conversation.entity';
import { CtaEventsService } from './cta-events.service';
import { CtaEventsController } from './cta-events.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CtaEvent, Contact, Conversation])],
  providers: [CtaEventsService],
  controllers: [CtaEventsController],
  exports: [CtaEventsService],
})
export class CtaEventsModule {}
