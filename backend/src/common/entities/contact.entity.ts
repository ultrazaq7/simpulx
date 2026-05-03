// ============================================================
// Contact Entity (Customers)
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
import { Conversation } from './conversation.entity';

export enum SourceChannel {
  WHATSAPP_DIRECT = 'WHATSAPP_DIRECT',
  META_ADS = 'META_ADS',
  META_ORGANIC = 'META_ORGANIC',
  META_MESSENGER = 'META_MESSENGER',
  TIKTOK_ADS = 'TIKTOK_ADS',
  GOOGLE_ADS = 'GOOGLE_ADS',
  INSTAGRAM = 'INSTAGRAM',
  LANDING_PAGE = 'LANDING_PAGE',
  PUBLISHER = 'PUBLISHER',
  REFERRAL = 'REFERRAL',
  EMAIL = 'EMAIL',
  FORM = 'FORM',
  MANUAL = 'MANUAL',
}

@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'whatsapp_id', nullable: true, length: 50 })
  whatsappId: string;

  @Column({ name: 'instagram_id', nullable: true, length: 100 })
  instagramId: string;

  @Column({ name: 'facebook_id', nullable: true, length: 100 })
  facebookId: string;

  @Column({ nullable: true, length: 50 })
  phone: string;

  @Column({ nullable: true, length: 255 })
  email: string;

  @Column({ nullable: true, length: 255 })
  name: string;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl: string;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ name: 'is_blocked', default: false })
  isBlocked: boolean;

  @Column({ name: 'first_seen_at', default: () => 'NOW()' })
  firstSeenAt: Date;

  @Column({ name: 'last_seen_at', nullable: true })
  lastSeenAt: Date;

  // ── Omnichannel Source Tracking ────────────────────────
  @Column({
    name: 'source_channel',
    type: 'enum',
    enum: SourceChannel,
    enumName: 'source_channel',
    default: SourceChannel.WHATSAPP_DIRECT,
    nullable: true,
  })
  sourceChannel: SourceChannel;

  @Column({ name: 'source_campaign_id', nullable: true, length: 255 })
  sourceCampaignId: string;

  @Column({ name: 'source_campaign_name', nullable: true, length: 500 })
  sourceCampaignName: string;

  @Column({ name: 'source_metadata', type: 'jsonb', default: {} })
  sourceMetadata: Record<string, any>;

  @Column({ name: 'first_contacted_at', nullable: true })
  firstContactedAt: Date;

  // ── Conversion Tracking ───────────────────────────────
  @Column({ name: 'converted_at', nullable: true })
  convertedAt: Date;

  @Column({ name: 'conversion_value', type: 'decimal', precision: 12, scale: 2, nullable: true })
  conversionValue: number;

  @Column({ name: 'conversion_metadata', type: 'jsonb', default: {} })
  conversionMetadata: Record<string, any>;

  // ── Cross-channel Linking ─────────────────────────────
  @Column({ name: 'cross_channel_group_id', type: 'uuid', nullable: true })
  crossChannelGroupId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Organization, (org) => org.contacts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @OneToMany(() => Conversation, (conv) => conv.contact)
  conversations: Conversation[];
}
