// ============================================================
// Contacts Module
// ============================================================
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from '../../common/entities/contact.entity';
import { Conversation } from '../../common/entities/conversation.entity';
import { User, UserRole } from '../../common/entities/user.entity';
import { JwtAuthGuard } from '../auth/jwt.strategy';

// ── Service ─────────────────────────────────────────────
@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact) private contactRepo: Repository<Contact>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async getContacts(
    orgId: string,
    options: { page?: number; limit?: number; search?: string; tag?: string },
    currentUser?: { id: string; role: string; departmentId?: string },
  ) {
    const { page = 1, limit = 50, search, tag } = options;

    const qb = this.contactRepo
      .createQueryBuilder('c')
      .where('c.organizationId = :orgId', { orgId })
      .orderBy('c.lastSeenAt', 'DESC', 'NULLS LAST');

    // ── Role-based visibility ──────────────────────────
    if (currentUser) {
      const role = currentUser.role as UserRole;

      if (role === UserRole.AGENT) {
        // Agents only see contacts that have a conversation assigned to them
        qb.andWhere(
          `c.id IN (SELECT contact_id FROM conversations WHERE organization_id = :orgId AND assigned_agent_id = :myId)`,
          { myId: currentUser.id },
        );
      } else if (role === UserRole.SUPERVISOR || role === UserRole.MANAGER) {
        // Supervisors/Managers see contacts with conversations assigned to
        // themselves, their supervised agents, their department, or unassigned
        const supervisedAgents = await this.userRepo.find({
          where: { organizationId: orgId, supervisorId: currentUser.id },
          select: ['id'],
        });
        const visibleIds = [
          currentUser.id,
          ...supervisedAgents.map((a) => a.id),
        ];
        qb.andWhere(
          `c.id IN (SELECT contact_id FROM conversations WHERE organization_id = :orgId AND (assigned_agent_id IN (:...visibleIds) OR assigned_agent_id IS NULL OR department_id = :deptId))`,
          { visibleIds, deptId: currentUser.departmentId },
        );
      }
      // Admin/Owner: no filter — see all contacts in the org
    }

    if (search) {
      qb.andWhere(
        '(c.name ILIKE :search OR c.phone ILIKE :search OR c.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (tag) {
      qb.andWhere(':tag = ANY(c.tags)', { tag });
    }

    const [contacts, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { contacts, total, page, limit };
  }

  async getContact(orgId: string, contactId: string) {
    const contact = await this.contactRepo.findOne({
      where: { id: contactId, organizationId: orgId },
      relations: ['conversations'],
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async createContact(orgId: string, data: Partial<Contact>) {
    const contact = this.contactRepo.create({ ...data, organizationId: orgId });
    return this.contactRepo.save(contact);
  }

  async updateContact(orgId: string, contactId: string, updates: Partial<Contact>) {
    await this.contactRepo.update(
      { id: contactId, organizationId: orgId },
      updates,
    );
    return this.contactRepo.findOne({
      where: { id: contactId, organizationId: orgId },
    });
  }
}

// ── Controller ──────────────────────────────────────────
@ApiTags('contacts')
@Controller('contacts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ContactsController {
  constructor(private readonly service: ContactsService) {}

  @Get()
  @ApiOperation({ summary: 'List contacts' })
  async getContacts(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
  ) {
    return this.service.getContacts(
      req.user.organizationId,
      { page, limit, search, tag },
      { id: req.user.sub, role: req.user.role, departmentId: req.user.departmentId },
    );
  }

  @Get('fields')
  @ApiOperation({ summary: 'List custom contact fields' })
  async getContactFields(@Request() _req) {
    // Custom fields table not yet implemented; return empty list so
    // frontend settings/flow-builder pages render the empty state.
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single contact' })
  async getContact(@Request() req, @Param('id') id: string) {
    return this.service.getContact(req.user.organizationId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a contact' })
  async createContact(@Request() req, @Body() body: Partial<Contact>) {
    return this.service.createContact(req.user.organizationId, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a contact' })
  async updateContact(
    @Request() req,
    @Param('id') id: string,
    @Body() body: Partial<Contact>,
  ) {
    return this.service.updateContact(req.user.organizationId, id, body);
  }
}

// ── Module ──────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([Contact, User]),],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
