// ============================================================
// Dispositions Service — CRUD
// ============================================================
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Disposition } from '../../common/entities/disposition.entity';

@Injectable()
export class DispositionsService {
  constructor(
    @InjectRepository(Disposition)
    private readonly repo: Repository<Disposition>,
  ) {}

  async findAll(orgId: string) {
    return this.repo.find({
      where: { organizationId: orgId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findActive(orgId: string) {
    return this.repo.find({
      where: { organizationId: orgId, isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async create(orgId: string, data: { name: string; description?: string; groupName?: string }) {
    const entity = this.repo.create({
      organizationId: orgId,
      name: data.name,
      description: data.description ?? undefined,
      groupName: data.groupName ?? null,
    });
    return this.repo.save(entity);
  }

  async update(orgId: string, id: string, data: { name?: string; description?: string; isActive?: boolean; sortOrder?: number; groupName?: string }) {
    const existing = await this.repo.findOne({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Disposition not found');
    Object.assign(existing, data);
    return this.repo.save(existing);
  }

  async remove(orgId: string, id: string) {
    const existing = await this.repo.findOne({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Disposition not found');
    await this.repo.remove(existing);
    return { success: true };
  }
}
