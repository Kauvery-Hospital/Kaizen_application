import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { AnalyzeSuggestionDto } from './dto/analyze-suggestion.dto';
import { EvaluateKaizenDto } from './dto/evaluate-kaizen.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('analyze-suggestion')
  analyzeSuggestion(@Body() dto: AnalyzeSuggestionDto) {
    return this.ai.analyzeSuggestion(dto.title, dto.context);
  }

  @Post('evaluate-kaizen')
  evaluateKaizen(@Body() dto: EvaluateKaizenDto) {
    // Keep criteria matrix definition on backend to avoid coupling Gemini to UI.
    const criteriaList = [
      'productivity (Productivity): Options [Level 1=1, Level 2=3, Level 3=5, Level 4=8]',
      'originality (Originality): Options [Level 1=1, Level 2=3, Level 3=5, Level 4=10]',
      'efforts (Efforts): Options [Level 1=1, Level 2=3, Level 3=5, Level 4=8]',
      'horizontal (Horizontal Deployment): Options [Level 1=0, Level 2=2, Level 3=5, Level 4=8]',
      'hse (HSE): Options [Level 1=0, Level 2=1, Level 3=3, Level 4=5]',
      'qualitative (Qualitative): Options [Level 1=1, Level 2=3, Level 3=5, Level 4=8]',
      'cost (Cost): Options [Level 1=1, Level 2=3, Level 3=5, Level 4=8]',
    ].join('\n');

    return this.ai.evaluateKaizen(dto.suggestionData, criteriaList);
  }
}

