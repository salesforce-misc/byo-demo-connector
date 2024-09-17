import axios from 'axios';
import NodeCache from "node-cache" ;
import { settingsCache } from '../ottAppServer.mjs';

// Get config metadata from .env
const {
  SF_SCRT_INSTANCE_URL
} = process.env;
const IS_OTT = process.env.IS_OTT === "true";
const responseCache = new NodeCache();

export async function sendConsentAPIRequest(req, requestHeader) {
    
  let responseData = {};

  let jsonData = {
    "endUserClientId" : req.body.endUserClientIdentifier,
    "channelAddressIdentifier" : req.body.channelAddressIdentifier,
    "consentStatus" : req.body.consentStatus
  }

  jsonData = JSON.stringify(jsonData);

  responseData = await axios.patch(
    (IS_OTT ? SF_SCRT_INSTANCE_URL : settingsCache.get("scrtUrl")) + "/api/v1/consent",
    jsonData,
    requestHeader
  ).then(function (response) {    
    console.log('\n====== Consent api patch request completed successfully: ', response.data);
    responseCache.set("success", response.data.success);        
    return response.data;
  }).catch(function (error) {
    let responseData = error.response.data;
    console.log('\n====== Consent api patch request has error: ', responseData);        
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