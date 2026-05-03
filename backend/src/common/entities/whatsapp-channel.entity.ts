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

@Entity('whatsapp_channels')
export class WhatsappChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'department_id', nullable: true })
  departmentId: string;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'phone_number', length: 50 })
  phoneNumber: string;

  @Column({ name: 'phone_number_id', length: 100 })
  phoneNumberId: string;

  @Column({ name: 'business_account_id', length: 100, nullable: true })
  businessAccountId: string;

  @Column({ name: 'access_token', type: 'text' })
  accessToken: string;

  @Column({ name: 'webhook_verify_token', length: 255, nullable: true })
  webhookVerifyToken: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ length: 50, default: 'disconnected' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
