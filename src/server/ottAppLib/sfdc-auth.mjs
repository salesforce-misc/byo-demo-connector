import jwt from 'jsonwebtoken';
//import { v4: uuidv4 } from "uuid";
import axios from 'axios';
import { settingsCache } from '../ottAppServer.mjs';

// Import dotenv that loads the config metadata from .env
//require('dotenv').config();

// Get config metadata from .env
const {
  SF_CONSUMER_KEY,
  SF_PRIVATE_KEY,
  SF_AUDIENCE,
  SF_SUBJECT, // OTT-needed
  SF_AUTH_ENDPOINT
} = process.env;
const IS_OTT = process.env.IS_OTT === "true"
let cachedAccessToken;

/**
 * Generates a JWT for obtaining an access token via Salesforce's OAuth 2.0 JWT Bearer Flow.
 * @param {Object} payload a JSON claim set for the to-be-generated JWT 
 * @param {string} expiresIn validity of the to-be-generated JWT, expressed in a string describing a time span (e.g., "3m")
 * @param {string} privateKey the private key used to sign the JWT
 * @returns {string} a JWT conforming to draft-ietf-oauth-json-web-token-08
 */
function generateJWT(payload, expiresIn, privateKey) {
  const options = {
    algorithm: 'RS256',
    expiresIn
  };

  return jwt.sign(payload, privateKey, options);
}

/**
 * Obtains an access token using Salesforce's OAuth 2.0 JWT Bearer Flow.
 * @param {boolean} refresh whether to obtain a fresh token from Salesforce or not 
 * @returns {string} an access token which can be used to access Salesforce's APIs and services
 */
export async function getAccessToken(refresh) {
  if (refresh || !cachedAccessToken) {
    // TODO: The console logs will be refactored in next story W-13133225
    console.log(`\n====== Obtain a new access token.`);
    // Obtain a new access token.
    const consumerKey = SF_CONSUMER_KEY;
    const privateKey = SF_PRIVATE_KEY.replace(/\\n/g, '\n');
    // If there's no private key provided in .env for messaging, we should still allow the app run and enable phone usage
    // Return null here to avoid secretOrPrivateKey error
    if (!privateKey || privateKey.length < 50) {
      return null;}
    const aud = SF_AUDIENCE;
    let sub = IS_OTT ? SF_SUBJECT : settingsCache.get("userName"); // read from .env if it's ott

    // wait until critical data are retrieved from core
    if (!sub) {
      return null;
    }

    const jwt = generateJWT({ iss: consumerKey, sub, aud }, '3m', privateKey);
    const response = await axios.post(SF_AUTH_ENDPOINT,
      `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    cachedAccessToken = response.data.access_token;
  }

  console.log(`\n====== cachedAccessToken: ${cachedAccessToken}.`);
  return cachedAccessToken;
}

