import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

// Feature Modules
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { AutomationModule } from './modules/automation/automation.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { UsersModule } from './modules/users/users.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { MetaChannelsModule } from './modules/meta-channels/meta-channels.module';
import { QuickRepliesModule } from './modules/quick-replies/quick-replies.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { BroadcastsModule } from './modules/broadcasts/broadcasts.module';
import { DripCampaignsModule } from './modules/drip-campaigns/drip-campaigns.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { StagesModule } from './modules/stages/stages.module';
import { PublisherLeadsModule } from './modules/publisher-leads/publisher-leads.module';
import { ConversionsModule } from './modules/conversions/conversions.module';
import { FollowUpsModule } from './modules/follow-ups/follow-ups.module';
import { CtaEventsModule } from './modules/cta-events/cta-events.module';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // Environment configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.example'],
    }),

    // PostgreSQL via TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'simpulx'),
        password: configService.get('DB_PASSWORD', 'simpulx_secret'),
        database: configService.get('DB_DATABASE', 'simpulx_crm'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get('NODE_ENV') !== 'production', // Never sync in production
        logging: configService.get('NODE_ENV') === 'development',
      }),
    }),

    // Redis via BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD', undefined),
        },
      }),
    }),

    // Feature modules
    AuthModule,
    ChatModule,
    WebhookModule,
    AutomationModule,
    OrganizationsModule,
    ContactsModule,
    DepartmentsModule,
    UsersModule,
    ChannelsModule,
    MetaChannelsModule,
    QuickRepliesModule,
    DashboardModule,
    BroadcastsModule,
    DripCampaignsModule,
    AuditLogModule,
    StagesModule,
    PublisherLeadsModule,
    ConversionsModule,
    FollowUpsModule,
    CtaEventsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [HealthController],
})
export class AppModule {}
