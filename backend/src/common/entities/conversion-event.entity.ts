// ============================================================
// Conversion Event Entity
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
import { Conversation } from './conversation.entity';

@Entity('conversion_events')
export class ConversionEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'contact_id' })
  contactId: string;

  @Column({ name: 'conversation_id', nullable: true })
  conversationId: string;

  @Column({
    name: 'channel_credited',
    type: 'enum',
    enum: SourceChannel,
    enumName: 'source_channel',
  })
  channelCredited: SourceChannel;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @Column({ name: 'converted_at', default: () => 'NOW()' })
  convertedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;

  @ManyToOne(() => Conversation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;
}
