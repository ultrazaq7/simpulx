// ============================================================
// Organizations Module
// ============================================================
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Controller,
  Get,
  Put,
  Patch,
  Body,
  UseGuards,
  Request,
  Injectable,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../../common/entities/organization.entity';
import { User } from '../../common/entities/user.entity';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/entities/user.entity';

// ── Service ─────────────────────────────────────────────
@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async getOrganization(orgId: string) {
    return this.orgRepo.findOne({ where: { id: orgId } });
  }

  async updateOrganization(orgId: string, updates: Partial<Organization>) {
    await this.orgRepo.update(orgId, updates);
    return this.orgRepo.findOne({ where: { id: orgId } });
  }

  async getAgents(orgId: string) {
    return this.userRepo.find({
      where: { organizationId: orgId },
      select: ['id', 'email', 'fullName', 'role', 'status', 'isOnline', 'avatarUrl', 'lastSeenAt'],
      order: { fullName: 'ASC' },
    });
  }

  async updateAgent(orgId: string, userId: string, updates: Partial<User>) {
    await this.userRepo.update(
      { id: userId, organizationId: orgId },
      updates,
    );
    return this.userRepo.findOne({ where: { id: userId } });
  }

  async getRolePermissions(orgId: string): Promise<Record<string, Record<string, boolean>>> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    return org?.rolePermissions || {};
  }

  async updateRolePermissions(
    orgId: string,
    permissions: Record<string, Record<string, boolean>>,
  ) {
    await this.orgRepo.update(orgId, { rolePermissions: permissions });
    return this.getRolePermissions(orgId);
  }
}

// ── Controller ──────────────────────────────────────────
@ApiTags('organizations')
@Controller('organization')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get current organization' })
  async getOrganization(@Request() req) {
    return this.service.getOrganization(req.user.organizationId);
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update organization settings' })
  async updateOrganization(@Request() req, @Body() body: Partial<Organization>) {
    return this.service.updateOrganization(req.user.organizationId, body);
  }

  @Get('agents')
  @ApiOperation({ summary: 'List agents in organization' })
  async getAgents(@Request() req) {
    return this.service.getAgents(req.user.organizationId);
  }

  @Get('role-permissions')
  @ApiOperation({ summary: 'Get role permissions matrix' })
  async getRolePermissions(@Request() req) {
    return this.service.getRolePermissions(req.user.organizationId);
  }

  @Put('role-permissions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update role permissions matrix' })
  async updateRolePermissions(@Request() req, @Body() body: Record<string, any>) {
    return this.service.updateRolePermissions(req.user.organizationId, body as any);
  }
}

// ── Module ──────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([Organization, User])],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
