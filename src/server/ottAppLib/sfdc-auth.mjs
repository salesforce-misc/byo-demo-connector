import jwt from 'jsonwebtoken';
import axios from 'axios';
import { settingsCache } from '../ottAppServer.mjs';
import { logger } from '../util.mjs';

// Get config metadata from .env
const {
  SF_CONSUMER_KEY,
  SF_PRIVATE_KEY,
  SF_AUDIENCE,
  SF_SUBJECT, // OTT-needed
  SF_AUTH_ENDPOINT
} = process.env;
const IS_LOCAL_CONFIG = process.env.IS_LOCAL_CONFIG === "true"
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
    // Obtain a new access token.
    const consumerKey = SF_CONSUMER_KEY;
    const privateKey = SF_PRIVATE_KEY.replace(/\\n/g, '\n');
    // If there's no private key provided in .env for messaging, we should still allow the app run and enable phone usage
    // Return null here to avoid secretOrPrivateKey error
    if (!privateKey || privateKey.length < 50) {
      logger.error(`Missing required environment variables. Check if the SF_PRIVATE_KEY is correct in env file.`);
      return null;
    }
    const aud = SF_AUDIENCE;
    let sub = IS_LOCAL_CONFIG ? SF_SUBJECT : settingsCache.get("userName"); // read from .env if it's ott

    // wait until critical data are retrieved from core
    if (!sub) {
      logger.error(`Missing required environment variables. Check if the SF_SUBJECT is correct in env file.`);
      return null;
    }

    const jwt = generateJWT({ iss: consumerKey, sub, aud }, '3m', privateKey);

    logger.info(`POST ${SF_AUTH_ENDPOINT} to obtain access token.`);
    try {
      const response = await axios.post(SF_AUTH_ENDPOINT,
        `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      logger.info(`POST ${SF_AUTH_ENDPOINT} completed successfully. Access token: ${response.data.access_token}`);
      cachedAccessToken = response.data.access_token;
      return response.data.access_token;
    } catch (error) {
      const errorMessage = error.response?.data?.error_description || error.response?.data?.error || error.message || error;
      logger.error(`POST ${SF_AUTH_ENDPOINT} has error. Check if the SF_CONSUMER_KEY, SF_PRIVATE_KEY, SF_AUDIENCE, SF_SUBJECT, and SF_AUTH_ENDPOINT are correct in env file. Error: ${errorMessage}`);
      return null;
    }
  } else {
    logger.info(`GET access token from cache. Access token: ${cachedAccessToken}`);
    return cachedAccessToken;
  }
}
