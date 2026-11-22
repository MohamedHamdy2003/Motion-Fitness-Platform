import { createApp } from './bootstrap';
import { environment } from './config/environment';

void createApp()
  .then(async (app) => {
    const server = await app.listen(environment().PORT, '0.0.0.0');
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
  })
  .then(() => process.stdout.write('Motion API listening\n'))
  .catch(() => {
    process.stderr.write(
      'Motion API startup failed; verify configuration and database\n',
    );
    process.exitCode = 1;
  });
