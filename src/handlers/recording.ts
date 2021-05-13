import child_process from 'child_process';
import { concat, EMPTY, merge, Observable, timer } from 'rxjs';
import { catchError, concatMap, delay, filter, finalize, ignoreElements, map, take } from 'rxjs/operators';
import { InputMessage, OutputMessage } from '.';
import { HIDClient } from '../hid-client';

const sendQuery = (client: HIDClient) => client.write(Buffer.of(OutputMessage.RECORDING_QUERY));

const sendAck = (client: HIDClient, recording: boolean) =>
  client.write(Buffer.of(OutputMessage.RECORDING_ACK, +recording));

const STARTUP_HELLO_INTERVAL = 500;

const sendStartupHello = (client: HIDClient) =>
  timer(0, STARTUP_HELLO_INTERVAL).pipe(
    take(5),
    concatMap((i) => sendAck(client, !!(i % 2))),
    delay(STARTUP_HELLO_INTERVAL),
  );

const unmuteCommand = (unmute: boolean) => {
  switch (process.platform) {
    case 'linux':
      return `pactl set-source-mute $(pacmd list-sources | awk '/* index:/{print $3}') ${unmute ? 0 : 1}`;
    case 'darwin':
      return `osascript -e "set volume input volume ${unmute ? 100 : 0}"`;
    default:
      throw new Error('unmute: unsupported platform');
  }
};

const unmute = (unmute: boolean) =>
  new Promise<void>((resolve, reject) => {
    console.log('[recording] Recording:', unmute);
    child_process.exec(unmuteCommand(unmute), (error, stdout, stderr) => {
      process.stdout.write(stdout);
      if (error) {
        process.stderr.write(stderr);
        if (error.code) reject(new Error(`Command exited with code ${error.code}`));
        else if (error.signal) reject(new Error(`Command was killed by signal ${error.signal}`));
      } else {
        resolve();
      }
    });
  });

const processUpdates = (client: HIDClient) =>
  client.data().pipe(
    filter((buffer) => buffer.length >= 2 && buffer[0] === InputMessage.RECORDING_UPDATE),
    map((buffer) => buffer[1] !== 0),
    concatMap((recording) =>
      concat(unmute(recording), sendAck(client, recording)).pipe(
        catchError((error) => {
          console.error('[recording] Failed to process recording update:', error);
          return EMPTY;
        }),
      ),
    ),
  );

export const recordingHandler = (client: HIDClient): Observable<never> =>
  concat(sendStartupHello(client), merge(processUpdates(client), sendQuery(client))).pipe(
    ignoreElements(),
    finalize(() => unmute(true)),
  );
