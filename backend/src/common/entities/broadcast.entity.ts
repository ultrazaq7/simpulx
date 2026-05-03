// ============================================================
// Broadcast Entity
// ============================================================
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { User } from './user.entity';

export enum BroadcastStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity('broadcasts')
export class Broadcast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'created_by_id', nullable: true })
  createdById: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  // Template-based sending fields
  @Column({ name: 'channel_id', nullable: true })
  channelId: string;

  @Column({ name: 'template_name', nullable: true })
  templateName: string;

  @Column({ name: 'language_code', nullable: true, default: 'en_US' })
  languageCode: string;

  @Column({ name: 'template_components', type: 'jsonb', nullable: true })
  templateComponents: any[];

  @Column({ name: 'broadcast_type', default: 'text' })
  broadcastType: string; // 'text' | 'template'

  @Column({ type: 'enum', enum: BroadcastStatus, default: BroadcastStatus.DRAFT })
  status: BroadcastStatus;

  @Column({ name: 'recipient_filter', type: 'jsonb', default: {} })
  recipientFilter: Record<string, any>;

  @Column({ name: 'total_recipients', default: 0 })
  totalRecipients: number;

  @Column({ name: 'sent_count', default: 0 })
  sentCount: number;

  @Column({ name: 'delivered_count', default: 0 })
  deliveredCount: number;

  @Column({ name: 'read_count', default: 0 })
  readCount: number;

  @Column({ name: 'failed_count', default: 0 })
  failedCount: number;

  @Column({ name: 'scheduled_at', nullable: true })
  scheduledAt: Date;

  @Column({ name: 'sent_at', nullable: true })
  sentAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;
}
