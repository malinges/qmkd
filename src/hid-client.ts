import HID from 'node-hid';
import { defer, merge, Observable, of, Subject, throwError } from 'rxjs';
import { delay, filter, finalize, first, ignoreElements, repeat, switchMap } from 'rxjs/operators';
import usbDetection from 'usb-detection';

const connectedDevices$: Observable<HID.Device[]> = defer(() => of(HID.devices()));

const deviceAddEventsSubject = new Subject<usbDetection.Device>();
usbDetection.startMonitoring();
process.on('beforeExit', () => usbDetection.stopMonitoring());
usbDetection.on('add', (device) => deviceAddEventsSubject.next(device));
const deviceAddEvents$ = deviceAddEventsSubject.asObservable();

const locateDevice = (
  vendorId: number,
  productId: number,
  usagePage: number,
  usageId: number,
): Observable<HID.Device> => {
  return connectedDevices$.pipe(
    switchMap((devices) => {
      const device = devices.find(
        (device) =>
          device.vendorId === vendorId &&
          device.productId === productId &&
          device.usagePage === usagePage &&
          device.usage === usageId,
      );

      if (device) return of(device);

      return deviceAddEvents$.pipe(
        filter((device) => device.vendorId === vendorId && device.productId === productId),
        first(),
        delay(100),
        ignoreElements(),
      );
    }),
    repeat(),
    first(),
  );
};

export class HIDClient {
  static connect(vendorId: number, productId: number, usagePage: number, usageId: number): Observable<HIDClient> {
    return locateDevice(vendorId, productId, usagePage, usageId).pipe(
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
