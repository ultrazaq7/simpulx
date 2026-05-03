// ============================================================
// Automation Controller
// ============================================================
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/entities/user.entity';
import { AutomationService } from './automation.service';
import { AutomationRule } from '../../common/entities/automation-rule.entity';

@ApiTags('automation')
@Controller('automation/rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create automation rule' })
  async createRule(@Request() req, @Body() body: Partial<AutomationRule>) {
    return this.automationService.createRule(req.user.organizationId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List automation rules' })
  async getRules(@Request() req) {
    return this.automationService.getRules(req.user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single automation rule' })
  async getRule(@Request() req, @Param('id') id: string) {
    return this.automationService.getRule(req.user.organizationId, id);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update automation rule' })
  async updateRule(
    @Request() req,
    @Param('id') id: string,
    @Body() body: Partial<AutomationRule>,
  ) {
    return this.automationService.updateRule(req.user.organizationId, id, body);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete automation rule' })
  async deleteRule(@Request() req, @Param('id') id: string) {
    return this.automationService.deleteRule(req.user.organizationId, id);
  }
}
