// ============================================================
// User Entity (Agents & Admins)
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

export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MANAGER = 'manager',
  SUPERVISOR = 'supervisor',
  AGENT = 'agent',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  INVITED = 'invited',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'department_id', nullable: true })
  departmentId: string;

  @Column({ name: 'supervisor_id', nullable: true })
  supervisorId: string;

  @Column({ length: 255 })
  email: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash: string;

  @Column({ name: 'full_name', length: 255 })
  fullName: string;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.AGENT })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.INVITED })
  status: UserStatus;

  @Column({ name: 'max_concurrent_chats', default: 10 })
  maxConcurrentChats: number;

  @Column({ name: 'is_online', default: false })
  isOnline: boolean;

  @Column({ name: 'last_seen_at', nullable: true })
  lastSeenAt: Date;

  @Column({ type: 'jsonb', default: {} })
  preferences: Record<string, any>;

  @Column({ name: 'password_reset_token', nullable: true, select: false, type: 'text' })
  passwordResetToken: string | null;

  @Column({ name: 'password_reset_expires', nullable: true, select: false, type: 'timestamptz' })
  passwordResetExpires: Date | null;

  @Column({ name: 'available_for_round_robin', default: true })
  availableForRoundRobin: boolean;

  @Column({ name: 'fcm_token', nullable: true, type: 'text' })
  fcmToken: string | null;

  @Column({ name: 'fcm_platform', nullable: true, type: 'varchar', length: 20 })
  fcmPlatform: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Organization, (org) => org.users, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supervisor_id' })
  supervisor: User;
}
