import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { RubricDto, SendRubricDto } from './rubric.dto';
import { RubricsService } from './rubrics.service';

/** A professor's rubric drafts, and sending a draft to a class (D-011, D-013, D-015). */
@Controller('rubrics')
@UseGuards(SessionGuard)
export class RubricsController {
  constructor(private readonly rubrics: RubricsService) {}

  @Get()
  @Roles(Role.PROFESSOR, Role.ADMIN)
  listDrafts(@Req() request: AuthenticatedRequest) {
    return this.rubrics.listDrafts(request.user.id);
  }

  @Post()
  @Roles(Role.PROFESSOR, Role.ADMIN)
  create(@Req() request: AuthenticatedRequest, @Body() body: RubricDto) {
    return this.rubrics.create(request.user.id, body);
  }

  @Get(':id')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  get(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.rubrics.get(request.user.id, id);
  }

  @Put(':id')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  replace(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: RubricDto) {
    return this.rubrics.replace(request.user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.PROFESSOR, Role.ADMIN)
  async remove(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.rubrics.remove(request.user.id, id);
  }

  @Post(':id/copy')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  copy(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.rubrics.copy(request.user.id, id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @Roles(Role.PROFESSOR, Role.ADMIN)
  archive(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.rubrics.archive(request.user.id, id);
  }

  @Post(':id/send')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  send(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: SendRubricDto) {
    return this.rubrics.send(request.user.id, id, body);
  }
}
