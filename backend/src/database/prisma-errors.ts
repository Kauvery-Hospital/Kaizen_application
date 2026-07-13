/** Detect unique violation on `suggestions.code` (Prisma + driver adapter shapes). */
export function isUniqueConstraintOnSuggestionCode(err: unknown): boolean {
  const e = err as {
    code?: string;
    message?: string;
    meta?: {
      target?: string | string[];
      driverAdapterError?: {
        cause?: { constraint?: { fields?: string[] } };
      };
    };
  };
  if (e?.code !== 'P2002') return false;

  const target = e.meta?.target;
  if (target === 'code' || (Array.isArray(target) && target.includes('code'))) {
    return true;
  }

  const fields = e.meta?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(fields) && fields.includes('code')) {
    return true;
  }

  const msg = String(e.message ?? '');
  return (
    msg.includes('suggestions_code_key') ||
    msg.includes('fields: (`code`)') ||
    msg.includes('fields: (code)')
  );
}
