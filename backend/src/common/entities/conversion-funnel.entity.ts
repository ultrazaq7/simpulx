// ============================================================
// Conversion Funnel Entity (Pre-computed analytics)
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
import { SourceChannel } from './contact.entity';

@Entity('conversion_funnels')
export class ConversionFunnel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'date' })
  period: Date;

  @Column({
    type: 'enum',
    enum: SourceChannel,
  })
  channel: SourceChannel;

  @Column({ name: 'leads_count', default: 0 })
  leadsCount: number;

  @Column({ name: 'conversations_count', default: 0 })
  conversationsCount: number;

  @Column({ name: 'conversions_count', default: 0 })
  conversionsCount: number;

  @Column({ name: 'total_value', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalValue: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;
}
