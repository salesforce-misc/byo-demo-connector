// Source code adapted from https://github.com/pozil/pub-sub-api-node-client
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';
import fs from 'fs';
import avro from 'avro-js';
import certifi from 'certifi';
import {getAccessToken} from './sfdc-auth.mjs';
import {fileURLToPath} from 'url';
import { settingsCache } from '../ottAppServer.mjs';

// Import dotenv that loads the config metadata from .env
//require('dotenv').config();

// Get config metadata from .env
const {
  SF_PUB_SUB_ENDPOINT,
  SF_PUB_SUB_EVENT_RECEIVE_LIMIT,
  SF_INSTANCE_URL,
  SF_ORG_ID
} = process.env;
const IS_OTT = process.env.IS_OTT === "true";
/**
 * Connects to the Pub/Sub API and returns a gRPC client.
 * @returns a gRPC client
 */
export async function connectToPubSubApi() {
  console.log('\n====== Start connectToPubSubApi()');

  // Read certificates
  const rootCert = fs.readFileSync(certifi);

  // Load proto definition
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const packageDef = protoLoader.loadSync(path.join(__dirname, 'pubsub_api.proto'), {});
  const grpcObj = grpc.loadPackageDefinition(packageDef);
  const sfdcPackage = grpcObj.eventbus.v1;
  const accessToken = await getAccessToken();

  // getAccessToken returns null means private key not specified in .env and thus not able to use PubSubApi and messaging, 
  // but it won't affect the usage of phone
  // Return null here
  if (!accessToken) {
    return null;
  }

  // Prepare gRPC connection
  const metaCallback = (_params, callback) => {
    const meta = new grpc.Metadata();
    meta.add('accesstoken', accessToken);
    meta.add('instanceurl', IS_OTT ? SF_INSTANCE_URL : settingsCache.get("instanceUrl"));
    meta.add('tenantid', IS_OTT ? SF_ORG_ID : settingsCache.get("orgId"));
    callback(null, meta);
  };
  const callCreds =
    grpc.credentials.createFromMetadataGenerator(metaCallback);
  const combCreds = grpc.credentials.combineChannelCredentials(
    grpc.credentials.createSsl(rootCert),
    callCreds
  );

  // Return pub/sub gRPC client
  const client = new sfdcPackage.PubSub(SF_PUB_SUB_ENDPOINT, combCreds);

  console.log('\n====== Pub/Sub API client is ready to connect');

  return client;
}

/**
 * Requests the event schema for a topic.
 * @param {Object} client Pub/Sub API gRPC client
 * @param {string} topicName name of the topic that we're fetching
 * @returns {Object} parsed event schema `{id: string, type: Object}`
 */
export async function getEventSchema(client, topicName) {
  return new Promise((resolve, reject) => {
    console.log(`\n====== start getEventSchema()`);
    client.GetTopic({ topicName }, (err, response) => {
      if (err) {
        // Handle error
        console.log(`\n====== getEventSchema error: `, err);
        reject(err);
      } else {
        // Get the schema information
        const schemaId = response.schemaId;
        client.GetSchema({ schemaId }, (error, res) => {
          if (error) {
            // Handle error
            console.log(`\n====== client.GetSchema error: `, err);
            reject(err);
          } else {

            // TODO: Following block is to fix the Error: potential precision loss for long data type
            // When plug in actual outbound message event, we will see if we still need it, if not, will
            // remove the following block.
            const longType = avro.types.LongType.using({
              fromBuffer: (buf) => buf.readBigInt64LE(),
              toBuffer: (n) => {
                const buf = Buffer.alloc(8);
                buf.writeBigInt64LE(n);
                return buf;
              },
              fromJSON: BigInt,
              toJSON: Number,
              isValid: (n) => typeof n == 'bigint',
              compare: (n1, n2) => { return n1 === n2 ? 0 : (n1 < n2 ? -1 : 1); }
            });

            // TODO: Will remove second param: {registry: {'long': longType}}, if we don't need the block of code above
            const schemaType = avro.parse(res.schemaJson, {registry: {'long': longType}});

            console.log(`\n====== Topic schema loaded: ${topicName}`, schemaType);
            resolve({
              id: schemaId,
              type: schemaType
            });
          }
        });
      }
    });
  });
}

/**
 * Subscribes to a topic with basic handlers registered.
 * @param {Object} client Pub/Sub API gRPC client
 * @param {string} topicName name of the topic that we're subscribing to
 * @param {Object} schema event schema associated with the topic
 * @param {string} schema.id
 * @param {Object} schema.type
 */
function subscribeWithBasicHandlers(client, topicName, schema) {
  const subscription = client.Subscribe(); //client here is the grpc client.
  //Since this is a stream, you can call the write method multiple times.
  //Only the required data is being passed here, the topic name & the numReqested
  //Once the system has received the events == to numReqested then the stream will end.
  const subscribeRequest = {
    topicName,
    numRequested: SF_PUB_SUB_EVENT_RECEIVE_LIMIT
  };
  subscription.write(subscribeRequest);
  console.log(
    `\n====== Subscribe request sent for ${subscribeRequest.numRequested} events from ${topicName}...`
  );

  // Listen to new events.
  subscription.on('data', (data) => {
    if (data.events) {
      const latestReplayId = data.latestReplayId.readBigUInt64BE();
      console.log(
        `\n====== Received ${data.events.length} events, latest replay ID: ${latestReplayId}`
      );
      const parsedEvents = data.events.map((event) =>
        parseEvent(schema, event)
      );
      console.log(
        '\n====== gRPC event payloads: ',
        JSON.stringify(parsedEvents, null, 2)
      );
    } else {
      // If there are no events then every 270 seconds the system will keep publishing the latestReplayId.
    }
  });
  subscription.on('end', () => {
    console.log('\n====== gRPC stream ended');
  });
  subscription.on('error', (err) => {
    // TODO: Handle errors
    console.error('gRPC stream error: ', JSON.stringify(err));
  });
  subscription.on('status', (status) => {
    console.log('\n====== gRPC stream status: ', status);
  });
}

/**
 * Subscribes to a topic using the gRPC client.
 * @param {Object} client Pub/Sub API gRPC client
 * @param {string} topicName name of the topic that we're subscribing to
 * @returns {Object} a subscription object which can later be used to register event handlers
 */
 export function subscribe(client, topicName) {
  const subscription = client.Subscribe(); //client here is the grpc client.
  //Since this is a stream, you can call the write method multiple times.
  //Only the required data is being passed here, the topic name & the numReqested
  //Once the system has received the events == to numReqested then the stream will end.
  const subscribeRequest = {
    topicName,
    numRequested: SF_PUB_SUB_EVENT_RECEIVE_LIMIT
  };
  subscription.write(subscribeRequest);
  console.log(
    `\n====== Subscribe request sent for ${subscribeRequest.numRequested} events from ${topicName}...`
  );

  return subscription;
}

/**
 * Publishes a payload to a topic using the gRPC client.
 * @param {Object} client Pub/Sub API gRPC client
 * @param {string} topicName name of the topic that we're subscribing to
 * @param {Object} schema event schema associated with the topic
 * @param {string} schema.id
 * @param {Object} schema.type
 * @param {Object} payload
 */
/* eslint-disable no-unused-vars */
async function publish(client, topicName, schema, payload) {
  return new Promise((resolve, reject) => {
    client.Publish(
      {
        topicName,
        events: [
          {
            id: '124', // this can be any string
            schemaId: schema.id,
            payload: schema.type.toBuffer(payload)
          }
        ]
      },
      (err, response) => {
        if (err) {
          reject(err);
        } else {
          resolve(response);
        }
      }
    );
  });
}

/**
 * Parses a received Salesforce platform event.
 * @param {Object} schema event schema associated with the topic
 * @param {string} schema.id
 * @param {Object} schema.type
 * @param {Object} event a raw Salesforce platform event received via the Pub/Sub API
 * @returns {Object} a parsed Salesforce platform event
 */
export function parseEvent(schema, event) {
  console.log('\n====== parseEvent: ', schema, event, event.event.payload);
  const replayId = event.replayId.readBigUInt64BE().toString();
  const payload = schema.type.fromBuffer(event.event.payload);

  return {
    replayId,
    payload
  };
}
