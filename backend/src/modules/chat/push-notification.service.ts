// ============================================================
// Push Notification Service — Firebase Cloud Messaging
// ============================================================
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, IsNull } from 'typeorm';
import { User } from '../../common/entities/user.entity';
import { Conversation } from '../../common/entities/conversation.entity';
import * as admin from 'firebase-admin';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private initialized = false;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    this.initFirebase();
  }

  private initFirebase() {
    try {
      if (admin.apps.length === 0) {
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (serviceAccountPath) {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const serviceAccount = require(serviceAccountPath);
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
          this.initialized = true;
          this.logger.log('Firebase Admin initialized');
        } else {
          this.logger.warn(
            'FIREBASE_SERVICE_ACCOUNT env not set — push notifications disabled',
          );
        }
      } else {
        this.initialized = true;
      }
    } catch (err) {
      this.logger.error(`Firebase init error: ${err.message}`);
    }
  }

  /**
   * Send push notification to agents who should receive messages for a conversation.
   * Targets: assigned agent, supervisor, department agents with FCM tokens.
   */
  async notifyNewMessage(
    orgId: string,
    conversation: Conversation,
    senderName: string,
    messagePreview: string,
    senderId?: string,
  ) {
    if (!this.initialized) return;

    try {
      // Build list of target user IDs
      const targetUserIds: string[] = [];

      // 1. Assigned agent
      if (conversation.assignedAgentId) {
        targetUserIds.push(conversation.assignedAgentId);
      }

      // 2. If no agent assigned, notify all active agents in the department
      if (!conversation.assignedAgentId && conversation.departmentId) {
        const deptAgents = await this.userRepo.find({
          where: {
            organizationId: orgId,
            departmentId: conversation.departmentId,
            fcmToken: Not(IsNull()),
          },
          select: ['id'],
        });
        targetUserIds.push(...deptAgents.map((a) => a.id));
      }

      // 3. If unassigned and no department, notify all agents in org with tokens
      if (!conversation.assignedAgentId && !conversation.departmentId) {
        const allAgents = await this.userRepo.find({
          where: {
            organizationId: orgId,
            fcmToken: Not(IsNull()),
          },
          select: ['id'],
        });
        targetUserIds.push(...allAgents.map((a) => a.id));
      }

      // Remove the sender from notification targets
      const uniqueIds = [...new Set(targetUserIds)].filter(
        (id) => id !== senderId,
      );
      if (uniqueIds.length === 0) return;

      // Fetch users with FCM tokens
      const users = await this.userRepo.find({
        where: { id: In(uniqueIds), fcmToken: Not(IsNull()) },
        select: ['id', 'fcmToken'],
      });

      const tokens = users
        .map((u) => u.fcmToken)
        .filter((t): t is string => !!t);
      if (tokens.length === 0) return;

      // Send via FCM — data-only message to avoid double notifications
      // (notification field causes Android to auto-display + our handler also shows one)
      const message: admin.messaging.MulticastMessage = {
        tokens,
        data: {
          conversationId: conversation.id,
          contactName: senderName,
          title: senderName,
          body: messagePreview,
          type: 'new_message',
        },
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: senderName,
                body: messagePreview,
              },
              badge: 1,
              sound: 'default',
              'interruption-level': 'time-sensitive',
              'content-available': 1,
            },
          },
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert',
          },
        },
      };

      const result = await admin.messaging().sendEachForMulticast(message);
      if (result.failureCount > 0) {
        // Clean up invalid tokens
        const invalidTokens: string[] = [];
        result.responses.forEach((resp, idx) => {
          if (
            !resp.success &&
            resp.error?.code &&
            [
              'messaging/invalid-registration-token',
              'messaging/registration-token-not-registered',
            ].includes(resp.error.code)
          ) {
            invalidTokens.push(tokens[idx]);
          }
        });
        if (invalidTokens.length > 0) {
          await this.userRepo
            .createQueryBuilder()
            .update()
            .set({ fcmToken: null, fcmPlatform: null })
            .where('fcm_token IN (:...tokens)', { tokens: invalidTokens })
            .execute();
          this.logger.log(
            `Cleaned ${invalidTokens.length} invalid FCM tokens`,
          );
        }
      }

      this.logger.debug(
        `Push sent to ${result.successCount}/${tokens.length} devices`,
      );
    } catch (err) {
      this.logger.error(`Push notification error: ${err.message}`);
    }
  }

  /**
   * Send push notification for follow-up reminder to the assigned agent.
   */
  async notifyFollowUpDue(
    agentId: string,
    followUp: { id: string; conversationId: string; note?: string | null; scheduledAt: Date },
    contactName?: string,
  ) {
    if (!this.initialized) {
      this.logger.warn('Firebase not initialized — skipping follow-up push');
      return;
    }

    try {
      const user = await this.userRepo.findOne({
        where: { id: agentId },
        select: ['id', 'fcmToken'],
      });
      if (!user?.fcmToken) {
        this.logger.warn(`No FCM token for agent ${agentId} — skipping follow-up push`);
        return;
      }

      const scheduledTime = new Date(followUp.scheduledAt);
      const timeStr = scheduledTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const dateStr = scheduledTime.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
      });

      const title = '⏰ Follow-up Reminder';
      const body = contactName
        ? `Follow-up with ${contactName} scheduled at ${timeStr}, ${dateStr}${followUp.note ? ` — ${followUp.note}` : ''}`
        : `Follow-up scheduled at ${timeStr}, ${dateStr}${followUp.note ? ` — ${followUp.note}` : ''}`;

      const message: admin.messaging.Message = {
        token: user.fcmToken,
        data: {
          conversationId: followUp.conversationId,
          title,
          body,
          type: 'follow_up_reminder',
        },
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              alert: { title, body },
              badge: 1,
              sound: 'default',
              'interruption-level': 'time-sensitive',
              'content-available': 1,
            },
          },
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert',
          },
        },
      };

      await admin.messaging().send(message);
      this.logger.debug(`Follow-up push sent to agent ${agentId}`);
    } catch (err) {
      this.logger.error(`Follow-up push error: ${err.message}`);
    }
  }
}
