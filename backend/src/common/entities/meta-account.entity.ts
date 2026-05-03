// ============================================================
// Meta Account Entity (per Organization)
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

@Entity('meta_accounts')
export class MetaAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ length: 20, default: 'facebook' })
  platform: string;

  @Column({ name: 'business_account_id', length: 100 })
  businessAccountId: string;

  @Column({ name: 'page_id', nullable: true, length: 100 })
  pageId: string;

  @Column({ name: 'page_name', nullable: true, length: 255 })
  pageName: string;

  @Column({ name: 'access_token', type: 'text' })
  accessToken: string;

  @Column({ name: 'webhook_verify_token', nullable: true, length: 255 })
  webhookVerifyToken: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_synced_at', nullable: true })
  lastSyncedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;
}
