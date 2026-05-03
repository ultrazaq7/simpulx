// ============================================================
// Drip Campaigns Controller — REST API
// ============================================================
import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { DripCampaignsService } from './drip-campaigns.service';
import { JwtAuthGuard } from '../auth/jwt.strategy';

@Controller('drip-campaigns')
@UseGuards(JwtAuthGuard)
export class DripCampaignsController {
  constructor(private readonly service: DripCampaignsService) {}

  @Post()
  create(@Req() req, @Body() body) {
    return this.service.create(req.user.organizationId, body);
  }

  @Get()
  findAll(@Req() req) {
    return this.service.findAll(req.user.organizationId);
  }

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    return this.service.findOne(req.user.organizationId, id);
  }

  @Put(':id')
  update(@Req() req, @Param('id') id: string, @Body() body) {
    return this.service.update(req.user.organizationId, id, body);
  }

  @Delete(':id')
  remove(@Req() req, @Param('id') id: string) {
    return this.service.remove(req.user.organizationId, id);
  }

  // Steps
  @Post(':id/steps')
  addStep(@Req() req, @Param('id') id: string, @Body() body) {
    return this.service.addStep(req.user.organizationId, id, body);
  }

  @Put('steps/:stepId')
  updateStep(@Param('stepId') stepId: string, @Body() body) {
    return this.service.updateStep(stepId, body);
  }

  @Delete('steps/:stepId')
  removeStep(@Param('stepId') stepId: string) {
    return this.service.removeStep(stepId);
  }

  // Enrollment
  @Post(':id/enroll')
  enroll(@Req() req, @Param('id') id: string, @Body() body: { contactId: string }) {
    return this.service.enroll(req.user.organizationId, id, body.contactId);
  }

  @Post('enrollments/:enrollmentId/unenroll')
  unenroll(@Param('enrollmentId') enrollmentId: string) {
    return this.service.unenroll(enrollmentId);
  }
}
