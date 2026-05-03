import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Organization } from './organization.entity';
import { WhatsappChannel } from './whatsapp-channel.entity';

@Entity('whatsapp_templates')
@Unique(['channelId', 'metaTemplateId'])
export class WhatsappTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'channel_id' })
  channelId: string;

  @ManyToOne(() => WhatsappChannel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel: WhatsappChannel;

  @Column({ name: 'meta_template_id', length: 100 })
  metaTemplateId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 50, default: 'PENDING' })
  status: string;

  @Column({ length: 50, nullable: true })
  category: string;

  @Column({ length: 20, default: 'en' })
  language: string;

  @Column({ type: 'jsonb', nullable: true })
  components: any;

  @Column({ name: 'department_ids', type: 'jsonb', default: '[]' })
  departmentIds: string[];

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
