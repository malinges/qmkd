import HID from 'node-hid';
import { defer, from, merge, Observable, of, Subject, throwError } from 'rxjs';
import { delay, finalize, first, repeat, repeatWhen, shareReplay, switchMap } from 'rxjs/operators';
import usbDetection from 'usb-detection';

export interface DeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

const deviceAddEventsSubject = new Subject<usbDetection.Device>();
usbDetection.startMonitoring();
process.on('beforeExit', () => usbDetection.stopMonitoring());
usbDetection.on('add', (device) => deviceAddEventsSubject.next(device));
const deviceAddEvents$ = deviceAddEventsSubject.pipe(delay(100));

const connectedDevices$: Observable<HID.Device[]> = defer(() => of(HID.devices())).pipe(
  repeatWhen(() => deviceAddEvents$),
  shareReplay({ refCount: true, bufferSize: 1 }),
);

const locateDevice = (deviceFilter: DeviceFilter): Observable<HID.Device> => {
  return connectedDevices$.pipe(
    switchMap((devices) => from(devices)),
    repeat(),
    first(
      (device) =>
        (deviceFilter.vendorId == null || device.vendorId === deviceFilter.vendorId) &&
        (deviceFilter.productId == null || device.productId === deviceFilter.productId) &&
        (deviceFilter.usagePage == null || device.usagePage === deviceFilter.usagePage) &&
        (deviceFilter.usage == null || device.usage === deviceFilter.usage),
    ),
  );
};

export class HIDClient {
  static connect(deviceFilter: DeviceFilter): Observable<HIDClient> {
    return locateDevice(deviceFilter).pipe(
      switchMap((device) => {
        const client = new HIDClient(device);
        return merge(of(client), client._errorSubject).pipe(finalize(() => client._close()));
      }),
    );
  }

  private readonly _hid: HID.HID;

  private readonly _dataSubject = new Subject<Buffer>();
  private readonly _data$ = this._dataSubject.asObservable();

  private readonly _errorSubject = new Subject<never>();

  private readonly _writeBufferPrefix = Buffer.from([0]);

  readonly deviceName: string;

  private constructor(device: HID.Device) {
    this.deviceName = `[${device.manufacturer}] ${device.product}`;
    this._hid = new HID.HID(device.path!);
    this._hid.on('data', (buffer) => this._dataSubject.next(buffer));
    this._hid.on('error', (error) => this._errorSubject.error(error));
  }

  data(): Observable<Buffer> {
    return this._data$;
  }

  write(buffer: Buffer): Observable<void> {
    return defer(() => {
      try {
        this._hid.write(Buffer.concat([this._writeBufferPrefix, buffer]));
      } catch (error) {
        return throwError(error);
      }
      return of(undefined);
    });
  }

  private _close() {
    this._hid.close();
    this._dataSubject.complete();
    this._errorSubject.complete();
  }
}
