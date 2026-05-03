// ============================================================
// Stages Controller (formerly Dispositions)
// ============================================================
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { StagesService } from './stages.service';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { StageCategory } from '../../common/entities/stage.entity';

const VALID_CATEGORIES: StageCategory[] = ['progressing', 'lost', 'won'];

interface CreateStageDto {
  name: string;
  description?: string;
  color?: string;
  category: StageCategory;
  sortOrder?: number;
}

interface UpdateStageDto {
  name?: string;
  description?: string;
  color?: string;
  category?: StageCategory;
  isActive?: boolean;
  sortOrder?: number;
}

@Controller('stages')
@UseGuards(JwtAuthGuard)
export class StagesController {
  constructor(private readonly service: StagesService) {}

  @Get()
  findAll(@Req() req) {
    return this.service.findAll(req.user.organizationId);
  }

  @Get('active')
  findActive(@Req() req) {
    return this.service.findActive(req.user.organizationId);
  }

  @Post()
  create(@Req() req, @Body() body: CreateStageDto) {
    if (!body.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
      throw new BadRequestException(
        `category is required and must be one of: ${VALID_CATEGORIES.join(', ')}`,
      );
    }
    return this.service.create(req.user.organizationId, body);
  }

  @Patch(':id')
  update(@Req() req, @Param('id') id: string, @Body() body: UpdateStageDto) {
    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      throw new BadRequestException(
        `category must be one of: ${VALID_CATEGORIES.join(', ')}`,
      );
    }
    return this.service.update(req.user.organizationId, id, body);
  }

  @Delete(':id')
  remove(@Req() req, @Param('id') id: string) {
    return this.service.remove(req.user.organizationId, id);
  }
}
