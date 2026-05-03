// ============================================================
// Stages Service — CRUD (formerly Dispositions)
// ============================================================
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stage, StageCategory } from '../../common/entities/stage.entity';

@Injectable()
export class StagesService {
  constructor(
    @InjectRepository(Stage)
    private readonly repo: Repository<Stage>,
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

  async create(
    orgId: string,
    data: {
      name: string;
      description?: string;
      color?: string;
      category: StageCategory;
      sortOrder?: number;
    },
  ) {
    const entity = this.repo.create({
      organizationId: orgId,
      name: data.name,
      description: data.description ?? undefined,
      color: data.color ?? '#3B82F6',
      category: data.category,
      sortOrder: data.sortOrder ?? 0,
    });
    return this.repo.save(entity);
  }

  async update(
    orgId: string,
    id: string,
    data: {
      name?: string;
      description?: string;
      color?: string;
      category?: StageCategory;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    const existing = await this.repo.findOne({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Stage not found');
    Object.assign(existing, data);
    return this.repo.save(existing);
  }

  async remove(orgId: string, id: string) {
    const existing = await this.repo.findOne({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Stage not found');
    await this.repo.remove(existing);
    return { success: true };
  }
}
