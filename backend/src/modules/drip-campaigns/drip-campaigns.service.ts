// ============================================================
// Drip Campaigns Service — Campaign CRUD + Enrollment Logic
// ============================================================
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  DripCampaign, DripCampaignStatus,
  DripStep, DripStepType,
  DripEnrollment, EnrollmentStatus,
} from '../../common/entities/drip-campaign.entity';
import { Contact } from '../../common/entities/contact.entity';

@Injectable()
export class DripCampaignsService {
  private readonly logger = new Logger('DripCampaignsService');

  constructor(
    @InjectRepository(DripCampaign) private campaignRepo: Repository<DripCampaign>,
    @InjectRepository(DripStep) private stepRepo: Repository<DripStep>,
    @InjectRepository(DripEnrollment) private enrollmentRepo: Repository<DripEnrollment>,
    @InjectRepository(Contact) private contactRepo: Repository<Contact>,
  ) {}

  // ── Campaign CRUD ────────────────────────────────────
  async create(orgId: string, data: Partial<DripCampaign>) {
    const campaign = this.campaignRepo.create({ ...data, organizationId: orgId });
    return this.campaignRepo.save(campaign);
  }

  async findAll(orgId: string) {
    return this.campaignRepo.find({
      where: { organizationId: orgId },
      relations: ['steps'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(orgId: string, id: string) {
    const campaign = await this.campaignRepo.findOne({
      where: { id, organizationId: orgId },
      relations: ['steps', 'enrollments'],
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async update(orgId: string, id: string, data: Partial<DripCampaign>) {
    await this.campaignRepo.update({ id, organizationId: orgId }, data);
    return this.findOne(orgId, id);
  }

  async remove(orgId: string, id: string) {
    await this.campaignRepo.delete({ id, organizationId: orgId });
    return { success: true };
  }

  // ── Steps CRUD ───────────────────────────────────────
  async addStep(orgId: string, campaignId: string, data: Partial<DripStep>) {
    await this.findOne(orgId, campaignId); // verify ownership
    const step = this.stepRepo.create({ ...data, campaignId });
    return this.stepRepo.save(step);
  }

  async updateStep(stepId: string, data: Partial<DripStep>) {
    await this.stepRepo.update(stepId, data);
    return this.stepRepo.findOne({ where: { id: stepId } });
  }

  async removeStep(stepId: string) {
    await this.stepRepo.delete(stepId);
    return { success: true };
  }

  // ── Enrollment ───────────────────────────────────────
  async enroll(orgId: string, campaignId: string, contactId: string) {
    const campaign = await this.findOne(orgId, campaignId);
    if (campaign.status !== DripCampaignStatus.ACTIVE) {
      throw new Error('Campaign is not active');
    }

    const existing = await this.enrollmentRepo.findOne({
      where: { campaignId, contactId, status: EnrollmentStatus.ACTIVE },
    });
    if (existing) return existing;

    const steps = await this.stepRepo.find({
      where: { campaignId },
      order: { sortOrder: 'ASC' },
    });

    const firstDelay = steps[0]?.stepType === DripStepType.DELAY
      ? (steps[0].config as any).delayMinutes || 60
      : 0;

    const enrollment = this.enrollmentRepo.create({
      campaignId,
      contactId,
      currentStepIndex: 0,
      nextExecutionAt: new Date(Date.now() + firstDelay * 60000),
    });

    await this.enrollmentRepo.save(enrollment);
    await this.campaignRepo.increment({ id: campaignId }, 'enrolledCount', 1);

    return enrollment;
  }

  async unenroll(enrollmentId: string) {
    await this.enrollmentRepo.update(enrollmentId, { status: EnrollmentStatus.EXITED });
    return { success: true };
  }

  // ── Scheduler — Execute due steps ────────────────────
  @Cron(CronExpression.EVERY_MINUTE)
  async processEnrollments() {
    const dueEnrollments = await this.enrollmentRepo.find({
      where: {
        status: EnrollmentStatus.ACTIVE,
        nextExecutionAt: LessThanOrEqual(new Date()),
      },
      relations: ['campaign'],
      take: 50,
    });

    for (const enrollment of dueEnrollments) {
      try {
        await this.executeStep(enrollment);
      } catch (err) {
        this.logger.error(`Drip step failed for enrollment ${enrollment.id}: ${err.message}`);
      }
    }
  }

  private async executeStep(enrollment: DripEnrollment) {
    const steps = await this.stepRepo.find({
      where: { campaignId: enrollment.campaignId },
      order: { sortOrder: 'ASC' },
    });

    const currentStep = steps[enrollment.currentStepIndex];
    if (!currentStep) {
      // Campaign completed
      await this.enrollmentRepo.update(enrollment.id, { status: EnrollmentStatus.COMPLETED });
      await this.campaignRepo.increment({ id: enrollment.campaignId }, 'completedCount', 1);
      return;
    }

    this.logger.log(`▶ Executing step ${enrollment.currentStepIndex} (${currentStep.stepType}) for enrollment ${enrollment.id}`);

    switch (currentStep.stepType) {
      case DripStepType.MESSAGE:
        // TODO: Send message via WhatsApp service
        this.logger.log(`  📨 Would send message: "${(currentStep.config as any).content}"`);
        break;
      case DripStepType.TEMPLATE:
        // TODO: Send template via WhatsApp service
        this.logger.log(`  📋 Would send template: "${(currentStep.config as any).templateName}"`);
        break;
      case DripStepType.TAG:
        const tagConfig = currentStep.config as any;
        const contact = await this.contactRepo.findOne({ where: { id: enrollment.contactId } });
        if (contact) {
          if (tagConfig.action === 'add') {
            contact.tags = [...new Set([...contact.tags, ...tagConfig.tags])];
          } else {
            contact.tags = contact.tags.filter((t) => !tagConfig.tags.includes(t));
          }
          await this.contactRepo.save(contact);
        }
        break;
      case DripStepType.DELAY:
        // Delay is handled by nextExecutionAt
        break;
    }

    // Advance to next step
    const nextIndex = enrollment.currentStepIndex + 1;
    const nextStep = steps[nextIndex];

    if (!nextStep) {
      await this.enrollmentRepo.update(enrollment.id, {
        currentStepIndex: nextIndex,
        status: EnrollmentStatus.COMPLETED,
      });
      await this.campaignRepo.increment({ id: enrollment.campaignId }, 'completedCount', 1);
    } else {
      const delay = nextStep.stepType === DripStepType.DELAY
        ? ((nextStep.config as any).delayMinutes || 60)
        : 1; // execute immediately for non-delay steps
      await this.enrollmentRepo.update(enrollment.id, {
        currentStepIndex: nextIndex,
        nextExecutionAt: new Date(Date.now() + delay * 60000),
      });
    }
  }
}
