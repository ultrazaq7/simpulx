// ============================================================
// JWT Auth Guard & Strategy
// ============================================================
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../common/entities';

export interface JwtPayload {
  sub: string;        // user ID
  orgId: string;      // organization ID
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.userRepo.findOne({
      where: { id: payload.sub, organizationId: payload.orgId },
    });

    if (!user || user.status === 'inactive') {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      sub: user.id,
      id: user.id,
      orgId: user.organizationId,
      organizationId: user.organizationId,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      departmentId: user.departmentId || null,
    };
  }
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
