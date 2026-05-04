// ============================================================
// Conversation Entity
// ============================================================
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Organization } from './organization.entity';
import { Contact } from './contact.entity';
import { SourceChannel } from './contact.entity';
import { User } from './user.entity';
import { Message } from './message.entity';
import { Department } from './department.entity';
import { WhatsappChannel } from './whatsapp-channel.entity';
import { MetaChannel } from './meta-channel.entity';
import { Stage } from './stage.entity';
import { InternalNote } from './internal-note.entity';

export enum InterestLevel {
  HOT = 'hot',
  WARM = 'warm',
  COLD = 'cold',
}

export enum ConversationStatus {
  OPEN = 'open',
  PENDING = 'pending',
  CLOSED = 'closed',
}

export enum ConversationChannel {
  WHATSAPP = 'whatsapp',
  WEB_CHAT = 'web_chat',
  EMAIL = 'email',
  INSTAGRAM = 'instagram',
  TELEGRAM = 'telegram',
  META_MESSENGER = 'meta_messenger',
}

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'contact_id' })
  contactId: string;

  @Column({ name: 'assigned_agent_id', nullable: true })
  assignedAgentId: string;

  @Column({ name: 'department_id', nullable: true })
  departmentId: string;

  @Column({ name: 'whatsapp_channel_id', nullable: true })
  whatsappChannelId: string;

  @Column({ name: 'meta_channel_id', nullable: true })
  metaChannelId: string;

  @Column({
    type: 'enum',
    enum: ConversationChannel,
    default: ConversationChannel.WHATSAPP,
  })
  channel: ConversationChannel;

  @Column({
    type: 'enum',
    enum: ConversationStatus,
    default: ConversationStatus.OPEN,
  })
  status: ConversationStatus;

  @Column({ nullable: true, length: 500 })
  subject: string;

  @Column({ name: 'last_message_at', nullable: true })
  lastMessageAt: Date;

  @Column({ name: 'last_contact_message_at', type: 'timestamptz', nullable: true })
  lastContactMessageAt: Date | null;

  @Column({ name: 'last_agent_message_at', type: 'timestamptz', nullable: true })
  lastAgentMessageAt: Date | null;

  @Column({ name: 'window_expires_at', type: 'timestamptz', nullable: true })
  windowExpiresAt: Date | null;

  @Column({ name: 'last_message_preview', nullable: true, type: 'text' })
  lastMessagePreview: string;

  @Column({ name: 'last_message_sender_type', nullable: true, length: 20 })
  lastMessageSenderType: string;

  @Column({ name: 'unread_count', default: 0 })
  unreadCount: number;

  @Column({ name: 'is_bot_active', default: false })
  isBotActive: boolean;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  // ── Referral / Ad Set Isolation ────────────────────────
  @Column({ name: 'referral_ad_set_id', nullable: true, length: 255 })
  referralAdSetId: string;

  @Column({ name: 'referral_campaign_id', nullable: true, length: 255 })
  referralCampaignId: string;

  @Column({ name: 'referral_source_url', nullable: true, type: 'text' })
  referralSourceUrl: string;

  @Column({ name: 'referral_headline', nullable: true, length: 500 })
  referralHeadline: string;

  @Column({ name: 'closed_at', nullable: true })
  closedAt: Date;

  @Column({ name: 'closed_reason', nullable: true, length: 80 })
  closedReason: string | null;

  @Column({ name: 'auto_close_at', type: 'timestamptz', nullable: true })
  autoCloseAt: Date | null;

  @Column({ name: 'stage_id', nullable: true })
  stageId: string;

  @Column({ name: 'interest_level', nullable: true, length: 10 })
  interestLevel: string;

  @Column({ name: 'first_reply_at', nullable: true })
  firstReplyAt: Date;

  @Column({ name: 'hsm_sent_at', type: 'timestamptz', nullable: true })
  hsmSentAt: Date | null;

  @Column({ name: 'hsm_count', default: 0 })
  hsmCount: number;

  @Column({ name: 'ai_stage', nullable: true, length: 30 })
  aiStage: string | null;

  @Column({ name: 'ai_confidence', type: 'numeric', precision: 5, scale: 4, nullable: true })
  aiConfidence: string | null;

  @Column({ name: 'ai_reason', nullable: true, type: 'text' })
  aiReason: string | null;

  @Column({ name: 'ai_analyzed_at', type: 'timestamptz', nullable: true })
  aiAnalyzedAt: Date | null;

  @Column({ name: 'snoozed_until', type: 'timestamp', nullable: true })
  snoozedUntil: Date | null;

  @Column({ name: 'routing_automation_rule_id', nullable: true })
  routingAutomationRuleId: string | null;

  @Column({ name: 'routed_ad_id', nullable: true, length: 255 })
  routedAdId: string | null;

  // ── Omnichannel Source ────────────────────────────────
  @Column({
    name: 'source_channel',
    type: 'enum',
    enum: SourceChannel,
    enumName: 'source_channel',
    nullable: true,
  })
  sourceChannel: SourceChannel;

  @Column({ name: 'cross_channel_group_id', type: 'uuid', nullable: true })
  crossChannelGroupId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Organization, (org) => org.conversations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Contact, (contact) => contact.conversations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_agent_id' })
  assignedAgent: User;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @ManyToOne(() => WhatsappChannel, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'whatsapp_channel_id' })
  whatsappChannel: WhatsappChannel;

  @ManyToOne(() => MetaChannel, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'meta_channel_id' })
  metaChannel: MetaChannel;

  @OneToMany(() => Message, (msg) => msg.conversation)
  messages: Message[];

  @ManyToOne(() => Stage, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'stage_id' })
  stage: Stage;

  @OneToMany(() => InternalNote, (note) => note.conversation)
  internalNotes: InternalNote[];
}
