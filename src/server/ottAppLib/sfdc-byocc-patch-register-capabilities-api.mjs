import axios from 'axios';
import { settingsCache } from '../ottAppServer.mjs';

// Get config metadata from .env
const {
    SF_SCRT_INSTANCE_URL,
  } = process.env;
  const IS_OTT = process.env.IS_OTT === "true";

export async function sendPatchRegisterCapabilitiesAPIRequest(req, requestHeader) {

  let responseData = {};

  let jsonData = req.body;

  console.log("\n======== Patch Register Capabilities json data: ");
  console.dir(jsonData);

  responseData = await axios.patch(
    (IS_OTT ? SF_SCRT_INSTANCE_URL : settingsCache.get("scrtUrl")) + "/api/v1/capabilities",
    jsonData,
    requestHeader
  ).then(function (response) {
    console.log('\n====== Register Capabilities API patch request completed successfully: ', response.data);
    return response.data;
  }).catch(function (error) {
    let responseData = (error.response && error.response.data) ? error.response.data : "Unknown error";
    console.log('\n====== Register Capabilities API patch request has error: ', responseData);
    return responseData;
  });

  return responseData;
}