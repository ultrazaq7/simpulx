// ============================================================
// WhatsApp Channels Module — Multi-channel management
// ============================================================
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsArray, ValidateNested, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { WhatsappChannel } from '../../common/entities/whatsapp-channel.entity';
import { WhatsappTemplate } from '../../common/entities/whatsapp-template.entity';
import { UserRole } from '../../common/entities/user.entity';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import axios from 'axios';

// ── DTOs ────────────────────────────────────────────────
class CreateChannelDto {
  @ApiProperty({ example: 'BYD Jakarta Barat — Main' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '+6281234567890' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: '123456789012345', description: 'Meta Phone Number ID' })
  @IsString()
  @IsNotEmpty()
  phoneNumberId: string;

  @ApiPropertyOptional({ description: 'Meta Business Account ID' })
  @IsString()
  @IsOptional()
  businessAccountId?: string;

  @ApiProperty({ description: 'Meta API access token' })
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

class UpdateChannelDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phoneNumberId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  businessAccountId?: string;

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

// ── Template DTOs ──────────────────────────────────────
class TemplateComponentDto {
  @ApiProperty({ enum: ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'] })
  @IsString()
  @IsIn(['HEADER', 'BODY', 'FOOTER', 'BUTTONS'])
  type: string;

  @ApiPropertyOptional({ enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'] })
  @IsString()
  @IsOptional()
  format?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  text?: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  buttons?: any[];

  @ApiPropertyOptional()
  @IsOptional()
  example?: any;
}

class CreateTemplateDto {
  @ApiProperty({ example: 'order_confirmation' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'] })
  @IsString()
  @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category: string;

  @ApiProperty({ example: 'en_US' })
  @IsString()
  @IsNotEmpty()
  language: string;

  @ApiProperty({ type: [TemplateComponentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateComponentDto)
  components: TemplateComponentDto[];
}

// ── Embedded Signup DTO ──────────────────────────────────
class EmbeddedSignupDto {
  @ApiProperty({ description: 'Exchangeable token code from Facebook SDK' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'WhatsApp Business Account ID from session data' })
  @IsString()
  @IsNotEmpty()
  wabaId: string;

  @ApiProperty({ description: 'Phone Number ID from session data' })
  @IsString()
  @IsNotEmpty()
  phoneNumberId: string;
}

// ── Service ─────────────────────────────────────────────
@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    @InjectRepository(WhatsappChannel) private channelRepo: Repository<WhatsappChannel>,
    private readonly configService: ConfigService,
  ) {}

  async list(orgId: string) {
    return this.channelRepo.find({
      where: { organizationId: orgId },
      relations: ['department'],
      order: { name: 'ASC' },
    });
  }

  async get(orgId: string, id: string) {
    const channel = await this.channelRepo.findOne({
      where: { id, organizationId: orgId },
      relations: ['department'],
    });
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  async create(orgId: string, dto: CreateChannelDto) {
    const channel = this.channelRepo.create({
      organizationId: orgId,
      name: dto.name,
      phoneNumber: dto.phoneNumber,
      phoneNumberId: dto.phoneNumberId,
      businessAccountId: dto.businessAccountId,
      accessToken: dto.accessToken,
      webhookVerifyToken: dto.webhookVerifyToken || Math.random().toString(36).slice(-16),
      departmentId: dto.departmentId,
      status: 'pending',
    });
    return this.channelRepo.save(channel);
  }

  async update(orgId: string, id: string, dto: UpdateChannelDto) {
    const channel = await this.get(orgId, id);
    Object.assign(channel, dto);
    return this.channelRepo.save(channel);
  }

  async remove(orgId: string, id: string) {
    const channel = await this.get(orgId, id);
    await this.channelRepo.remove(channel);
    return { message: 'Channel removed' };
  }

  async testConnection(orgId: string, id: string) {
    const channel = await this.get(orgId, id);

    try {
      const res = await axios.get(
        `https://graph.facebook.com/v21.0/${channel.phoneNumberId}`,
        { headers: { Authorization: `Bearer ${channel.accessToken}` } },
      );

      channel.status = 'connected';
      await this.channelRepo.save(channel);

      return {
        status: 'connected',
        phoneNumber: res.data.display_phone_number,
        qualityRating: res.data.quality_rating,
      };
    } catch (error) {
      channel.status = 'error';
      await this.channelRepo.save(channel);

      const msg = error.response?.data?.error?.message || 'Connection failed';
      throw new BadRequestException(msg);
    }
  }

  async completeEmbeddedSignup(orgId: string, dto: EmbeddedSignupDto) {
    const { code, wabaId, phoneNumberId } = dto;
    const appId = this.configService.get<string>('FACEBOOK_APP_ID');
    const appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET');

    if (!appId || !appSecret) {
      throw new BadRequestException('Facebook App credentials not configured on server');
    }

    // Step 1: Exchange code for business token
    this.logger.log(`Exchanging code for business token...`);
    let accessToken: string;
    try {
      const tokenRes = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
        params: { client_id: appId, client_secret: appSecret, code },
      });
      accessToken = tokenRes.data.access_token;
      if (!accessToken) {
        throw new Error('No access_token in response');
      }
      this.logger.log(`Token exchange successful`);
    } catch (error) {
      const msg = error.response?.data?.error?.message || error.message || 'Token exchange failed';
      this.logger.error(`Token exchange failed: ${msg}`);
      throw new BadRequestException(`Token exchange failed: ${msg}`);
    }

    // Step 2: Get phone number details
    this.logger.log(`Fetching phone number details for ${phoneNumberId}...`);
    let phoneData: any;
    try {
      const phoneRes = await axios.get(`https://graph.facebook.com/v21.0/${phoneNumberId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      phoneData = phoneRes.data;
      this.logger.log(`Phone: ${phoneData.display_phone_number}, Name: ${phoneData.verified_name}`);
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Failed to fetch phone details';
      this.logger.error(`Phone details fetch failed: ${msg}`);
      throw new BadRequestException(`Failed to fetch phone details: ${msg}`);
    }

    // Step 3: Subscribe app to webhooks on customer's WABA
    this.logger.log(`Subscribing to webhooks on WABA ${wabaId}...`);
    try {
      await axios.post(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, null, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      this.logger.log(`Webhook subscription successful`);
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Webhook subscription failed';
      this.logger.warn(`Webhook subscription warning: ${msg}`);
      // Don't fail — webhook sub may already exist
    }

    // Step 4: Register phone number for Cloud API
    this.logger.log(`Registering phone number ${phoneNumberId} for Cloud API...`);
    try {
      await axios.post(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/register`,
        { messaging_product: 'whatsapp', pin: '147258' },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      this.logger.log(`Phone registration successful`);
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Phone registration failed';
      this.logger.warn(`Phone registration warning: ${msg}`);
      // Don't fail — phone may already be registered
    }

    // Step 5: Create channel in database
    const channelName = phoneData.verified_name || phoneData.display_phone_number || 'WhatsApp Channel';
    const channel = this.channelRepo.create({
      organizationId: orgId,
      name: channelName,
      phoneNumber: phoneData.display_phone_number || '',
      phoneNumberId,
      businessAccountId: wabaId,
      accessToken,
      webhookVerifyToken: Math.random().toString(36).slice(-16),
      status: 'connected',
    });
    const saved = await this.channelRepo.save(channel);
    this.logger.log(`Channel created: ${saved.id} — ${channelName}`);

    return saved;
  }
}

// ── Templates Service ──────────────────────────────────
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectRepository(WhatsappTemplate) private templateRepo: Repository<WhatsappTemplate>,
    private readonly channelsService: ChannelsService,
  ) {}

  async list(orgId: string, channelId: string, departmentId?: string, status?: string) {
    // Verify channel belongs to org
    await this.channelsService.get(orgId, channelId);
    const where: any = { organizationId: orgId, channelId };
    if (status) {
      where.status = status;
    }
    const templates = await this.templateRepo.find({
      where,
      order: { name: 'ASC' },
    });

    if (departmentId) {
      return templates.filter(
        (t) => !t.departmentIds?.length || t.departmentIds.includes(departmentId),
      );
    }

    return templates;
  }

  async updateDepartments(orgId: string, channelId: string, templateId: string, departmentIds: string[]) {
    await this.channelsService.get(orgId, channelId);
    const template = await this.templateRepo.findOne({
      where: { id: templateId, channelId, organizationId: orgId },
    });
    if (!template) throw new NotFoundException('Template not found');
    template.departmentIds = departmentIds;
    await this.templateRepo.save(template);
    return template;
  }

  async sync(orgId: string, channelId: string) {
    const channel = await this.channelsService.get(orgId, channelId);

    if (!channel.businessAccountId) {
      throw new BadRequestException('Business Account ID is required to sync templates. Edit the channel and add it.');
    }

    try {
      const res = await axios.get(
        `https://graph.facebook.com/v21.0/${channel.businessAccountId}/message_templates`,
        {
          headers: { Authorization: `Bearer ${channel.accessToken}` },
          params: { limit: 250 },
        },
      );

      const metaTemplates = res.data.data || [];
      const now = new Date();
      let synced = 0;

      for (const mt of metaTemplates) {
        const existing = await this.templateRepo.findOne({
          where: { channelId, metaTemplateId: mt.id },
        });

        if (existing) {
          existing.name = mt.name;
          existing.status = mt.status;
          existing.category = mt.category;
          existing.language = mt.language;
          existing.components = mt.components;
          existing.lastSyncedAt = now;
          await this.templateRepo.save(existing);
        } else {
          await this.templateRepo.save(this.templateRepo.create({
            organizationId: orgId,
            channelId,
            metaTemplateId: mt.id,
            name: mt.name,
            status: mt.status,
            category: mt.category,
            language: mt.language,
            components: mt.components,
            lastSyncedAt: now,
          }));
        }
        synced++;
      }

      // Remove templates that no longer exist in Meta
      const metaIds = metaTemplates.map((mt: any) => mt.id);
      const allLocal = await this.templateRepo.find({ where: { channelId } });
      for (const local of allLocal) {
        if (!metaIds.includes(local.metaTemplateId)) {
          await this.templateRepo.remove(local);
        }
      }

      this.logger.log(`Synced ${synced} templates for channel ${channelId}`);
      return { synced, total: metaTemplates.length };
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Failed to sync templates from Meta';
      throw new BadRequestException(msg);
    }
  }

  async create(orgId: string, channelId: string, dto: CreateTemplateDto) {
    const channel = await this.channelsService.get(orgId, channelId);

    if (!channel.businessAccountId) {
      throw new BadRequestException('Business Account ID is required. Edit the channel and add it.');
    }

    // Build Meta API payload
    const payload: any = {
      name: dto.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      language: dto.language,
      category: dto.category,
      components: dto.components.map((c) => {
        const comp: any = { type: c.type };
        if (c.format) comp.format = c.format;
        if (c.text) comp.text = c.text;
        if (c.buttons) comp.buttons = c.buttons;
        if (c.example) comp.example = c.example;
        return comp;
      }),
    };

    try {
      const res = await axios.post(
        `https://graph.facebook.com/v21.0/${channel.businessAccountId}/message_templates`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${channel.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      // Save locally
      const template = this.templateRepo.create({
        organizationId: orgId,
        channelId,
        metaTemplateId: res.data.id,
        name: payload.name,
        status: res.data.status || 'PENDING',
        category: dto.category,
        language: dto.language,
        components: dto.components,
        lastSyncedAt: new Date(),
      });
      await this.templateRepo.save(template);

      this.logger.log(`Created template "${payload.name}" → Meta ID: ${res.data.id}`);
      return template;
    } catch (error) {
      const metaError = error.response?.data?.error;
      const msg = metaError?.error_user_msg || metaError?.message || 'Failed to create template on Meta';
      this.logger.error(`Template creation failed: ${msg}`, metaError);
      throw new BadRequestException(msg);
    }
  }

  async remove(orgId: string, channelId: string, templateId: string) {
    const channel = await this.channelsService.get(orgId, channelId);
    const template = await this.templateRepo.findOne({
      where: { id: templateId, channelId, organizationId: orgId },
    });
    if (!template) throw new NotFoundException('Template not found');

    // Delete from Meta if we have business account ID
    if (channel.businessAccountId) {
      try {
        await axios.delete(
          `https://graph.facebook.com/v21.0/${channel.businessAccountId}/message_templates`,
          {
            headers: { Authorization: `Bearer ${channel.accessToken}` },
            params: { name: template.name },
          },
        );
      } catch (error) {
        this.logger.warn(`Failed to delete template from Meta: ${error.response?.data?.error?.message}`);
      }
    }

    await this.templateRepo.remove(template);
    return { message: 'Template deleted' };
  }
}

// ── Controller ──────────────────────────────────────────
@ApiTags('channels')
@Controller('channels')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChannelsController {
  constructor(
    private readonly service: ChannelsService,
    private readonly templatesService: TemplatesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List WhatsApp channels' })
  list(@Request() req) {
    return this.service.list(req.user.orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a WhatsApp channel (Manager/Owner)' })
  create(@Request() req, @Body() dto: CreateChannelDto) {
    if (![UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER].includes(req.user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return this.service.create(req.user.orgId, dto);
  }

  @Post('embedded-signup')
  @ApiOperation({ summary: 'Complete Embedded Signup — exchange code, register phone, create channel' })
  embeddedSignup(@Request() req, @Body() dto: EmbeddedSignupDto) {
    if (![UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER].includes(req.user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return this.service.completeEmbeddedSignup(req.user.orgId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a channel' })
  get(@Request() req, @Param('id') id: string) {
    return this.service.get(req.user.orgId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update channel config' })
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdateChannelDto) {
    if (![UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER].includes(req.user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return this.service.update(req.user.orgId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a channel' })
  remove(@Request() req, @Param('id') id: string) {
    if (![UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER].includes(req.user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return this.service.remove(req.user.orgId, id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test channel connection to Meta API' })
  test(@Request() req, @Param('id') id: string) {
    return this.service.testConnection(req.user.orgId, id);
  }

  @Get(':id/templates')
  @ApiOperation({ summary: 'List synced message templates' })
  listTemplates(@Request() req, @Param('id') id: string, @Query('departmentId') departmentId?: string, @Query('status') status?: string) {
    return this.templatesService.list(req.user.orgId, id, departmentId, status);
  }

  @Post(':id/templates/sync')
  @ApiOperation({ summary: 'Sync message templates from Meta' })
  syncTemplates(@Request() req, @Param('id') id: string) {
    return this.templatesService.sync(req.user.orgId, id);
  }

  @Post(':id/templates')
  @ApiOperation({ summary: 'Create a message template on Meta' })
  createTemplate(@Request() req, @Param('id') id: string, @Body() dto: CreateTemplateDto) {
    if (![UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER].includes(req.user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return this.templatesService.create(req.user.orgId, id, dto);
  }

  @Patch(':id/templates/:templateId/departments')
  @ApiOperation({ summary: 'Assign departments to a template' })
  updateTemplateDepartments(
    @Request() req,
    @Param('id') id: string,
    @Param('templateId') templateId: string,
    @Body('departmentIds') departmentIds: string[],
  ) {
    if (![UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER].includes(req.user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return this.templatesService.updateDepartments(req.user.orgId, id, templateId, departmentIds || []);
  }

  @Delete(':id/templates/:templateId')
  @ApiOperation({ summary: 'Delete a message template' })
  deleteTemplate(@Request() req, @Param('id') id: string, @Param('templateId') templateId: string) {
    if (![UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER].includes(req.user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return this.templatesService.remove(req.user.orgId, id, templateId);
  }
}

// ── Module ──────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([WhatsappChannel, WhatsappTemplate]), ConfigModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, TemplatesService],
  exports: [ChannelsService, TemplatesService],
})
export class ChannelsModule {}
