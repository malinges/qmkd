import childProcess from 'child_process';
import { concat, EMPTY, merge, Observable } from 'rxjs';
import { catchError, concatMap, filter, finalize, ignoreElements, map } from 'rxjs/operators';
import { HIDClient } from '../hid-client';

enum InputMessage {
  RECORDING_UPDATE,
}

enum OutputMessage {
  RECORDING_QUERY,
  RECORDING_ACK,
}

const sendQuery = (client: HIDClient) => client.write(Buffer.of(OutputMessage.RECORDING_QUERY));

const sendAck = (client: HIDClient, recording: boolean) =>
  client.write(Buffer.of(OutputMessage.RECORDING_ACK, +recording));

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

const processUpdates = (client: HIDClient) =>
  client.data().pipe(
    filter((buffer) => buffer.length >= 2 && buffer[0] === InputMessage.RECORDING_UPDATE),
    map((buffer) => buffer[1] !== 0),
    concatMap((recording) =>
      concat(unmute(recording), sendAck(client, recording)).pipe(
        catchError((err) => {
          console.error('Failed to process update:', err);
          return EMPTY;
        }),
      ),
    ),
  );

export const recordingHandler = (client: HIDClient): Observable<never> =>
  merge(processUpdates(client), sendQuery(client)).pipe(
    ignoreElements(),
    finalize(() => unmute(true)),
  );
