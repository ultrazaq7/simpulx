// ============================================================
// Auth Controller — with RBAC
// ============================================================
import { Controller, Post, Body, Get, UseGuards, Request, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  CreateAccountDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './jwt.strategy';
import { RolesGuard, MinRole } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/entities/user.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login with email + password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register')
  @ApiOperation({ summary: 'Register new organization + owner' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (authenticated)' })
  changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.sub, dto.currentPassword, dto.newPassword);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile with org & department' })
  getMe(@Request() req) {
    return this.authService.getMe(req.user.sub);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own profile (name only)' })
  updateProfile(@Request() req, @Body() body: { fullName: string }) {
    return this.authService.updateProfile(req.user.sub, body.fullName);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  // ── Create Account (Manager+) ────────────────────────
  @Post('create-account')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @MinRole(UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new account (manager+ only, hierarchy enforced)' })
  createAccount(@Request() req, @Body() dto: CreateAccountDto) {
    return this.authService.createAccount(
      req.user.orgId,
      req.user.role,
      dto,
      req.user.fullName || req.user.email,
      req.user.sub,
    );
  }

  // ── Backward compat: POST /auth/invite still works ────
  @Post('invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @MinRole(UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Deprecated] Use POST /auth/create-account instead' })
  invite(@Request() req, @Body() dto: CreateAccountDto) {
    return this.authService.createAccount(
      req.user.orgId,
      req.user.role,
      dto,
      req.user.fullName || req.user.email,
      req.user.sub,
    );
  }
}
