// ============================================================
// Drip Campaigns Module
// ============================================================
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DripCampaignsController } from './drip-campaigns.controller';
import { DripCampaignsService } from './drip-campaigns.service';
import { DripCampaign, DripStep, DripEnrollment } from '../../common/entities/drip-campaign.entity';
import { Contact } from '../../common/entities/contact.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DripCampaign, DripStep, DripEnrollment, Contact]),
    ScheduleModule.forRoot(),
  ],
  controllers: [DripCampaignsController],
  providers: [DripCampaignsService],
  exports: [DripCampaignsService],
})
export class DripCampaignsModule {}
