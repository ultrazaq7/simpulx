import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CtaEvent, CtaType } from '../../common/entities/cta-event.entity';
import { Contact } from '../../common/entities/contact.entity';
import { Conversation } from '../../common/entities/conversation.entity';

@Injectable()
export class CtaEventsService {
  constructor(
    @InjectRepository(CtaEvent)
    private readonly repo: Repository<CtaEvent>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
  ) {}

  async log(params: {
    orgId: string;
    agentId: string | null;
    type: CtaType;
    contactId?: string | null;
    conversationId?: string | null;
    durationSeconds?: number | null;
    metadata?: Record<string, any>;
  }) {
    // Resolve source channel snapshot from conversation or contact.
    let sourceChannel: string | null = null;
    if (params.conversationId) {
      const c = await this.convRepo.findOne({ where: { id: params.conversationId } });
      sourceChannel = (c as any)?.sourceChannel ?? (c as any)?.source_channel ?? null;
    }
    if (!sourceChannel && params.contactId) {
      const ct = await this.contactRepo.findOne({ where: { id: params.contactId } });
      sourceChannel = (ct as any)?.sourceChannel ?? (ct as any)?.source_channel ?? null;
    }

    const event = this.repo.create({
      organizationId: params.orgId,
      agentId: params.agentId,
      type: params.type,
      contactId: params.contactId ?? null,
      conversationId: params.conversationId ?? null,
      durationSeconds: params.durationSeconds ?? null,
      sourceChannel,
      metadata: params.metadata ?? {},
    });
    return this.repo.save(event);
  }

  async updateDuration(orgId: string, eventId: string, durationSeconds: number) {
    await this.repo.update(
      { id: eventId, organizationId: orgId },
      { durationSeconds },
    );
    return this.repo.findOne({ where: { id: eventId, organizationId: orgId } });
  }

  async listRecent(orgId: string, limit = 50) {
    return this.repo.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
