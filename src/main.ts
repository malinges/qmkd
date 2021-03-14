import { defer, merge, Observable, ReplaySubject, timer } from 'rxjs';
import { catchError, ignoreElements, repeat, switchMap, takeUntil, tap } from 'rxjs/operators';
import { debugConsole } from './handlers/debug-console';
import { recordingHandler } from './handlers/recording';
import { wpmHandler } from './handlers/wpm';
import { DeviceFilter, HIDClient } from './hid-client';

interface DevicePipe {
  name: string;
  filter: DeviceFilter;
  onConnected: (client: HIDClient) => Observable<any>;
}

const PIPES: DevicePipe[] = [
  {
    name: 'rawhid',
    filter: { usagePage: 0xff60, usage: 0x61 },
    onConnected: (client) => merge(recordingHandler(client), wpmHandler(client)),
  },
  {
    name: 'console',
    filter: { usagePage: 0xff31, usage: 0x74 },
    onConnected: (client) => debugConsole(client),
  },
];

const interruptedSubject = new ReplaySubject<void>(1);
process.on('SIGINT', () => interruptedSubject.next());

const main$: Observable<any> = merge(
  ...PIPES.map((pipe) =>
    defer(() => {
      console.log(`[${pipe.name}] Looking for device...`);
      return HIDClient.connect(pipe.filter);
    }).pipe(
      tap((client) => console.log(`[${pipe.name}] Found device: ${client.deviceName}`)),
      switchMap(pipe.onConnected),
      catchError((error) => {
        console.error(`[${pipe.name}] ERROR:`, error);
        return timer(1000).pipe(ignoreElements());
      }),
      repeat(),
      takeUntil(interruptedSubject),
    ),
  ),
);

main$.subscribe();
