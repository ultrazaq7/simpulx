// ============================================================
// Chat Service — Messages & Conversations
// ============================================================
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Conversation,
  ConversationStatus,
  ConversationChannel,
} from "../../common/entities/conversation.entity";
import {
  Message,
  MessageDirection,
  MessageType,
  MessageStatus,
} from "../../common/entities/message.entity";
import { Contact, SourceChannel } from "../../common/entities/contact.entity";
import { ChannelInteraction, InteractionType } from "../../common/entities/channel-interaction.entity";
import { User, UserRole } from "../../common/entities/user.entity";
import { WhatsappChannel } from "../../common/entities/whatsapp-channel.entity";
import { WhatsappTemplate } from "../../common/entities/whatsapp-template.entity";
import { MetaChannel } from "../../common/entities/meta-channel.entity";
import { Department } from "../../common/entities/department.entity";
import { InternalNote } from "../../common/entities/internal-note.entity";
import { Stage } from "../../common/entities/stage.entity";
import { ChatGateway } from "./chat.gateway";
import { PushNotificationService } from "./push-notification.service";
import { WhatsappService } from "../webhook/whatsapp.service";
import { MetaMessagingService } from "../webhook/meta-messaging.service";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
    @InjectRepository(Message) private msgRepo: Repository<Message>,
    @InjectRepository(Contact) private contactRepo: Repository<Contact>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(WhatsappChannel)
    private channelRepo: Repository<WhatsappChannel>,
    @InjectRepository(WhatsappTemplate)
    private templateRepo: Repository<WhatsappTemplate>,
    @InjectRepository(Department)
    private departmentRepo: Repository<Department>,
    @InjectRepository(InternalNote)
    private noteRepo: Repository<InternalNote>,
    @InjectRepository(ChannelInteraction)
    private interactionRepo: Repository<ChannelInteraction>,
    @InjectRepository(Stage)
    private stageRepo: Repository<Stage>,
    @InjectRepository(MetaChannel)
    private metaChannelRepo: Repository<MetaChannel>,
    private chatGateway: ChatGateway,
    private pushNotificationService: PushNotificationService,
    private whatsappService: WhatsappService,
    private metaMessagingService: MetaMessagingService,
    private configService: ConfigService,
  ) {}

  private get uploadsDir(): string {
    return (
      this.configService.get<string>('UPLOAD_DIR') ??
      this.configService.get<string>('UPLOADS_DIR', '/var/lib/simpulx/uploads')
    );
  }

  private extFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/3gpp': '.3gp',
      'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
      'audio/amr': '.amr',
      'audio/mp4': '.m4a',
      'audio/aac': '.aac',
      'audio/webm': '.webm',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'text/plain': '.txt',
    };
    return map[mime.split(';')[0].trim().toLowerCase()] || '';
  }

  private async downloadAndPersistWaMedia(
    orgId: string,
    mediaId: string,
    channelId: string | null,
  ): Promise<{ url: string; mimeType: string; filename: string; size: number }> {
    const { url, mimeType } = await this.whatsappService.downloadMedia(
      orgId,
      mediaId,
      channelId,
    );
    const bytes = await this.whatsappService.fetchMediaBytes(orgId, url, channelId);

    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
    const ext = this.extFromMime(mimeType) || '';
    const storedName = `${crypto.randomUUID()}${ext}`;
    const absPath = path.join(this.uploadsDir, storedName);
    fs.writeFileSync(absPath, bytes);

    return {
      url: `/uploads/${storedName}`,
      mimeType,
      filename: storedName,
      size: bytes.length,
    };
  }

  private async downloadAndPersistUrlMedia(
    orgId: string,
    mediaUrl: string,
  ): Promise<{ url: string; mimeType: string; filename: string; size: number }> {
    const axios = require('axios');
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    const bytes = Buffer.from(response.data);
    const mimeType = response.headers['content-type'] || 'application/octet-stream';

    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
    const ext = this.extFromMime(mimeType) || '';
    const storedName = `${crypto.randomUUID()}${ext}`;
    const absPath = path.join(this.uploadsDir, storedName);
    fs.writeFileSync(absPath, bytes);

    return {
      url: `/uploads/${storedName}`,
      mimeType,
      filename: storedName,
      size: bytes.length,
    };
  }

  // ── List Conversations ────────────────────────────────
  async getConversations(
    orgId: string,
    options: {
      status?: ConversationStatus;
      agentId?: string;
      campaignId?: string;
      contactId?: string;
      assignment?: "all" | "unassigned" | "assigned" | "me";
      lastMessageBy?: "customer" | "bot" | "customer_or_bot";
      channelId?: string;
      departmentId?: string;
      interestLevel?: string;
      sourceChannel?: string;
      stageId?: string;
      followUpDue?: "overdue" | "today" | "this_week";
      sort?: "latest" | "oldest";
      tag?: string;
      page?: number;
      limit?: number;
      search?: string;
      currentUser?: { id: string; role: string; departmentId: string | null };
    },
  ) {
    const {
      status,
      agentId,
      campaignId,
      contactId,
      assignment = "all",
      lastMessageBy,
      channelId,
      departmentId,
      interestLevel,
      sourceChannel,
      stageId,
      followUpDue,
      sort = "latest",
      tag,
      page = 1,
      limit = 50,
      search,
      currentUser,
    } = options;
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const sortDirection = sort === "oldest" ? "ASC" : "DESC";

    const qb = this.convRepo
      .createQueryBuilder("c")
      .leftJoinAndSelect("c.contact", "contact")
      .leftJoinAndSelect("c.assignedAgent", "agent")
      .leftJoinAndSelect("c.whatsappChannel", "whatsappChannel")
      .leftJoinAndSelect("c.department", "department")
      .leftJoinAndSelect("c.stage", "stage")
      .where("c.organizationId = :orgId", { orgId })
      .orderBy("c.lastMessageAt", sortDirection, "NULLS LAST");

    // ── Role-based visibility ──────────────────────────
    if (currentUser) {
      const role = currentUser.role as UserRole;

      if (role === UserRole.AGENT) {
        // Agents only see conversations assigned to them
        qb.andWhere("c.assignedAgentId = :myId", { myId: currentUser.id });
      } else if (role === UserRole.SUPERVISOR || role === UserRole.MANAGER) {
        // Supervisors/Managers see their own assigned chats, their supervised
        // agents' chats, department queue chats, and channel-only unassigned chats.
        const supervisedAgents = await this.userRepo.find({
          where: { organizationId: orgId, supervisorId: currentUser.id },
          select: ["id"],
        });
        const visibleIds = [
          currentUser.id,
          ...supervisedAgents.map((a) => a.id),
        ];
        qb.andWhere(
          "(c.assignedAgentId IN (:...visibleIds) OR c.assignedAgentId IS NULL OR c.departmentId = :deptId)",
          { visibleIds, deptId: currentUser.departmentId },
        );
      }
      // Admin/Owner: no filter — see all conversations in the org
    }

    if (status) qb.andWhere("c.status = :status", { status });
    if (agentId) qb.andWhere("c.assignedAgentId = :agentId", { agentId });
    if (campaignId)
      qb.andWhere("c.referralAdSetId = :campaignId", { campaignId });
    if (contactId)
      qb.andWhere("c.contactId = :contactId", { contactId });
    if (channelId)
      qb.andWhere("c.whatsappChannelId = :channelId", { channelId });
    if (departmentId)
      qb.andWhere("c.departmentId = :departmentId", { departmentId });
    if (interestLevel)
      qb.andWhere("c.interestLevel = :interestLevel", { interestLevel });
    if (sourceChannel)
      qb.andWhere("c.sourceChannel = :sourceChannel", { sourceChannel });
    if (stageId)
      qb.andWhere("c.stageId = :stageId", { stageId });

    if (followUpDue) {
      const nowDate = new Date();
      if (followUpDue === 'overdue') {
        qb.andWhere(
          `EXISTS (SELECT 1 FROM follow_ups fu WHERE fu.conversation_id = c.id AND fu.status = 'pending' AND fu.scheduled_at < :now)`,
          { now: nowDate },
        );
      } else if (followUpDue === 'today') {
        qb.andWhere(
          `EXISTS (SELECT 1 FROM follow_ups fu WHERE fu.conversation_id = c.id AND fu.status = 'pending' AND fu.scheduled_at >= CURRENT_DATE AND fu.scheduled_at < CURRENT_DATE + INTERVAL '1 day')`,
        );
      } else if (followUpDue === 'this_week') {
        qb.andWhere(
          `EXISTS (SELECT 1 FROM follow_ups fu WHERE fu.conversation_id = c.id AND fu.status = 'pending' AND fu.scheduled_at >= date_trunc('week', CURRENT_DATE) AND fu.scheduled_at < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days')`,
        );
      }
    }

    if (assignment === "unassigned") {
      qb.andWhere("c.assignedAgentId IS NULL AND c.departmentId IS NULL");
    } else if (assignment === "assigned") {
      qb.andWhere(
        "(c.assignedAgentId IS NOT NULL OR c.departmentId IS NOT NULL)",
      );
    } else if (assignment === "me" && currentUser) {
      qb.andWhere("c.assignedAgentId = :currentUserId", {
        currentUserId: currentUser.id,
      });
    }

    if (lastMessageBy) {
      const senderTypes =
        lastMessageBy === "customer_or_bot"
          ? ["contact", "bot"]
          : [lastMessageBy === "customer" ? "contact" : "bot"];

      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM messages last_message
          WHERE last_message.conversation_id = c.id
            AND last_message.organization_id = :orgId
            AND last_message.is_deleted = false
            AND last_message.sender_type IN (:...lastSenderTypes)
            AND last_message.created_at = (
              SELECT MAX(message_sort.created_at)
              FROM messages message_sort
              WHERE message_sort.conversation_id = c.id
                AND message_sort.is_deleted = false
            )
        )`,
        { lastSenderTypes: senderTypes },
      );
    }

    if (tag) {
      const tags = tag
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (tags.length) {
        qb.andWhere("contact.tags && CAST(:tags AS text[])", { tags });
      }
    }

    if (search) {
      qb.andWhere(
        "(contact.name ILIKE :search OR contact.phone ILIKE :search OR contact.whatsappId ILIKE :search OR c.lastMessagePreview ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    const [conversations, total] = await qb
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();

    // ── Attach latest message status/direction per conversation ──
    let enriched: any[] = conversations;
    if (conversations.length > 0) {
      const ids = conversations.map((c) => c.id);
      const rows: Array<{
        conversation_id: string;
        status: string;
        direction: string;
      }> = await this.msgRepo.query(
        `SELECT DISTINCT ON (conversation_id) conversation_id, status, direction
         FROM messages
         WHERE conversation_id = ANY($1::uuid[])
           AND is_deleted = false
         ORDER BY conversation_id, created_at DESC`,
        [ids],
      );
      const byId = new Map<string, { status: string; direction: string }>();
      for (const r of rows) {
        byId.set(r.conversation_id, {
          status: r.status,
          direction: r.direction,
        });
      }
      enriched = conversations.map((c) => {
        const last = byId.get(c.id);
        return {
          ...c,
          lastMessageStatus: last?.status ?? null,
          lastMessageDirection: last?.direction ?? null,
        };
      });
    }

    return { conversations: enriched, total, page: safePage, limit: safeLimit };
  }

  async getConversationFilters(
    orgId: string,
    currentUser?: { id: string; role: string; departmentId: string | null },
  ) {
    const role = currentUser?.role as UserRole | undefined;
    const isScopedRole =
      role === UserRole.AGENT || role === UserRole.SUPERVISOR;

    const channelQb = this.channelRepo
      .createQueryBuilder("channel")
      .leftJoinAndSelect("channel.department", "department")
      .where("channel.organizationId = :orgId", { orgId })
      .andWhere("channel.isActive = true")
      .orderBy("channel.name", "ASC");

    if (isScopedRole && currentUser?.departmentId) {
      channelQb.andWhere(
        "(channel.departmentId = :departmentId OR channel.departmentId IS NULL)",
        { departmentId: currentUser.departmentId },
      );
    }

    const departmentQb = this.departmentRepo
      .createQueryBuilder("department")
      .where("department.organizationId = :orgId", { orgId })
      .andWhere("department.isActive = true")
      .orderBy("department.name", "ASC");

    if (isScopedRole && currentUser?.departmentId) {
      departmentQb.andWhere("department.id = :departmentId", {
        departmentId: currentUser.departmentId,
      });
    }

    const [channels, departments, tagRows] = await Promise.all([
      channelQb.getMany(),
      departmentQb.getMany(),
      this.contactRepo.query(
        `
          SELECT DISTINCT contact_tag.tag AS tag
          FROM contacts contact
          CROSS JOIN LATERAL unnest(contact.tags) AS contact_tag(tag)
          WHERE contact.organization_id = $1
            AND contact_tag.tag <> ''
          ORDER BY contact_tag.tag ASC
        `,
        [orgId],
      ),
    ]);

    // Get distinct source channels from contacts
    const sourceChannelRows = await this.contactRepo.query(
      `SELECT DISTINCT source_channel FROM contacts WHERE organization_id = $1 AND source_channel IS NOT NULL AND source_channel::text <> '' ORDER BY source_channel ASC`,
      [orgId],
    );

    // Get active stages
    const stages = await this.stageRepo.find({
      where: { organizationId: orgId, isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    return {
      channels: channels.map((channel) => ({
        id: channel.id,
        label: channel.name,
        departmentId: channel.departmentId,
        departmentName: channel.department?.name ?? null,
      })),
      departments: departments.map((department) => ({
        id: department.id,
        label: department.name,
      })),
      tags: tagRows
        .map((row: { tag?: string }) => row.tag)
        .filter((tag: string | undefined): tag is string => Boolean(tag)),
      sourceChannels: sourceChannelRows.map((r: { source_channel: string }) => r.source_channel),
      stages: stages.map((s) => ({
        id: s.id,
        label: s.name,
        color: s.color,
        category: s.category,
      })),
    };
  }

  // ── Get Messages for a Conversation ───────────────────
  async getMessages(
    orgId: string,
    conversationId: string,
    options: { page?: number; limit?: number },
  ) {
    const { page = 1, limit = 100 } = options;

    const [messages, total] = await this.msgRepo.findAndCount({
      where: { conversationId, organizationId: orgId },
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { messages: messages.reverse(), total, page, limit };
  }

  // ── Send Message (Agent → WhatsApp/IG/FB) ──────────────
  async sendMessage(
    orgId: string,
    conversationId: string,
    agentId: string,
    body: { content: string; type?: MessageType },
  ) {
    this.logger.log(`📝 sendMessage called: conv=${conversationId}, agent=${agentId}`);
    const conversation = await this.convRepo.findOne({
      where: { id: conversationId, organizationId: orgId },
      relations: ["contact", "whatsappChannel", "metaChannel"],
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    // Create message record
    const message = this.msgRepo.create({
      conversationId,
      organizationId: orgId,
      senderType: "agent",
      senderId: agentId,
      direction: MessageDirection.OUTBOUND,
      type: body.type || MessageType.TEXT,
      content: body.content,
      status: MessageStatus.PENDING,
    });
    await this.msgRepo.save(message);

    // Update conversation
    const convUpdates: Partial<Conversation> = {
      lastMessageAt: new Date(),
      lastMessagePreview: body.content?.substring(0, 150),
      lastMessageSenderType: 'agent',
      status: ConversationStatus.OPEN,
    };

    // Set first reply time if not already set (exclude bot actions)
    if (!conversation.firstReplyAt && !conversation.isBotActive) {
      convUpdates.firstReplyAt = new Date();
    }

    await this.convRepo.update(conversationId, convUpdates);

    // Send via platform API
    try {
      let waMessageId: string;

      if (conversation.channel === ConversationChannel.INSTAGRAM || conversation.channel === ConversationChannel.META_MESSENGER) {
        // IG / FB Messenger
        const recipientId = conversation.channel === ConversationChannel.INSTAGRAM
          ? conversation.contact.instagramId
          : conversation.contact.facebookId;
        waMessageId = await this.metaMessagingService.sendTextMessage(
          conversation.metaChannelId,
          recipientId,
          body.content,
        );
      } else {
        // WhatsApp
        waMessageId = await this.whatsappService.sendTextMessage(
          orgId,
          conversation.contact.whatsappId,
          body.content,
          conversation.whatsappChannelId,
        );
      }

      await this.msgRepo.update(message.id, {
        whatsappMessageId: waMessageId,
        status: MessageStatus.SENT,
        sentAt: new Date(),
      });

      message.whatsappMessageId = waMessageId;
      message.status = MessageStatus.SENT;
    } catch (error) {
      await this.msgRepo.update(message.id, {
        status: MessageStatus.FAILED,
        errorMessage: error.message,
      });
      message.status = MessageStatus.FAILED;
    }

    // Broadcast to relevant agents via WebSocket
    this.chatGateway.broadcastMessage(
      orgId,
      conversationId,
      message,
      conversation,
    );

    return message;
  }

  // ── Send Media Message (Agent → WhatsApp/IG/FB with file upload) ──
  async sendMediaMessage(
    orgId: string,
    conversationId: string,
    agentId: string,
    file: Express.Multer.File,
    caption?: string,
  ) {
    const conversation = await this.convRepo.findOne({
      where: { id: conversationId, organizationId: orgId },
      relations: ["contact", "whatsappChannel", "metaChannel"],
    });
    if (!conversation) throw new NotFoundException("Conversation not found");

    // Determine media type from MIME
    const mime = file.mimetype;
    let mediaType: 'image' | 'document' | 'audio' | 'video' = 'document';
    let msgType = MessageType.DOCUMENT;
    if (mime.startsWith('image/')) { mediaType = 'image'; msgType = MessageType.IMAGE; }
    else if (mime.startsWith('video/')) { mediaType = 'video'; msgType = MessageType.VIDEO; }
    else if (mime.startsWith('audio/')) { mediaType = 'audio'; msgType = MessageType.AUDIO; }

    // Persist file to local uploads so we can preview/download later
    const ext = path.extname(file.originalname) || '';
    const storedName = `${crypto.randomUUID()}${ext}`;
    const absPath = path.join(this.uploadsDir, storedName);
    try {
      if (!fs.existsSync(this.uploadsDir)) {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
      }
      fs.writeFileSync(absPath, file.buffer);
    } catch (err) {
      this.logger.warn(`Failed to persist upload locally: ${(err as Error).message}`);
    }
    const localUrl = `/uploads/${storedName}`;

    const message = this.msgRepo.create({
      conversationId,
      organizationId: orgId,
      senderType: "agent",
      senderId: agentId,
      direction: MessageDirection.OUTBOUND,
      type: msgType,
      content: caption || file.originalname,
      mediaUrl: localUrl,
      mediaMimeType: mime,
      mediaFilename: file.originalname,
      mediaSize: file.size,
      status: MessageStatus.PENDING,
    });
    await this.msgRepo.save(message);

    const mediaConvUpdates: Partial<Conversation> = {
      lastMessageAt: new Date(),
      lastMessagePreview: `📎 ${file.originalname}`,
      lastMessageSenderType: 'agent',
      status: ConversationStatus.OPEN,
    };
    if (!conversation.firstReplyAt && !conversation.isBotActive) {
      mediaConvUpdates.firstReplyAt = new Date();
    }
    await this.convRepo.update(conversationId, mediaConvUpdates);

    try {
      let waMessageId: string;

      if (conversation.channel === ConversationChannel.INSTAGRAM || conversation.channel === ConversationChannel.META_MESSENGER) {
        // IG / FB Messenger — send via URL attachment
        const baseUrl = this.configService.get('APP_BASE_URL', 'https://app.simpulx.com');
        const publicUrl = `${baseUrl}${localUrl}`;
        const metaMediaType = mediaType === 'document' ? 'file' : mediaType;
        const recipientId = conversation.channel === ConversationChannel.INSTAGRAM
          ? conversation.contact.instagramId
          : conversation.contact.facebookId;
        waMessageId = await this.metaMessagingService.sendMediaMessage(
          conversation.metaChannelId,
          recipientId,
          metaMediaType as any,
          publicUrl,
          caption,
        );
      } else {
        // WhatsApp — upload then send by media ID
        const waMediaId = await this.whatsappService.uploadMedia(
          orgId, file.buffer, file.mimetype, file.originalname,
          conversation.whatsappChannelId,
        );
        waMessageId = await this.whatsappService.sendMediaById(
          orgId, conversation.contact.whatsappId, mediaType, waMediaId,
          caption, file.originalname, conversation.whatsappChannelId,
        );
      }

      await this.msgRepo.update(message.id, {
        whatsappMessageId: waMessageId,
        status: MessageStatus.SENT,
        sentAt: new Date(),
      });
      message.whatsappMessageId = waMessageId;
      message.status = MessageStatus.SENT;
    } catch (error) {
      this.logger.error(`❌ Media send failed: ${error.message}`);
      await this.msgRepo.update(message.id, {
        status: MessageStatus.FAILED,
        errorMessage: error.message,
      });
      message.status = MessageStatus.FAILED;
    }

    this.chatGateway.broadcastMessage(orgId, conversationId, message, conversation);
    return message;
  }

  // ── Send Template Message ─────────────────────────────
  async sendTemplate(
    orgId: string,
    conversationId: string,
    agentId: string,
    templateId: string,
    variables?: Record<string, string>,
    userDepartmentId?: string | null,
  ) {
    const conversation = await this.convRepo.findOne({
      where: { id: conversationId, organizationId: orgId },
      relations: ["contact", "whatsappChannel"],
    });
    if (!conversation) throw new NotFoundException("Conversation not found");

    const template = await this.templateRepo.findOne({
      where: { id: templateId, organizationId: orgId },
    });
    if (!template) throw new NotFoundException("Template not found");
    if (template.status !== 'APPROVED') {
      throw new BadRequestException("Only approved templates can be sent");
    }

    // Check department access: if template has departments, agent must be in one
    if (template.departmentIds?.length > 0 && userDepartmentId) {
      if (!template.departmentIds.includes(userDepartmentId)) {
        throw new ForbiddenException("Template not available for your department");
      }
    }

    // Build components with variables
    const components: any[] = [];
    if (variables && Object.keys(variables).length > 0) {
      const bodyVars = Object.entries(variables)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, v]) => ({ type: 'text', text: v }));
      if (bodyVars.length > 0) {
        components.push({ type: 'body', parameters: bodyVars });
      }
    }

    // Build preview text from template body
    let previewText = `[Template: ${template.name}]`;
    const bodyComp = (template.components || []).find((c: any) => c.type === 'BODY');
    if (bodyComp?.text) {
      previewText = bodyComp.text;
      if (variables) {
        for (const [key, val] of Object.entries(variables)) {
          previewText = previewText.replace(`{{${key}}}`, val);
        }
      }
    }

    // Create message record
    const message = this.msgRepo.create({
      conversationId,
      organizationId: orgId,
      senderType: "agent",
      senderId: agentId,
      direction: MessageDirection.OUTBOUND,
      type: MessageType.TEMPLATE,
      content: previewText,
      status: MessageStatus.PENDING,
    });
    await this.msgRepo.save(message);

    // Update conversation
    await this.convRepo.update(conversationId, {
      lastMessageAt: new Date(),
      lastMessagePreview: previewText.substring(0, 150),
      lastMessageSenderType: 'agent',
      status: ConversationStatus.OPEN,
    });

    // Send via WhatsApp API
    try {
      const waMessageId = await this.whatsappService.sendTemplateMessage(
        orgId,
        conversation.contact.whatsappId,
        template.name,
        template.language,
        components.length > 0 ? components : undefined,
        conversation.whatsappChannelId,
      );

      await this.msgRepo.update(message.id, {
        whatsappMessageId: waMessageId,
        status: MessageStatus.SENT,
        sentAt: new Date(),
      });
      message.whatsappMessageId = waMessageId;
      message.status = MessageStatus.SENT;
    } catch (error) {
      await this.msgRepo.update(message.id, {
        status: MessageStatus.FAILED,
        errorMessage: error.message,
      });
      message.status = MessageStatus.FAILED;
    }

    this.chatGateway.broadcastMessage(orgId, conversationId, message, conversation);
    return message;
  }

  // ── Split Conversation (Automation) ────────────────────
  // Creates a new conversation for the same contact and moves
  // the triggering message to it.  Broadcasts everything so
  // the front-end stays in sync.
  async splitConversation(
    orgId: string,
    existingConversationId: string,
    messageId?: string,
  ): Promise<Conversation> {
    const existing = await this.convRepo.findOne({
      where: { id: existingConversationId, organizationId: orgId },
      relations: ['contact'],
    });
    if (!existing) throw new NotFoundException('Conversation not found');

    // 1. Create new conversation
    const newConv = this.convRepo.create({
      organizationId: orgId,
      contactId: existing.contactId,
      channel: existing.channel,
      status: ConversationStatus.OPEN,
      whatsappChannelId: existing.whatsappChannelId || undefined,
    });
    await this.convRepo.save(newConv);

    // 2. Move triggering message to the new conversation
    if (messageId) {
      const movedMsg = await this.msgRepo.findOne({ where: { id: messageId } });
      if (movedMsg) {
        await this.msgRepo.update(messageId, { conversationId: newConv.id });

        // 3. Set new conversation metadata
        await this.convRepo.update(newConv.id, {
          lastMessageAt: movedMsg.createdAt,
          lastMessagePreview:
            movedMsg.content?.substring(0, 150) || `[${movedMsg.type}]`,
          lastMessageSenderType: movedMsg.senderType,
          unreadCount: 1,
        });

        // 4. Fix old conversation metadata
        const prevMsg = await this.msgRepo.findOne({
          where: { conversationId: existingConversationId },
          order: { createdAt: 'DESC' },
        });
        if (prevMsg) {
          await this.convRepo.update(existingConversationId, {
            lastMessageAt: prevMsg.createdAt,
            lastMessagePreview:
              prevMsg.content?.substring(0, 150) || `[${prevMsg.type}]`,
            lastMessageSenderType: prevMsg.senderType,
            unreadCount: () => 'GREATEST(unread_count - 1, 0)',
          });
        } else {
          // No messages left in original conversation — remove it
          await this.convRepo.delete(existingConversationId);
          this.chatGateway.broadcastConversationUpdate(orgId, existingConversationId, {
            deleted: true,
          });
          // Return early — skip the normal old-conv update broadcast below
          const loaded = await this.convRepo.findOne({
            where: { id: newConv.id },
            relations: ['contact'],
          });
          if (loaded) {
            this.chatGateway.broadcastNewConversation(orgId, loaded);
          }
          return loaded || newConv;
        }
      }
    }

    // 5. Reload with contact relation
    const loaded = await this.convRepo.findOne({
      where: { id: newConv.id },
      relations: ['contact'],
    });

    // 6. Broadcast new conversation to frontend
    if (loaded) {
      this.chatGateway.broadcastNewConversation(orgId, loaded);
    }

    // 7. Broadcast old conversation update (message removed, metadata fixed)
    this.chatGateway.broadcastConversationUpdate(orgId, existingConversationId, {
      messageRemoved: messageId,
    });

    return loaded || newConv;
  }

  // ── Process Incoming WhatsApp Message ─────────────────
  async processIncomingMessage(
    orgId: string,
    whatsappId: string,
    messageData: {
      waMessageId: string;
      type: MessageType;
      content: string;
      mediaUrl?: string;
      timestamp: Date;
      phoneNumberId?: string;
      contactName?: string;
      referral?: {
        sourceId?: string;
        sourceType?: string;
        sourceUrl?: string;
        headline?: string;
        body?: string;
        ctwaClid?: string;
      };
      metaChannelId?: string;
      metaPlatform?: string; // 'instagram' | 'messenger'
    },
  ) {
    // ── Determine channel type ───────────────────────────
    const isInstagram = messageData.metaPlatform === 'instagram';
    const isMessenger = messageData.metaPlatform === 'messenger';
    const isMetaDM = isInstagram || isMessenger;

    // ── Detect source channel ────────────────────────────
    const detectedSource = isInstagram
      ? { channel: SourceChannel.INSTAGRAM }
      : isMessenger
      ? { channel: SourceChannel.META_MESSENGER }
      : this._detectSourceChannel(messageData.referral, messageData.content);

    // Find or create contact
    const contactLookup: Record<string, any> = { organizationId: orgId };
    if (isInstagram) {
      contactLookup.instagramId = whatsappId;
    } else if (isMessenger) {
      contactLookup.facebookId = whatsappId;
    } else {
      contactLookup.whatsappId = whatsappId;
    }

    let contact = await this.contactRepo.findOne({ where: contactLookup });

    const isNewContact = !contact;
    if (!contact) {
      const contactCreate: any = {
        organizationId: orgId,
        name: messageData.contactName || whatsappId,
        sourceChannel: detectedSource.channel,
        firstContactedAt: new Date(),
        ...(detectedSource.campaignId && { sourceCampaignId: detectedSource.campaignId }),
        ...(detectedSource.campaignName && { sourceCampaignName: detectedSource.campaignName }),
        ...(detectedSource.metadata && { sourceMetadata: detectedSource.metadata }),
      };
      if (isInstagram) {
        contactCreate.instagramId = whatsappId;
      } else if (isMessenger) {
        contactCreate.facebookId = whatsappId;
      } else {
        contactCreate.whatsappId = whatsappId;
        contactCreate.phone = whatsappId;
      }
      const newContact = this.contactRepo.create(contactCreate);
      const savedContact = await this.contactRepo.save(newContact);
      contact = Array.isArray(savedContact) ? savedContact[0] : savedContact;
    } else if (messageData.contactName && (contact.name === contact.whatsappId || contact.name === contact.phone || contact.name === contact.instagramId || contact.name === contact.facebookId)) {
      contact.name = messageData.contactName;
      contact = await this.contactRepo.save(contact);
    }

    // At this point contact is guaranteed to exist
    const contactRecord = contact!;

    // Update contact last seen
    await this.contactRepo.update(contactRecord.id, { lastSeenAt: new Date() });

    // Look up channel for department linking
    let channel: WhatsappChannel | null = null;
    let metaChannel: MetaChannel | null = null;

    if (isMetaDM && messageData.metaChannelId) {
      metaChannel = await this.metaChannelRepo.findOne({
        where: { id: messageData.metaChannelId, organizationId: orgId },
      });
    } else if (messageData.phoneNumberId) {
      channel = await this.channelRepo.findOne({
        where: {
          organizationId: orgId,
          phoneNumberId: messageData.phoneNumberId,
        },
      });
    }

    // ── Determine conversation channel ──────────────────
    const convChannel = isInstagram
      ? ConversationChannel.INSTAGRAM
      : isMessenger
      ? ConversationChannel.META_MESSENGER
      : ConversationChannel.WHATSAPP;

    // ── Find or Create Conversation (referral-aware) ────
    const referral = messageData.referral;
    const adSetId = referral?.sourceId || null;
    const channelId = channel?.id || null;
    const metaChId = metaChannel?.id || null;
    let conversation: Conversation | null = null;
    let isNewConversation = false;

    const conversationQb = this.convRepo
      .createQueryBuilder("c")
      .where("c.organizationId = :orgId", { orgId })
      .andWhere("c.contactId = :contactId", { contactId: contactRecord.id })
      .andWhere("c.status IN (:...statuses)", { statuses: [ConversationStatus.OPEN, ConversationStatus.PENDING] })
      .andWhere("c.channel = :channel", { channel: convChannel });

    if (channelId) {
      conversationQb.andWhere("c.whatsappChannelId = :channelId", {
        channelId,
      });
    }
    if (metaChId) {
      conversationQb.andWhere("c.metaChannelId = :metaChId", { metaChId });
    }

    if (adSetId) {
      // CTWA message: isolate by contact + ad set ID
      // Order by lastMessageAt DESC so reply goes to most recently active thread
      conversation = await conversationQb
        .andWhere("c.referralAdSetId = :adSetId", { adSetId })
        .orderBy("c.lastMessageAt", "DESC", "NULLS LAST")
        .getOne();
    } else {
      // Organic message: only match the organic (non-CTWA) thread,
      // never land in a CTWA ad-set thread by accident.
      // Order by lastMessageAt DESC so reply routes to the conversation
      // where the last agent interaction happened.
      conversation = await conversationQb
        .andWhere("c.referralAdSetId IS NULL")
        .orderBy("c.lastMessageAt", "DESC", "NULLS LAST")
        .getOne();
    }

    if (!conversation) {
      conversation = this.convRepo.create({
        organizationId: orgId,
        contactId: contactRecord.id,
        channel: convChannel,
        status: ConversationStatus.OPEN,
        whatsappChannelId: channel?.id || undefined,
        metaChannelId: metaChannel?.id || undefined,
        departmentId: channel?.departmentId || metaChannel?.departmentId || undefined,
        sourceChannel: detectedSource.channel,
        crossChannelGroupId: contactRecord.crossChannelGroupId || contactRecord.id,
        ...(referral && {
          referralAdSetId: adSetId || undefined,
          referralCampaignId: referral.ctwaClid || undefined,
          referralSourceUrl: referral.sourceUrl || undefined,
          referralHeadline: referral.headline || undefined,
        }),
      });
      await this.convRepo.save(conversation);
      isNewConversation = true;
    } else if (conversation.status === ConversationStatus.PENDING) {
      // Auto-reopen snoozed conversation on customer reply
      await this.convRepo.update(conversation.id, {
        status: ConversationStatus.OPEN,
        snoozedUntil: null,
      });
      conversation.status = ConversationStatus.OPEN;
      this.chatGateway.broadcastConversationUpdate(orgId, conversation.id, {
        status: ConversationStatus.OPEN,
      });
      this.logger.log(`⏰ Auto-reopened snoozed conversation ${conversation.id} on customer reply`);
    }

    // If inbound has a WA media ID, download & persist to local uploads
    let resolvedMediaUrl = messageData.mediaUrl;
    let resolvedMime: string | undefined;
    let resolvedFilename: string | undefined;
    let resolvedSize: number | undefined;
    if (messageData.mediaUrl && /^\d+$/.test(messageData.mediaUrl)) {
      // WhatsApp media ID — download via Graph API
      try {
        const saved = await this.downloadAndPersistWaMedia(
          orgId,
          messageData.mediaUrl,
          channel?.id ?? null,
        );
        resolvedMediaUrl = saved.url;
        resolvedMime = saved.mimeType;
        resolvedFilename = saved.filename;
        resolvedSize = saved.size;
      } catch (err) {
        this.logger.warn(
          `Failed to download inbound WA media ${messageData.mediaUrl}: ${(err as Error).message}`,
        );
      }
    } else if (isMetaDM && messageData.mediaUrl && messageData.mediaUrl.startsWith('http')) {
      // IG/FB media — direct URL, download and persist locally
      try {
        const saved = await this.downloadAndPersistUrlMedia(
          orgId,
          messageData.mediaUrl,
        );
        resolvedMediaUrl = saved.url;
        resolvedMime = saved.mimeType;
        resolvedFilename = saved.filename;
        resolvedSize = saved.size;
      } catch (err) {
        this.logger.warn(
          `Failed to download IG/FB media ${messageData.mediaUrl}: ${(err as Error).message}`,
        );
      }
    }

    // Create message
    const message = this.msgRepo.create({
      conversationId: conversation.id,
      organizationId: orgId,
      senderType: "contact",
      senderId: contactRecord.id,
      direction: MessageDirection.INBOUND,
      type: messageData.type,
      content: messageData.content,
      mediaUrl: resolvedMediaUrl,
      mediaMimeType: resolvedMime,
      mediaFilename: resolvedFilename,
      mediaSize: resolvedSize,
      whatsappMessageId: messageData.waMessageId,
      status: MessageStatus.DELIVERED,
      deliveredAt: new Date(),
    });
    await this.msgRepo.save(message);

    // Update conversation
    await this.convRepo.update(conversation.id, {
      lastMessageAt: new Date(),
      lastMessagePreview:
        messageData.content?.substring(0, 150) || `[${messageData.type}]`,
      lastMessageSenderType: 'contact',
      unreadCount: () => "unread_count + 1",
    });

    // Broadcast via WebSocket (with conversation context for role-scoped delivery)
    // Skip push notification here — automation hasn't run yet so the conversation
    // may be re-routed to a different agent. Push will be sent AFTER automation.
    this.chatGateway.broadcastMessage(
      orgId,
      conversation.id,
      message,
      conversation,
      contactRecord,
      true, // skipPush: defer until after automation routing
    );

    if (isNewConversation) {
      this.chatGateway.broadcastNewConversation(orgId, conversation);
    }

    // ── Record channel interaction (fire-and-forget) ────
    this.interactionRepo.save(
      this.interactionRepo.create({
        organizationId: orgId,
        contactId: contactRecord.id,
        channel: detectedSource.channel,
        interactionType: isNewConversation
          ? InteractionType.LEAD_CREATED
          : InteractionType.MESSAGE_RECEIVED,
        metadata: {
          conversationId: conversation.id,
          messageId: message.id,
          campaignId: detectedSource.campaignId,
        },
      }),
    ).catch((e) => this.logger.warn(`Failed to log interaction: ${e.message}`));

    return { message, conversation, isNewConversation, contact: contactRecord };
  }

  /**
   * Send push notification for an inbound message AFTER automation routing.
   * Re-reads the conversation from DB to get the correct assignedAgentId/departmentId.
   */
  async sendPushForMessage(
    orgId: string,
    conversationId: string,
    contact: any,
    message: any,
  ) {
    try {
      const conversation = await this.convRepo.findOne({
        where: { id: conversationId, organizationId: orgId },
      });
      if (!conversation) return;

      const contactName = contact?.name || contact?.phone || 'Customer';
      const preview = message.content || `📎 ${message.mediaFilename || 'attachment'}`;
      await this.pushNotificationService.notifyNewMessage(
        orgId,
        conversation,
        contactName,
        preview,
        message.senderId,
      );
    } catch (err) {
      this.logger.error(`Deferred push notification error: ${err.message}`);
    }
  }

  // ── Source Channel Detection ──────────────────────────
  private _detectSourceChannel(
    referral?: {
      sourceId?: string;
      sourceType?: string;
      sourceUrl?: string;
      headline?: string;
      body?: string;
      ctwaClid?: string;
    },
    content?: string,
  ): {
    channel: SourceChannel;
    campaignId?: string;
    campaignName?: string;
    metadata?: Record<string, any>;
  } {
    // Meta CTWA ads → referral object present
    if (referral) {
      if (referral.sourceType === 'ad') {
        return {
          channel: SourceChannel.META_ADS,
          campaignId: referral.sourceId,
          campaignName: referral.headline,
          metadata: referral,
        };
      }
      // Organic Facebook/Instagram post click
      return {
        channel: SourceChannel.META_ORGANIC,
        metadata: referral,
      };
    }

    // Pre-filled message patterns (TikTok / Google Ads)
    if (content) {
      const tkMatch = content.match(/^TK-(\S+)/i);
      if (tkMatch) {
        return {
          channel: SourceChannel.TIKTOK_ADS,
          campaignId: tkMatch[1],
        };
      }
      const gaMatch = content.match(/^GA-(\S+)/i);
      if (gaMatch) {
        return {
          channel: SourceChannel.GOOGLE_ADS,
          campaignId: gaMatch[1],
        };
      }
    }

    return { channel: SourceChannel.WHATSAPP_DIRECT };
  }

  // ── Assign Agent to Conversation ──────────────────────
  async assignAgent(
    orgId: string,
    conversationId: string,
    assignment: { agentId?: string | null; departmentId?: string | null },
    currentUser: { id: string; role: string },
  ) {
    const eligibleRoles = [
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.SUPERVISOR,
    ];

    if (!eligibleRoles.includes(currentUser.role as UserRole)) {
      throw new ForbiddenException(
        "Only eligible users can assign conversations",
      );
    }

    const conversation = await this.convRepo.findOne({
      where: { id: conversationId, organizationId: orgId },
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const hasAgent = assignment.agentId !== undefined;
    const hasDepartment = assignment.departmentId !== undefined;
    if (!hasAgent && !hasDepartment) {
      throw new BadRequestException("agentId or departmentId is required");
    }

    const updates: Partial<Conversation> = {};

    if (hasAgent) {
      if (assignment.agentId) {
        const agent = await this.userRepo.findOne({
          where: { id: assignment.agentId, organizationId: orgId },
        });

        if (!agent) {
          throw new NotFoundException("Agent not found");
        }

        if (
          ![UserRole.AGENT, UserRole.SUPERVISOR, UserRole.MANAGER].includes(
            agent.role,
          )
        ) {
          throw new BadRequestException(
            "Conversation can only be assigned to a team member",
          );
        }
      }

      updates.assignedAgentId = (assignment.agentId || null) as any;
    }

    if (hasDepartment) {
      if (assignment.departmentId) {
        const department = await this.departmentRepo.findOne({
          where: {
            id: assignment.departmentId,
            organizationId: orgId,
            isActive: true,
          },
        });

        if (!department) {
          throw new NotFoundException("Department not found");
        }
      }

      updates.departmentId = (assignment.departmentId || null) as any;
    }

    await this.convRepo.update(
      { id: conversationId, organizationId: orgId },
      updates,
    );

    // Insert a system timeline message so the UI shows who assigned whom
    const parts: string[] = [];
    const assignerLabel = currentUser.id === 'automation' ? '@bot' : '@agent';

    if (hasAgent && assignment.agentId) {
      const agent = await this.userRepo.findOne({
        where: { id: assignment.agentId },
        select: ['id', 'fullName'],
      });
      parts.push(`assigned this contact to **${agent?.fullName || 'a team member'}**`);
    } else if (hasAgent && !assignment.agentId) {
      parts.push('unassigned this contact');
    }

    if (hasDepartment && assignment.departmentId) {
      const dept = await this.departmentRepo.findOne({
        where: { id: assignment.departmentId },
        select: ['id', 'name'],
      });
      parts.push(`moved to **${dept?.name || 'a department'}**`);
    }

    // Re-fetch conversation AFTER assignment update so broadcasts target the
    // correct rooms (new agent/department, not the stale pre-update state).
    const updatedConversation = await this.convRepo.findOne({
      where: { id: conversationId, organizationId: orgId },
    });

    if (parts.length) {
      const sysMsg = this.msgRepo.create({
        organizationId: orgId,
        conversationId,
        direction: MessageDirection.OUTBOUND,
        senderType: 'system',
        type: MessageType.TEXT,
        content: `${assignerLabel} ${parts.join(' and ')}`,
        status: MessageStatus.DELIVERED,
        deliveredAt: new Date(),
      });
      await this.msgRepo.save(sysMsg);

      this.chatGateway.broadcastMessage(orgId, conversationId, sysMsg, updatedConversation || conversation);
    }

    this.chatGateway.broadcastConversationUpdate(
      orgId,
      conversationId,
      updates,
    );

    return { success: true };
  }

  // ── Mark as Read ──────────────────────────────────────
  async markAsRead(orgId: string, conversationId: string) {
    await this.convRepo.update(
      { id: conversationId, organizationId: orgId },
      { unreadCount: 0 },
    );
    return { success: true };
  }

  // ── Update Conversation Status ────────────────────────
  async updateStatus(
    orgId: string,
    conversationId: string,
    status: ConversationStatus,
    stageId?: string,
    snoozedUntil?: Date,
  ) {
    // Mandatory stage on close
    if (status === ConversationStatus.CLOSED && !stageId) {
      throw new BadRequestException('Stage is required when closing a conversation');
    }

    let finalStatus = status;
    const updates: Partial<Conversation> = {};

    if (status === ConversationStatus.CLOSED) {
      updates.closedAt = new Date();
      updates.stageId = stageId;

      // If stage is in "lost" category but named like a follow-up, set status to pending instead
      if (stageId) {
        const stage = await this.stageRepo.findOne({ where: { id: stageId } });
        if (stage && stage.name.toLowerCase().includes('follow-up needed')) {
          finalStatus = ConversationStatus.PENDING;
          delete updates.closedAt;
        }
      }
      // Clear any snooze when closing
      updates.snoozedUntil = null;
    } else if (status === ConversationStatus.PENDING && snoozedUntil) {
      // Snooze: set pending + snoozedUntil
      updates.snoozedUntil = snoozedUntil;
    } else if (status === ConversationStatus.OPEN) {
      // Reopening: clear snooze
      updates.snoozedUntil = null;
    }

    updates.status = finalStatus;

    await this.convRepo.update(
      { id: conversationId, organizationId: orgId },
      updates,
    );

    this.chatGateway.broadcastConversationUpdate(orgId, conversationId, {
      status: finalStatus,
    });

    return { success: true, status: finalStatus };
  }

  // ── Snooze Cron: auto-reopen expired snoozed conversations ──
  async reopenExpiredSnoozes() {
    const now = new Date();
    const expired = await this.convRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: ConversationStatus.PENDING })
      .andWhere('c.snoozedUntil IS NOT NULL')
      .andWhere('c.snoozedUntil <= :now', { now })
      .getMany();

    for (const conv of expired) {
      await this.convRepo.update(conv.id, {
        status: ConversationStatus.OPEN,
        snoozedUntil: null,
      });
      this.chatGateway.broadcastConversationUpdate(
        conv.organizationId,
        conv.id,
        { status: ConversationStatus.OPEN },
      );

      // Send push notification to assigned agent (or all agents)
      try {
        const fullConv = await this.convRepo.findOne({
          where: { id: conv.id },
          relations: ['contact'],
        });
        if (fullConv) {
          const contactName = fullConv.contact?.name || fullConv.contact?.whatsappId || 'A contact';
          this.pushNotificationService.notifyNewMessage(
            conv.organizationId,
            fullConv,
            '⏰ Snooze Expired',
            `${contactName} — conversation is back to open`,
          ).catch(() => {});
        }
      } catch (_) {}

      this.logger.log(`⏰ Auto-reopened snoozed conversation ${conv.id}`);
    }

    return { reopened: expired.length };
  }

  // ── Update Conversation Field (stage, interest level) ──
  async updateConversationField(
    orgId: string,
    conversationId: string,
    updates: Partial<Conversation>,
  ) {
    await this.convRepo.update(
      { id: conversationId, organizationId: orgId },
      updates,
    );

    this.chatGateway.broadcastConversationUpdate(orgId, conversationId, updates);

    return { success: true };
  }

  // ── Internal Notes ────────────────────────────────────
  async getInternalNotes(orgId: string, conversationId: string) {
    return this.noteRepo.find({
      where: { conversationId, organizationId: orgId },
      order: { createdAt: 'DESC' },
    });
  }

  async addInternalNote(
    orgId: string,
    conversationId: string,
    agentId: string,
    agentName: string,
    content: string,
  ) {
    const note = this.noteRepo.create({
      conversationId,
      organizationId: orgId,
      agentId,
      agentName,
      content: content.trim(),
    });
    return this.noteRepo.save(note);
  }

  async deleteInternalNote(orgId: string, noteId: string) {
    await this.noteRepo.delete({ id: noteId, organizationId: orgId });
    return { success: true };
  }

  // ── Agent Action Tracking ────────────────────────────
  async trackAgentAction(
    orgId: string,
    conversationId: string,
    agentId: string,
    actionType: string,
    metadata?: Record<string, any>,
  ) {
    // Get conversation to find contactId
    const conversation = await this.convRepo.findOne({
      where: { id: conversationId, organizationId: orgId },
    });
    if (!conversation) return { success: false };

    const interaction = this.interactionRepo.create({
      organizationId: orgId,
      contactId: conversation.contactId,
      channel: conversation.sourceChannel || SourceChannel.WHATSAPP_DIRECT,
      interactionType: InteractionType.NOTE_ADDED,
      metadata: { actionType, agentId, conversationId, ...metadata },
    });
    return this.interactionRepo.save(interaction);
  }
}
