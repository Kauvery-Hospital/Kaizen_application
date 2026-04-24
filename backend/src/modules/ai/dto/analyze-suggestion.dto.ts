import { IsString } from 'class-validator';

export class AnalyzeSuggestionDto {
  @IsString()
  title!: string;

  @IsString()
  context!: string;
}

