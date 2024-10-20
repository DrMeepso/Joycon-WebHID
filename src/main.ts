import { Joycon } from "./JoyCon";

const Button = document.getElementById('connect');

if (Button == null)
    throw new Error('Could not find the button element');

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
            //console.log(event.detail!.stick);
        })
    }

});