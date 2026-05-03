// ============================================================
// Meta Lead Entity
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
import { MetaAccount } from './meta-account.entity';
import { Contact } from './contact.entity';

@Entity('meta_leads')
export class MetaLead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'meta_account_id' })
  metaAccountId: string;

  @Column({ name: 'contact_id', nullable: true })
  contactId: string;

  @Column({ name: 'meta_lead_id', length: 100 })
  metaLeadId: string;

  @Column({ name: 'form_id', nullable: true, length: 100 })
  formId: string;

  @Column({ name: 'form_name', nullable: true, length: 255 })
  formName: string;

  @Column({ name: 'ad_id', nullable: true, length: 100 })
  adId: string;

  @Column({ name: 'ad_name', nullable: true, length: 255 })
  adName: string;

  @Column({ name: 'adset_id', nullable: true, length: 100 })
  adsetId: string;

  @Column({ name: 'adset_name', nullable: true, length: 255 })
  adsetName: string;

  @Column({ name: 'campaign_id', nullable: true, length: 100 })
  campaignId: string;

  @Column({ name: 'campaign_name', nullable: true, length: 255 })
  campaignName: string;

  @Column({ length: 20, default: 'facebook' })
  platform: string;

  @Column({ name: 'lead_data', type: 'jsonb', default: {} })
  leadData: Record<string, any>;

  @Column({ length: 20, default: 'new' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => MetaAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meta_account_id' })
  metaAccount: MetaAccount;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;
}
