import {HIDParser} from './hidDeviceParser';
import {Constants} from '@salesforce/scv-connector-base';

export class PlantronicsHIDDeviceParser extends HIDParser {
    async parseInputReport(event, sdk) {
        const {data} = event;
        //An integer received from the Plantronics HID device
        const action = data.getUint8(0);
        const activeCalls = await sdk.getActiveCalls();
        if (activeCalls.activeCalls.length !== 0) {
            const activeCall = activeCalls.activeCalls[0];
            const callInfo = activeCall.callInfo;
            //set this to send signal to salesforce that the source of action is HID
            callInfo.isHIDCall = true;
            //Handle action based on the action number received from HID device
            switch (action) {
                //Answer call action
                case 2:
                case 0:
                    //if call is not answered, answer the call
                    if (activeCall.state === Constants.CALL_STATE.RINGING && activeCall.callType === "inbound") {
                        sdk.log("answer call triggered using HID: ", activeCall);
                        sdk.connectCall(callInfo);
                    }
                    break;
            }
        }
    }
}