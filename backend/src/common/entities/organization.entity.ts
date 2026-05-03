// ============================================================
// Organization Entity
// ============================================================
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { Contact } from './contact.entity';
import { Conversation } from './conversation.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 100, unique: true })
  slug: string;

  @Column({ name: 'logo_url', nullable: true })
  logoUrl: string;

  @Column({ length: 50, default: 'free' })
  plan: string;

  @Column({ name: 'max_agents', default: 3 })
  maxAgents: number;

  @Column({ name: 'whatsapp_phone_number_id', nullable: true, length: 100 })
  whatsappPhoneNumberId: string;

  @Column({ name: 'whatsapp_business_account_id', nullable: true, length: 100 })
  whatsappBusinessAccountId: string;

  @Column({ name: 'whatsapp_access_token', nullable: true, type: 'text' })
  whatsappAccessToken: string;

  @Column({ name: 'webhook_verify_token', nullable: true, length: 255 })
  webhookVerifyToken: string;

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, any>;

  @Column({ name: 'role_permissions', type: 'jsonb', default: {} })
  rolePermissions: Record<string, Record<string, boolean>>;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @OneToMany(() => Contact, (contact) => contact.organization)
  contacts: Contact[];

  @OneToMany(() => Conversation, (conv) => conv.organization)
  conversations: Conversation[];
}
