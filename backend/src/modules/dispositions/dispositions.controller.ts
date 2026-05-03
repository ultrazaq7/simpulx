// ============================================================
// Dispositions Controller
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
} from '@nestjs/common';
import { DispositionsService } from './dispositions.service';
import { JwtAuthGuard } from '../auth/jwt.strategy';

@Controller('dispositions')
@UseGuards(JwtAuthGuard)
export class DispositionsController {
  constructor(private readonly service: DispositionsService) {}

  @Get()
  findAll(@Req() req) {
    return this.service.findAll(req.user.organizationId);
  }

  @Get('active')
  findActive(@Req() req) {
    return this.service.findActive(req.user.organizationId);
  }

  @Post()
  create(@Req() req, @Body() body: { name: string; description?: string }) {
    return this.service.create(req.user.organizationId, body);
  }

  @Patch(':id')
  update(
    @Req() req,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; isActive?: boolean; sortOrder?: number },
  ) {
    return this.service.update(req.user.organizationId, id, body);
  }

  @Delete(':id')
  remove(@Req() req, @Param('id') id: string) {
    return this.service.remove(req.user.organizationId, id);
  }
}
