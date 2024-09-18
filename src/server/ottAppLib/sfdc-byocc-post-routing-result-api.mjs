import axios from 'axios';
import NodeCache from "node-cache" ;
import { settingsCache } from '../ottAppServer.mjs';

// Get config metadata from .env
const {
    SF_SCRT_INSTANCE_URL,
  } = process.env;
const IS_OTT = process.env.IS_OTT === "true";
const responseCache = new NodeCache();

export async function sendPostRoutingResultAPIRequest(req, requestHeader) {

  let responseData = {};

  let jsonData = {
    "conversationIdentifier" : req.body.conversationIdentifier,
    "workItemId":req.body.workItemId,
    "success": req.body.success,
    "externallyRouted": req.body.externallyRouted,
    "errorMessage":req.body.errorMessage
  }

  console.log("\n======== Post Routing result json data: ");
  console.dir(jsonData);

  responseData = await axios.post(
    IS_OTT ? SF_SCRT_INSTANCE_URL: settingsCache.get("scrtUrl") + "/api/v1/routingResult",
    jsonData,
    requestHeader
  ).then(function (response) {
    console.log('\n====== Routing Result API post request completed successfully: ', response.data);
    responseCache.set("success", response.data.success);
    return response.data;
  }).catch(function (error) {
    let responseData = error.response.data;
    console.log('\n====== Routing Result API post request has error: ', responseData);
    responseCache.set("message", responseData.message);
    responseCache.set("code", responseData.code);
    return responseData;
  });

  return responseData;
}