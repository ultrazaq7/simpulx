// ============================================================
// Automation Service — Rule-based Engine
// ============================================================
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository, IsNull } from 'typeorm';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  AutomationRule,
  AutomationTrigger,
  AutomationAction,
} from '../../common/entities/automation-rule.entity';
import { Conversation } from '../../common/entities/conversation.entity';
import { Contact } from '../../common/entities/contact.entity';
import { Department } from '../../common/entities/department.entity';
import { User, UserStatus } from '../../common/entities/user.entity';
import { ChatService } from '../chat/chat.service';
import { WhatsappService } from '../webhook/whatsapp.service';
import { GoogleSheetsService } from './google-sheets.service';
import { AUTOMATION_QUEUE } from '../webhook/message-queue.service';

@Injectable()
export class AutomationService {
  private logger = new Logger('AutomationService');

  constructor(
    @InjectRepository(AutomationRule) private ruleRepo: Repository<AutomationRule>,
    @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
    @InjectRepository(Contact) private contactRepo: Repository<Contact>,
    @InjectRepository(Department) private deptRepo: Repository<Department>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private chatService: ChatService,
    private whatsappService: WhatsappService,
    private googleSheetsService: GoogleSheetsService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────
  async createRule(orgId: string, data: Partial<AutomationRule>) {
    const rule = this.ruleRepo.create({ ...data, organizationId: orgId });
    return this.ruleRepo.save(rule);
  }

  async getRules(orgId: string) {
    return this.ruleRepo.find({
      where: { organizationId: orgId },
      order: { priorityOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  async getRule(orgId: string, ruleId: string) {
    const rule = await this.ruleRepo.findOne({
      where: { id: ruleId, organizationId: orgId },
    });
    if (!rule) {
      throw new NotFoundException('Rule not found');
    }
    return rule;
  }

  async updateRule(orgId: string, ruleId: string, updates: Partial<AutomationRule>) {
    await this.ruleRepo.update({ id: ruleId, organizationId: orgId }, updates);
    return this.ruleRepo.findOne({ where: { id: ruleId } });
  }

  async deleteRule(orgId: string, ruleId: string) {
    await this.ruleRepo.delete({ id: ruleId, organizationId: orgId });
    return { success: true };
  }

  // ── Evaluate Rules ────────────────────────────────────
  async evaluateRules(data: {
    orgId: string;
    triggerType: string;
    conversationId: string;
    messageId?: string;
    contactId?: string;
    metadata?: Record<string, any>;
  }) {
    // Build list of trigger types to evaluate.
    // Any incoming message (new_message / new_conversation) should evaluate
    // keyword_match rules as well as both new_message and new_conversation rules.
    const triggerTypes: AutomationTrigger[] = [data.triggerType as AutomationTrigger];
    if (
      [AutomationTrigger.NEW_MESSAGE, AutomationTrigger.NEW_CONVERSATION].includes(
        data.triggerType as AutomationTrigger,
      )
    ) {
      if (!triggerTypes.includes(AutomationTrigger.KEYWORD_MATCH)) triggerTypes.push(AutomationTrigger.KEYWORD_MATCH);
      if (!triggerTypes.includes(AutomationTrigger.NEW_MESSAGE)) triggerTypes.push(AutomationTrigger.NEW_MESSAGE);
      if (!triggerTypes.includes(AutomationTrigger.NEW_CONVERSATION)) triggerTypes.push(AutomationTrigger.NEW_CONVERSATION);
      if (data.metadata?.sourceId && data.metadata?.sourceType === 'ad') {
        triggerTypes.push(AutomationTrigger.AD_CLICK);
      }
    }

    const rules = await this.ruleRepo.find({
      where: {
        organizationId: data.orgId,
        triggerType: In(triggerTypes),
        isActive: true,
      },
      order: { priorityOrder: 'ASC' },
    });

    if (!rules.length) return;

    const conversation = await this.convRepo.findOne({
      where: { id: data.conversationId },
      relations: ['contact'],
    });

    if (!conversation) return;

    // Track whether an agent was already assigned in this evaluation pass
    // so that the second matching rule doesn't overwrite the first assignment.
    let alreadyAssigned = false;

    for (const rule of rules) {
      const flowNodes = rule.triggerConditions?.flowNodes;
      const flowEdges = rule.triggerConditions?.flowEdges;

      // ── Flow-based evaluation ──
      // When flowNodes exist, the flow builder is the source of truth.
      // Walk the graph: find matching trigger nodes, then execute connected actions.
      if (flowNodes?.length && flowEdges?.length) {
        const result = await this.evaluateFlowNodes(
          flowNodes, flowEdges, conversation, data, alreadyAssigned,
        );
        if (result.executed) {
          this.logger.log(`🤖 Flow rule matched: "${rule.name}" for conversation ${data.conversationId}`);
          alreadyAssigned = result.alreadyAssigned;
          await this.ruleRepo.update(rule.id, {
            executionCount: () => 'execution_count + 1',
            lastExecutedAt: new Date(),
          });
        }
        continue;
      }

      // ── Legacy evaluation (rules without flow nodes) ──
      const matched = await this.matchConditions(rule, conversation, data);
      if (matched) {
        this.logger.log(`🤖 Rule matched: "${rule.name}" for conversation ${data.conversationId}`);
        alreadyAssigned = await this.executeActions(rule, conversation, data, alreadyAssigned);

        // Update execution stats
        await this.ruleRepo.update(rule.id, {
          executionCount: () => 'execution_count + 1',
          lastExecutedAt: new Date(),
        });
      }
    }
  }

  // ── Match Conditions ──────────────────────────────────
  private async matchConditions(
    rule: AutomationRule,
    conversation: Conversation,
    context: any,
  ): Promise<boolean> {
    const conditions = rule.triggerConditions;

    // Keyword match
    if (conditions.keywords?.length) {
      const content = (context.metadata?.content || '').toLowerCase();
      const matched = conditions.keywords.some((kw: string) =>
        content.includes(kw.toLowerCase()),
      );
      if (!matched) return false;
    }

    // CTWA / ad click filters. Use exact unique IDs, not message text.
    if (rule.triggerType === AutomationTrigger.AD_CLICK) {
      const sourceId = context.metadata?.sourceId || context.metadata?.referral?.sourceId;
      if (!sourceId) return false;
      if (conditions.sourceIds?.length && !conditions.sourceIds.includes(sourceId)) {
        return false;
      }
      if (conditions.sourceId && conditions.sourceId !== sourceId) {
        return false;
      }
      const sourceType = context.metadata?.sourceType || context.metadata?.referral?.sourceType;
      if (conditions.sourceType && conditions.sourceType !== sourceType) {
        return false;
      }
    }

    // Channel filter (supports both 'channel' and 'channelId' condition keys)
    if (conditions.channelId && conversation.whatsappChannelId !== conditions.channelId) {
      return false;
    }
    if (conditions.channel && conversation.channel !== conditions.channel) {
      return false;
    }

    // Contact tag filter
    if (conditions.contactTags?.length && conversation.contact) {
      const hasTag = conditions.contactTags.some((tag: string) =>
        conversation.contact.tags.includes(tag),
      );
      if (!hasTag) return false;
    }

    // Office hours check
    if (conditions.officeHours) {
      const now = new Date();
      const hour = now.getHours();
      const isOfficeHours = hour >= (conditions.officeHoursStart || 9) 
        && hour < (conditions.officeHoursEnd || 17);
      
      if (rule.triggerType === AutomationTrigger.OFFICE_HOURS && !isOfficeHours) return false;
      if (rule.triggerType === AutomationTrigger.AFTER_HOURS && isOfficeHours) return false;
    }

    return true;
  }

  // ── Execute Actions ───────────────────────────────────
  private async executeActions(
    rule: AutomationRule,
    conversation: Conversation,
    context: any,
    alreadyAssigned: boolean,
  ): Promise<boolean> {
    for (const action of rule.actions) {
      try {
        switch (action.actionType) {
          case AutomationAction.ASSIGN_AGENT:
            if (!alreadyAssigned) {
              await this.chatService.assignAgent(
                context.orgId,
                conversation.id,
                {
                  agentId: action.params.agentId,
                  departmentId: action.params.departmentId,
                },
                { id: 'automation', role: 'owner' },
              );
              alreadyAssigned = true;
            } else {
              this.logger.log(
                `⏭️ Skipping ASSIGN_AGENT in rule "${rule.name}" — already assigned by prior rule`,
              );
            }
            break;

          case AutomationAction.SEND_MESSAGE:
            // Skip if message is empty
            if (action.params.message?.trim()) {
              // Insert system message directly to avoid UUID validation
              const { Message } = require('../../common/entities/message.entity');
              const msgRepo = this.convRepo.manager.getRepository(Message);
              const sysMsg = msgRepo.create({
                organizationId: context.orgId,
                conversationId: conversation.id,
                senderType: 'bot',
                direction: 'outbound',
                type: 'text',
                content: action.params.message,
                status: 'sent',
                sentAt: new Date(),
              });
              await msgRepo.save(sysMsg);
            }
            break;

          case AutomationAction.SEND_TEMPLATE:
            if (conversation.contact?.whatsappId) {
              await this.whatsappService.sendTemplateMessage(
                context.orgId,
                conversation.contact.whatsappId,
                action.params.templateName,
                action.params.languageCode || 'en',
                action.params.components,
                conversation.whatsappChannelId,
              );
            }
            break;

          case AutomationAction.ADD_TAG:
            if (context.contactId) {
              const contact = await this.contactRepo.findOne({
                where: { id: context.contactId },
              });
              if (contact) {
                const newTags = [...new Set([...contact.tags, ...action.params.tags])];
                await this.contactRepo.update(contact.id, { tags: newTags });
              }
            }
            break;

          case AutomationAction.REMOVE_TAG:
            if (context.contactId) {
              const contact = await this.contactRepo.findOne({
                where: { id: context.contactId },
              });
              if (contact) {
                const newTags = contact.tags.filter(
                  (t) => !action.params.tags.includes(t),
                );
                await this.contactRepo.update(contact.id, { tags: newTags });
              }
            }
            break;

          case AutomationAction.SET_PRIORITY:
            break;

          case AutomationAction.CLOSE_CONVERSATION:
            await this.chatService.closeConversationBySystem(
              context.orgId,
              conversation.id,
              action.params?.reason || 'automation_closed',
            );
            break;

          default:
            this.logger.warn(`Unknown action: ${action.actionType}`);
        }
      } catch (error) {
        this.logger.error(
          `❌ Action "${action.actionType}" failed for rule "${rule.name}": ${error.message}`,
        );
      }
    }
    return alreadyAssigned;
  }

  // ── Flow Node Evaluation ──────────────────────────────
  // Walks the flow graph: finds trigger nodes whose keywords match,
  // then follows edges to execute connected action nodes in order.
  private async evaluateFlowNodes(
    flowNodes: any[],
    flowEdges: any[],
    conversation: Conversation,
    context: any,
    alreadyAssigned: boolean,
  ): Promise<{ executed: boolean; alreadyAssigned: boolean }> {
    const content = (context.metadata?.content || '').toLowerCase();
    let executed = false;
    // Mutable reference so createConversation can redirect subsequent actions
    let currentConversation = conversation;

    // Build adjacency list from edges
    const adjacency: Record<string, string[]> = {};
    for (const edge of flowEdges) {
      if (!adjacency[edge.sourceNodeId]) adjacency[edge.sourceNodeId] = [];
      adjacency[edge.sourceNodeId].push(edge.targetNodeId);
    }

    // Build id→node map
    const nodeMap: Record<string, any> = {};
    for (const node of flowNodes) {
      nodeMap[node.id] = node;
    }

    // Find trigger nodes that match
    const triggerNodes = flowNodes.filter((n) => n.type === 'trigger');
    for (const trigger of triggerNodes) {
      const config = trigger.config || {};
      const keywords: string[] = config.keywords || [];
      const event = config.event || 'all_messages';

      // Check keyword match
      let matched = false;
      if (event === 'message_text_includes_keywords' && keywords.length) {
        matched = keywords.some((kw: string) => content.includes(kw.toLowerCase()));
      } else if (event === 'ad_click' || event === 'ctwa_referral') {
        const sourceId = context.metadata?.sourceId || context.metadata?.referral?.sourceId;
        const configuredIds: string[] = config.sourceIds || [];
        matched = !!sourceId && (
          configuredIds.length === 0 || configuredIds.includes(sourceId)
        );
      } else if (event === 'all_messages' || event === 'new_conversation') {
        matched = true;
      }

      if (!matched) continue;

      this.logger.log(`🎯 Flow trigger matched: keywords=[${keywords.join(',')}] for content "${content}"`);

      // Walk connected action nodes via BFS
      const queue = adjacency[trigger.id] || [];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const nodeId = queue.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        const node = nodeMap[nodeId];
        if (!node) continue;

        // ── Criteria Router: gate — only continue if conditions pass ──
        if (node.type === 'criteriaRouter') {
          // Look ahead to find what agent this flow branch would assign
          const assignTarget = this.findDownstreamAssignTarget(nodeId, adjacency, nodeMap);
          const enrichedContext = {
            ...context,
            flowTargetAgentId: assignTarget.agentId,
            flowTargetDepartmentId: assignTarget.departmentId,
            flowTargetAssignmentType: assignTarget.assignmentType,
          };
          const passed = await this.evaluateCriteriaRouter(node, currentConversation, enrichedContext);
          if (!passed) {
            this.logger.log(`🚫 Criteria router "${node.id}" blocked — conditions not met`);
            // Don't push children; effectively stops this branch
            continue;
          }
          this.logger.log(`✅ Criteria router "${node.id}" passed`);
          const nextNodes = adjacency[nodeId] || [];
          queue.push(...nextNodes);
          continue;
        }

        try {
          const result = await this.executeFlowAction(node, currentConversation, context, alreadyAssigned);
          if (result.newConversation) {
            currentConversation = result.newConversation;
            // Reset assignment flag for the new conversation
            alreadyAssigned = false;
          }
          if (node.type === 'assignAgent' || node.type === 'assignTeam') {
            alreadyAssigned = true;
          }
          executed = true;
        } catch (error) {
          this.logger.error(`❌ Flow action "${node.type}" failed: ${error.message}`);
        }

        // Continue to next connected nodes
        const nextNodes = adjacency[nodeId] || [];
        queue.push(...nextNodes);
      }
    }

    return { executed, alreadyAssigned };
  }

  // ── Criteria Router Evaluation ────────────────────────
  // Evaluates the criteria router's rule groups against the
  // current conversation / contact / context.
  private async evaluateCriteriaRouter(
    node: any,
    conversation: Conversation,
    context: any,
  ): Promise<boolean> {
    const config = node.config || {};
    const rules: any[] = config.rules || [];

    if (!rules.length) return true; // no rules = pass through

    // All rules must pass (rules are AND-ed at the top level)
    for (const rule of rules) {
      const conditions: any[] = rule.conditions || [];
      const matchMode = rule.match || 'all'; // 'all' = AND, 'any' = OR

      if (!conditions.length) continue;

      const results = await Promise.all(
        conditions.map((cond) => this.evaluateCondition(cond, conversation, context)),
      );

      const passed = matchMode === 'any'
        ? results.some(Boolean)
        : results.every(Boolean);

      if (!passed) return false;
    }

    return true;
  }

  // Evaluate a single condition: { attribute, operator, value }
  private async evaluateCondition(
    condition: { attribute: string; operator: string; value?: string },
    conversation: Conversation,
    context: any,
  ): Promise<boolean> {
    const { attribute, operator, value } = condition;
    const actual = await this.resolveAttribute(attribute, conversation, context);
    this.logger.debug(`🔍 Condition: ${attribute} ${operator} "${value || ''}" → actual="${actual}"`);
    const expected = (value || '').toLowerCase();
    const actualLower = (actual || '').toLowerCase();

    switch (operator) {
      case 'is_not_set':
        return !actual || actual.trim() === '';
      case 'is_set':
        return !!actual && actual.trim() !== '';
      case 'is':
        return actualLower === expected;
      case 'is_not':
        return actualLower !== expected;
      case 'contains':
        return actualLower.includes(expected);
      case 'does_not_contain':
        return !actualLower.includes(expected);
      case 'starts_with':
        return actualLower.startsWith(expected);
      case 'ends_with':
        return actualLower.endsWith(expected);
      case 'matches_regex':
        try { return new RegExp(value || '', 'i').test(actual || ''); }
        catch { return false; }
      case 'greater_than':
        return parseFloat(actual || '0') > parseFloat(value || '0');
      case 'less_than':
        return parseFloat(actual || '0') < parseFloat(value || '0');
      default:
        return false;
    }
  }

  // Resolve an attribute path to a string value
  private async resolveAttribute(
    attribute: string,
    conversation: Conversation,
    context: any,
  ): Promise<string> {
    const contact = conversation.contact;

    switch (attribute) {
      case 'assigned_to.name': {
        this.logger.debug(`🔍 resolveAttribute: assignedAgentId=${conversation.assignedAgentId}`);
        const isRoundRobin = context.flowTargetAssignmentType === 'department_round_robin'
          || context.flowTargetAssignmentType === 'one_by_one_round_robin';
        const targetDeptId = context.flowTargetDepartmentId;

        // ── Department-level check (round robin) ──
        if (isRoundRobin && targetDeptId && conversation.contactId) {
          // Check if contact already has an open conversation in the SAME department
          const existingConv = await this.convRepo.findOne({
            where: {
              contactId: conversation.contactId,
              organizationId: conversation.organizationId,
              departmentId: targetDeptId,
              assignedAgentId: Not(IsNull()),
            },
          });
          if (existingConv) {
            const agent = await this.contactRepo.manager
              .getRepository('User')
              .findOne({ where: { id: existingConv.assignedAgentId }, select: ['id', 'fullName'] });
            this.logger.debug(`🔍 Contact already has conv ${existingConv.id} in dept ${targetDeptId} assigned to ${(agent as any)?.fullName} — blocking`);
            return (agent as any)?.fullName || 'assigned';
          }
          this.logger.debug(`🔍 No existing conv in dept ${targetDeptId} — treating as unassigned`);
          return '';
        }

        // ── Agent-specific check ──
        let agentId = conversation.assignedAgentId;
        if (!agentId && conversation.contactId) {
          const assignedConv = await this.convRepo.findOne({
            where: {
              contactId: conversation.contactId,
              organizationId: conversation.organizationId,
              assignedAgentId: Not(IsNull()),
            },
          });
          if (assignedConv) {
            agentId = assignedConv.assignedAgentId;
            this.logger.debug(`🔍 Found assigned conv ${assignedConv.id} with agentId=${agentId}`);
          }
        }
        if (!agentId) return '';
        if (context.flowTargetAgentId && agentId !== context.flowTargetAgentId) {
          this.logger.debug(`🔍 Assigned to ${agentId} but flow targets ${context.flowTargetAgentId} — treating as unassigned (bypass)`);
          return '';
        }
        const agent = await this.contactRepo.manager
          .getRepository('User')
          .findOne({ where: { id: agentId }, select: ['id', 'fullName'] });
        return (agent as any)?.fullName || '';
      }
      case 'phone_number':
        return contact?.phone || contact?.whatsappId || '';
      case 'full_name':
        return contact?.name || '';
      case 'first_name':
        return (contact?.name || '').split(' ')[0] || '';
      case 'last_name': {
        const parts = (contact?.name || '').split(' ');
        return parts.length > 1 ? parts.slice(1).join(' ') : '';
      }
      case 'email':
        return contact?.email || '';
      case 'company':
        return contact?.metadata?.company || '';
      case 'address':
        return contact?.metadata?.address || '';
      case 'city':
        return contact?.metadata?.city || '';
      case 'tags':
        return (contact?.tags || []).join(', ');
      case 'channel':
        return conversation.channel || '';
      case 'ad.id':
      case 'ad.source_id':
        return context.metadata?.sourceId || context.metadata?.referral?.sourceId || '';
      case 'ad.headline':
        return context.metadata?.headline || context.metadata?.referral?.headline || '';
      case 'ad.ctwa_clid':
        return context.metadata?.ctwaClid || context.metadata?.referral?.ctwaClid || '';
      case 'last_message.text':
        return context.metadata?.content || '';
      default:
        return '';
    }
  }

  // Execute a single flow action node
  // Returns { newConversation } if a createConversation action created a new thread.
  private async executeFlowAction(
    node: any,
    conversation: Conversation,
    context: any,
    alreadyAssigned: boolean,
  ): Promise<{ newConversation?: Conversation }> {
    const config = node.config || {};

    switch (node.type) {
      case 'assignAgent': {
        if (alreadyAssigned) {
          this.logger.log(`⏭️ Flow: Skipping assign — already assigned`);
          return {};
        }
        const assignmentType = config.assignmentType || 'specific_member';

        if (assignmentType === 'specific_member') {
          const assignment: any = {};
          if (config.agentId) assignment.agentId = config.agentId;
          if (config.departmentId) assignment.departmentId = config.departmentId;
          await this.chatService.assignAgent(
            context.orgId,
            conversation.id,
            assignment,
            { id: 'automation', role: 'owner' },
          );
          this.logger.log(`✅ Flow: Assigned agent ${config.agentName || config.agentId}`);
          return {};
        }

        if (assignmentType === 'department_round_robin' || assignmentType === 'one_by_one_round_robin') {
          const selectedAgent = await this.roundRobinPickAgent(config.departmentId, context.orgId);
          if (!selectedAgent) {
            this.logger.warn(`⚠️ Round robin: no eligible agents in department ${config.departmentId}`);
            return {};
          }
          await this.chatService.assignAgent(
            context.orgId,
            conversation.id,
            { agentId: selectedAgent.id, departmentId: config.departmentId },
            { id: 'automation', role: 'owner' },
          );
          this.logger.log(`✅ Flow: Round robin assigned to ${selectedAgent.fullName}`);
          return {};
        }

        if (assignmentType === 'push_department_queue') {
          if (config.departmentId) {
            await this.chatService.assignAgent(
              context.orgId,
              conversation.id,
              { departmentId: config.departmentId },
              { id: 'automation', role: 'owner' },
            );
            this.logger.log(`✅ Flow: Pushed to department queue`);
          }
          return {};
        }

        return {};
      }

      case 'addTag':
        if (context.contactId && config.tags?.length) {
          const contact = await this.contactRepo.findOne({
            where: { id: context.contactId },
          });
          if (contact) {
            const newTags = [...new Set([...contact.tags, ...config.tags])];
            await this.contactRepo.update(contact.id, { tags: newTags });
            this.logger.log(`✅ Flow: Added tags [${config.tags.join(',')}]`);
          }
        }
        return {};

      case 'removeTag':
        if (context.contactId && config.tags?.length) {
          const contact = await this.contactRepo.findOne({
            where: { id: context.contactId },
          });
          if (contact) {
            const newTags = contact.tags.filter(
              (t) => !config.tags.includes(t),
            );
            await this.contactRepo.update(contact.id, { tags: newTags });
          }
        }
        return {};

      case 'sendMessage': {
        const { Message, MessageDirection, MessageStatus, MessageType } = require('../../common/entities/message.entity');
        const msgRepo = this.convRepo.manager.getRepository(Message);

        // Load conversation with contact and channel for WhatsApp sending
        const convForMsg = await this.convRepo.findOne({
          where: { id: conversation.id },
          relations: ['contact', 'whatsappChannel'],
        });

        if (config.messageType === 'template') {
          // ── Template Message ──
          const templateName = config.templateName?.trim();
          const languageCode = config.languageCode || 'en';
          if (!templateName || !convForMsg?.contact?.whatsappId) return {};

          const sysMsg = msgRepo.create({
            organizationId: context.orgId,
            conversationId: conversation.id,
            senderType: 'bot',
            direction: MessageDirection.OUTBOUND,
            type: MessageType.TEMPLATE,
            content: `Template: ${templateName}`,
            status: MessageStatus.PENDING,
          });
          await msgRepo.save(sysMsg);

          await this.convRepo.update(conversation.id, {
            lastMessageAt: new Date(),
            lastMessagePreview: `Template: ${templateName}`,
            lastMessageSenderType: 'bot',
          });

          try {
            const waMessageId = await this.whatsappService.sendTemplateMessage(
              context.orgId,
              convForMsg.contact.whatsappId,
              templateName,
              languageCode,
              undefined,
              convForMsg.whatsappChannelId,
            );
            await msgRepo.update(sysMsg.id, {
              whatsappMessageId: waMessageId,
              status: MessageStatus.SENT,
              sentAt: new Date(),
            });
            this.logger.log(`✅ Flow sendTemplate: ${templateName} sent to ${convForMsg.contact.whatsappId}`);
          } catch (err) {
            await msgRepo.update(sysMsg.id, {
              status: MessageStatus.FAILED,
              errorMessage: err.message,
            });
            this.logger.error(`❌ Flow sendTemplate failed: ${err.message}`);
          }
        } else {
          // ── Text Message ──
          if (!config.message?.trim()) return {};

          const sysMsg = msgRepo.create({
            organizationId: context.orgId,
            conversationId: conversation.id,
            senderType: 'bot',
            direction: MessageDirection.OUTBOUND,
            type: 'text',
            content: config.message,
            status: MessageStatus.PENDING,
          });
          await msgRepo.save(sysMsg);

          await this.convRepo.update(conversation.id, {
            lastMessageAt: new Date(),
            lastMessagePreview: config.message.substring(0, 150),
            lastMessageSenderType: 'bot',
          });

          if (convForMsg?.contact?.whatsappId) {
            try {
              const waMessageId = await this.whatsappService.sendTextMessage(
                context.orgId,
                convForMsg.contact.whatsappId,
                config.message,
                convForMsg.whatsappChannelId,
              );
              await msgRepo.update(sysMsg.id, {
                whatsappMessageId: waMessageId,
                status: MessageStatus.SENT,
                sentAt: new Date(),
              });
              this.logger.log(`✅ Flow sendMessage: sent to ${convForMsg.contact.whatsappId}`);
            } catch (err) {
              await msgRepo.update(sysMsg.id, {
                status: MessageStatus.FAILED,
                errorMessage: err.message,
              });
              this.logger.error(`❌ Flow sendMessage failed: ${err.message}`);
            }
          }
        }
        return {};
      }

      case 'closeConversation':
        await this.chatService.updateStatus(
          context.orgId,
          conversation.id,
          'closed' as any,
        );
        return {};

      case 'createConversation': {
        // Delegate to ChatService which handles:
        // - Creating the new conversation
        // - Moving the triggering message
        // - Updating metadata on both conversations
        // - Broadcasting via WebSocket
        const newConv = await this.chatService.splitConversation(
          context.orgId,
          conversation.id,
          context.messageId,
        );

        this.logger.log(
          `✅ Flow: Created new conversation ${newConv.id} for contact ${conversation.contactId}`,
        );
        return { newConversation: newConv };
      }

      case 'setContactAttribute': {
        if (!context.contactId) return {};
        const contact = await this.contactRepo.findOne({
          where: { id: context.contactId },
        });
        if (!contact) return {};

        const { fieldKey, value } = config;
        if (!fieldKey || value === undefined || value === null) return {};

        // Built-in fields
        const builtinFields = ['name', 'email', 'phone', 'notes'];
        if (builtinFields.includes(fieldKey)) {
          await this.contactRepo.update(contact.id, { [fieldKey]: value });
          this.logger.log(`✅ Flow: Set contact.${fieldKey} = "${value}"`);
        } else {
          // Custom field → store in metadata JSONB
          const metadata = { ...(contact.metadata || {}), [fieldKey]: value };
          await this.contactRepo.update(contact.id, { metadata });
          this.logger.log(`✅ Flow: Set contact metadata.${fieldKey} = "${value}"`);
        }
        return {};
      }

      case 'interactiveMessage': {
        const { Message, MessageDirection, MessageStatus, MessageType } = require('../../common/entities/message.entity');
        const msgRepo = this.convRepo.manager.getRepository(Message);

        const convForInteractive = await this.convRepo.findOne({
          where: { id: conversation.id },
          relations: ['contact', 'whatsappChannel'],
        });
        if (!convForInteractive?.contact?.whatsappId) return {};

        const interactiveType = config.interactiveType || 'button';
        const bodyText = config.body || '';

        let interactive: any;
        if (interactiveType === 'button') {
          // Quick Reply Buttons (max 3)
          const buttons = (config.buttons || []).slice(0, 3).map((btn: any, i: number) => ({
            type: 'reply',
            reply: { id: btn.id || `btn_${i}`, title: (btn.title || '').substring(0, 20) },
          }));
          interactive = {
            type: 'button',
            body: { text: bodyText },
            action: { buttons },
          };
        } else {
          // List Message
          const sections = (config.sections || []).map((sec: any) => ({
            title: (sec.title || '').substring(0, 24),
            rows: (sec.rows || []).map((row: any) => ({
              id: row.id || `row_${Date.now()}`,
              title: (row.title || '').substring(0, 24),
              description: (row.description || '').substring(0, 72),
            })),
          }));
          interactive = {
            type: 'list',
            body: { text: bodyText },
            action: {
              button: config.buttonText || 'Menu',
              sections,
            },
          };
        }

        if (config.header) {
          interactive.header = { type: 'text', text: config.header };
        }
        if (config.footer) {
          interactive.footer = { text: config.footer };
        }

        const preview = interactiveType === 'button'
          ? `Buttons: ${(config.buttons || []).map((b: any) => b.title).join(', ')}`
          : `List: ${config.buttonText || 'Menu'}`;

        const sysMsg = msgRepo.create({
          organizationId: context.orgId,
          conversationId: conversation.id,
          senderType: 'bot',
          direction: MessageDirection.OUTBOUND,
          type: 'interactive',
          content: bodyText || preview,
          status: MessageStatus.PENDING,
        });
        await msgRepo.save(sysMsg);

        await this.convRepo.update(conversation.id, {
          lastMessageAt: new Date(),
          lastMessagePreview: preview.substring(0, 150),
          lastMessageSenderType: 'bot',
        });

        try {
          const waMessageId = await this.whatsappService.sendInteractiveMessage(
            context.orgId,
            convForInteractive.contact.whatsappId,
            interactive,
            convForInteractive.whatsappChannelId,
          );
          await msgRepo.update(sysMsg.id, {
            whatsappMessageId: waMessageId,
            status: MessageStatus.SENT,
            sentAt: new Date(),
          });
          this.logger.log(`✅ Flow: Interactive ${interactiveType} sent to ${convForInteractive.contact.whatsappId}`);
        } catch (err) {
          await msgRepo.update(sysMsg.id, {
            status: MessageStatus.FAILED,
            errorMessage: err.message,
          });
          this.logger.error(`❌ Flow interactive message failed: ${err.message}`);
        }
        return {};
      }

      case 'googleSheets': {
        if (!context.contactId) return {};
        const contact = await this.contactRepo.findOne({
          where: { id: context.contactId },
        });
        if (!contact) return {};

        const { spreadsheetId, sheetName, columns } = config;
        if (!spreadsheetId || !sheetName || !columns?.length) return {};

        // Resolve column values — each column has a "source" (contact field key or literal)
        const values = columns.map((col: any) => {
          const src = col.source || '';
          // Built-in contact fields
          if (src === 'name') return contact.name || '';
          if (src === 'email') return contact.email || '';
          if (src === 'phone') return contact.phone || '';
          if (src === 'whatsappId') return contact.whatsappId || '';
          if (src === 'tags') return (contact.tags || []).join(', ');
          if (src === 'notes') return contact.notes || '';
          if (src === 'firstSeenAt') return contact.firstSeenAt?.toISOString() || '';
          if (src === 'lastSeenAt') return contact.lastSeenAt?.toISOString() || '';
          // Custom field from metadata
          if (contact.metadata && contact.metadata[src] !== undefined) {
            return String(contact.metadata[src]);
          }
          // Literal value
          if (src.startsWith('"') && src.endsWith('"')) {
            return src.slice(1, -1);
          }
          return col.value || src || '';
        });

        try {
          await this.googleSheetsService.appendRow(spreadsheetId, sheetName, values);
          this.logger.log(`✅ Flow: Appended row to Google Sheet ${spreadsheetId}`);
        } catch (err) {
          this.logger.error(`❌ Flow Google Sheets failed: ${err.message}`);
        }
        return {};
      }

      default:
        this.logger.debug(`Flow node type "${node.type}" — no-op`);
        return {};
    }
  }

  // Look ahead in the flow graph to find what agent the downstream assignAgent node would assign
  private findDownstreamAssignTarget(
    startNodeId: string,
    adjacency: Record<string, string[]>,
    nodeMap: Record<string, any>,
  ): { agentId: string | null; departmentId: string | null; assignmentType: string | null } {
    const queue = [...(adjacency[startNodeId] || [])];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodeMap[id];
      if (node?.type === 'assignAgent') {
        const cfg = node.config || {};
        return {
          agentId: cfg.agentId || null,
          departmentId: cfg.departmentId || null,
          assignmentType: cfg.assignmentType || 'specific_member',
        };
      }
      queue.push(...(adjacency[id] || []));
    }
    return { agentId: null, departmentId: null, assignmentType: null };
  }

  // ── Round Robin Agent Selection ───────────────────────
  // Picks the next eligible agent in the department using a
  // persistent pointer (lastRoundRobinAgentId on Department).
  // Sorted by createdAt so order is stable. Pointer advances
  // after each pick and wraps around.
  private async roundRobinPickAgent(
    departmentId: string,
    orgId: string,
  ): Promise<User | null> {
    if (!departmentId) return null;

    const department = await this.deptRepo.findOne({
      where: { id: departmentId, isActive: true },
    });
    if (!department) return null;

    // Get all eligible agents: active, in this department, opted-in for round robin
    const agents = await this.userRepo.find({
      where: {
        departmentId,
        organizationId: orgId,
        status: UserStatus.ACTIVE,
        availableForRoundRobin: true,
      },
      order: { createdAt: 'ASC' },
    });

    if (!agents.length) return null;

    // Find the next agent after the last one assigned
    let nextIndex = 0;
    if (department.lastRoundRobinAgentId) {
      const lastIndex = agents.findIndex(
        (a) => a.id === department.lastRoundRobinAgentId,
      );
      if (lastIndex !== -1) {
        nextIndex = (lastIndex + 1) % agents.length;
      }
      // If lastRoundRobinAgentId not found (agent removed/deactivated), start from 0
    }

    const selected = agents[nextIndex];

    // Update the pointer
    await this.deptRepo.update(departmentId, {
      lastRoundRobinAgentId: selected.id,
    });

    this.logger.debug(
      `🔄 Round robin: picked ${selected.fullName} (${nextIndex + 1}/${agents.length})`,
    );

    return selected;
  }
}

// ── Automation Queue Processor ──────────────────────────
@Processor(AUTOMATION_QUEUE)
export class AutomationProcessor extends WorkerHost {
  private logger = new Logger('AutomationProcessor');

  constructor(
    private automationService: AutomationService,
    private chatService: ChatService,
  ) {
    super();
  }

  async process(job: Job) {
    this.logger.debug(`🤖 Evaluating automation rules for trigger: ${job.data.triggerType}`);
    await this.automationService.evaluateRules(job.data);

    // Send push notification AFTER automation routing is complete.
    // The conversation now has the correct assignedAgentId/departmentId.
    const pushData = job.data.pushNotification;
    if (pushData) {
      const contactName = pushData.contactName || 'Customer';
      const preview = pushData.messageContent || (pushData.mediaFilename ? `📎 ${pushData.mediaFilename}` : '');
      await this.chatService.sendPushForMessage(
        job.data.orgId,
        job.data.conversationId,
        { name: contactName, phone: pushData.contactPhone },
        { content: preview, senderId: pushData.messageSenderId, mediaFilename: pushData.mediaFilename },
      );
    }
  }
}
