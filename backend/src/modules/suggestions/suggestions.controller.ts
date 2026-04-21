import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { mapTokenRolesToAppRoles } from '../auth/auth-role-mapping';
import {
  JwtAuthGuard,
  type JwtAccessPayload,
} from '../auth/guards/jwt-auth.guard';
import { SuggestionsService } from './suggestions.service';
import { PptxExportService } from './pptx-export.service';
import { CreateSuggestionDto } from './dto/create-suggestion.dto';
import { UpdateSuggestionStatusDto } from './dto/update-suggestion-status.dto';
import { ListSuggestionsQueryDto } from './dto/list-suggestions-query.dto';
import { AppRole } from './suggestions.types';

@Controller('suggestions')
@UseGuards(JwtAuthGuard)
export class SuggestionsController {
  constructor(
    private readonly suggestionsService: SuggestionsService,
    private readonly pptxExport: PptxExportService,
  ) {}

  @Post()
  create(
    @Req() req: { user: JwtAccessPayload },
    @Body() dto: CreateSuggestionDto,
  ) {
    return this.suggestionsService.create(
      {
        ...dto,
        actorName: dto.actorName ?? req.user.name,
        employeeName: dto.employeeName ?? req.user.name,
      },
      { employeeCode: req.user.employeeCode },
    );
  }

  @Get()
  list(
    @Req() req: { user: JwtAccessPayload },
    @Query() query: ListSuggestionsQueryDto,
  ) {
    const allowedRoles = mapTokenRolesToAppRoles(req.user.roles ?? []);
    const role =
      query.role && allowedRoles.includes(query.role)
        ? query.role
        : allowedRoles[0];
    return this.suggestionsService.list(
      role,
      query.currentUserName ?? req.user.name,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.suggestionsService.findOne(id);
  }

  @Get(':id/pptx')
  async downloadPptx(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buf = await this.pptxExport.buildSuggestionPptx(id);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    res.setHeader('Content-Disposition', `attachment; filename="kaizen-${id}.pptx"`);
    res.send(buf);
  }

  @Post(':id/pptx/rendered')
  async downloadRenderedPptx(
    @Param('id') id: string,
    @Body() body: { slides?: string[]; fileNameBase?: string },
    @Res() res: Response,
  ) {
    // `id` is kept in the route for authorization/auditing symmetry with other suggestion endpoints.
    // The PPT is built purely from the rendered slides sent by the client.
    const buf = await this.pptxExport.buildRenderedSlidesPptx(body?.slides ?? []);
    const base = String(body?.fileNameBase || `kaizen-${id}`).replace(/[^a-zA-Z0-9-_]/g, '');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${base || `kaizen-${id}`}.pptx"`);
    res.send(buf);
  }

  @Post(':id/template/finalize')
  async finalizeTemplate(
    @Param('id') id: string,
    @Body() body: { slides?: string[]; fileNameBase?: string },
  ) {
    return await this.pptxExport.finalizeTemplateAssets(
      id,
      body?.slides ?? [],
      body?.fileNameBase,
    );
  }

  @Patch(':id/status')
  updateStatus(
    @Req() req: { user: JwtAccessPayload },
    @Param('id') id: string,
    @Body() dto: UpdateSuggestionStatusDto,
  ) {
    const allowedRoles = mapTokenRolesToAppRoles(req.user.roles ?? []);
    const actorRole: AppRole =
      dto.actor?.role && allowedRoles.includes(dto.actor.role)
        ? dto.actor.role
        : allowedRoles[0];

    return this.suggestionsService.updateStatus(id, {
      ...dto,
      actor: {
        ...dto.actor,
        name: dto.actor?.name || req.user.name,
        role: actorRole,
      },
    });
  }
}
