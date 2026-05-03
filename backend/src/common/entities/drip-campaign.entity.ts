// ============================================================
// Drip Campaign Entities — Time-Sequenced Message Flows
// ============================================================
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { Organization } from './organization.entity';

export enum DripCampaignStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
}

export enum DripStepType {
  DELAY = 'delay',
  MESSAGE = 'message',
  TEMPLATE = 'template',
  CONDITION = 'condition',
  TAG = 'tag',
}

export enum EnrollmentStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  EXITED = 'exited',
  PAUSED = 'paused',
}

@Entity('drip_campaigns')
export class DripCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: DripCampaignStatus, default: DripCampaignStatus.DRAFT })
  status: DripCampaignStatus;

  @Column({ type: 'jsonb', default: [] })
  triggerConditions: Record<string, any>;

  @Column({ default: 0 })
  enrolledCount: number;

  @Column({ default: 0 })
  completedCount: number;

  @OneToMany(() => DripStep, (s) => s.campaign, { cascade: true })
  steps: DripStep[];

  @OneToMany(() => DripEnrollment, (e) => e.campaign)
  enrollments: DripEnrollment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('drip_steps')
export class DripStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  campaignId: string;

  @ManyToOne(() => DripCampaign, (c) => c.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: DripCampaign;

  @Column({ type: 'enum', enum: DripStepType })
  stepType: DripStepType;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ type: 'jsonb', default: {} })
  config: Record<string, any>;
  // For DELAY: { delayMinutes: number }
  // For MESSAGE: { content: string }
  // For TEMPLATE: { templateName: string, languageCode: string, components: [] }
  // For CONDITION: { field: string, operator: string, value: any, trueBranch: number, falseBranch: number }
  // For TAG: { action: 'add'|'remove', tags: string[] }

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('drip_enrollments')
export class DripEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  campaignId: string;

  @ManyToOne(() => DripCampaign, (c) => c.enrollments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: DripCampaign;

  @Column()
  contactId: string;

  @Column({ default: 0 })
  currentStepIndex: number;

  @Column({ type: 'enum', enum: EnrollmentStatus, default: EnrollmentStatus.ACTIVE })
  status: EnrollmentStatus;

  @Column({ type: 'timestamp', nullable: true })
  nextExecutionAt: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn()
  enrolledAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
