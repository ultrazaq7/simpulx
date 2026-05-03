// ============================================================
// Channel Interaction Entity (Timeline / Audit Trail)
// ============================================================
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { Contact } from './contact.entity';
import { SourceChannel } from './contact.entity';

export enum InteractionType {
  LEAD_CREATED = 'LEAD_CREATED',
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  MESSAGE_SENT = 'MESSAGE_SENT',
  CONVERSATION_OPENED = 'CONVERSATION_OPENED',
  CONVERSATION_CLOSED = 'CONVERSATION_CLOSED',
  AD_CLICK = 'AD_CLICK',
  FORM_SUBMITTED = 'FORM_SUBMITTED',
  CONVERSION = 'CONVERSION',
  NOTE_ADDED = 'NOTE_ADDED',
}

@Entity('channel_interactions')
export class ChannelInteraction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'contact_id' })
  contactId: string;

  @Column({
    type: 'enum',
    enum: SourceChannel,
    enumName: 'source_channel',
  })
  channel: SourceChannel;

  @Column({
    name: 'interaction_type',
    type: 'enum',
    enum: InteractionType,
    enumName: 'interaction_type',
  })
  interactionType: InteractionType;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;
}
