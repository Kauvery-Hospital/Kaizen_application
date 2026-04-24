import { IsObject } from 'class-validator';

export class EvaluateKaizenDto {
  @IsObject()
  suggestionData!: Record<string, unknown>;
}

