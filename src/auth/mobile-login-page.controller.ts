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
      "script-src 'unsafe-inline' 'unsafe-eval' https://telegram.org",
      'frame-src https://oauth.telegram.org https://*.telegram.org',
      "connect-src 'self'",
      "style-src 'unsafe-inline'",
      "img-src 'self' https://telegram.org https://*.telegram.org data:",
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
  <title>Sign in to LovableCar</title>
  <style>
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont,
        "Segoe UI", sans-serif;
    }

    body {
      margin: 0;
      padding: 24px;
      min-height: 100vh;
      box-sizing: border-box;
      display: grid;
      place-items: center;
      background: #f4f6f9;
      color: #172033;
    }

    main {
      width: 100%;
      max-width: 420px;
      padding: 32px 24px;
      box-sizing: border-box;
      border-radius: 18px;
      background: white;
      box-shadow: 0 8px 32px rgba(0, 0, 0, .06);
      text-align: center;
    }

    h1 {
      margin: 0 0 12px;
      font-size: 26px;
    }

    p {
      line-height: 1.5;
      color: #536174;
    }

    .field {
      margin: 24px 0 16px;
      text-align: left;
    }

    .field label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 600;
    }

    .field input {
      width: 100%;
      box-sizing: border-box;
      padding: 14px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      font-size: 24px;
      letter-spacing: 6px;
      text-align: center;
    }

    .field input:focus {
      outline: 2px solid #0088cc;
      outline-offset: 2px;
    }

    #confirm {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin: 20px 0;
      text-align: left;
      font-size: 14px;
      line-height: 1.5;
    }

    #confirm input {
      margin-top: 3px;
    }

    #telegram-widget {
      margin: 24px 0;
      min-height: 44px;
    }

    #status {
      min-height: 24px;
      font-size: 14px;
    }

    .error {
      color: #b42318;
    }

    .success {
      color: #067647;
    }
  </style>
</head>
<body>
  <main>
    <h1>LovableCar</h1>

    <p>
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
        autocomplete="off"
        maxlength="6"
        pattern="[0-9]{6}"
        placeholder="000000"
        aria-describedby="code-help"
      >

      <p id="code-help">
        Find this code in the LovableCar app.
        Do not use a code sent by someone else.
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
    <script
        async
        src="https://telegram.org/js/telegram-widget.js?22"
        data-telegram-login="lovablecar_bot"
        data-size="large"
        data-userpic="false"
        data-onauth="onLovableCarTelegramAuth(user)"
    ></script>
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

    const widgetContainer =
      document.getElementById('telegram-widget');

    const status =
      document.getElementById('status');

    let submitting = false;
    let completed = false;

    function showStatus(message, type) {
      status.textContent = message;
      status.className = type || '';
    }

    async function onTelegramAuth(user) {
      if (submitting || completed) {
        return;
      }

      const confirmationCode =
        confirmationInput.value.trim();

      if (!/^[0-9]{6}$/.test(confirmationCode)) {
        showStatus(
          'Enter the six-digit code from your LovableCar app.',
          'error'
        );
        confirmationInput.focus();
        return;
      }

      if (!approval.checked) {
        showStatus(
          'Confirm that you started this login on your own device.',
          'error'
        );
        return;
      }

      submitting = true;
      showStatus('Verifying Telegram login...');

      try {
        const response = await fetch(
          '/auth/mobile/approve',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
              transactionId,
              browserState,
              confirmationCode,
              telegram: user
            })
          }
        );

        if (!response.ok) {
          throw new Error('Login approval failed');
        }

        completed = true;

        showStatus(
          'Login approved. Return to LovableCar to continue.',
          'success'
        );

        approval.disabled = true;
        confirmationInput.disabled = true;
        confirmationInput.value = '';
        widgetContainer.replaceChildren();
      } catch {
        showStatus(
          'Could not approve login. Check the code or start again.',
          'error'
        );
      } finally {
        submitting = false;
      }
    }

    window.onLovableCarTelegramAuth = onTelegramAuth;
  </script>
</body>
</html>`;

    response.status(200).type('html').send(html);
  }
}
