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

const unmute = (unmute: boolean) =>
  new Promise<void>((resolve, reject) => {
    console.log('Recording:', unmute);
    const proc = child_process.spawn('osascript', ['-e', `set volume input volume ${unmute ? 100 : 0}`], {
      stdio: 'inherit',
    });
    proc.once('error', (error) => reject(error));
    proc.once('exit', (code) => {
      if (code === 0) resolve();
      else if (code) reject(new Error(`Command exited with code ${code}`));
      else reject(new Error(`Command was killed by signal ${proc.signalCode}`));
    });
  });

const processUpdates = (client: HIDClient) =>
  client.data().pipe(
    filter((buffer) => buffer.length >= 2 && buffer[0] === InputMessage.RECORDING_UPDATE),
    map((buffer) => buffer[1] !== 0),
    concatMap((recording) =>
      concat(unmute(recording), sendAck(client, recording)).pipe(
        catchError((error) => {
          console.error('Failed to process recording update:', error);
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
