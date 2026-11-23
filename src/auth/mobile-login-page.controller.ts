import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{10,100}$/;
const BROWSER_STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Controller('auth/mobile')
export class MobileLoginPageController {
  @Get('login')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Referrer-Policy', 'no-referrer')
  @Header(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      "script-src 'unsafe-inline'",
      "connect-src 'self'",
      "style-src 'unsafe-inline'",
      "img-src 'self' data:",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  )
  loginPage(
    @Query('transactionId') transactionId: string,
    @Query('state') browserState: string,
    @Res() response: Response,
  ): void {
    if (
      typeof transactionId !== 'string' ||
      !TRANSACTION_ID_PATTERN.test(transactionId) ||
      typeof browserState !== 'string' ||
      !BROWSER_STATE_PATTERN.test(browserState)
    ) {
      response.status(400).type('text/plain').send('Invalid login link.');
      return;
    }

    const safeTransactionId = JSON.stringify(transactionId);
    const safeBrowserState = JSON.stringify(browserState);

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <meta name="theme-color" content="#EAF6FF">
  <title>Sign in to LovableCar</title>

  <style>
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont,
        "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 20px;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #EAF6FF;
      color: #102647;
    }

    main {
      width: 100%;
      max-width: 420px;
      padding: 30px 24px;
      border-radius: 24px;
      background: #FFFFFF;
      box-shadow: 0 10px 35px rgba(16, 38, 71, .09);
      text-align: center;
    }

    .logo {
      width: 58px;
      height: 58px;
      margin: 0 auto 18px;
      display: grid;
      place-items: center;
      border-radius: 18px;
      background: #FFD33F;
      color: #102647;
      font-size: 27px;
      font-weight: 900;
    }

    h1 {
      margin: 0;
      font-size: 26px;
      font-weight: 850;
      letter-spacing: -.6px;
    }

    p {
      line-height: 1.55;
      color: #41668B;
    }

    .intro {
      margin: 12px 0 26px;
      font-size: 14px;
    }

    .field {
      margin: 24px 0 16px;
      text-align: left;
    }

    .field label {
      display: block;
      margin-bottom: 10px;
      font-size: 13px;
      font-weight: 750;
      color: #102647;
    }

    .field input {
      display: block;
      width: 100%;
      min-height: 62px;
      padding: 12px;
      border: 2px solid #D7EAF8;
      border-radius: 14px;
      background: #EAF6FF;
      color: #102647;
      font-size: 30px;
      font-weight: 800;
      letter-spacing: 9px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .field input:focus {
      outline: none;
      border-color: #41668B;
    }

    #paste-code {
      width: 100%;
      min-height: 48px;
      margin-top: 10px;
      border: 1px solid #D7EAF8;
      border-radius: 12px;
      background: #FFFFFF;
      color: #41668B;
      font-size: 14px;
      font-weight: 750;
      cursor: pointer;
    }

    #paste-code:active {
      background: #EAF6FF;
    }

    .hint {
      margin: 9px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: #8295A8;
    }

    #confirm {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin: 24px 0;
      text-align: left;
      font-size: 13px;
      line-height: 1.5;
      color: #41668B;
    }

    #confirm input {
      width: 18px;
      height: 18px;
      margin: 1px 0 0;
      flex-shrink: 0;
      accent-color: #1686D4;
    }

    #telegram-widget {
      margin-top: 24px;
    }

    #telegram-login-button {
      width: 100%;
      min-height: 54px;
      border: none;
      border-radius: 15px;
      background: #FFD33F;
      color: #102647;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
    }

    #telegram-login-button:disabled {
      opacity: .55;
      cursor: wait;
    }

    #status {
      min-height: 24px;
      margin: 16px 0 0;
      font-size: 13px;
    }

    .error {
      color: #B42318;
    }

    .success {
      color: #067647;
    }

    @media (max-width: 360px) {
      main {
        padding: 24px 18px;
      }

      .field input {
        font-size: 27px;
        letter-spacing: 7px;
      }
    }
  </style>
</head>

<body>
  <main>
    <div class="logo">L</div>

    <h1>LovableCar</h1>

    <p class="intro">
      Enter the confirmation code shown in your
      LovableCar mobile app, then sign in with Telegram.
    </p>

    <div class="field">
      <label for="confirmation-code">
        Six-digit confirmation code
      </label>

      <input
        id="confirmation-code"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        pattern="[0-9]{6}"
        placeholder="000000"
        aria-describedby="code-help"
        autofocus
      >

      <button type="button" id="paste-code">
        📋 Paste code
      </button>

      <p class="hint" id="code-help">
        The code is automatically copied when you start
        login in the LovableCar app.
      </p>
    </div>

    <label id="confirm">
      <input type="checkbox" id="approval">
      <span>
        I started this sign-in from my own LovableCar app,
        and I want to authorize that device.
      </span>
    </label>

    <div id="telegram-widget">
      <button type="button" id="telegram-login-button">
        Continue with Telegram
      </button>
    </div>

    <p id="status" role="status" aria-live="polite"></p>
  </main>

  <script>
    const transactionId = ${safeTransactionId};
    const browserState = ${safeBrowserState};

    const approval =
      document.getElementById('approval');

    const confirmationInput =
      document.getElementById('confirmation-code');

    const pasteButton =
      document.getElementById('paste-code');

    const status =
      document.getElementById('status');

    const loginButton =
      document.getElementById('telegram-login-button');

    let submitting = false;

    function showStatus(message, type) {
      status.textContent = message;
      status.className = type || '';
    }

    function normalizeCode(value) {
      return value.replace(/\\D/g, '').slice(0, 6);
    }

    confirmationInput.addEventListener('input', () => {
      const normalized =
        normalizeCode(confirmationInput.value);

      confirmationInput.value = normalized;
    });

    window.addEventListener('load', () => {
      confirmationInput.focus();
    });

    pasteButton.addEventListener('click', async () => {
      try {
        const clipboardText =
          await navigator.clipboard.readText();

        const code = normalizeCode(clipboardText);

        if (!code) {
          showStatus(
            'No confirmation code found in clipboard.',
            'error',
          );
          return;
        }

        confirmationInput.value = code;
        confirmationInput.focus();

        showStatus(
          code.length === 6
            ? 'Confirmation code pasted.'
            : 'Code pasted. Complete the remaining digits.',
          'success',
        );
      } catch {
        showStatus(
          'Clipboard access is unavailable. Use Paste manually in the code field.',
          'error',
        );
        confirmationInput.focus();
      }
    });

    loginButton.addEventListener('click', async () => {
      if (submitting) return;

      const confirmationCode =
        normalizeCode(confirmationInput.value);

      confirmationInput.value = confirmationCode;

      if (!/^[0-9]{6}$/.test(confirmationCode)) {
        showStatus(
          'Enter the six-digit code from your LovableCar app.',
          'error',
        );
        confirmationInput.focus();
        return;
      }

      if (!approval.checked) {
        showStatus(
          'Confirm that you started this login on your own device.',
          'error',
        );
        return;
      }

      submitting = true;
      loginButton.disabled = true;

      showStatus('Connecting to Telegram...');

      try {
        const response = await fetch('/auth/telegram/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            transactionId,
            browserState,
            confirmationCode,
          }),
        });

        if (!response.ok) {
          let detail = '';

          try {
            const errorBody = await response.json();

            if (typeof errorBody.message === 'string') {
              detail = errorBody.message;
            }
          } catch {
            // Use a generic message.
          }

          throw new Error(
            detail || 'Could not start Telegram login.',
          );
        }

        const result = await response.json();

        if (
          typeof result.authorizationUrl !== 'string' ||
          !result.authorizationUrl.startsWith(
            'https://oauth.telegram.org/',
          )
        ) {
          throw new Error(
            'Invalid Telegram authorization URL.',
          );
        }

        window.location.assign(result.authorizationUrl);
      } catch (error) {
        showStatus(
          error instanceof Error
            ? error.message
            : 'Could not start Telegram login. Please try again.',
          'error',
        );

        submitting = false;
        loginButton.disabled = false;
      }
    });
  </script>
</body>
</html>`;

    response.status(200).type('html').send(html);
  }
}
