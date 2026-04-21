import { join } from 'path';

export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** Absolute path where kaizen/{employeeCode}/... files are stored */
  uploadRoot:
    process.env.KAIZEN_UPLOAD_ROOT ??
    join(process.cwd(), 'uploads', 'kaizen_storage'),
});
