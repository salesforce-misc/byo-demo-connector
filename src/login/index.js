/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import Constants from '../common/constants'

const submitButton = document.getElementById('submit');
const previewButton = document.getElementById('preview');
const passwordInput = document.getElementById('password');
const showPasswordContainer = document.getElementById('show-password-container');
const hidePasswordContainer = document.getElementById('hide-password-container');
let showPassword = false;

previewButton.addEventListener('click', () => {
    showPassword = !showPassword;
    if (showPassword) {
        passwordInput.type = 'text';
        showPasswordContainer.style.display = 'none';
        hidePasswordContainer.style.display = 'block';
    } else {
        passwordInput.type = 'password';
        hidePasswordContainer.style.display = 'none';
        showPasswordContainer.style.display = 'block';
    }
});

submitButton.addEventListener('click', () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const success = (username === 'test' && password === 'test');
    const requestBroadcastChannel = new BroadcastChannel('rc-request');
    requestBroadcastChannel.postMessage({
        type: Constants.LOGIN_SUBMIT,
        success
    });
});