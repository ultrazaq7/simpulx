// ============================================================
// Auth Service — JWT Token & Login Logic + RBAC
// ============================================================
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User, UserRole, UserStatus } from '../../common/entities/user.entity';
import { Organization } from '../../common/entities/organization.entity';
import { LoginDto, RegisterDto, CreateAccountDto } from './dto/auth.dto';
import { JwtPayload } from './jwt.strategy';
import { EmailService } from '../../common/services/email.service';
import { getRoleLevel } from '../../common/guards/roles.guard';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditCategory } from '../../common/entities/audit-log.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private auditLogService: AuditLogService,
  ) {}

  // ── Login (email + password only, auto-resolve org) ───
  async login(dto: LoginDto) {
    // Find user by email (no org needed)
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.organization', 'org')
      .leftJoinAndSelect('user.department', 'dept')
      .where('user.email = :email', { email: dto.email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('Account is inactive');
    }

    // Compare password
    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update online status
    await this.userRepo.update(user.id, {
      isOnline: true,
      lastSeenAt: new Date(),
      status: UserStatus.ACTIVE,
    });

    return this.generateTokens(user, user.organization);
  }

  // ── Register (Create Org + Owner) ─────────────────────
  async register(dto: RegisterDto) {
    // Check if email already exists
    const existingUser = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Create organization
    const slug = dto.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const organization = this.orgRepo.create({
      name: dto.organizationName,
      slug,
    });
    await this.orgRepo.save(organization);

    // Create owner user
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepo.create({
      organizationId: organization.id,
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role: UserRole.OWNER,
      status: UserStatus.ACTIVE,
    });
    await this.userRepo.save(user);

    return this.generateTokens(user, organization);
  }

  // ── Forgot Password ──────────────────────────────────
  async forgotPassword(email: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      // Don't reveal whether email exists
      return { message: 'If the email exists, a reset link has been sent.' };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save hashed token with 1h expiry
    await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({
        passwordResetToken: hashedToken,
        passwordResetExpires: new Date(Date.now() + 3600000), // 1 hour
      })
      .where('id = :id', { id: user.id })
      .execute();

    // Send email
    await this.emailService.sendPasswordReset(user.email, user.fullName, resetToken);

    return { message: 'If the email exists, a reset link has been sent.' };
  }

  // ── Reset Password ───────────────────────────────────
  async resetPassword(token: string, newPassword: string) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordResetToken')
      .addSelect('user.passwordResetExpires')
      .where('user.passwordResetToken = :token', { token: hashedToken })
      .andWhere('user.passwordResetExpires > :now', { now: new Date() })
      .getOne();

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      })
      .where('id = :id', { id: user.id })
      .execute();

    return { message: 'Password reset successfully' };
  }

  // ── Change Password (authenticated) ──────────────────
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .addSelect('user.organizationId')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) throw new NotFoundException('User not found');

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new BadRequestException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userRepo.update(userId, { passwordHash } as any);

    await this.auditLogService.log({
      organizationId: user.organizationId,
      category: AuditCategory.AUTH,
      action: 'auth.password_changed',
      userId: user.id,
      userName: user.fullName,
      targetId: user.id,
      targetType: 'user',
      metadata: {
        email: user.email,
      },
    });

    return { message: 'Password changed successfully' };
  }

  // ── Get Current User ─────────────────────────────────
  async getMe(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['organization', 'department', 'supervisor'],
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      isOnline: user.isOnline,
      department: user.department ? {
        id: user.department.id,
        name: user.department.name,
      } : null,
      supervisor: user.supervisor ? {
        id: user.supervisor.id,
        fullName: user.supervisor.fullName,
      } : null,
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
        plan: user.organization.plan,
        rolePermissions: (user.organization as any).rolePermissions || {},
      },
    };
  }

  // ── Update Own Profile ───────────────────────────────
  async updateProfile(userId: string, fullName: string) {
    if (!fullName || fullName.trim().length < 1) {
      throw new BadRequestException('Full name is required');
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    user.fullName = fullName.trim();
    await this.userRepo.save(user);

    return { message: 'Profile updated successfully', fullName: user.fullName };
  }

  // ── Create Account (with role hierarchy enforcement) ──
  async createAccount(
    orgId: string,
    creatorRole: UserRole,
    dto: CreateAccountDto,
    createdByName: string,
    createdById?: string,
  ) {
    // Enforce role hierarchy: creator can only create accounts with lower role
    const creatorLevel = getRoleLevel(creatorRole);
    const newRoleLevel = getRoleLevel(dto.role);

    if (newRoleLevel >= creatorLevel) {
      throw new ForbiddenException(
        `Cannot create account with role "${dto.role}". You can only create accounts with a role lower than your own.`,
      );
    }

    // Cannot create owner accounts
    if (dto.role === UserRole.OWNER) {
      throw new ForbiddenException('Cannot create owner accounts');
    }

    // Check duplicate
    const existing = await this.userRepo.findOne({
      where: { organizationId: orgId, email: dto.email },
    });
    if (existing) {
      throw new ConflictException('User already exists in this organization');
    }

    const initialPassword = dto.password?.trim().length
      ? dto.password.trim()
      : crypto.randomBytes(6).toString('hex');
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    const shouldInviteByEmail = !(dto.password?.trim().length);

    const user = this.userRepo.create({
      organizationId: orgId,
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role: dto.role,
      departmentId: dto.departmentId || undefined,
      supervisorId: dto.supervisorId || undefined,
      maxConcurrentChats: dto.maxConcurrentChats ?? 10,
      availableForRoundRobin: dto.availableForRoundRobin ?? true,
      status: shouldInviteByEmail ? UserStatus.INVITED : UserStatus.ACTIVE,
    } as Partial<User>);
    await this.userRepo.save(user);

    if (shouldInviteByEmail) {
      try {
        await this.emailService.sendInvitation(dto.email, dto.fullName, createdByName, initialPassword);
      } catch (e) {
        // Log but don't fail — user is created
      }
    }

    await this.auditLogService.log({
      organizationId: orgId,
      category: AuditCategory.USER,
      action: 'user.account_created',
      userId: createdById,
      userName: createdByName,
      targetId: user.id,
      targetType: 'user',
      metadata: {
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
        supervisorId: user.supervisorId,
        maxConcurrentChats: user.maxConcurrentChats,
        availableForRoundRobin: user.availableForRoundRobin,
        status: user.status,
      },
    });

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      message: 'Account created successfully',
    };
  }

  // ── Backward compat alias ─────────────────────────────
  async inviteAgent(orgId: string, dto: any, invitedByName: string) {
    return this.createAccount(orgId, UserRole.OWNER, dto, invitedByName);
  }

  // ── Reactivate User ──────────────────────────────────
  async reactivateUser(orgId: string, userId: string, requesterRole: UserRole) {
    const user = await this.userRepo.findOne({
      where: { id: userId, organizationId: orgId },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.status !== UserStatus.INACTIVE) {
      throw new BadRequestException('User is not inactive');
    }

    // Enforce hierarchy: can only reactivate users with lower role
    if (getRoleLevel(requesterRole) < getRoleLevel(user.role)) {
      throw new ForbiddenException('Cannot reactivate a user with equal or higher role');
    }

    user.status = UserStatus.ACTIVE;
    await this.userRepo.save(user);

    return { message: 'User reactivated successfully' };
  }

  // ── Refresh Token ─────────────────────────────────────
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.userRepo.findOne({
        where: { id: payload.sub },
        relations: ['organization'],
      });
      if (!user || !user.organization) throw new UnauthorizedException();

      return this.generateTokens(user, user.organization);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // ── Generate Token Pair ───────────────────────────────
  private generateTokens(user: User, org: Organization) {
    const payload: JwtPayload = {
      sub: user.id,
      orgId: org.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload, {
        expiresIn: this.configService.get('JWT_EXPIRATION', '7d'),
      }),
      refreshToken: this.jwtService.sign(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION', '30d'),
      }),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        departmentId: user.departmentId,
        supervisorId: user.supervisorId,
      },
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        rolePermissions: org.rolePermissions || {},
      },
    };
  }
}
