import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Public } from '../../common/decorators';
import { OptionalJwtAuthGuard } from '../../common/guards';
import { PublicRestaurantQueryDto } from './dto';
import { CustomerAppService } from './customer-app.service';

@ApiTags('Public Content')
@Controller('public-content')
export class PublicContentController {
  constructor(private readonly customerAppService: CustomerAppService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('privacy-policy')
  @ApiOperation({ summary: 'Fetch public privacy policy content' })
  getPrivacyPolicy(
    @CurrentUser() user: AuthUserContext | undefined,
    @Query() query: PublicRestaurantQueryDto,
  ) {
    return this.customerAppService.getPrivacyPolicy(query, user);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('help-support')
  @ApiOperation({ summary: 'Fetch public help and support content' })
  getHelpSupport(
    @CurrentUser() user: AuthUserContext | undefined,
    @Query() query: PublicRestaurantQueryDto,
  ) {
    return this.customerAppService.getHelpSupport(query, user);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('faqs')
  @ApiOperation({ summary: 'Fetch public FAQ content' })
  getFaqs(
    @CurrentUser() user: AuthUserContext | undefined,
    @Query() query: PublicRestaurantQueryDto,
  ) {
    return this.customerAppService.getFaqs(query, user);
  }
}
