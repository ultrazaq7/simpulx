// ============================================================
// Automation Rule Entity
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

export enum AutomationTrigger {
  NEW_CONVERSATION = 'new_conversation',
  NEW_MESSAGE = 'new_message',
  AD_CLICK = 'ad_click',
  CONVERSATION_IDLE = 'conversation_idle',
  KEYWORD_MATCH = 'keyword_match',
  CONTACT_TAG = 'contact_tag',
  OFFICE_HOURS = 'office_hours',
  AFTER_HOURS = 'after_hours',
}

export enum AutomationAction {
  ASSIGN_AGENT = 'assign_agent',
  ASSIGN_TEAM = 'assign_team',
  SEND_MESSAGE = 'send_message',
  SEND_TEMPLATE = 'send_template',
  ADD_TAG = 'add_tag',
  REMOVE_TAG = 'remove_tag',
  SET_PRIORITY = 'set_priority',
  CLOSE_CONVERSATION = 'close_conversation',
  WEBHOOK_NOTIFY = 'webhook_notify',
}

@Entity('automation_rules')
export class AutomationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({
    name: 'trigger_type',
    type: 'enum',
    enum: AutomationTrigger,
  })
  triggerType: AutomationTrigger;

  @Column({ name: 'trigger_conditions', type: 'jsonb', default: {} })
  triggerConditions: Record<string, any>;

  @Column({ type: 'jsonb', default: [] })
  actions: Array<{ actionType: AutomationAction; params: Record<string, any> }>;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'priority_order', default: 0 })
  priorityOrder: number;

  @Column({ name: 'execution_count', type: 'bigint', default: 0 })
  executionCount: number;

  @Column({ name: 'last_executed_at', nullable: true })
  lastExecutedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;
}
