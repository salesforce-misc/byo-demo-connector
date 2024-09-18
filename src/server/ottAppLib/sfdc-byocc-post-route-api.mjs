import axios from 'axios';
import NodeCache from "node-cache" ;
import { settingsCache } from '../ottAppServer.mjs';

// Get config metadata from .env
const {
  SF_SCRT_INSTANCE_URL,
} = process.env;
const IS_OTT = process.env.IS_OTT === "true";
const responseCache = new NodeCache();

export async function sendPostRouteAPIRequest(req, requestHeader) {

  let responseData = {};

  let jsonData = {
    "conversationIdentifier" : req.body.conversationIdentifier,
    "routingType" : req.body.routingType
  }
  let RoutingInfoType = req.body.routingInfo;
  let routingInfo;
  if (RoutingInfoType === "FLOW"){
    routingInfo = {
      flow : {
        "flowId": req.body.flow,
        "queueId": req.body.fallBackQueue,
      }
    };
    let routingAttributes;
    if (req.body.routingAttributes && (JSON.parse(req.body.routingAttributes) !== "" || JSON.parse(req.body.routingAttributes) !== "{}"))
    {
      routingAttributes = JSON.parse(req.body.routingAttributes);
      routingInfo["routingAttributes"] = routingAttributes;
    }
  } else if(RoutingInfoType === "QUEUE"){
    routingInfo = {
      "queueId": req.body.queue
    }
  }

  if(routingInfo){
    jsonData["routingInfo"] = routingInfo;
  }

  jsonData = JSON.stringify(jsonData);

  console.log("======== post route json data: ");
  console.dir(jsonData);

  responseData = await axios.post(
    (IS_OTT ? SF_SCRT_INSTANCE_URL : settingsCache.get("scrtUrl")) + "/api/v1/route",
      jsonData,
      requestHeader
  ).then(function (response) {
    console.log('\n====== Route api post request completed successfully: ', response.data);
    responseCache.set("success", response.data.success);
    return response.data;
  }).catch(function (error) {
    let responseData = error.response.data;
    console.log('\n====== Route api post request has error: ', responseData);
    responseCache.set("message", responseData.message);
    responseCache.set("code", responseData.code);
    return responseData;
  });

  return responseData;
}

// Function to get a value from the cache
export function getResponseCache(key) {
  return responseCache.get(key);
}