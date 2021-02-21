import childProcess from 'child_process';
import { merge, Observable, of, timer } from 'rxjs';
import { concatMap, distinctUntilChanged, filter, finalize, ignoreElements, map, mapTo, tap } from 'rxjs/operators';
import { HIDClient } from '../hid-client';

enum MessageType {
  HELLO,
  HEARTBEAT,
}

const unmute = (unmute: boolean) =>
  new Promise<void>((resolve, reject) => {
    console.log('Recording:', unmute);
    childProcess.exec(`osascript -e "set volume input volume ${unmute ? 100 : 0}"`, (err, stdout, stderr) => {
      if (err) {
        console.error('Failed to set input volume:', err);
        console.error('Command stdout:', stdout);
        console.error('Command stderr:', stderr);
        return reject(err);
      }
      resolve();
    });
  });

const sendHeartbeats = (client: HIDClient): Observable<never> =>
  merge(of(MessageType.HELLO), timer(100, 4000).pipe(mapTo(MessageType.HEARTBEAT))).pipe(
    tap((type) => client.write(Buffer.from([type]))),
    ignoreElements(),
  );

const muteUnmute = (client: HIDClient): Observable<never> =>
  client.data().pipe(
    filter((buffer) => buffer.length >= 2 && buffer[0] === 1),
    map((buffer) => buffer[1] !== 0),
    distinctUntilChanged(),
    concatMap(unmute),
    ignoreElements(),
    finalize(() => unmute(true)),
  );

export const recordingHandler = (client: HIDClient): Observable<never> =>
  merge(sendHeartbeats(client), muteUnmute(client));
