import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { ReviewDto } from './review.dto';
import { ReviewsService } from './reviews.service';

/** A reviewer reads and sends the reviews allocated to them (D-023). */
@Controller('my/reviews')
@UseGuards(SessionGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(':id')
  @Roles(Role.STUDENT)
  get(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.get(request.user.id, id);
  }

  @Post(':id')
  @HttpCode(200)
  @Roles(Role.STUDENT)
  send(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto) {
    return this.reviews.send(request.user.id, id, dto);
  }
}
