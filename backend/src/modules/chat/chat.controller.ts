// ============================================================
// Chat Controller
// ============================================================
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Delete,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt.strategy";
import { ChatService } from "./chat.service";
import { ConversationStatus } from "../../common/entities/conversation.entity";

@ApiTags("chat")
@Controller("chat")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get("conversations")
  @ApiOperation({ summary: "List conversations for organization" })
  async getConversations(
    @Request() req,
    @Query("status") status?: ConversationStatus,
    @Query("agentId") agentId?: string,
    @Query("contactId") contactId?: string,
    @Query("assignment") assignment?: "all" | "unassigned" | "assigned" | "me",
    @Query("lastMessageBy") lastMessageBy?:
      | "customer"
      | "bot"
      | "customer_or_bot",
    @Query("channelId") channelId?: string,
    @Query("departmentId") departmentId?: string,
    @Query("interestLevel") interestLevel?: string,
    @Query("sourceChannel") sourceChannel?: string,
    @Query("stageId") stageId?: string,
    @Query("followUpDue") followUpDue?: "overdue" | "today" | "this_week",
    @Query("sort") sort?: "latest" | "oldest",
    @Query("tag") tag?: string,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("search") search?: string,
  ) {
    return this.chatService.getConversations(req.user.organizationId, {
      status,
      agentId,
      contactId,
      assignment,
      lastMessageBy,
      channelId,
      departmentId,
      interestLevel,
      sourceChannel,
      stageId,
      followUpDue,
      sort,
      tag,
      page,
      limit,
      search,
      currentUser: {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
      },
    });
  }

  @Get("conversation-filters")
  @ApiOperation({ summary: "List filter metadata for conversations" })
  async getConversationFilters(@Request() req) {
    return this.chatService.getConversationFilters(req.user.organizationId, {
      id: req.user.id,
      role: req.user.role,
      departmentId: req.user.departmentId,
    });
  }

  @Get("conversations/:conversationId/messages")
  @ApiOperation({ summary: "Get messages for a conversation" })
  async getMessages(
    @Request() req,
    @Param("conversationId") conversationId: string,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
  ) {
    return this.chatService.getMessages(
      req.user.organizationId,
      conversationId,
      {
        page,
        limit,
      },
    );
  }

  @Post("conversations/:conversationId/messages")
  @ApiOperation({ summary: "Send a message in a conversation" })
  async sendMessage(
    @Request() req,
    @Param("conversationId") conversationId: string,
    @Body() body: { content: string; type?: string },
  ) {
    return this.chatService.sendMessage(
      req.user.organizationId,
      conversationId,
      req.user.id,
      body as any,
    );
  }

  @Post("conversations/:conversationId/media")
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Send a media message (image, document, audio, video)" })
  async sendMedia(
    @Request() req,
    @Param("conversationId") conversationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { caption?: string },
  ) {
    return this.chatService.sendMediaMessage(
      req.user.organizationId,
      conversationId,
      req.user.id,
      file,
      body.caption,
    );
  }

  @Post("conversations/:conversationId/send-template")
  @ApiOperation({ summary: "Send a template message in a conversation" })
  async sendTemplate(
    @Request() req,
    @Param("conversationId") conversationId: string,
    @Body() body: { templateId: string; variables?: Record<string, string> },
  ) {
    return this.chatService.sendTemplate(
      req.user.organizationId,
      conversationId,
      req.user.id,
      body.templateId,
      body.variables,
      req.user.departmentId,
    );
  }

  @Patch("conversations/:conversationId/assign")
  @ApiOperation({ summary: "Assign agent to conversation" })
  async assignAgent(
    @Request() req,
    @Param("conversationId") conversationId: string,
    @Body() body: { agentId?: string | null; departmentId?: string | null },
  ) {
    return this.chatService.assignAgent(
      req.user.organizationId,
      conversationId,
      body,
      { id: req.user.id, role: req.user.role },
    );
  }

  @Patch("conversations/:conversationId/read")
  @ApiOperation({ summary: "Mark conversation as read" })
  async markAsRead(
    @Request() req,
    @Param("conversationId") conversationId: string,
  ) {
    return this.chatService.markAsRead(req.user.organizationId, conversationId);
  }

  @Patch("conversations/:conversationId/status")
  @ApiOperation({ summary: "Update conversation status" })
  async updateStatus(
    @Request() req,
    @Param("conversationId") conversationId: string,
    @Body("status") status: ConversationStatus,
    @Body("stageId") stageId?: string,
    @Body("snoozedUntil") snoozedUntil?: string,
  ) {
    return this.chatService.updateStatus(
      req.user.organizationId,
      conversationId,
      status,
      stageId,
      snoozedUntil ? new Date(snoozedUntil) : undefined,
    );
  }

  @Patch("conversations/:conversationId/stage")
  @ApiOperation({ summary: "Update conversation stage" })
  async updateStage(
    @Request() req,
    @Param("conversationId") conversationId: string,
    @Body("stageId") stageId: string | null,
  ) {
    return this.chatService.updateConversationField(
      req.user.organizationId,
      conversationId,
      { stageId: stageId ?? undefined },
    );
  }

  @Patch("conversations/:conversationId/interest-level")
  @ApiOperation({ summary: "Update conversation interest level" })
  async updateInterestLevel(
    @Request() req,
    @Param("conversationId") conversationId: string,
    @Body("interestLevel") interestLevel: string | null,
  ) {
    return this.chatService.updateConversationField(
      req.user.organizationId,
      conversationId,
      { interestLevel: interestLevel ?? undefined },
    );
  }

  @Post("conversations/:conversationId/track-action")
  @ApiOperation({ summary: "Track agent action (call, whatsapp, etc.)" })
  async trackAction(
    @Request() req,
    @Param("conversationId") conversationId: string,
    @Body() body: { actionType: string; metadata?: Record<string, any> },
  ) {
    return this.chatService.trackAgentAction(
      req.user.organizationId,
      conversationId,
      req.user.id,
      body.actionType,
      body.metadata,
    );
  }

  @Get("conversations/:conversationId/notes")
  @ApiOperation({ summary: "Get internal notes for a conversation" })
  async getNotes(
    @Request() req,
    @Param("conversationId") conversationId: string,
  ) {
    return this.chatService.getInternalNotes(
      req.user.organizationId,
      conversationId,
    );
  }

  @Post("conversations/:conversationId/notes")
  @ApiOperation({ summary: "Add internal note to a conversation" })
  async addNote(
    @Request() req,
    @Param("conversationId") conversationId: string,
    @Body("content") content: string,
  ) {
    return this.chatService.addInternalNote(
      req.user.organizationId,
      conversationId,
      req.user.id,
      req.user.fullName || req.user.email,
      content,
    );
  }

  @Delete("conversations/:conversationId/notes/:noteId")
  @ApiOperation({ summary: "Delete an internal note" })
  async deleteNote(
    @Request() req,
    @Param("conversationId") conversationId: string,
    @Param("noteId") noteId: string,
  ) {
    return this.chatService.deleteInternalNote(
      req.user.organizationId,
      noteId,
    );
  }
}
