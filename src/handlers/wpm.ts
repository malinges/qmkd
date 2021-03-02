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

    const influx = new Influx.InfluxDB({
      host: process.env.INFLUX_HOST!,
      username: process.env.INFLUX_USERNAME!,
      password: process.env.INFLUX_PASSWORD!,
      database: process.env.INFLUX_DATABASE!,
      schema: [
        {
          measurement: process.env.INFLUX_MEASUREMENT!,
          fields: {
            wpm: Influx.FieldType.INTEGER,
          },
          tags: [],
        },
      ],
    });

    return client.data().pipe(
      filter((buffer) => buffer.length >= 2 && buffer[0] === InputMessage.WPM_UPDATE),
      map<Buffer, Influx.IPoint>((buf) => ({ fields: { wpm: buf[1] }, timestamp: new Date() })),
      tap((point) => console.log('WPM:', point.fields?.wpm)),
      bufferTime(1000),
      mergeMap((points) => influx.writeMeasurement('wpm', points)),
    );
  });

export const wpmHandler = (client: HIDClient): Observable<never> => processUpdates(client).pipe(ignoreElements());
