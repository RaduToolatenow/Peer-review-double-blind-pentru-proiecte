import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { ClassDto, JoinTeamDto, TeamDto, UpdateTeamDto } from './class.dto';
import { ClassesService } from './classes.service';

/** Classes and teams (D-012). Students only join a team with its code. */
@Controller()
@UseGuards(SessionGuard)
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get('classes')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  list(@Req() request: AuthenticatedRequest) {
    return this.classes.list(request.user.id);
  }

  @Post('classes')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  create(@Req() request: AuthenticatedRequest, @Body() body: ClassDto) {
    return this.classes.create(request.user.id, body);
  }

  @Get('classes/:id')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  detail(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.classes.detail(request.user.id, id);
  }

  @Patch('classes/:id')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  rename(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: ClassDto) {
    return this.classes.rename(request.user.id, id, body);
  }

  @Delete('classes/:id')
  @HttpCode(204)
  @Roles(Role.PROFESSOR, Role.ADMIN)
  async remove(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.classes.remove(request.user.id, id);
  }

  @Post('classes/:id/teams')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  addTeam(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: TeamDto) {
    return this.classes.addTeam(request.user.id, id, body);
  }

  @Post('teams/join')
  @HttpCode(200)
  @Roles(Role.STUDENT)
  join(@Req() request: AuthenticatedRequest, @Body() body: JoinTeamDto) {
    return this.classes.join(request.user.id, body.code);
  }

  @Patch('teams/:id')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  updateTeam(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTeamDto,
  ) {
    return this.classes.updateTeam(request.user.id, id, body);
  }

  @Delete('teams/:id')
  @HttpCode(204)
  @Roles(Role.PROFESSOR, Role.ADMIN)
  async removeTeam(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.classes.removeTeam(request.user.id, id);
  }

  @Post('teams/:id/code')
  @HttpCode(200)
  @Roles(Role.PROFESSOR, Role.ADMIN)
  newCode(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.classes.newCode(request.user.id, id);
  }
}
