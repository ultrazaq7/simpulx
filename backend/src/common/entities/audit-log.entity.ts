// ============================================================
// Audit Log Entity — Track all user & system actions
// ============================================================
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Organization } from './organization.entity';

export enum AuditCategory {
  AUTH = 'auth',
  CHAT = 'chat',
  CONTACT = 'contact',
  SETTINGS = 'settings',
  AUTOMATION = 'automation',
  BROADCAST = 'broadcast',
  USER = 'user',
  SYSTEM = 'system',
  CTA = 'cta',
}

@Entity('audit_logs')
@Index(['organizationId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar', nullable: true })
  category: AuditCategory;

  @Column()
  action: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @Column({ name: 'user_name', nullable: true })
  userName: string;

  @Column({ name: 'target_id', nullable: true })
  targetId: string;

  @Column({ name: 'target_type', nullable: true })
  targetType: string;

  @Column({ type: 'jsonb', default: {}, nullable: true })
  metadata: Record<string, any>;

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
