import * as Influx from 'influx';
import { defer, Observable } from 'rxjs';
import { bufferTime, filter, ignoreElements, map, mergeMap } from 'rxjs/operators';
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
            n: Influx.FieldType.INTEGER,
          },
          tags: [],
        },
      ],
    });

    return client.data().pipe(
      filter((buffer) => buffer.length >= 1 && buffer[0] === InputMessage.WPM_KEYPRESS),
      map<Buffer, Influx.IPoint>((buf) => ({ fields: { n: 1 }, timestamp: new Date() })),
      bufferTime(1000),
      mergeMap((points) => influx.writeMeasurement(INFLUX_MEASUREMENT!, points)),
    );
  });

export const wpmHandler = (client: HIDClient): Observable<never> => processUpdates(client).pipe(ignoreElements());
