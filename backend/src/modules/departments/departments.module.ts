// ============================================================
// Departments Module — CRUD with hierarchy-scoped access
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
  UseGuards,
  Request,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Department } from '../../common/entities/department.entity';
import { User, UserRole } from '../../common/entities/user.entity';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditCategory } from '../../common/entities/audit-log.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';

// ── DTOs ────────────────────────────────────────────────
class CreateDepartmentDto {
  @ApiProperty({ example: 'BYD Arista Jakarta Barat' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Sales department for Jakarta Barat region' })
  @IsString()
  @IsOptional()
  description?: string;
}

class UpdateDepartmentDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

// ── Service ─────────────────────────────────────────────
@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department) private deptRepo: Repository<Department>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private auditLogService: AuditLogService,
  ) {}

  async list(orgId: string, userId: string, userRole: UserRole) {
    // Manager/Owner/Admin see all departments
    if ([UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER].includes(userRole)) {
      return this.deptRepo.find({
        where: { organizationId: orgId, isActive: true },
        order: { name: 'ASC' },
      });
    }

    // Supervisor/Agent only see their own department
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user?.departmentId) {
      return this.deptRepo.find({
        where: { id: user.departmentId, organizationId: orgId, isActive: true },
      });
    }
    return [];
  }

  async create(
    orgId: string,
    dto: CreateDepartmentDto,
    requesterId?: string,
    requesterName?: string,
  ) {
    const dept = this.deptRepo.create({
      organizationId: orgId,
      name: dto.name,
      description: dto.description,
    });
    const savedDept = await this.deptRepo.save(dept);

    await this.auditLogService.log({
      organizationId: orgId,
      category: AuditCategory.SETTINGS,
      action: 'department.created',
      userId: requesterId,
      userName: requesterName,
      targetId: savedDept.id,
      targetType: 'department',
      metadata: {
        name: savedDept.name,
        description: savedDept.description,
      },
    });

    return savedDept;
  }

  async update(
    orgId: string,
    id: string,
    dto: UpdateDepartmentDto,
    requesterId?: string,
    requesterName?: string,
  ) {
    const dept = await this.deptRepo.findOne({
      where: { id, organizationId: orgId },
    });
    if (!dept) throw new NotFoundException('Department not found');

    Object.assign(dept, dto);
    const savedDept = await this.deptRepo.save(dept);

    await this.auditLogService.log({
      organizationId: orgId,
      category: AuditCategory.SETTINGS,
      action: 'department.updated',
      userId: requesterId,
      userName: requesterName,
      targetId: savedDept.id,
      targetType: 'department',
      metadata: {
        name: savedDept.name,
        description: savedDept.description,
      },
    });

    return savedDept;
  }

  async remove(
    orgId: string,
    id: string,
    requesterId?: string,
    requesterName?: string,
  ) {
    const dept = await this.deptRepo.findOne({
      where: { id, organizationId: orgId },
    });
    if (!dept) throw new NotFoundException('Department not found');

    dept.isActive = false;
    await this.deptRepo.save(dept);

    await this.auditLogService.log({
      organizationId: orgId,
      category: AuditCategory.SETTINGS,
      action: 'department.deactivated',
      userId: requesterId,
      userName: requesterName,
      targetId: dept.id,
      targetType: 'department',
      metadata: {
        name: dept.name,
      },
    });

    return { message: 'Department deactivated' };
  }

  async getWithAgents(orgId: string, id: string) {
    const dept = await this.deptRepo.findOne({
      where: { id, organizationId: orgId },
    });
    if (!dept) throw new NotFoundException('Department not found');

    const agents = await this.userRepo.find({
      where: { departmentId: id, organizationId: orgId },
      order: { role: 'ASC', fullName: 'ASC' },
    });

    return { ...dept, agents };
  }
}

// ── Controller ──────────────────────────────────────────
@ApiTags('departments')
@Controller('departments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List departments (role-scoped)' })
  list(@Request() req) {
    return this.service.list(req.user.orgId, req.user.sub, req.user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get department with agents' })
  get(@Request() req, @Param('id') id: string) {
    return this.service.getWithAgents(req.user.orgId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create department (Manager/Owner only)' })
  create(@Request() req, @Body() dto: CreateDepartmentDto) {
    if (![UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER].includes(req.user.role)) {
      throw new ForbiddenException('Only managers can create departments');
    }
    return this.service.create(req.user.orgId, dto, req.user.sub, req.user.fullName);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update department' })
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    if (![UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER].includes(req.user.role)) {
      throw new ForbiddenException('Only managers can update departments');
    }
    return this.service.update(req.user.orgId, id, dto, req.user.sub, req.user.fullName);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate department' })
  remove(@Request() req, @Param('id') id: string) {
    if (![UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER].includes(req.user.role)) {
      throw new ForbiddenException('Only managers can delete departments');
    }
    return this.service.remove(req.user.orgId, id, req.user.sub, req.user.fullName);
  }
}

// ── Module ──────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([Department, User]), AuditLogModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
