// ============================================================
// Publisher Entity (configurable lead sources)
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
import { Department } from './department.entity';

@Entity('publishers')
export class Publisher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 100 })
  slug: string;

  @Column({ name: 'api_key', length: 64, unique: true })
  apiKey: string;

  @Column({ name: 'auto_assign_dept_id', nullable: true })
  autoAssignDeptId: string;

  @Column({ name: 'auto_template_name', nullable: true, length: 255 })
  autoTemplateName: string;

  @Column({ name: 'webhook_url', nullable: true, type: 'text' })
  webhookUrl: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'auto_assign_dept_id' })
  autoAssignDept: Department;
}
