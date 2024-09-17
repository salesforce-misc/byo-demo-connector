import axios from 'axios';
import NodeCache from "node-cache" ;
import { settingsCache } from '../ottAppServer.mjs';

// Get config metadata from .env
const {
    SF_SCRT_INSTANCE_URL
  } = process.env;
const IS_OTT = process.env.IS_OTT === "true";
const responseCache = new NodeCache();

export async function sendDeleteRouteAPIRequest(req, requestHeader) {

  let responseData = {};

  let jsonData = {
    "conversationIdentifier" : req.body.conversationIdentifier,
  }

  console.log("\n======== delete route json data: ");
  console.dir(jsonData);

  responseData = await axios.delete(
    (IS_OTT ? SF_SCRT_INSTANCE_URL : settingsCache.get("scrtUrl")) + "/api/v1/route",
    {
      data: jsonData,
      headers: requestHeader.headers
    }
  ).then(function (response) {
    console.log('\n====== Route api delete request completed successfully: ', response.data);
    responseCache.set("success", response.data.success);
    return response.data;
  }).catch(function (error) {
    let responseData = error.response.data;
    console.log('\n====== Route api delete request has error: ', responseData);
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