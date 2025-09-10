# Salesforce CCaaS Voice/Messaging Demo

The demo app is a sample application for both "Partner Telephony Systems" that integrate with Salesforce Service Cloud Voice and "BYO OTT" that integrates with Salesforce Service Cloud Messaging (Inbound/Outbound).

- The "Partner Telephony Systems" application demonstrates an optimal Voice implementation based on a group of telephony API mocks. It also includes a voice call simulation tool that you can use to test call actions such as making and answering calls and using phone controls.
- For "BYO OTT" application helps you test the features of inbound/outbound messaging and attachment for inbound messages after your custom channel messaging configuration is done. It also allows you to customize the settings of "Conversation Channel Definition API Name", "Conversation Address Identifier", "End User Client Identifier", and "Custom Event Payload Field" to test different custom channels, conversations, and end users.

## Document
We’ve provided documentation for Salesforce Service Cloud Voice connector APIs in the [`/docs/`](https://github.com/salesforce-misc/byo-demo-connector/tree/main/docs) folder.

## Installation

### Environment setup
The developer environment requires [Node](https://nodejs.org/en/download/), [NPM](https://docs.npmjs.com/cli/install) and [webpack-dev-server](https://webpack.github.io/docs/webpack-dev-server.html). 


### Installation
#### Clone this repo

```
$ git clone https://github.com/salesforce-misc/byo-demo-connector.git
```

#### Install npm dependencies

```
$ cd byo-demo-connector
$ npm install
```
### Config Setup


#### For "BYO CCaaS" application
```
$ cp config.env .env
```

#### For "BYO OTT" application
```
$ cp config.env.ott .env
```

#### Setup "Partner Telephony Systems" application

Open `.env` and set following config values as per Org and Environment if needed.

```
################## env vars for remote-control (Voice)
#Server app will listen on this port. Only change if you want to use other port.
SERVER_PORT=3030
#Server Url. Only change if you want to use other port.
SERVER_URL=http://localhost:3030
#Contact Center Phone No. Only Change if you want to use any other Contact Center Number
CALL_CENTER_NO=4150000000
#Only use if you want to bypass SCRT and use your own VoiceCallId for inbound call
#OVERRIDE_VOICECALLID=0LQxx0000004C92GAE
```

- OVERRIDE_VOICECALLID (Optional): If you want to bypass scrt2 to create a voiceCall, pass a voiceCallId, i.e. 0LQxx0000004CIiGAM
	
- PRIVATE_KEY: If you have generated your own private/public key pair then replace the private key at /src/server/private.key

Open webpack.config.js and configure the local host web server URL.

- Default value for `devServer.host` is `0.0.0.0`, it allows your server to be accessible externally, you can use `https://127.0.0.1:8080` as the adapter URL without any change in local development, DO NOT use `https://localhost:8080` as it will give CORS error. If you want to configure to use your own specific URL please see details in [the webpack documents](https://webpack.js.org/configuration/dev-server/#devserverhost)

SSL certificate for local HTTPS development

- HTTPS is enabled by default in webpack.config.js, if you don't have a SSL certificate in your local server, you will see a warning page in browser with message "Your connection is not private", and you can choose to preceed to your web server URL.

- To avoid the warning message from the browser, you can setup a self-signed SSL certificate for you local web server.
 
#### Setup "BYO OTT" application
Copy config.env.ott to .env, and replace all placeholder vars marked inside <> accordingly shown as below:

```
#########################################
## Section #1:                         ##
##  The entries that are not           ##
##  dynamically fetched from core,they ##
##  are manually set here.             ##
#########################################
SF_CONSUMER_KEY="<connected app consumer key>"
SF_PRIVATE_KEY="<private key>"
SF_AUDIENCE=https://login.salesforce.com [^1]
SF_SUBJECT=<admin user name>
SF_AUTH_ENDPOINT=https://login.salesforce.com/services/oauth2/token [^2]
SF_PUB_SUB_ENDPOINT=api.pubsub.salesforce.com:7443 [^3]
SF_PUB_SUB_EVENT_RECEIVE_LIMIT=100
SF_INSTANCE_URL=<Salesforce core app instance url> [^4][^9]
SF_SCRT_INSTANCE_URL=<Salesforce core app scrt2 instance url> [^5][^9]
SF_ORG_ID=<orgId>[^9]
SF_PASSWORD=<Admin user password> [^11]
SF_AUTHORIZATION_CONTEXT=<ConversationChannelDefinition API Name> [^9]
CHANNEL_ADDRESS_IDENTIFIER=<Channel address identifier> [^6]
END_USER_CLIENT_IDENTIFIER=<End user client identifier>
API_VERSION=<Ex: "63.0" API version for the current release of salesforce app> [^10]
```

#### Setup "BYO CCaaS" application for messaging
Copy config.env to .env, finish the section #1 configure as shown above for BYO OTT setup, then replace all placeholder vars marked inside <> accordingly for Section #2 and #3 shown as below:

```
#########################################
## Section #2:                         ##
##  The entries that are for BYO CCaaS ##
#########################################
USER_ID=<Valid salesforce or external user id> [^9]
ROUTING_OWNER=<Owner of Routing possible values Partner|Salesforce>[^9]
CAPACITY_WEIGHT=<Capacity weight which will be used in agent work example value:1>[^9]
AUTO_CREATE_AGENT_WORK=true[^7][^9]

############################################
## Section #3: Indicator to specify       ##
## whether to dynamically fetch following ##
## entries from core:                     ##
##   - SF_INSTANCE_URL                    ##
##   - SF_SCRT_INSTANCE_URL               ##
##   - SF_AUTHORIZATION_CONTEXT           ##
##   - SF_ORG_ID                          ##
##   - USER_ID                            ##
##   - SF_SUBJECT                         ##
############################################
IS_LOCAL_CONFIG=<true: read from local env config, or false: read from core>[^8]
```

#### Setup "BYOB" application for messaging
Copy config.env to .env, finish the section #1 configure as shown above for BYO OTT setup, then replace/update all placeholder vars marked inside <> accordingly for Section #2 and #3 shown as below:

```
#########################################
## Section #2:                         ##
##  The entries that are for BYOB ##
#########################################
SF_AUTHORIZATION_CONTEXT=<ExtConvParticipantIntegDef API Name>
SF_AUTHORIZATION_CONTEXT_TYPE=ExternalConversationParticipant
END_USER_CLIENT_IDENTIFIER=<Salesforce recordId of the ExternalConversationBotDef associated with the ExtConvParticipantIntegDef provided>
QUEUE_ID=<Omni-Queue recorId associated with the routing>

############################################
## Section #3: Indicator to specify       ##
## whether to dynamically fetch following ##
## entries from core:                     ##
##   - SF_INSTANCE_URL                    ##
##   - SF_SCRT_INSTANCE_URL               ##
##   - SF_AUTHORIZATION_CONTEXT           ##
##   - SF_ORG_ID                          ##
##   - USER_ID                            ##
##   - SF_SUBJECT                         ##
############################################
IS_LOCAL_CONFIG=<true: read from local env config, or false: read from core>[^8]
```

### Launch application 
 
```
$ npm start
```

By default the web server will run in SSL on port 8080. 

Now that your web server is running, you can point your Service Cloud Voice Call Center Adapter URL to the web server URL (i.e. https://example.com:8080)
The remote control can be accessed at ccaas.html.

### Replace private key
Replace the src/server/private.key  data 
```
<BYO_TELEPHONY_CONNECTOR_PRIVATE_KEY>
```

with private key


### Launch OTT Demo app
When the app is running you can find it by going to this URL {your web server URL}/ottapp (i.e. https://localhost:8080/ottapp). You can use this URL to verify the installation succeed.

This application provides BYO OTT testing tool that you can use to test inbound/outbound messaging.

### Launch CCaaS Voice/Messaging Demo app
When the app is running you can find it by going to this URL {your web server URL}/ccaas (i.e. https://localhost:8080/ccaas). You can use this URL to verify the installation succeed.

This application provides both voice call simulation tool that you can use to test call actions such as making and answering calls and using phone controls, and BYO OTT testing tool that you can use to test inbound/outbound messaging. These two parts are organized in two tabs: "Voice" and "Message".

### Launch BYOB Demo app
When the app is running you can find it by going to this URL {your web server URL}/byob (i.e. https://localhost:8080/byob). You can use this URL to verify the installation succeed.

This application provides a BYOB (Bring Your Own Bot) testing tool that allows you to test messages from an external bot. When MEU sends a message, you can choose to accept or decline the bot’s agent work request. Upon accepting, you can send messages on behalf of the bot to simulate bot-meu interactions.


**Note**:
Sample payloads for APIs requiring json files are found here
- [Register capabilities](/payloads/RegisterCapabilitySample.md)
- [Conversation History API](/payloads/ConversationHistorySample.md)

## Testing
Lint all the source code and run all the unit tests:
```
$ npm test
```
To bundle the source code in the src/ folder into one connector.js file:
```
$ gulp bundle
```
To bundle the source code in the src/ folder into one minified connector_min.js file:
```
$ gulp bundle --mode prod
```

## Note about adding voice call recording via the ccaas demo connector UI 
If you are testing voice call recording for BYOT, you should use this URL as the voice call recording URL in the UI: https://127.0.0.1:8080/assets/sampleaudio.mp3
You have to use this url in order for the recording playback to work correctly

## Note about using the telephony integration service
Certain features (e.g. voice call transcripts) depend on the telephony integration service to work. In order for the demo connector to be able to authenticate with it, you need to set the private key in `src/server/private.key` to match the public key that you created your call center with. If you don't want to create a new key pair you can use the one in `src/server/cert.pem`

## Contributing and Developing Locally
We welcome contributors into our repo. Please read the [contributing guidelines](https://github.com/salesforce/demo-scv-connector/blob/master/CONTRIBUTING.md) for more information.


**Note**:
- [^1] The audience url for different environments:
  - Sandbox instance: `https://test.salesforce.com`
  - Prod instance: `https://login.salesforce.com`
- [^2] The auth endpoint for different environments:
  - Sandbox instance: `https://test.salesforce.com/services/oauth2/token`
  - Prod instance: `https://login.salesforce.com/services/oauth2/token`
- [^3] The Pub/Sub endpoint for different environments:
  - Sandbox instance: `api.pubsub.salesforce.com:7443`
  - Prod instance: `api.pubsub.salesforce.com:7443`
- [^4] The value of \<Salesforce core app instance url\> above is an url with the pattern of "https://\<your org my domain name\>.my.salesforce.com".
- [^5] The value of \<Salesforce core app scrt2 instance url\> above is an url with the pattern of "https://\<your org my domain name\>.my.salesforce-scrt.com".
- [^6] The value of \<Channel address identifier\> above is the value from field "ChannelAddressIdentifier" in corresponding MessagingChannel record.
- [^7] Auto create agent work boolean flag is used to specify if agent work should be created automatically when sending inbound messages.
- [^8] Specify if it reads configuration from env or from core. Under the circumstance of no contact center, please select true.
- [^9] No need to specify if you choose IS_LOCAL_CONFIG=false
- [^10] The API version for the current release of salesforce app. This should be specified in the format "XX.0", where XX is the version number. For example, "62.0".
- [^11] The admin password for the Salesforce instance. Ensure this is securely stored and not exposed in public repositories.
