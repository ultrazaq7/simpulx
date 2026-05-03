// ============================================================
// Meta Channels Module — Instagram + Facebook Messenger CRUD
// ============================================================
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
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
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetaChannel } from '../../common/entities/meta-channel.entity';
import { UserRole } from '../../common/entities/user.entity';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import axios from 'axios';

// ── DTOs ────────────────────────────────────────────────
class CreateMetaChannelDto {
  @ApiProperty({ example: 'Instagram — BYD Jakarta' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ['instagram', 'messenger'] })
  @IsString()
  @IsIn(['instagram', 'messenger'])
  platform: string;

  @ApiProperty({ example: '123456789', description: 'Facebook Page ID' })
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @ApiPropertyOptional({ description: 'Facebook Page name' })
  @IsString()
  @IsOptional()
  pageName?: string;

  @ApiPropertyOptional({ description: 'Instagram Business Account ID (for IG only)' })
  @IsString()
  @IsOptional()
  instagramAccountId?: string;

  @ApiProperty({ description: 'Page Access Token (long-lived)' })
  @IsString()
  @IsNotEmpty()
  accessToken: string;

  @ApiPropertyOptional({ description: 'Webhook verify token' })
  @IsString()
  @IsOptional()
  webhookVerifyToken?: string;

  @ApiPropertyOptional({ description: 'Department UUID to link' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;
}

class UpdateMetaChannelDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  pageId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  pageName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  instagramAccountId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  accessToken?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;
}

class MetaEmbeddedSignupDto {
  @ApiProperty({ description: 'Auth code from FB.login()' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ enum: ['instagram', 'messenger'] })
  @IsString()
  @IsOptional()
  platform?: string;

  @ApiPropertyOptional({ description: 'Department UUID to link' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;
}

// ── Service ─────────────────────────────────────────────
@Injectable()
export class MetaChannelsService {
  private readonly logger = new Logger(MetaChannelsService.name);

  constructor(
    @InjectRepository(MetaChannel) private channelRepo: Repository<MetaChannel>,
    private readonly configService: ConfigService,
  ) {}

  async list(orgId: string) {
    return this.channelRepo.find({
      where: { organizationId: orgId },
      relations: ['department'],
      order: { platform: 'ASC', name: 'ASC' },
    });
  }

  async get(orgId: string, id: string) {
    const channel = await this.channelRepo.findOne({
      where: { id, organizationId: orgId },
      relations: ['department'],
    });
    if (!channel) throw new NotFoundException('Meta channel not found');
    return channel;
  }

  async create(orgId: string, dto: CreateMetaChannelDto) {
    const channel = this.channelRepo.create({
      organizationId: orgId,
      name: dto.name,
      platform: dto.platform,
      pageId: dto.pageId,
      pageName: dto.pageName,
      instagramAccountId: dto.instagramAccountId,
      accessToken: dto.accessToken,
      webhookVerifyToken: dto.webhookVerifyToken || Math.random().toString(36).slice(-16),
      departmentId: dto.departmentId,
      status: 'pending',
    });
    return this.channelRepo.save(channel);
  }

  async update(orgId: string, id: string, dto: UpdateMetaChannelDto) {
    const channel = await this.get(orgId, id);
    Object.assign(channel, dto);
    return this.channelRepo.save(channel);
  }

  async remove(orgId: string, id: string) {
    const channel = await this.get(orgId, id);
    await this.channelRepo.remove(channel);
    return { message: 'Meta channel removed' };
  }

  async testConnection(orgId: string, id: string) {
    const channel = await this.get(orgId, id);

    try {
      // Validate page access token
      const res = await axios.get(
        `https://graph.facebook.com/v21.0/${channel.pageId}?fields=name,id`,
        { headers: { Authorization: `Bearer ${channel.accessToken}` } },
      );

      channel.status = 'connected';
      if (res.data.name) channel.pageName = res.data.name;
      await this.channelRepo.save(channel);

      return { status: 'connected', pageName: res.data.name };
    } catch (error) {
      channel.status = 'error';
      await this.channelRepo.save(channel);
      return { status: 'error', error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Exchange the auth code from FB.login() for a user access token,
   * then list the user's pages (with IG accounts) so Flutter can show a picker.
   */
  async getMetaPages(orgId: string, dto: MetaEmbeddedSignupDto): Promise<any[]> {
    const appId = this.configService.get<string>('FACEBOOK_APP_ID');
    const appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET');
    if (!appId || !appSecret) {
      throw new BadRequestException('Facebook App credentials not configured on server');
    }

    // Step 1: Exchange code for user access token
    this.logger.log('Meta signup: exchanging code for access token');
    let userToken: string;
    try {
      const tokenRes = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
        params: { client_id: appId, client_secret: appSecret, code: dto.code },
      });
      userToken = tokenRes.data.access_token;
      if (!userToken) throw new Error('No access_token in response');
    } catch (error) {
      const msg = error.response?.data?.error?.message || error.message || 'Token exchange failed';
      throw new BadRequestException(`Token exchange failed: ${msg}`);
    }

    // Step 2: Exchange for long-lived token
    let longToken: string;
    try {
      const llRes = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: userToken,
        },
      });
      longToken = llRes.data.access_token || userToken;
    } catch {
      longToken = userToken;
    }

    // Step 3: Get list of pages the user manages + their IG accounts
    this.logger.log('Meta signup: fetching managed pages');
    const pagesRes = await axios.get(
      'https://graph.facebook.com/v21.0/me/accounts',
      {
        params: {
          fields: 'id,name,access_token,instagram_business_account{id,name,username}',
          access_token: longToken,
        },
      },
    );

    const pages: any[] = pagesRes.data.data || [];
    return pages.map((p) => ({
      pageId: p.id,
      pageName: p.name,
      pageAccessToken: p.access_token,
      instagramAccountId: p.instagram_business_account?.id ?? null,
      instagramUsername: p.instagram_business_account?.username ?? null,
    }));
  }

  /**
   * Create a Meta channel from a selected page (after embedded signup flow).
   */
  async completeMetaSignup(
    orgId: string,
    dto: MetaEmbeddedSignupDto & {
      pageId: string;
      pageName: string;
      pageAccessToken: string;
      instagramAccountId?: string;
      name: string;
    },
  ) {
    const channel = this.channelRepo.create({
      organizationId: orgId,
      name: dto.name,
      platform: dto.platform ?? (dto.instagramAccountId ? 'instagram' : 'messenger'),
      pageId: dto.pageId,
      pageName: dto.pageName,
      instagramAccountId: dto.instagramAccountId,
      accessToken: dto.pageAccessToken,
      webhookVerifyToken: Math.random().toString(36).slice(-16),
      departmentId: dto.departmentId,
      status: 'connected',
    });
    return this.channelRepo.save(channel);
  }
}

// ── Controller ──────────────────────────────────────────
@ApiTags('meta-channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('meta-channels')
export class MetaChannelsController {
  constructor(private readonly service: MetaChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'List all Meta channels (IG + Messenger)' })
  async list(@Request() req: any) {
    return this.service.list(req.user.organizationId);
  }

  @Post()
  @ApiOperation({ summary: 'Create Meta channel' })
  async create(@Request() req: any, @Body() dto: CreateMetaChannelDto) {
    if (req.user.role !== UserRole.OWNER && req.user.role !== UserRole.ADMIN) {
      throw new NotFoundException('Not authorized');
    }
    return this.service.create(req.user.organizationId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Meta channel' })
  async update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateMetaChannelDto) {
    if (req.user.role !== UserRole.OWNER && req.user.role !== UserRole.ADMIN) {
      throw new NotFoundException('Not authorized');
    }
    return this.service.update(req.user.organizationId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete Meta channel' })
  async remove(@Request() req: any, @Param('id') id: string) {
    if (req.user.role !== UserRole.OWNER && req.user.role !== UserRole.ADMIN) {
      throw new NotFoundException('Not authorized');
    }
    return this.service.remove(req.user.organizationId, id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test Meta channel connection' })
  async test(@Request() req: any, @Param('id') id: string) {
    return this.service.testConnection(req.user.organizationId, id);
  }

  @Post('embedded-signup/pages')
  @ApiOperation({ summary: 'Exchange Meta auth code and return list of pages for picker' })
  async getMetaPages(@Request() req: any, @Body() dto: MetaEmbeddedSignupDto) {
    if (req.user.role !== UserRole.OWNER && req.user.role !== UserRole.ADMIN) {
      throw new BadRequestException('Not authorized');
    }
    return this.service.getMetaPages(req.user.organizationId, dto);
  }

  @Post('embedded-signup/complete')
  @ApiOperation({ summary: 'Create Meta channel from selected page after embedded signup' })
  async completeMetaSignup(@Request() req: any, @Body() body: any) {
    if (req.user.role !== UserRole.OWNER && req.user.role !== UserRole.ADMIN) {
      throw new BadRequestException('Not authorized');
    }
    return this.service.completeMetaSignup(req.user.organizationId, body);
  }
}

// ── Module ──────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([MetaChannel])],
  controllers: [MetaChannelsController],
  providers: [MetaChannelsService, ConfigService],
  exports: [MetaChannelsService],
})
export class MetaChannelsModule {}
