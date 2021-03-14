import * as Influx from 'influx';
import { defer, Observable } from 'rxjs';
import { bufferTime, filter, ignoreElements, map, mergeMap, tap } from 'rxjs/operators';
import { InputMessage } from '.';
import { HIDClient } from '../hid-client';

const ENV_VARS = ['INFLUX_HOST', 'INFLUX_USERNAME', 'INFLUX_PASSWORD', 'INFLUX_DATABASE', 'INFLUX_MEASUREMENT'];

const processUpdates = (client: HIDClient) =>
  defer(() => {
    ENV_VARS.forEach((envVar) => {
      if (!process.env[envVar]) {
        throw new Error(`invalid config: missing environment variable ${envVar}`);
      }
    });

    const { INFLUX_HOST, INFLUX_USERNAME, INFLUX_PASSWORD, INFLUX_DATABASE, INFLUX_MEASUREMENT } = process.env;

    const influx = new Influx.InfluxDB({
      host: INFLUX_HOST!,
      username: INFLUX_USERNAME!,
      password: INFLUX_PASSWORD!,
      database: INFLUX_DATABASE!,
      schema: [
        {
          measurement: INFLUX_MEASUREMENT!,
          fields: {
            wpm: Influx.FieldType.INTEGER,
            kp: Influx.FieldType.INTEGER,
          },
          tags: [],
        },
      ],
    });

    return client.data().pipe(
      filter((buffer) => buffer.length >= 3 && buffer[0] === InputMessage.WPM_KEYPRESS),
      map<Buffer, Influx.IPoint>((buf) => ({ fields: { wpm: buf[1], kp: buf[2] }, timestamp: new Date() })),
      tap((point) => console.log(`[wpm] WPM: ${point.fields!.wpm} (KP: ${point.fields!.kp})`)),
      bufferTime(1000),
      filter((points) => points.length > 0),
      mergeMap((points) => influx.writeMeasurement(INFLUX_MEASUREMENT!, points)),
    );
  });

export const wpmHandler = (client: HIDClient): Observable<never> => processUpdates(client).pipe(ignoreElements());
