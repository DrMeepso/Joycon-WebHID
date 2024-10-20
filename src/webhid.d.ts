// webhid.d.ts

interface HID extends EventTarget {
    getDevices(): Promise<HIDDevice[]>;
    requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
    onconnect: ((this: HID, ev: HIDConnectionEvent) => any) | null;
    ondisconnect: ((this: HID, ev: HIDConnectionEvent) => any) | null;
}

interface HIDDevice extends EventTarget {
    opened: boolean;
    vendorId: number;
    productId: number;
    productName?: string;
    collections: HIDCollectionInfo[];

    open(): Promise<void>;
    close(): Promise<void>;
    sendReport(reportId: number, data: BufferSource): Promise<void>;
    sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
    receiveFeatureReport(reportId: number): Promise<DataView>;

    oninputreport: ((this: HIDDevice, ev: HIDInputReportEvent) => any) | null;
}

interface HIDDeviceRequestOptions {
    filters: HIDDeviceFilter[];
}

interface HIDDeviceFilter {
    vendorId?: number;
    productId?: number;
    usagePage?: number;
    usage?: number;
}

interface HIDCollectionInfo {
    usagePage: number;
    usage: number;
    type: HIDCollectionType;
    children: HIDCollectionInfo[];
    reports: HIDReportInfo[];
}

type HIDCollectionType = 'application' | 'physical' | 'logical' | 'report' | 'named_array' | 'usage_switch' | 'usage_modifier';

interface HIDReportInfo {
    reportId: number;
    items: HIDReportItem[];
}

interface HIDReportItem {
    isAbsolute: boolean;
    isArray: boolean;
    isRange: boolean;
    isVolatile: boolean;
    hasNull: boolean;
    usages: number[];
    usageMinimum?: number;
    usageMaximum?: number;
    reportSize: number;
    reportCount: number;
    unitExponent: number;
    unitSystem: HIDUnitSystem;
    logicalMinimum: number;
    logicalMaximum: number;
    physicalMinimum?: number;
    physicalMaximum?: number;
}

type HIDUnitSystem = 'none' | 'si_linear' | 'si_rotation' | 'english_linear' | 'english_rotation' | 'vendor_defined' | 'reserved';

interface HIDInputReportEvent extends Event {
    device: HIDDevice;
    reportId: number;
    data: DataView;
}

interface HIDConnectionEvent extends Event {
    device: HIDDevice;
}

// Extend the navigator interface to include HID
interface Navigator {
    hid: HID;
}
