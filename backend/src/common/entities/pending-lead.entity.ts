// ============================================================
// Pending Lead Entity
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
import { Contact } from './contact.entity';
import { Conversation } from './conversation.entity';
import { User } from './user.entity';
import { Department } from './department.entity';

export type PendingLeadStatus =
  | 'pending'
  | 'activated'
  | 'cancelled'
  | 'expired';

@Entity('pending_leads')
export class PendingLead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'contact_id' })
  contactId: string;

  @Column({ name: 'source_conversation_id', nullable: true })
  sourceConversationId: string | null;

  @Column({ name: 'target_conversation_id', nullable: true })
  targetConversationId: string | null;

  @Column({ name: 'automation_rule_id', nullable: true })
  automationRuleId: string | null;

  @Column({ name: 'ad_id', nullable: true, length: 255 })
  adId: string | null;

  @Column({ name: 'source_type', nullable: true, length: 50 })
  sourceType: string | null;

  @Column({ name: 'target_agent_id', nullable: true })
  targetAgentId: string | null;

  @Column({ name: 'target_department_id', nullable: true })
  targetDepartmentId: string | null;

  @Column({ length: 30, default: 'pending' })
  status: PendingLeadStatus;

  @Column({ nullable: true, length: 80 })
  reason: string | null;

  @Column({ default: 0 })
  priority: number;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @Column({ name: 'triggered_at', type: 'timestamptz', nullable: true })
  triggeredAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;

  @ManyToOne(() => Conversation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_conversation_id' })
  sourceConversation: Conversation | null;

  @ManyToOne(() => Conversation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'target_conversation_id' })
  targetConversation: Conversation | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'target_agent_id' })
  targetAgent: User | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'target_department_id' })
  targetDepartment: Department | null;
}
