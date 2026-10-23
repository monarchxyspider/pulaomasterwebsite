# Pulao Master

A responsive restaurant ordering website branded as **Pulao Master**, using the Firebase project and WhatsApp details included in the supplied reference script. The supplied starter did not contain the referenced Arzoo HTML, CSS, or `pics/` directory, so the application is implemented as a complete React/Vite project rather than a patch to missing files.

The website uses contact phone `03009263111` and the matching WhatsApp number `923009263111` everywhere. The starter menu (Karahi, Kabuli Pulao, Yakhni Pulao, Bannu Beef Pulao, BBQ Platter, Biryani, and sides) is used as the initial Firebase menu only when matching dishes are not already present. A custom hero photograph is in `public/images/pulao-hero.jpg` and the restaurant logo is `public/images/pulaomaster-logo.jpg`.

Approved administrators: `raffaysweet@gmail.com` and `pulaomaster.com@gmail.com`.

## Architecture

- `src/` is the React customer storefront and owner dashboard.
- Firebase Realtime Database stores the menu, public restaurant settings, orders, order statuses, and support conversations.
- `functions/` contains Firebase Cloud Functions v2. It is the trusted write boundary for order creation, administrator actions, menu changes, settings, and customer tracking sessions.
- `database.rules.json` denies public access to customer records and denies direct client writes to protected data. Customer chat writes are limited to the order-bound customer token and validated message fields.
- Firebase Authentication provides Google sign-in. An administrator allowlist and custom claims are checked server-side. Claims expire after a short window and are refreshed while the authorized owner dashboard is open.
- The browser stores only the cart and a convenience copy of the tracking key. A value in browser storage is not authorization: the server verifies a SHA-256 hash before issuing the order-scoped Firebase session.
- No payment processor or Discord integration is configured. Dashboard totals are order value, not verified payments or revenue.

New orders receive a private tracking key shown in the successful checkout confirmation. Customers need both this key and the order ID to view their status or chat from another device. The public status node contains no customer name, phone number, or delivery address. Older records in the existing `orders` node remain visible and manageable to an approved administrator; old records cannot be customer-tracked because the previous application did not create private tracking keys.

## Project Files

```text
public/images/pulao-hero.jpg       Custom restaurant hero image
src/App.tsx                        Storefront, cart, checkout, tracking, chat, and admin UI
src/index.css                      Responsive design system, animations, and reduced-motion rules
src/lib/firebase.ts                Firebase client setup and existing public project configuration
src/lib/restaurant.ts               Data types, formatting, and menu normalization
functions/index.js                 Trusted Firebase callable functions
functions/package.json             Cloud Functions dependencies and Node runtime
functions/.env.example             Server-side configuration template
database.rules.json                Realtime Database access-control rules
firebase.json                     Firebase Functions, Database, and Hosting configuration
.firebaserc                        Existing Firebase project reference
.env.example                      Optional frontend configuration template
```

## Requirements

- Node.js 22 for deploying Cloud Functions. The frontend also builds on Node.js 20.
- A Firebase project with Realtime Database and Google Authentication enabled.
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase **Blaze** billing account to deploy Cloud Functions. Firebase Functions v2 runs on Google Cloud; the project may incur charges if usage exceeds the applicable no-cost quotas. The static Hosting, Authentication, and Realtime Database portions do not require a separate paid vendor.

## Local Development

1. Install frontend dependencies: `npm install`.
2. Install Functions dependencies: `cd functions && npm install && cd ..`.
3. Copy `functions/.env.example` to `functions/.env` and replace the example administrator emails and database URL. Never commit `functions/.env`.
4. The Firebase web configuration supplied in the original script is already used as a public client fallback in `src/lib/firebase.ts`. If connecting a different Firebase project, copy `.env.example` to `.env.local` and fill its `VITE_` values before building. Do not leave the example values in `.env.local`.
5. Start the storefront: `npm run dev`.
6. Check the frontend: `npx tsc --noEmit && npm run build`.
7. Check the Functions syntax: `cd functions && npm run lint`.

The Firebase web API key and project identifiers are public client configuration, not server credentials. Never place a service-account JSON file, private key, admin password, or webhook URL in a `VITE_` variable or browser source.

## Firebase Console Setup

1. Select the existing project `resturant-db-f2cd9` or update `.firebaserc` to the intended project. Confirm that its Realtime Database URL matches `DATABASE_URL`.
2. In **Authentication > Sign-in method**, enable **Google** and select a support email.
3. In **Authentication > Settings > Authorized domains**, add the production Hosting domain and any custom domain. `localhost` is commonly available for local development; add it if the Console does not already list it.
4. In **Realtime Database**, create or select the database that matches the supplied URL. Deploy `database.rules.json`; do not use test mode or public order permissions.
5. Create `functions/.env` from `functions/.env.example` and set the administrator list, for example:

   ```text
   ADMIN_EMAILS=owner@example.com,manager@example.com
   DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
   ```

   Use the exact Google account email addresses that should have owner access. The backend requires a verified email and checks this list on every protected callable operation. This configuration is server-side and must not be moved into frontend code.
6. Enable the Google Cloud APIs requested by Firebase CLI during Functions deployment. If custom-token creation reports a signing-permission error, grant the Cloud Functions runtime service account **Service Account Token Creator** and enable the IAM Service Account Credentials API.

## Deploy

1. Authenticate and select the project: `firebase login` and `firebase use resturant-db-f2cd9`.
2. Install dependencies: `npm install` and `cd functions && npm install && cd ..`.
3. Confirm that `functions/.env` contains the real administrator allowlist and Realtime Database URL.
4. Build the static site: `npm run build`.
5. Deploy rules, backend, and website: `firebase deploy --only database,functions,hosting`.
6. Open the HTTPS Hosting URL. Confirm that the deployed hostname is included in Firebase Authentication's authorized domains.

The Functions are in `us-central1`, matching the frontend callable client. If the project is deployed in another preferred region, change both `REGION` in `functions/index.js` and `getFunctions()` in `src/lib/firebase.ts` before deployment.

## Security and Data Notes

- Public reads are limited to `/dishes` and `/settings/public`.
- `/orders`, `/orderRequests`, and tracking-key hashes are private. Only a current administrator claim can read full orders.
- No client can directly write an order, menu, restaurant setting, or order status. Callable functions validate identity and data and perform those writes with the Admin SDK.
- The customer session function verifies the order ID and private tracking key, then issues a Firebase custom token containing only that order's ID. Realtime Database rules scope status and chat access to that claim.
- Messages are plain text, capped at 800 characters, appended rather than edited, and rendered as text. The rules prevent customers from changing sender identity or sending into another order's conversation.
- Marking an order completed or cancelled closes customer chat without deleting messages. An owner can delete an order and its chat only after confirming the destructive action.
- If an administrator is removed from `ADMIN_EMAILS`, callable functions deny access immediately. Existing short-lived Realtime Database claims are cleared on the next access check and expire within their configured claim window.
- Because orders are saved before WhatsApp opens, a blocked popup cannot silently discard an order. The confirmation screen includes a WhatsApp share link and private tracking information.
- When no delivery fee is configured, customers see that it is still to be confirmed; the stored subtotal is not presented as a configured delivery charge.

## Manual Features and Limitations

- **Google provider and authorized domains:** must be enabled in Firebase Console before owner sign-in can work.
- **Administrator allowlist:** replace the example emails in `functions/.env`; the app intentionally grants no administrator access until a verified email is allowlisted.
- **Cloud Functions:** deploy the Functions and database rules. A static-only GitHub Pages deployment cannot enforce this backend authorization on its own.
- **Payments:** the site records orders but does not collect or verify online payments.
- **Discord:** optional Discord notifications are not enabled; no webhook is exposed in the frontend.
- **Opening hours and delivery fee:** not assumed. Set them in the owner dashboard only after confirming the business values.

## Verification Checklist

- [ ] Open the public menu and verify Firebase menu updates appear without refreshing.
- [ ] Confirm the three supplied seed dishes are not duplicated if the database already contains matching names.
- [ ] Search the menu, use category and availability filters, and try price sorting.
- [ ] Add and remove menu quantities, clear the cart, refresh, and verify cart persistence.
- [ ] Submit checkout with an invalid phone/address and confirm a useful validation message appears.
- [ ] Place a valid order and confirm it appears in Realtime Database under `/orders` after a refresh.
- [ ] Change a dish price or availability in the database/admin and confirm the backend uses the current price and rejects unavailable dishes.
- [ ] Submit the WhatsApp order path and verify the order is saved before WhatsApp opens; test with popups blocked.
- [ ] Copy the order ID and tracking key, reopen tracking, and verify the current order status is visible.
- [ ] Try the same order ID with a wrong tracking key and confirm access is denied.
- [ ] Sign in with an approved Google account and test overview, status changes, menu edits, settings, and sign-out.
- [ ] Sign in with a non-allowlisted Google account and confirm the dashboard is denied and protected Functions return permission errors.
- [ ] Inspect Realtime Database rules: anonymous reads of `/orders` and `/chats` and unauthenticated writes must be denied.
- [ ] Open a customer chat, send a message, check real-time updates on the admin account, complete the order, and verify the history remains visible but customer input is closed.
- [ ] Test navigation, forms, cart, checkout, and owner dashboard at phone, tablet, and desktop widths; also test keyboard navigation and reduced-motion settings.

## Build Status

The source was checked with `npx tsc --noEmit`, `npm run build`, and `cd functions && npm run lint`. Firebase Console configuration, live database access, Google sign-in, and cloud deployment require the project owner's credentials and have not been exercised from this workspace.