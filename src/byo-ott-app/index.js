/* eslint-disable no-unused-vars */
import Constants from '../common/constants'
import { Contact, publishEvent, publishError } from '@salesforce/scv-connector-base';
import { EventEmitter } from 'events';
import { io } from "socket.io-client";

class ConnectorEventEmitter extends EventEmitter {}
const eventEmitter = new ConnectorEventEmitter();

export function initializeBYOOTTAppController(connector) {
    connector.sdk.eventEmitter.on('event', async (event) => {
        if (event && event.data) {
            try {
                switch (event.data.type) {
                    case Constants.GET_AGENT_CONFIG: {
                        const { agentConfig, agentId, userPresenceStatuses } = connector.sdk.state;
                        connector.sdk.messageUser(event.fromUsername,  Constants.AGENT_CONFIG, 
                            {
                                type: Constants.AGENT_CONFIG,
                                value: agentConfig,
                                userPresenceStatuses,
                                from: `${document.referrer} as ${agentId}` 
                            })
                    }
                    break;
                    case Constants.SET_AGENT_CONFIG: {
                        connector.sdk.updateAgentConfig({
                            selectedPhone: event.data.value.selectedPhone
                         });
                    }
                    break;
                    case Constants.SET_AGENT_STATUS: {
                        connector.sdk.publishSetAgentStatus(event.data.statusId);
                    }
                    break;
                }
            } catch (error) {
                const eventType = event.data.eventType;
                connector.sdk.messageUser(event.fromUsername, Constants.ERROR,
                {
                    type: Constants.ERROR,
                    error: `${error.message} (Event: ${eventType || event.data.type})`
                })
                console.error(`Error occured when published event ${eventType} from the hardphone simulator: ${error.message}`);
                if (connector.sdk.state.publishHardphoneErrors) {
                    publishError({ eventType, error });
                }
            }
        }
    });
}


