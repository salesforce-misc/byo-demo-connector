const LOG_LEVELS_MAP = {
    INFO: 1,
    ERROR: 2
};

const LOG_METHODS_MAP = {
    INFO: console.info,
    ERROR: console.error
};

const {
  MAX_LOG_LEVEL: envMaxLogLevel
} = process.env;

export const cacheKeys = {
    channelAddressIdentifier: "channelAddressIdentifier",
    endUserClientIdentifier: "endUserClientIdentifier",
    userId: "userId",
    conversationIdentifier: "conversationIdentifier",
    agentWorkId: "agentWorkId",
    workItemId: "workItemId",
}

/**
 * Converts the MAX_LOG_LEVEL environment variable string to its numeric equivalent.
 * @returns {number} The numeric log level (1 for INFO, 2 for ERROR).
 *                   Defaults to INFO (1) if not set or if an invalid value is provided.
 */
const getMaxLogLevelNumeric = () => {
    if (!envMaxLogLevel) {
        return LOG_LEVELS_MAP.INFO;
    }
    const upperLevel = envMaxLogLevel.toUpperCase();
    return LOG_LEVELS_MAP[upperLevel] || LOG_LEVELS_MAP.INFO;
};

const MAX_LOG_LEVEL = getMaxLogLevelNumeric();

/**
 * Gets a formatted timestamp string for log lines.
 * @returns {string} Formatted timestamp string in Pacific timezone.
 */
export function getTimeStampForLoglines() {
  const now = new Date();
  const options = { timeZone: 'America/Los_Angeles', hour12: false };
  const pacificTimeString = '\n========= [' + now.toLocaleString('en-US', options) + '.' + now.getMilliseconds().toString().padStart(3, '0') + ']: ';
  return pacificTimeString;
}

/**
 * Centralized logging function.
 * @param {string} severity - The severity level ('INFO' or 'ERROR').
 * @param {string} message - The main log message.
 * @param {any} [data] - Optional structured data (object/array).
 */
function log(severity, message, data) {
    // Only log if severity level is >= MAX_LOG_LEVEL
    // If MAX_LOG_LEVEL=ERROR (2), only ERROR (2) >= 2, so INFO (1) is suppressed
    // If MAX_LOG_LEVEL=INFO (1), both INFO (1) and ERROR (2) >= 1, so both are logged
    if (LOG_LEVELS_MAP[severity] < MAX_LOG_LEVEL) {
        return;
    }
    
    const timestamp = getTimeStampForLoglines();
    const prefix = `${timestamp}[${severity.toUpperCase()}] `;
    
    const consoleMethod = LOG_METHODS_MAP[severity] || console.log;
    consoleMethod(prefix + message);
    if (data) {
        console.dir(data, { depth: null });
    }
}

export const logger = {
    info: (message, data) => log('INFO', message, data),
    error: (message, data) => log('ERROR', message, data)
};

/**
 * Generates a full API URL by combining the base SCRT instance URL with an endpoint
 * @param {Object} settingsCache - The settings cache object
 * @param {string} endpoint - The API endpoint path (e.g., "/api/v1/route")
 * @returns {string} The complete API URL
 */
export function generateApiUrl(settingsCache, endpoint) {
    const IS_LOCAL_CONFIG = process.env.IS_LOCAL_CONFIG === "true";
    const SF_SCRT_INSTANCE_URL = process.env.SF_SCRT_INSTANCE_URL;
    const baseUrl = IS_LOCAL_CONFIG ? SF_SCRT_INSTANCE_URL : settingsCache.get("scrtUrl");
    return baseUrl + endpoint;
}
