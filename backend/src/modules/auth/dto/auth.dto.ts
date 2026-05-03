// ============================================================
// Auth DTOs
// ============================================================
import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsUUID, IsEnum, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../common/entities/user.entity';

export class LoginDto {
  @ApiProperty({ example: 'admin@simpulx.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'BYD Arista Group' })
  @IsString()
  @IsNotEmpty()
  organizationName: string;

  @ApiProperty({ example: 'admin@simpulx.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  fullName: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@simpulx.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'newSecurePassword123' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message: 'Password must be at least 8 characters with 1 uppercase letter and 1 digit',
  })
  newPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message: 'Password must be at least 8 characters with 1 uppercase letter and 1 digit',
  })
  newPassword: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

// Renamed from InviteAgentDto → CreateAccountDto
export class CreateAccountDto {
  @ApiProperty({ example: 'newagent@simpulx.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Jane Agent' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: 'agent', enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({ description: 'Department UUID' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Supervisor UUID' })
  @IsUUID()
  @IsOptional()
  supervisorId?: string;

  @ApiPropertyOptional({ description: 'Initial password for the new account' })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({ description: 'Max concurrent chats for the user' })
  @IsOptional()
  maxConcurrentChats?: number;

  @ApiPropertyOptional({ description: 'Whether the user participates in round robin assignment' })
  @IsOptional()
  availableForRoundRobin?: boolean;
}

// Keep backward compatibility
export { CreateAccountDto as InviteAgentDto };
