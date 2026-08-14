# Using Fenéla

Fenéla is built around one simple loop:

**overwhelm → one small action → gentle accountability → daily return**

It is not designed to be clicked through like a checklist or productivity dashboard.

## The core flow

Fenéla helps you choose one small, concrete action.

When an anchor appears:

1. Read the action.
2. Choose to start it.
3. Leave Fenéla long enough to actually do the action.
4. Return to Fenéla.
5. Select **Done** only after the action itself has been completed.

`Done` means the real action was completed. It does not mean that the screen or prompt was simply acknowledged.

If you are not ready to do the action, Fenéla lets you postpone or park it rather than asking you to mark something as completed when it was not.

This distinction matters because Fenéla's accountability history is based on what the user says actually happened.

## AI suggestions

AI suggestions are optional.

During setup, you can choose whether Fenéla may use AI to suggest small anchors.

You can change this later under **Account → AI suggestions**.

When AI suggestions are off, Fenéla does not call OpenAI to generate anchors. The core accountability flow remains available.

AI suggestions do not decide which action you must take. You remain responsible for choosing and completing the action.

## Daily reminders

Reminders are optional.

When enabled, Fenéla can send a daily notification at your chosen start time.

The selected reminder time represents the **next occurrence** of that daily time. If today's selected time has already passed, the next reminder is scheduled for that time on the following day.

Push delivery also depends on notification support and permission on the current browser or device.

## Reminder statuses

Fenéla keeps reminder intent separate from browser or operating-system notification capability.

### On

Your Fenéla reminder preference is enabled and notifications are currently permitted for this browser or installed web app.

### Off

Daily reminders are disabled in Fenéla.

You can turn them on again from Reminder settings.

### Blocked

Fenéla's reminder preference may be enabled, but notifications have been denied or blocked by the browser or operating system.

Enable notifications for Fenéla in your browser or device settings, then return to Fenéla and try again.

### Not supported

The current browser or device context does not expose the notification capability Fenéla needs.

On iPhone and iPad, this can happen when Fenéla is opened only as a normal browser tab rather than as a Home Screen web app.

## iPhone and iPad

Web Push on iPhone and iPad requires Fenéla to run as a Home Screen web app.

### Install Fenéla

1. Open Fenéla in Safari.
2. Sign in before installing it if you want the installed app to continue with the authenticated flow you are testing.
3. Tap the **Share** button.
4. Choose **Add to Home Screen**.
5. If your iOS version shows the option, enable **Open as Web App**.
6. Tap **Add**.
7. Open Fenéla from the new Home Screen icon.

### Enable notifications

After opening the Home Screen version:

1. Open Fenéla's Reminder settings.
2. Turn reminders on.
3. When iOS asks whether Fenéla may send notifications, choose **Allow**.

Notification permission must be requested from the installed Home Screen app. Opening Fenéla only in a normal Safari tab is not sufficient for Web Push on iPhone or iPad.

If notifications were denied earlier, enable them for Fenéla in the iPhone or iPad notification settings and then return to Fenéla.

## Android

Fenéla uses standards-based Web Push rather than a native mobile application.

Where the browser and operating system support Web Push:

1. Sign in to Fenéla.
2. Open Reminder settings.
3. Turn reminders on.
4. Allow notifications when the browser or device asks for permission.

If Fenéla shows **Blocked**, notification permission must be changed in the browser or device settings before Fenéla can deliver reminders.

If Fenéla shows **Not supported**, the current browser/device context does not provide the required notification capability.

Exact installation and notification-setting menus differ between Android browsers and devices.

## Magic Link sign-in

Fenéla uses passwordless Magic Link authentication.

Enter your email address on the sign-in screen and use the link sent to that address to complete authentication.

The current hosted portfolio deployment uses Supabase's built-in authentication email delivery. That service is rate-limited.

During repeated testing, requesting several Magic Links within a short period can therefore produce a temporary `429 Too Many Requests` response.

This does not necessarily indicate that the account or application is broken. Wait before requesting another link.

The current hosted deployment accepts this limitation rather than adding a dedicated SMTP service, because Fenéla is operated primarily as a personal application and public portfolio deployment rather than a high-volume public SaaS service.

## Account settings

The Account screen currently provides:

- the signed-in email address;
- the **AI suggestions** preference;
- Sign out;
- Privacy;
- Delete account.

Deleting the account is permanent.

## Reminders are best effort

Fenéla's core accountability flow does not depend on push notifications.

Reminder delivery relies on external browser, operating-system, push-provider and scheduling infrastructure.

Fenéla handles known terminal subscription failures and performs one bounded retry for a one-shot task reminder after a transient push-delivery failure.

A reminder can therefore still fail to arrive under external failure conditions. This does not prevent the app itself from being used.

## Privacy

The hosted Fenéla deployment processes account and product data as described in the [Privacy Notice](privacy-notice.md).

Privacy questions about the hosted deployment can be sent to:

**privacy@nadirabusse.com**

The public MIT-licensed Fenéla repository can also be deployed independently. Operators of another deployment are responsible for the privacy and data-protection obligations of their own instance.
