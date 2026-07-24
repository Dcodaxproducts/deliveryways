import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Public } from '../../common/decorators';
import { OptionalJwtAuthGuard } from '../../common/guards';
import { PublicRestaurantQueryDto, SubmitContactFormDto } from './dto';
import { CustomerAppService } from './customer-app.service';
import { AcceptLanguageQueryInterceptor } from './accept-language-query.interceptor';

@ApiTags('Public Content')
@Controller('public-content')
export class PublicContentController {
  constructor(private readonly customerAppService: CustomerAppService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @UseInterceptors(AcceptLanguageQueryInterceptor)
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
  @UseInterceptors(AcceptLanguageQueryInterceptor)
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
  @UseInterceptors(AcceptLanguageQueryInterceptor)
  @Get('about-us')
  @ApiOperation({ summary: 'Fetch public About Us content' })
  getAboutUs(
    @CurrentUser() user: AuthUserContext | undefined,
    @Query() query: PublicRestaurantQueryDto,
  ) {
    return this.customerAppService.getAboutUs(query, user);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post('contact-form')
  @ApiOperation({ summary: 'Submit public contact form message' })
  submitContactForm(
    @CurrentUser() user: AuthUserContext | undefined,
    @Query() query: PublicRestaurantQueryDto,
    @Body() dto: SubmitContactFormDto,
  ) {
    return this.customerAppService.submitContactForm(query, dto, user);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @UseInterceptors(AcceptLanguageQueryInterceptor)
  @Get('faqs')
  @ApiOperation({ summary: 'Fetch public FAQ content' })
  getFaqs(
    @CurrentUser() user: AuthUserContext | undefined,
    @Query() query: PublicRestaurantQueryDto,
  ) {
    return this.customerAppService.getFaqs(query, user);
  }
}
