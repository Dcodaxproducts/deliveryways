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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import {
  AssignChatThreadDto,
  CreateChatMessageDto,
  CreateChatThreadDto,
  ListChatThreadsDto,
  UpdateChatThreadStatusDto,
} from './dto';
import { ChatService } from './chat.service';

@ApiTags('Chat')
@Controller('chat/threads')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.CUSTOMER)
  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateChatThreadDto,
  ) {
    return this.chatService.createThread(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
    RolesEnum.STAFF,
  )
  @Get('summary')
  summary(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListChatThreadsDto,
  ) {
    return this.chatService.summary(user, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
    RolesEnum.STAFF,
  )
  @Get()
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListChatThreadsDto,
  ) {
    return this.chatService.list(user, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
    RolesEnum.STAFF,
  )
  @Get(':id')
  details(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.chatService.details(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
    RolesEnum.STAFF,
  )
  @Post(':id/messages')
  reply(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: CreateChatMessageDto,
  ) {
    return this.chatService.reply(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
    RolesEnum.STAFF,
  )
  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.chatService.markRead(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.STAFF,
  )
  @Patch(':id/assign')
  assign(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: AssignChatThreadDto,
  ) {
    return this.chatService.assign(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.STAFF,
  )
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateChatThreadStatusDto,
  ) {
    return this.chatService.updateStatus(user, id, dto);
  }
}
