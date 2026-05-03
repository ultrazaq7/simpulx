// ============================================================
// Chat WebSocket Gateway — Real-time Messaging
// Supports horizontal scaling via Redis adapter (PM2 cluster)
// ============================================================
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { User, UserRole } from '../../common/entities/user.entity';
import { Conversation } from '../../common/entities/conversation.entity';
import { PushNotificationService } from './push-notification.service';

// Redis key for storing connected user data across all PM2 instances
const REDIS_CONNECTED_USERS_KEY = 'simpulx:ws:connected_users';

interface ConnectedUserData {
  socketId: string;
  orgId: string;
  userId: string;
  role: string;
  departmentId: string | null;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  namespace: '/chat',
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger('ChatGateway');
  private redisClient: Redis;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
    private pushService: PushNotificationService,
  ) {}

  afterInit() {
    // Create Redis client for connected users tracking (shared across instances)
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD', '');

    const redisOpts: any = { host: redisHost, port: redisPort };
    if (redisPassword) redisOpts.password = redisPassword;

    this.redisClient = new Redis(redisOpts);

    this.logger.log(`💬 Chat WebSocket Gateway initialized (pid: ${process.pid}, Redis adapter enabled)`);
  }

  // ── Redis-backed connected users ──────────────────────
  private async setConnectedUser(socketId: string, data: ConnectedUserData): Promise<void> {
    await this.redisClient.hset(REDIS_CONNECTED_USERS_KEY, socketId, JSON.stringify(data));
  }

  private async getConnectedUser(socketId: string): Promise<ConnectedUserData | null> {
    const raw = await this.redisClient.hget(REDIS_CONNECTED_USERS_KEY, socketId);
    return raw ? JSON.parse(raw) : null;
  }

  private async removeConnectedUser(socketId: string): Promise<void> {
    await this.redisClient.hdel(REDIS_CONNECTED_USERS_KEY, socketId);
  }

  // ── Connection Handling ────────────────────────────────
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const orgId = payload.orgId;
      const userId = payload.sub;

      // Look up user for role and department info
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) {
        client.disconnect();
        return;
      }

      // Store connection in Redis (shared across all PM2 instances)
      await this.setConnectedUser(client.id, {
        socketId: client.id,
        orgId,
        userId,
        role: user.role,
        departmentId: user.departmentId || null,
      });

      // Join rooms
      client.join(`org:${orgId}`);
      client.join(`user:${userId}`);

      // Admin/Owner join a special room for org-wide broadcasts
      if (user.role === UserRole.OWNER || user.role === UserRole.ADMIN) {
        client.join(`org:${orgId}:admin`);
      }

      if (user.role === UserRole.MANAGER || user.role === UserRole.SUPERVISOR) {
        client.join(`org:${orgId}:assigners`);
      }

      // Join department room if user has a department
      if (user.departmentId) {
        client.join(`dept:${user.departmentId}`);
      }

      this.logger.log(`✅ Agent ${userId} connected (org: ${orgId}, role: ${user.role}, pid: ${process.pid})`);

      // Notify others this agent is online
      this.server.to(`org:${orgId}`).emit('agent:online', { userId });
    } catch (error) {
      this.logger.error(`❌ Connection rejected: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userData = await this.getConnectedUser(client.id);
    if (userData) {
      this.server.to(`org:${userData.orgId}`).emit('agent:offline', {
        userId: userData.userId,
      });
      await this.removeConnectedUser(client.id);
      this.logger.log(`🔌 Agent ${userData.userId} disconnected (pid: ${process.pid})`);
    }
  }

  // ── Socket Event Handlers ─────────────────────────────
  @SubscribeMessage('conversation:join')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.join(`conversation:${data.conversationId}`);
    this.logger.debug(`Agent joined conversation ${data.conversationId}`);
  }

  @SubscribeMessage('conversation:leave')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userData = await this.getConnectedUser(client.id);
    if (userData) {
      client.to(`conversation:${data.conversationId}`).emit('typing:start', {
        userId: userData.userId,
        conversationId: data.conversationId,
      });
    }
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userData = await this.getConnectedUser(client.id);
    if (userData) {
      client.to(`conversation:${data.conversationId}`).emit('typing:stop', {
        userId: userData.userId,
        conversationId: data.conversationId,
      });
    }
  }

  // ── Broadcast Methods (called from ChatService) ───────

  // Determine which rooms should receive a conversation event
  private async getTargetRooms(orgId: string, conversation: any): Promise<string[]> {
    const rooms: string[] = [];

    // Admins/Owners always see everything
    rooms.push(`org:${orgId}:admin`);

    // Channel-only conversations are deliberately not assigned to a
    // department/agent by default, so managers/supervisors need a queue signal.
    if (!conversation.assignedAgentId && !conversation.departmentId) {
      rooms.push(`org:${orgId}:assigners`);
    }

    // If assigned to an agent, notify that agent
    if (conversation.assignedAgentId) {
      rooms.push(`user:${conversation.assignedAgentId}`);

      // Also notify the agent's supervisor (if any)
      const agent = await this.userRepo.findOne({
        where: { id: conversation.assignedAgentId },
        select: ['id', 'supervisorId'],
      });
      if (agent?.supervisorId) {
        rooms.push(`user:${agent.supervisorId}`);
      }
    }

    // If conversation belongs to a department, notify the department room
    // (supervisors/managers in that department will receive it)
    if (conversation.departmentId) {
      rooms.push(`dept:${conversation.departmentId}`);
    }

    return [...new Set(rooms)]; // deduplicate
  }

  async broadcastMessage(orgId: string, conversationId: string, message: any, conversation?: any, contact?: any, skipPush = false) {
    let targetRooms: string[];

    if (conversation) {
      targetRooms = await this.getTargetRooms(orgId, conversation);
    } else {
      // Fallback: look up the conversation to determine proper rooms
      const conv = await this.convRepo.findOne({ where: { id: conversationId } });
      if (conv) {
        targetRooms = await this.getTargetRooms(orgId, conv);
      } else {
        // Last resort: only admin room (never broadcast to all agents)
        targetRooms = [`org:${orgId}:admin`];
      }
    }

    const payload: any = { conversationId, message };
    // Include assignedAgentId so frontend can target popup notifications
    if (conversation?.assignedAgentId) {
      payload.assignedAgentId = conversation.assignedAgentId;
    }
    if (contact) {
      payload.contact = { id: contact.id, name: contact.name, phone: contact.phone, whatsappId: contact.whatsappId };
    }

    for (const room of targetRooms) {
      this.server.to(room).emit('message:new', payload);
    }

    // Always send to agents watching this specific conversation
    this.server.to(`conversation:${conversationId}`).emit('conversation:message', payload);

    // Send push notification for inbound messages (from customers)
    // When skipPush is true, the caller will send push after automation routing
    if (!skipPush && conversation && message.direction === 'inbound') {
      const contactName = contact?.name || contact?.phone || 'Customer';
      const preview = message.content || `📎 ${message.mediaFilename || 'attachment'}`;
      this.pushService.notifyNewMessage(
        orgId,
        conversation,
        contactName,
        preview,
        message.senderId,
      ).catch((err) => this.logger.error(`Push error: ${err.message}`));
    }
  }

  async broadcastNewConversation(orgId: string, conversation: any) {
    const targetRooms = await this.getTargetRooms(orgId, conversation);
    for (const room of targetRooms) {
      this.server.to(room).emit('conversation:new', { conversation });
    }
  }

  async broadcastConversationUpdate(orgId: string, conversationId: string, updates: any) {
    // Look up conversation to determine who should receive the update
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (conv) {
      const targetRooms = await this.getTargetRooms(orgId, conv);
      for (const room of targetRooms) {
        this.server.to(room).emit('conversation:updated', {
          conversationId,
          updates,
        });
      }
    } else {
      // Fallback: admin only
      this.server.to(`org:${orgId}:admin`).emit('conversation:updated', {
        conversationId,
        updates,
      });
    }
  }
}
