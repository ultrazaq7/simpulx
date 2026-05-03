// ============================================================
// Quick Replies Controller
// ============================================================
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { QuickRepliesService } from './quick-replies.service';

@ApiTags('quick-replies')
@Controller('quick-replies')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class QuickRepliesController {
  constructor(private readonly qrService: QuickRepliesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a quick reply' })
  async create(
    @Request() req,
    @Body() body: { title: string; content: string; shortcut?: string; category?: string; departmentId?: string },
  ) {
    // If agent has a department and no departmentId specified, auto-assign to their dept
    const data = { ...body };
    if (!data.departmentId && req.user.departmentId) {
      data.departmentId = req.user.departmentId;
    }
    return this.qrService.create(req.user.organizationId, req.user.id, data);
  }

  @Get()
  @ApiOperation({ summary: 'List quick replies' })
  async findAll(
    @Request() req,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.qrService.findAll(req.user.organizationId, { search, category, departmentId });
  }

  @Get('categories')
  @ApiOperation({ summary: 'List categories' })
  async getCategories(@Request() req) {
    return this.qrService.getCategories(req.user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a quick reply' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.qrService.findById(req.user.organizationId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a quick reply' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { title?: string; content?: string; shortcut?: string; category?: string; departmentId?: string },
  ) {
    return this.qrService.update(req.user.organizationId, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a quick reply' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.qrService.remove(req.user.organizationId, id);
  }
}
