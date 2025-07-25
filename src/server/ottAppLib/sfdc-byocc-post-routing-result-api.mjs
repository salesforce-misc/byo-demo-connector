import axios from 'axios';
import NodeCache from "node-cache" ;
import { settingsCache } from '../ottAppServer.mjs';
import { getTimeStampForLoglines } from '../util.mjs';

// Get config metadata from .env
const {
    SF_SCRT_INSTANCE_URL,
  } = process.env;
const IS_LOCAL_CONFIG = process.env.IS_LOCAL_CONFIG === "true";
const responseCache = new NodeCache();

export async function sendPostRoutingResultAPIRequest(req, requestHeader) {

  let responseData = {};

  let jsonData = {
    "conversationIdentifier" : req.body.conversationIdentifier,
    "routingType": req.body.routingType,
    "workItemId":req.body.workItemId,
    "success": req.body.success,
    "externallyRouted": req.body.externallyRouted,
    "errorMessage":req.body.errorMessage
  }

  console.log(getTimeStampForLoglines() + "Post Routing result json data: ");
  console.dir(jsonData);

  responseData = await axios.post(
    (IS_LOCAL_CONFIG ? SF_SCRT_INSTANCE_URL: settingsCache.get("scrtUrl")) + "/api/v1/routingResult",
    jsonData,
    requestHeader
  ).then(function (response) {
    console.log(getTimeStampForLoglines() + 'Routing Result API post request completed successfully: ', response.data);
    responseCache.set("success", response.data.success);
    return response.data;
  }).catch(function (error) {
    let responseData = error.response.data;
    console.log(getTimeStampForLoglines() + 'Routing Result API post request has error: ', responseData);
    responseCache.set("message", responseData.message);
    responseCache.set("code", responseData.code);
    return responseData;
  });

  return responseData;
}