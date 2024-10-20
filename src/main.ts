import { Joycon } from "./JoyCon";

const Button = document.getElementById('connect');

if (Button == null)
    throw new Error('Could not find the button element');

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

if (canvas == null)
    throw new Error('Could not find the canvas element');

if (ctx == null)
    throw new Error('Could not get the canvas context');

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
        const thisJoycon = new Joycon(device);
        thisJoycon.Init();

        thisJoycon.addEventListener('data', (event) => {
            // draw the stick data
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
            ctx.arc(100, 100, 50, 0, 2 * Math.PI);
            ctx.stroke();

            let data = event.detail.stick

            ctx.beginPath();
            ctx.arc(100 + (data.x * 100), 100 + (-data.y * 100), 10, 0, 2 * Math.PI);
            ctx.fill();
        })
    }

});