import { ignoreElements, map, scan } from 'rxjs/operators';
import { HIDClient } from '../hid-client';

export const debugConsole = (client: HIDClient) =>
  client.data().pipe(
    map((data) => data.toString('utf8').replace(/\0+$/g, '')),
    scan((lastPending, received) => {
      const lines = (lastPending + received).split(/(?:\r|\n|\r\n)/);
      const pending = lines.pop()!;
      lines.forEach((line) => process.stdout.write('[console] ' + line));
      return pending;
    }, ''),
    ignoreElements(),
  );
