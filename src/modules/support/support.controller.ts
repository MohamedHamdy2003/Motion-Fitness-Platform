import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../../common/auth.guard';
import { ApiRequest, parse } from '../../common/http';
import { ContentGuard } from '../content/content.guard';
import {
  adminFaqCreateInput,
  adminFaqListQuery,
  adminFaqPatchInput,
  adminLegalCreateInput,
  adminLegalListQuery,
  faqPublicQuery,
  legalAcceptanceInput,
  legalPublicQuery,
} from './support.dto';
import { SupportService } from './support.service';

@Controller()
export class SupportController {
  constructor(
    @Inject(SupportService)
    private readonly support: SupportService,
  ) {}

  @Get('faq')
  listFaq(@Query() rawQuery: unknown) {
    return this.support.listPublicFaq(parse(faqPublicQuery, rawQuery));
  }

  @Get('legal/terms')
  getTerms(@Query() rawQuery: unknown) {
    const q = parse(legalPublicQuery, rawQuery);
    return this.support.getActiveLegalDocument('TERMS', q.locale);
  }

  @Get('legal/privacy')
  getPrivacy(@Query() rawQuery: unknown) {
    const q = parse(legalPublicQuery, rawQuery);
    return this.support.getActiveLegalDocument('PRIVACY', q.locale);
  }

  @Get('me/legal-acceptances')
  @UseGuards(AuthGuard)
  listAcceptances(@Req() req: ApiRequest) {
    return this.support.listUserLegalAcceptances(req.principal.userId);
  }

  @Post('me/legal-acceptances')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  acceptLegal(@Req() req: ApiRequest, @Body() body: unknown) {
    const input = parse(legalAcceptanceInput, body);
    return this.support.acceptLegalDocument(
      req.principal.userId,
      input.documentId,
    );
  }

  @Get('admin/faq')
  @UseGuards(AuthGuard, ContentGuard)
  listAdminFaq(@Query() rawQuery: unknown) {
    return this.support.listAdminFaq(parse(adminFaqListQuery, rawQuery));
  }

  @Post('admin/faq')
  @UseGuards(AuthGuard, ContentGuard)
  createAdminFaq(@Body() body: unknown) {
    return this.support.createAdminFaq(parse(adminFaqCreateInput, body));
  }

  @Patch('admin/faq/:id')
  @UseGuards(AuthGuard, ContentGuard)
  updateAdminFaq(@Param('id') id: string, @Body() body: unknown) {
    return this.support.updateAdminFaq(
      parse(z.uuid(), id),
      parse(adminFaqPatchInput, body),
    );
  }

  @Delete('admin/faq/:id')
  @UseGuards(AuthGuard, ContentGuard)
  deleteAdminFaq(@Param('id') id: string) {
    return this.support.deleteAdminFaq(parse(z.uuid(), id));
  }

  @Get('admin/legal')
  @UseGuards(AuthGuard, ContentGuard)
  listAdminLegal(@Query() rawQuery: unknown) {
    return this.support.listAdminLegal(parse(adminLegalListQuery, rawQuery));
  }

  @Post('admin/legal')
  @UseGuards(AuthGuard, ContentGuard)
  createAdminLegal(@Body() body: unknown) {
    return this.support.createAdminLegal(parse(adminLegalCreateInput, body));
  }
}
