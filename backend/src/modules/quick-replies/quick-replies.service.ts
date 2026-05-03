// ============================================================
// Quick Replies Service
// ============================================================
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { QuickReply } from '../../common/entities/quick-reply.entity';

@Injectable()
export class QuickRepliesService {
  constructor(
    @InjectRepository(QuickReply) private qrRepo: Repository<QuickReply>,
  ) {}

  async create(
    orgId: string,
    userId: string,
    data: { title: string; content: string; shortcut?: string; category?: string; departmentId?: string },
  ) {
    const qr = this.qrRepo.create({
      organizationId: orgId,
      createdById: userId,
      title: data.title,
      content: data.content,
      shortcut: data.shortcut || `/${data.title.toLowerCase().replace(/\s+/g, '_')}`,
      category: data.category,
      ...(data.departmentId ? { departmentId: data.departmentId } : {}),
    });
    return this.qrRepo.save(qr);
  }

  async findAll(orgId: string, options?: { search?: string; category?: string; departmentId?: string }) {
    const where: any = { organizationId: orgId };
    if (options?.category) where.category = options.category;

    let qb = this.qrRepo
      .createQueryBuilder('qr')
      .leftJoinAndSelect('qr.createdBy', 'user')
      .where('qr.organizationId = :orgId', { orgId })
      .orderBy('qr.title', 'ASC');

    if (options?.category) {
      qb = qb.andWhere('qr.category = :category', { category: options.category });
    }
    if (options?.search) {
      qb = qb.andWhere(
        '(qr.title ILIKE :s OR qr.content ILIKE :s OR qr.shortcut ILIKE :s)',
        { s: `%${options.search}%` },
      );
    }
    // If departmentId provided, show global + that department's QRs
    if (options?.departmentId) {
      qb = qb.andWhere('(qr.department_id IS NULL OR qr.department_id = :deptId)', { deptId: options.departmentId });
    }

    return qb.getMany();
  }

  async findById(orgId: string, id: string) {
    const qr = await this.qrRepo.findOne({
      where: { id, organizationId: orgId },
      relations: ['createdBy'],
    });
    if (!qr) throw new NotFoundException('Quick reply not found');
    return qr;
  }

  async update(
    orgId: string,
    id: string,
    data: { title?: string; content?: string; shortcut?: string; category?: string; departmentId?: string },
  ) {
    await this.findById(orgId, id);
    await this.qrRepo.update({ id, organizationId: orgId }, data);
    return this.findById(orgId, id);
  }

  async remove(orgId: string, id: string) {
    await this.findById(orgId, id);
    await this.qrRepo.delete({ id, organizationId: orgId });
    return { deleted: true };
  }

  async getCategories(orgId: string): Promise<string[]> {
    const result = await this.qrRepo
      .createQueryBuilder('qr')
      .select('DISTINCT qr.category', 'category')
      .where('qr.organizationId = :orgId', { orgId })
      .andWhere('qr.category IS NOT NULL')
      .getRawMany();
    return result.map((r) => r.category);
  }
}
