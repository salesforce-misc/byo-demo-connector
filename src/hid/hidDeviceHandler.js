/*
    Save the hid information received from Salesforce via setAgentConfig
    Based on the device type, parse the data and call respective call actions
 */
import {getHIDParser} from "./hidDeviceParserFactory";

export async function hidDeviceHandler(config, sdk){
    const devices = await navigator.hid.getDevices();
    if(devices && devices.length > 0) {
        //Filter the device based on the config info passed
        const device = devices.find(d => d.vendorId === config?.hidDevice?.vendorId &&
            d.productId === config?.hidDevice?.productId);

        if (device) {
            //fetch hid device specific parser using factory
            const parser = getHIDParser(device);
            //Open the device to receive the input report
            await device.open().then(() => {
                device.oninputreport = e => {
                    parser.parseInputReport(e, sdk);
                }
            });
        }
    }
}
