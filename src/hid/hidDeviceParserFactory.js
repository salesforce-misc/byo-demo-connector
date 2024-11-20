import {PlantronicsHIDDeviceParser} from "./plantronicsHIDDeviceParser";

export function getHIDParser(device) {
    switch(device.productName) {
        case "Plantronics Blackwire 5220 Series":
            return new PlantronicsHIDDeviceParser();
        // Add more device types here
        default:
            throw new Error("Unsupported HID device");
    }
}
