/*
 * Copyright (c) 2025, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable no-unused-vars */
/* eslint-disable no-console */

/* 
 * Sample Remote Storage for connector
 * @author ahakro
 */

/** @module remote-storage **/
export class RemoteStorage {
  constructor(storageProvider) {
    if (!storageProvider || typeof storageProvider !== 'object') {
      throw new Error('A valid storageProvider object is required.');
    }

    // Ensure required methods exist
    const requiredMethods = ['getItem', 'setItem'];
    for (const method of requiredMethods) {
      if (typeof storageProvider[method] !== 'function') {
        throw new Error(`storageProvider must implement a '${method}' method.`);
      }
    }

    this.provider = storageProvider;
  }

  // Getter method
  getItem(context, key) {
    if (typeof key !== 'string' || typeof context !== 'string') {
      throw new Error(`Key and context must be a string., context=${context},key=${key}`);
    }
    return this.provider.getItem(context, key);
  }

  // Setter method
  setItem(context, key, value) {
    if (typeof key !== 'string' || typeof context !== 'string') {
      throw new Error(`Key and context must be a string, context=${context},key=${key}, value=${value}`);
    }
    return this.provider.setItem(context, key, value);
  }

  upsertCall(context, call, callList, skipNotification = false) {
      if (typeof context !== 'string') {
          throw new Error(`Context must be a string, context=${context}`);
      }
      if (!call || typeof call !== 'object') {
          throw new Error(`Call must be a valid object, call=${call}`);
      }
      return this.provider.upsertCall(context, call, callList, skipNotification);
  }

  endCall(context, endCallData) {
      if (typeof context !== 'string') {
          throw new Error(`Context must be a string, context=${context}`);
      }
      if (!endCallData || typeof endCallData !== 'object') {
          throw new Error(`endCallData must be a valid object, endCallData=${endCallData}`);
      }
      if (!endCallData.call || typeof endCallData.call !== 'object') {
          throw new Error(`endCallData.call must be a valid object`);
      }
      // type is optional, defaults to HANGUP on backend
      if (endCallData.type && typeof endCallData.type !== 'string') {
          throw new Error(`endCallData.type must be a string (HANGUP or PARTICIPANT_REMOVED)`);
      }
      return this.provider.endCall(context, endCallData);
  }
}
