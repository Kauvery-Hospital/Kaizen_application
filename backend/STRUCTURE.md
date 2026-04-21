# Simple Backend Structure

src/
  main.ts
  app.module.ts

  config/
    configuration.ts

  common/
    decorators/
    filters/
    guards/
    interceptors/
    pipes/

  database/
    prisma.module.ts
    prisma.service.ts
    repositories/
    seeds/

  modules/
    health/
      health.module.ts
      health.controller.ts

    auth/
      auth.module.ts
      auth.controller.ts
      auth.service.ts
      dto/

    users/
      users.module.ts
      users.controller.ts
      users.service.ts
      dto/

    suggestions/
      suggestions.module.ts
      suggestions.controller.ts
      suggestions.service.ts
      dto/

    workflow/
      workflow.module.ts
      workflow.controller.ts
      workflow.service.ts
      dto/

    attachments/
      attachments.module.ts
      attachments.controller.ts
      attachments.service.ts
      dto/

    hrms-sync/
      hrms-sync.module.ts
      hrms-sync.controller.ts
      hrms-sync.service.ts
      dto/
