// ============================================================
// Dashboard Controller — Stats & Analytics Endpoints
// ============================================================
import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dashboard statistics' })
  getStats(
    @Request() req,
    @Query('channelId') channelId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('sourceChannel') sourceChannel?: string,
    @Query('tag') tag?: string,
    @Query('dateRange') dateRange?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.dashboardService.getStats(req.user.orgId, req.user.sub, req.user.role, {
      channelId, departmentId, sourceChannel, tag, dateRange, dateFrom, dateTo,
    });
  }

  @Get('source-channels')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Source channel distribution stats' })
  getSourceChannels(
    @Request() req,
    @Query('dateRange') dateRange?: string,
    @Query('sourceChannel') sourceChannel?: string,
    @Query('tag') tag?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.dashboardService.getSourceChannelStats(req.user.orgId, dateRange, sourceChannel, dateFrom, dateTo, tag);
  }

  @Get('agent-performance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent follow-up performance with first reply time' })
  getAgentPerformance(
    @Request() req,
    @Query('dateRange') dateRange?: string,
    @Query('sourceChannel') sourceChannel?: string,
    @Query('tag') tag?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.dashboardService.getAgentPerformance(req.user.orgId, dateRange, sourceChannel, dateFrom, dateTo, tag);
  }

  @Get('conversion-funnel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Conversion funnel by real stages (progressing/won/lost)' })
  getConversionFunnel(
    @Request() req,
    @Query('dateRange') dateRange?: string,
    @Query('sourceChannel') sourceChannel?: string,
    @Query('tag') tag?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.dashboardService.getConversionFunnel(req.user.orgId, dateRange, sourceChannel, dateFrom, dateTo, tag);
  }

  @Get('source-trend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Daily conversation trend by source channel' })
  getSourceTrend(
    @Request() req,
    @Query('dateRange') dateRange?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.dashboardService.getSourceTrend(req.user.orgId, dateRange, dateFrom, dateTo);
  }
}
