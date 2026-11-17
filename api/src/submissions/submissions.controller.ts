import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Put,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthenticatedRequest, Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { MAX_FILE_BYTES, SubmissionDto, UploadedFileData } from './submission.dto';
import { SubmissionsService } from './submissions.service';

/** Multer's own message is English; answer with the Romanian one. */
@Catch(PayloadTooLargeException)
class FileTooLargeFilter implements ExceptionFilter {
  catch(_: PayloadTooLargeException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(413)
      .json({ statusCode: 413, message: 'Fișierul are cel mult 10 MB.', error: 'Payload Too Large' });
  }
}

@Controller()
@UseGuards(SessionGuard)
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get('my/assignments')
  @Roles(Role.STUDENT)
  myAssignments(@Req() request: AuthenticatedRequest) {
    return this.submissions.myAssignments(request.user.id);
  }

  @Put('my/assignments/:id/submission')
  @Roles(Role.STUDENT)
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  submit(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmissionDto,
    @UploadedFile() file: UploadedFileData | undefined,
  ) {
    return this.submissions.submit(request.user.id, id, body, file);
  }

  @Get('submissions/:id/file')
  async file(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.submissions.download(request.user.id, id);
    response
      .set({
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(file.data);
  }
}
