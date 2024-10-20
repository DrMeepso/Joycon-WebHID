const Button = document.getElementById('connect');
const Out = document.getElementById('CurrentData');

if (Button == null || Out == null)
    throw new Error('Could not find the button or output element');

Button.addEventListener('click', async () => {

    const HIDDevice = await navigator.hid.requestDevice({

        filters: [
            {
                vendorId: 1406, // this is the vendor ID for Nintendo!
            }
        ]

    })

    if (HIDDevice.length == 0) {
        alert('You didnt select a device!');
        return;
    }

    for (const device of HIDDevice) {
        HandelNewJoycon(device);
    }

});

type CallBackRequest = {
    subCommand: number;
    cb: (data: Uint8Array) => void;
}

const Callbacks = new Map<HIDDevice, CallBackRequest[]>();

type DeviceJoyStickInfo = {
    xcenter: number;
    ycenter: number;
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
}

const DeviceJoyStickInfo = new Map<HIDDevice, DeviceJoyStickInfo>();
const IsDeviceLeftJoyCon = new Map<HIDDevice, boolean>();

const AllConnectedDevices = new Array<HIDDevice>();

function HandelNewJoycon(device: HIDDevice) {
    // @ts-ignore TS dosent know about the HID API
    device.open().then(() => {

        AllConnectedDevices.push(device);

        console.log('Connected to Joycon');
        device.oninputreport = (event) => {
            let data = event.data.buffer;
            // convert the data to hex
            let hex = Array.from(new Uint8Array(data)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
            // add the report id to the start of the hex
            hex = event.reportId.toString(16).padStart(2, "0") + " " + hex;

            // create a new unint8array that has the report id at the start and the rest of the data
            let newData = new Uint8Array(data.byteLength + 1);
            newData[0] = event.reportId;
            newData.set(new Uint8Array(data), 1);

            ParseInputPacket(newData, device);
        }

        // send a request device info subcommand
        // this will get the device info

        let subCommand = 0x02;
        let data = new Uint8Array(0);
        // add a callback for the subcommand

        const LocalCBs = []

        LocalCBs.push({
            subCommand: 8202,
            cb: (data: Uint8Array) => {
                let view = new DataView(data.buffer);

                let hex = Array.from(new Uint8Array(data)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
                console.log('Sub Command Data: ' + hex);

                let info = {
                    firmwareVersion: view.getUint16(0, true),
                    type: view.getUint8(2),
                    macAddress: Array.from(new Uint8Array(data.slice(4, 9))).map((b) => b.toString(16).padStart(2, "0")).join(":")
                }

                console.log('Device Info: ' + JSON.stringify(info, null, 2));

                if (info.type == 1) {
                    IsDeviceLeftJoyCon.set(device, true);
                } else if (info.type == 2) {
                    IsDeviceLeftJoyCon.set(device, false);
                } else {
                    console.warn("Pro Controller Is Not Supported!");
                }

                getStickData();

            }
        });

        // send the command
        SendHIDCommand(device, CreateSubCommandBuffer(subCommand, data, device));

        // because the device is new, we need to get the joystick calibration data!
        // we need to send a x01 command with the subcommand x10

        function getStickData() {
            subCommand = 0x10;
            data = new Uint8Array(5);
            // the first 4 bytes are the address of the calibration data
            // for the left stick it is 0x603D - 0x6045
            // for the right stick it is 0x6046 - 0x604E

            // create a data writer
            let view = new DataView(data.buffer);
            // write the address of the left stick calibration data
            if (IsDeviceLeftJoyCon.get(device) == true)
                view.setUint16(0, 0x603D, true);
            else
                view.setUint16(0, 0x6046, true);

            // write the size of the calibration data
            view.setUint8(4, 9);

            // send the command
            SendHIDCommand(device, CreateSubCommandBuffer(subCommand, data, device));

        }

        // add a callback for the subcommand
        LocalCBs.push({
            subCommand: 9010,
            cb: (data: Uint8Array) => {
                console.log(data.buffer.slice(5))
                let view = new DataView(data.buffer.slice(5));

                let hex = Array.from(new Uint8Array(data)).map((b) => b.toString(16).padStart(2, "0")).join(" ");

                let stick_cal = [
                    view.getUint8(0),
                    view.getUint8(1),
                    view.getUint8(2),
                    view.getUint8(3),
                    view.getUint8(4),
                    view.getUint8(5),
                    view.getUint8(6),
                    view.getUint8(7),
                    view.getUint8(8)
                ]

                let actualData = [
                    unsignedLeftShift(stick_cal[1], 8) & 0xF00 | stick_cal[0], // xAbove Center
                    unsignedLeftShift(stick_cal[2], 4) | (stick_cal[1] >>> 4), // yAbove Center
                    unsignedLeftShift(stick_cal[4], 8) & 0xF00 | stick_cal[3], // xCenter
                    unsignedLeftShift(stick_cal[5], 4) | (stick_cal[4] >>> 4), // yCenter
                    unsignedLeftShift(stick_cal[7], 8) & 0xF00 | stick_cal[6], // xBelow Center
                    unsignedLeftShift(stick_cal[8], 4) | (stick_cal[7] >>> 4), // yBelow Center
                ]

                let xcenter, ycenter, xmin, xmax, ymin, ymax;

                if (IsDeviceLeftJoyCon.get(device) == true) {
                    xcenter = actualData[2];
                    ycenter = actualData[3];

                    xmin = xcenter - actualData[4]
                    xmax = xcenter + actualData[1]
                    ymin = ycenter - actualData[5]
                    ymax = ycenter + actualData[0]
                } else {
                    xcenter = actualData[0];
                    ycenter = actualData[1];

                    xmin = xcenter - actualData[2]
                    xmax = xcenter + actualData[4]
                    ymin = ycenter - actualData[3]
                    ymax = ycenter + actualData[5]
                }

                const StickCalibration = {
                    xcenter,
                    ycenter,
                    xmin,
                    xmax,
                    ymin,
                    ymax
                }

                DeviceJoyStickInfo.set(device, StickCalibration);

                console.log('Left Stick Calibration Data: ' + JSON.stringify(StickCalibration, null, 2));
            }
        });

        Callbacks.set(device, LocalCBs);

    });

}

function CreateSubCommandBuffer(subCommand: number, data: Uint8Array, device: HIDDevice) {
    let buffer = new Uint8Array(data.byteLength + 11);
    buffer[0] = 0x01;
    buffer[1] = GetCommandCount(device);
    // create a new buffer of 8 0x00 bytes
    // this is the rumble data, we dont need it
    let rumbleData = new Uint8Array(8);
    buffer.set(rumbleData, 2);
    buffer[10] = subCommand;
    buffer.set(data, 11);

    return buffer;
}

type bufferType = {
    byteCount: number;
    name: string;
    type: "number" | "string" | "buffer";
}

const HidBasicInputReport: bufferType[] = [
    { byteCount: 1, type: "number", name: "Report ID" }, // Report ID
    { byteCount: 1, type: "number", name: "Latency Timer" }, // Latency Timer
    { byteCount: 1, type: "number", name: "Power Info" }, // PowerInfo

    { byteCount: 1, type: "number", name: "RightPadButtonStatus" }, // RightPadButtonStatus
    { byteCount: 1, type: "number", name: "SharedButtonStatus" }, // SharedButtonStatus
    { byteCount: 1, type: "number", name: "LeftPadButtonStatus" }, // LeftPadButtonStatus

    { byteCount: 3, type: "buffer", name: "Left Stick Data" }, // Left Stick Data
    { byteCount: 3, type: "buffer", name: "Right Stick Data" }, // Right Stick Data

    { byteCount: 1, type: "number", name: "Motor State" }, // Motor State

    { byteCount: 0x24, type: "number", name: "Basic Data" }, // Labeled as "Basic Data" in the HID Report Descriptor
]

function unsignedLeftShift(value: number, shift: number): number {
    return (value << shift) >>> 0;
}

function ReadStickData(buffer: Uint8Array, left: boolean = true, device: HIDDevice) {

    if (buffer.byteLength != 3) {
        throw new Error('Invalid Stick Data Buffer');
    }

    let view = new DataView(buffer.buffer);

    let data = [
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2)
    ]

    // Calculate stick_horizontal
    let stick_horizontal: number = data[0] | (data[1] & 0x0F) << 8;
    // Calculate stick_vertical
    let stick_vertical: number = (data[1] >> 4) | data[2] << 4;

    let stickCalibration = DeviceJoyStickInfo.get(device);

    if (stickCalibration != undefined) {
        stick_horizontal = (stick_horizontal - stickCalibration.xcenter) / (stickCalibration.xmax - stickCalibration.xmin);
        stick_vertical = (stick_vertical - stickCalibration.ycenter) / (stickCalibration.ymax - stickCalibration.ymin);
    }

    return {
        stick_horizontal,
        stick_vertical
    }
}

function ReadBuffer(buffer: Uint8Array, bufferType: bufferType[]) {

    let view = new DataView(buffer.buffer);
    let offset = 0;
    let data: any = {};

    for (const buffer of bufferType) {
        if (buffer.type == "number") {
            data[buffer.name] = view.getUint8(offset);
            offset += 1;
        } else if (buffer.type == "buffer") {
            data[buffer.name] = new Uint8Array(buffer.byteCount);
            for (let i = 0; i < buffer.byteCount; i++) {
                data[buffer.name][i] = view.getUint8(offset + i);
            }
            offset += buffer.byteCount;
        }
    }

    return data;

}

let commandCount = new Map<HIDDevice, number>();

function GetCommandCount(device: HIDDevice) {
    if (!commandCount.has(device)) {
        commandCount.set(device, 0);
    }
    return commandCount.get(device) as number;
}

function SendHIDCommand(device: HIDDevice, data: Uint8Array) {

    let reportId = data[0];
    let commandId = GetCommandCount(device);
    commandCount.set(device, commandId + 1);

    // if the command id is 0xFF then reset it
    if (commandId > 0xFF) {
        commandId = 0;
        commandCount.set(device, 1);
    }

    // because the first byte is the report id we need to remove it
    let command = new Uint8Array(data.byteLength - 1);
    command.set(data.slice(1));

    // @ts-ignore TS dosent know about the HID API
    device.sendReport(reportId, command);
}

function addReportId(data: Uint8Array, reportId: number) {
    let buffer = new Uint8Array(data.byteLength + 1);
    buffer[0] = reportId;
    buffer.set(data, 1);
    return buffer;
}

function ParseInputPacket(data: Uint8Array, device: HIDDevice) {
    let view = new DataView(data.buffer);
    let reportId = view.getUint8(0);

    switch (reportId) {
        case 0x30:
            let parsedData = ReadBuffer(data, HidBasicInputReport);

            Out!.innerText = JSON.stringify(parsedData, null, 2);

            // read the stick data
            let leftStick = ReadStickData(parsedData["Left Stick Data"], true, device);
            let rightStick = ReadStickData(parsedData["Right Stick Data"], false, device);

            Out!.innerText += "\n\nLeft Stick: " + JSON.stringify(leftStick, null, 2);
            Out!.innerText += "\nRight Stick: " + JSON.stringify(rightStick, null, 2);

            break;

        case 0x21:
            console.log('Sub Command Acknowledged');
            // there are 15 bytes of data that we dont need, they are just input data
            let aData = addReportId(data, reportId).slice(14);

            // read the first 2 bytes of the data
            let view = new DataView(aData.buffer);

            let subCommand = view.getUint16(0, false);

            // check if we have a callback for this subcommand

            console.log(Callbacks.get(device));

            if (Callbacks.has(device)) {
                // @ts-ignore
                let cb = Callbacks.get(device)!.find((cb) => {
                    console.log(cb.subCommand, subCommand);
                    return cb.subCommand == parseInt(subCommand.toString(16));
                });
                if (cb != undefined) {
                    cb.cb(new Uint8Array(aData.slice(2)));
                } else {
                    console.log('No Callback for Sub Command: ' + subCommand.toString(16));
                }
            } else {
                console.log('No Callback for Sub Command: ' + subCommand.toString(16));
            }

            break;

        default:
            console.log('Unknown Report ID: ' + reportId.toString(16));
    }


}