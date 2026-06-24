import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import {
  ListContactSubmissionsDto,
  ReplyContactSubmissionDto,
  UpdateContactSubmissionStatusDto,
} from './dto';
import { ContactSubmissionsService } from './contact-submissions.service';

@ApiTags('Contact Submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('contact-submissions')
export class ContactSubmissionsController {
  constructor(
    private readonly contactSubmissionsService: ContactSubmissionsService,
  ) {}

  @Get()
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'List contact form submissions' })
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListContactSubmissionsDto,
  ) {
    return this.contactSubmissionsService.list(user, query);
  }

  @Get(':id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get contact form submission details' })
  details(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.contactSubmissionsService.details(user, id);
  }

  @Patch(':id/status')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Update contact form submission status' })
  updateStatus(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateContactSubmissionStatusDto,
  ) {
    return this.contactSubmissionsService.updateStatus(user, id, dto);
  }

  @Post(':id/reply')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({
    summary: 'Reply to a contact form submission and mark it replied',
  })
  reply(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: ReplyContactSubmissionDto,
  ) {
    return this.contactSubmissionsService.reply(user, id, dto);
  }
}
