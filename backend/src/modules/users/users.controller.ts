import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequireTokenRoles } from '../auth/decorators/roles.decorator';
import { JwtAccessPayload, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TokenRolesGuard } from '../auth/guards/token-roles.guard';
import { UsersService } from './users.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { SetUnitScopesDto } from './dto/set-unit-scopes.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, TokenRolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@Req() req: { user?: JwtAccessPayload }) {
    return this.usersService.getMe(req.user!);
  }

  @Get('implementers')
  @RequireTokenRoles('SELECTION_COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  implementers(
    @Query('unitCode') unitCode: string,
    @Query('department') department: string,
  ) {
    return this.usersService.listImplementers(unitCode, department);
  }

  @Get('hrms/:employeeId')
  hrmsEmployee(@Param('employeeId') employeeId: string) {
    return this.usersService.getEmployeeHrms(employeeId);
  }

  /** Totals for admin screens (paginated list uses separate calls). */
  @Get('summary')
  @RequireTokenRoles('ADMIN', 'SUPER_ADMIN')
  usersSummary() {
    return this.usersService.usersSummary();
  }

  @Get()
  @RequireTokenRoles('ADMIN', 'SUPER_ADMIN')
  list(@Query() query: ListUsersQueryDto) {
    const includeUnitScopes =
      String(query.includeUnitScopes ?? '')
        .trim()
        .toLowerCase() === 'true';
    const isActive =
      query.isActive === 'true'
        ? true
        : query.isActive === 'false'
          ? false
          : undefined;
    return this.usersService.listEmployees({
      search: query.search,
      department: query.department,
      includeUnitScopes,
      skip: query.skip ?? 0,
      take: query.take ?? 50,
      roleCode: query.role?.trim() || undefined,
      isActive,
    });
  }

  @Post(':userId/roles')
  @RequireTokenRoles('ADMIN', 'SUPER_ADMIN')
  assignRole(@Param('userId') userId: string, @Body() dto: AssignRoleDto) {
    return this.usersService.assignRole(userId, dto);
  }

  @Delete(':userId/roles/:roleCode')
  @RequireTokenRoles('ADMIN', 'SUPER_ADMIN')
  removeRole(
    @Param('userId') userId: string,
    @Param('roleCode') roleCode: string,
  ) {
    return this.usersService.removeRole(userId, roleCode);
  }

  @Get(':userId/unit-scopes')
  @RequireTokenRoles('ADMIN', 'SUPER_ADMIN')
  unitScopes(
    @Param('userId') userId: string,
    @Query('roleCode') roleCode: string,
  ) {
    return this.usersService.getUnitScopes(userId, roleCode);
  }

  @Post(':userId/unit-scopes')
  @RequireTokenRoles('ADMIN', 'SUPER_ADMIN')
  setUnitScopes(
    @Param('userId') userId: string,
    @Body() dto: SetUnitScopesDto,
  ) {
    return this.usersService.setUnitScopes(userId, dto);
  }
}
