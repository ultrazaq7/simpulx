// ============================================================
// Users Management Module — CRUD, hierarchy-scoped, RBAC
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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { User, UserRole, UserStatus } from '../../common/entities/user.entity';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { RolesGuard, MinRole, getRoleLevel } from '../../common/guards/roles.guard';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditCategory } from '../../common/entities/audit-log.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';

// ── DTOs ────────────────────────────────────────────────
class UpdateUserDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  supervisorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  maxConcurrentChats?: number;

  @ApiPropertyOptional()
  @IsOptional()
  availableForRoundRobin?: boolean;
}

class AssignSupervisorDto {
  @ApiPropertyOptional({ description: 'Supervisor UUID (null to unassign)' })
  @IsUUID()
  @IsOptional()
  supervisorId?: string;
}

// ── Service ─────────────────────────────────────────────
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private auditLogService: AuditLogService,
  ) {}

  async list(
    orgId: string,
    requesterId: string,
    requesterRole: UserRole,
    filters: { departmentId?: string; role?: string; status?: string; search?: string; page?: number; limit?: number },
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;

    const qb = this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.department', 'dept')
      .leftJoinAndSelect('u.supervisor', 'sup')
      .where('u.organizationId = :orgId', { orgId });

    // Supervisor only sees their agents + themselves
    if (requesterRole === UserRole.SUPERVISOR) {
      qb.andWhere('(u.supervisorId = :requesterId OR u.id = :requesterId)', { requesterId });
    }

    // Agent only sees themselves
    if (requesterRole === UserRole.AGENT) {
      qb.andWhere('u.id = :requesterId', { requesterId });
    }

    if (filters.departmentId) {
      qb.andWhere('u.departmentId = :deptId', { deptId: filters.departmentId });
    }

    if (filters.role) {
      qb.andWhere('u.role = :role', { role: filters.role });
    }

    if (filters.status) {
      qb.andWhere('u.status = :status', { status: filters.status });
    }

    if (filters.search) {
      qb.andWhere('(u.fullName ILIKE :search OR u.email ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    }

    qb.orderBy('u.role', 'ASC').addOrderBy('u.fullName', 'ASC');

    const total = await qb.getCount();
    const data = await qb.skip((page - 1) * limit).take(limit).getMany();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async get(orgId: string, userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId, organizationId: orgId },
      relations: ['department', 'supervisor'],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(
    orgId: string,
    userId: string,
    dto: UpdateUserDto,
    requesterRole: UserRole,
    requesterId?: string,
    requesterName?: string,
  ) {
    const user = await this.userRepo.findOne({
      where: { id: userId, organizationId: orgId },
    });
    if (!user) throw new NotFoundException('User not found');

    // Cannot edit users with higher role (same level is allowed)
    if (getRoleLevel(requesterRole) < getRoleLevel(user.role)) {
      throw new ForbiddenException('Cannot edit a user with a higher role');
    }

    // Cannot promote above your own level (same level is allowed)
    if (dto.role && getRoleLevel(dto.role) > getRoleLevel(requesterRole)) {
      throw new ForbiddenException('Cannot promote a user above your own role level');
    }

    // Cannot change owner role
    if (user.role === UserRole.OWNER && dto.role && dto.role !== UserRole.OWNER) {
      throw new ForbiddenException('Cannot change owner role');
    }

    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.departmentId !== undefined) user.departmentId = dto.departmentId;
    if (dto.supervisorId !== undefined) user.supervisorId = dto.supervisorId;
    if (dto.maxConcurrentChats != null) user.maxConcurrentChats = dto.maxConcurrentChats;
    if (dto.availableForRoundRobin !== undefined) user.availableForRoundRobin = dto.availableForRoundRobin;
    const savedUser = await this.userRepo.save(user);

    await this.auditLogService.log({
      organizationId: orgId,
      category: AuditCategory.USER,
      action: 'user.account_updated',
      userId: requesterId,
      userName: requesterName,
      targetId: savedUser.id,
      targetType: 'user',
      metadata: {
        fullName: savedUser.fullName,
        role: savedUser.role,
        departmentId: savedUser.departmentId,
        supervisorId: savedUser.supervisorId,
        maxConcurrentChats: savedUser.maxConcurrentChats,
      },
    });

    return savedUser;
  }

  async deactivate(
    orgId: string,
    userId: string,
    requesterRole: UserRole,
    requesterId?: string,
    requesterName?: string,
  ) {
    const user = await this.userRepo.findOne({
      where: { id: userId, organizationId: orgId },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.OWNER) throw new ForbiddenException('Cannot deactivate owner');

    // Cannot deactivate users with higher role (same level is allowed)
    if (getRoleLevel(requesterRole) < getRoleLevel(user.role)) {
      throw new ForbiddenException('Cannot deactivate a user with a higher role');
    }

    user.status = UserStatus.INACTIVE;
    user.isOnline = false;
    await this.userRepo.save(user);

    await this.auditLogService.log({
      organizationId: orgId,
      category: AuditCategory.USER,
      action: 'user.account_deactivated',
      userId: requesterId,
      userName: requesterName,
      targetId: user.id,
      targetType: 'user',
      metadata: {
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });

    return { message: 'User deactivated' };
  }

  async deletePermanent(
    orgId: string,
    userId: string,
    requesterRole: UserRole,
    requesterId?: string,
    requesterName?: string,
  ) {
    const user = await this.userRepo.findOne({
      where: { id: userId, organizationId: orgId },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.id === requesterId) throw new ForbiddenException('Cannot permanently delete your own account');
    if (user.role === UserRole.OWNER) throw new ForbiddenException('Cannot permanently delete owner');

    // Hard delete is intentionally stricter than deactivate.
    if (getRoleLevel(requesterRole) <= getRoleLevel(user.role)) {
      throw new ForbiddenException('Cannot permanently delete a user with an equal or higher role');
    }

    const runIfTableExists = async (
      manager: any,
      tableName: string,
      sql: string,
      params: any[],
    ) => {
      const rows = await manager.query('SELECT to_regclass($1) AS table_name', [
        `public.${tableName}`,
      ]);
      if (rows[0]?.table_name) {
        await manager.query(sql, params);
      }
    };

    await this.userRepo.manager.transaction(async (manager) => {
      await runIfTableExists(
        manager,
        'users',
        'UPDATE users SET supervisor_id = NULL WHERE organization_id = $1 AND supervisor_id = $2',
        [orgId, user.id],
      );
      await runIfTableExists(
        manager,
        'departments',
        'UPDATE departments SET last_round_robin_agent_id = NULL WHERE organization_id = $1 AND last_round_robin_agent_id = $2',
        [orgId, user.id],
      );
      await runIfTableExists(
        manager,
        'conversations',
        'UPDATE conversations SET assigned_agent_id = NULL WHERE organization_id = $1 AND assigned_agent_id = $2',
        [orgId, user.id],
      );
      await runIfTableExists(
        manager,
        'pending_leads',
        'UPDATE pending_leads SET target_agent_id = NULL WHERE organization_id = $1 AND target_agent_id = $2',
        [orgId, user.id],
      );
      await runIfTableExists(
        manager,
        'broadcasts',
        'UPDATE broadcasts SET created_by_id = NULL WHERE organization_id = $1 AND created_by_id = $2',
        [orgId, user.id],
      );
      await runIfTableExists(
        manager,
        'quick_replies',
        'UPDATE quick_replies SET created_by = NULL WHERE organization_id = $1 AND created_by = $2',
        [orgId, user.id],
      );
      await runIfTableExists(
        manager,
        'audit_logs',
        'UPDATE audit_logs SET user_id = NULL WHERE organization_id = $1 AND user_id = $2',
        [orgId, user.id],
      );
      await runIfTableExists(
        manager,
        'messages',
        "UPDATE messages SET sender_id = NULL WHERE organization_id = $1 AND sender_id = $2 AND sender_type IN ('agent', 'bot', 'system')",
        [orgId, user.id],
      );
      await runIfTableExists(
        manager,
        'cta_events',
        'UPDATE cta_events SET agent_id = NULL WHERE organization_id = $1 AND agent_id = $2',
        [orgId, user.id],
      );
      await runIfTableExists(
        manager,
        'follow_ups',
        'DELETE FROM follow_ups WHERE organization_id = $1 AND agent_id = $2',
        [orgId, user.id],
      );
      await runIfTableExists(
        manager,
        'internal_notes',
        'DELETE FROM internal_notes WHERE organization_id = $1 AND agent_id = $2',
        [orgId, user.id],
      );

      await manager.delete(User, { id: user.id, organizationId: orgId });
    });

    await this.auditLogService.log({
      organizationId: orgId,
      category: AuditCategory.USER,
      action: 'user.account_deleted',
      userId: requesterId,
      userName: requesterName,
      targetId: user.id,
      targetType: 'user',
      metadata: {
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });

    return { message: 'User permanently deleted' };
  }

  async reactivate(
    orgId: string,
    userId: string,
    requesterRole: UserRole,
    requesterId?: string,
    requesterName?: string,
  ) {
    const user = await this.userRepo.findOne({
      where: { id: userId, organizationId: orgId },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.status !== UserStatus.INACTIVE) {
      throw new BadRequestException('User is not inactive');
    }

    // Cannot reactivate users with higher role (same level is allowed)
    if (getRoleLevel(requesterRole) < getRoleLevel(user.role)) {
      throw new ForbiddenException('Cannot reactivate a user with a higher role');
    }

    user.status = UserStatus.ACTIVE;
    await this.userRepo.save(user);

    await this.auditLogService.log({
      organizationId: orgId,
      category: AuditCategory.USER,
      action: 'user.account_reactivated',
      userId: requesterId,
      userName: requesterName,
      targetId: user.id,
      targetType: 'user',
      metadata: {
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });

    return { message: 'User reactivated' };
  }

  async assignSupervisor(
    orgId: string,
    userId: string,
    supervisorId: string | null,
    requesterId?: string,
    requesterName?: string,
  ) {
    const user = await this.userRepo.findOne({
      where: { id: userId, organizationId: orgId },
    });
    if (!user) throw new NotFoundException('User not found');

    if (supervisorId) {
      const supervisor = await this.userRepo.findOne({
        where: { id: supervisorId, organizationId: orgId },
      });
      if (!supervisor) throw new NotFoundException('Supervisor not found');
      if (![UserRole.SUPERVISOR, UserRole.MANAGER].includes(supervisor.role)) {
        throw new BadRequestException('Target user is not a supervisor or manager');
      }
    }

    user.supervisorId = (supervisorId ?? undefined) as any;
    await this.userRepo.save(user);

    await this.auditLogService.log({
      organizationId: orgId,
      category: AuditCategory.USER,
      action: 'user.supervisor_assigned',
      userId: requesterId,
      userName: requesterName,
      targetId: user.id,
      targetType: 'user',
      metadata: {
        fullName: user.fullName,
        supervisorId,
      },
    });

    return { message: 'Supervisor assigned' };
  }

  async getAgentsForSupervisor(orgId: string, supervisorId: string) {
    return this.userRepo.find({
      where: { organizationId: orgId, supervisorId, status: UserStatus.ACTIVE },
      relations: ['department'],
      order: { fullName: 'ASC' },
    });
  }

  async registerFcmToken(userId: string, token: string, platform?: string) {
    await this.userRepo.update(userId, {
      fcmToken: token,
      fcmPlatform: platform || 'android',
    });
    return { message: 'FCM token registered' };
  }
}

// ── Controller ──────────────────────────────────────────
@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (role-scoped, paginated)' })
  list(
    @Request() req,
    @Query('departmentId') departmentId?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(req.user.orgId, req.user.sub, req.user.role, {
      departmentId,
      role,
      status,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('my-agents')
  @ApiOperation({ summary: 'Get agents under this supervisor' })
  myAgents(@Request() req) {
    return this.service.getAgentsForSupervisor(req.user.orgId, req.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single user' })
  get(@Request() req, @Param('id') id: string) {
    return this.service.get(req.user.orgId, id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @MinRole(UserRole.MANAGER)
  @ApiOperation({ summary: 'Update user (Manager+ only, hierarchy enforced)' })
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(
      req.user.orgId,
      id,
      dto,
      req.user.role,
      req.user.sub,
      req.user.fullName,
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @MinRole(UserRole.MANAGER)
  @ApiOperation({ summary: 'Deactivate user (Manager+ only)' })
  deactivate(@Request() req, @Param('id') id: string) {
    return this.service.deactivate(
      req.user.orgId,
      id,
      req.user.role,
      req.user.sub,
      req.user.fullName,
    );
  }

  @Delete(':id/permanent')
  @UseGuards(RolesGuard)
  @MinRole(UserRole.ADMIN)
  @ApiOperation({ summary: 'Permanently delete user (Admin+ only)' })
  deletePermanent(@Request() req, @Param('id') id: string) {
    return this.service.deletePermanent(
      req.user.orgId,
      id,
      req.user.role,
      req.user.sub,
      req.user.fullName,
    );
  }

  @Patch(':id/reactivate')
  @UseGuards(RolesGuard)
  @MinRole(UserRole.MANAGER)
  @ApiOperation({ summary: 'Reactivate a deactivated user (Manager+ only)' })
  reactivate(@Request() req, @Param('id') id: string) {
    return this.service.reactivate(
      req.user.orgId,
      id,
      req.user.role,
      req.user.sub,
      req.user.fullName,
    );
  }

  @Patch(':id/assign-supervisor')
  @UseGuards(RolesGuard)
  @MinRole(UserRole.MANAGER)
  @ApiOperation({ summary: 'Assign supervisor to a user (Manager+ only)' })
  assignSupervisor(@Request() req, @Param('id') id: string, @Body() dto: AssignSupervisorDto) {
    return this.service.assignSupervisor(
      req.user.orgId,
      id,
      dto.supervisorId || null,
      req.user.sub,
      req.user.fullName,
    );
  }

  @Post('fcm-token')
  @ApiOperation({ summary: 'Register FCM push notification token' })
  async registerFcmToken(@Request() req, @Body() body: { token: string; platform?: string }) {
    return this.service.registerFcmToken(req.user.sub, body.token, body.platform);
  }
}

// ── Module ──────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([User]), AuditLogModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
