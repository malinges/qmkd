import { defer, Observable, ReplaySubject, timer } from 'rxjs';
import { catchError, ignoreElements, repeat, switchMap, takeUntil, tap } from 'rxjs/operators';
import { recordingHandler } from './handlers/recording';
import { HIDClient } from './hid-client';

const VENDOR_ID = 0x4b50;
const PRODUCT_ID = 0xef8d;
const USAGE_PAGE = 0xff60;
const USAGE_ID = 0x61;

const interruptedSubject = new ReplaySubject<void>(1);
process.on('SIGINT', () => interruptedSubject.next());

const main$: Observable<any> = defer(() => {
  console.log('Looking for device...');
  return HIDClient.connect(VENDOR_ID, PRODUCT_ID, USAGE_PAGE, USAGE_ID);
}).pipe(
  tap((client) => console.log(`Found device: ${client.deviceName}`)),
  switchMap((client) => recordingHandler(client)),
  catchError((error) => {
    console.error('ERROR:', error);
    return timer(1000).pipe(ignoreElements());
  }),
  repeat(),
  takeUntil(interruptedSubject),
);

main$.subscribe();
