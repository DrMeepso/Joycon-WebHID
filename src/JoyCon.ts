import e from "express";

type bufferType = {
    byteCount: number;
    name: string;
    type: "number" | "string" | "buffer";
}

const HidBasicInputReport: bufferType[] = [
    //{ byteCount: 1, type: "number", name: "Report ID" }, // Report ID
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

function bufferToHex(buffer: Uint8Array) {
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

export class Joycon extends EventTarget {

    public IsLeftJoyCon: boolean | null;
    public JoystickCalibration: {
        xcenter: number;
        ycenter: number;
        xmin: number;
        xmax: number;
        ymin: number;
        ymax: number;
    } | null;
    public HIDDevice: HIDDevice;

    private CommandCount: number = 0;

    constructor(device: HIDDevice) {
        super();
        this.HIDDevice = device;
        this.IsLeftJoyCon = null;
        this.JoystickCalibration = null;
    }

    private SendHIDCommand(data: Uint8Array) {
        let reportID = data[0];
        let reportData = data.slice(1);

        this.HIDDevice.sendReport(reportID, reportData);
    }

    private CreateSubCommandBuffer(subCommand: number, data: Uint8Array) {
        let buffer = new Uint8Array(data.byteLength + 11);
        buffer[0] = 0x01;
        buffer[1] = this.CommandCount++;
        // create a new buffer of 8 0x00 bytes
        // this is the rumble data, we dont need it
        let rumbleData = new Uint8Array(8);
        buffer.set(rumbleData, 2);
        buffer[10] = subCommand;
        buffer.set(data, 11);
    
        return buffer;
    }

    public async Init() {
        this.HIDDevice.oninputreport = this.OnInputReport.bind(this);
        this.HIDDevice.open().then(() => {

            let subCommand = 0x02;
            let data = new Uint8Array(0);
            this.SendHIDCommand(this.CreateSubCommandBuffer(subCommand, data));

        })
    }
    
    private ReadBuffer(buffer: DataView, bufferType: bufferType[]) {

        let view = buffer; // idk but it dont work otherwise
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

    private ReadStickData(buffer: Uint8Array) {

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
    
        let stickCalibration = this.JoystickCalibration

        //document.getElementById('CurrentData')!.innerText = `Stick Horizontal: ${stick_horizontal} Stick Vertical: ${stick_vertical}`;

        if (stickCalibration != undefined) {
            stick_horizontal = (stick_horizontal - stickCalibration.xcenter) / (stickCalibration.xmax - stickCalibration.xmin);
            stick_vertical = (stick_vertical - stickCalibration.ycenter) / (stickCalibration.ymax - stickCalibration.ymin);
        }
    
        //document.getElementById('CurrentData')!.innerText += `\nStick Horizontal: ${stick_horizontal}\nStick Vertical: ${stick_vertical}`;

        return {
            x: stick_horizontal,
            y: stick_vertical
        }
    }

    private OnInputReport(event: HIDInputReportEvent) {

        switch (event.reportId) {
            case 0x30:
                let parsedData = this.ReadBuffer(event.data, HidBasicInputReport);
        
                // read the stick data
                let joyStick

                if (this.IsLeftJoyCon == true) {
                    joyStick = this.ReadStickData(parsedData["Left Stick Data"]);
                } else if (this.IsLeftJoyCon == false) {
                    joyStick = this.ReadStickData(parsedData["Right Stick Data"]);
                } else {
                    // throw new Error('JoyCon is not initialized');
                }

                this.dispatchEvent(new CustomEvent('data', {
                    detail: {
                        stick: joyStick
                    }
                }));

                break;
    
            case 0x21:
                console.log('Sub Command Acknowledged');
                // there are 15 bytes of data that we dont need, they are just input dat
    
                let aData = new Uint8Array(event.data.byteLength + 1);
                aData[0] = event.reportId;
                aData.set(new Uint8Array(event.data.buffer), 1);

                aData = aData.slice(15 - 2); // remove the first 15 bytes of data

                // read the first 2 bytes of the data
                let view = new DataView(aData.buffer);
    
                let subCommand = view.getUint16(0, false);

                switch (parseInt(subCommand.toString(16))) {
                    case 8202: // Device Info
                        this.OnDeviceInfo(aData.slice(2));
                        break;
                    case 9010: // Joystick Calibration Data
                        this.OnJoystickCalibrationData(aData);
                        break;

                    default:
                        console.log('Unknown Sub Command: ' + subCommand.toString(16));
                        break;
                }

                break;
    
            default:
                console.log('Unknown Report ID: ' + event.reportId.toString(16));
        }

    }

    private OnDeviceInfo(data: Uint8Array) {

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
            this.IsLeftJoyCon = true;
        } else if (info.type == 2) {
            this.IsLeftJoyCon = false;
        } else {
            console.warn("Pro Controller Is Not Supported!");
        }

        // get the joystick calibration data
        let subCommand = 0x10;
        let subData = new Uint8Array(5);
        // the first 4 bytes are the address of the calibration data
        // for the left stick it is 0x603D - 0x6045
        // for the right stick it is 0x6046 - 0x604E

        // create a data writer
        let dataView = new DataView(subData.buffer);
        // write the address of the left stick calibration data
        if (this.IsLeftJoyCon == true)
        {
            dataView.setUint16(0, 0x603D, true);
        }
        else
        {
            dataView.setUint16(0, 0x6046, true);
        }

        // write the size of the calibration data
        dataView.setUint8(4, 9);

        // send the command
        this.SendHIDCommand(this.CreateSubCommandBuffer(subCommand, subData));

    }

    private OnJoystickCalibrationData(data: Uint8Array) {

        console.log('Joystick Calibration Data: ' + bufferToHex(data));

        let view = new DataView(data.buffer.slice(7));

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

        if (this.IsLeftJoyCon == true) {
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

        this.JoystickCalibration = StickCalibration;

        console.log('Stick Calibration Data: ' + JSON.stringify(StickCalibration, null, 2));

    }

}